package webhook

import (
	"bytes"
	"crypto/hmac"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"
	"time"

	"mdm-backend/internal/auth"
	"mdm-backend/internal/database"
	"mdm-backend/internal/model"

	"github.com/google/uuid"
	"github.com/lib/pq"
)

type WebhookCreateRequest struct {
	Name       string   `json:"name"`
	URL        string   `json:"url"`
	Secret     string   `json:"secret"`
	EventTypes []string `json:"event_types"`
	Enabled    bool     `json:"enabled"`
}

type WebhookUpdateRequest struct {
	Name       string   `json:"name"`
	URL        string   `json:"url"`
	Secret     string   `json:"secret"`
	EventTypes []string `json:"event_types"`
	Enabled    bool     `json:"enabled"`
}

var webhookHTTPClient = &http.Client{Timeout: 10 * time.Second}

// ListWebhooks returns all webhooks for the organisation
func ListWebhooks(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
		return
	}
	claims := r.Context().Value(auth.UserContextKey).(*auth.Claims)

	rows, err := database.DB.Query(`
		SELECT id, organization_id, name, url, event_types, enabled, created_at
		FROM webhooks WHERE organization_id = $1 ORDER BY created_at DESC`, claims.OrganizationID)
	if err != nil {
		http.Error(w, `{"error":"db query failed"}`, http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var hooks []model.Webhook
	for rows.Next() {
		var h model.Webhook
		if scanErr := rows.Scan(&h.ID, &h.OrganizationID, &h.Name, &h.URL,
			pq.Array(&h.EventTypes), &h.Enabled, &h.CreatedAt); scanErr == nil {
			hooks = append(hooks, h)
		}
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(hooks)
}

// CreateWebhook creates a new webhook endpoint
func CreateWebhook(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
		return
	}
	claims := r.Context().Value(auth.UserContextKey).(*auth.Claims)

	var req WebhookCreateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}
	if req.Name == "" || req.URL == "" || len(req.EventTypes) == 0 {
		http.Error(w, `{"error":"name, url, and event_types are required"}`, http.StatusBadRequest)
		return
	}

	var id uuid.UUID
	err := database.DB.QueryRow(`
		INSERT INTO webhooks (organization_id, name, url, secret, event_types, enabled)
		VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
		claims.OrganizationID, req.Name, req.URL, req.Secret,
		pq.Array(req.EventTypes), req.Enabled,
	).Scan(&id)
	if err != nil {
		log.Printf("Failed to create webhook: %v", err)
		http.Error(w, `{"error":"db insert failed"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(model.Webhook{
		ID: id, OrganizationID: claims.OrganizationID,
		Name: req.Name, URL: req.URL, EventTypes: req.EventTypes, Enabled: req.Enabled,
	})
}

// UpdateWebhook updates an existing webhook
func UpdateWebhook(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPut {
		http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
		return
	}

	parts := strings.Split(r.URL.Path, "/")
	id, err := uuid.Parse(parts[len(parts)-1])
	if err != nil {
		http.Error(w, `{"error":"invalid webhook id"}`, http.StatusBadRequest)
		return
	}

	var req WebhookUpdateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}

	_, err = database.DB.Exec(`
		UPDATE webhooks SET name=$1, url=$2, secret=$3, event_types=$4, enabled=$5
		WHERE id=$6`,
		req.Name, req.URL, req.Secret, pq.Array(req.EventTypes), req.Enabled, id,
	)
	if err != nil {
		http.Error(w, `{"error":"db update failed"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_, _ = w.Write([]byte(`{"status":"updated"}`))
}

// DeleteWebhook removes a webhook
func DeleteWebhook(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodDelete {
		http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
		return
	}

	parts := strings.Split(r.URL.Path, "/")
	id, err := uuid.Parse(parts[len(parts)-1])
	if err != nil {
		http.Error(w, `{"error":"invalid webhook id"}`, http.StatusBadRequest)
		return
	}

	if _, err := database.DB.Exec(`DELETE FROM webhooks WHERE id = $1`, id); err != nil {
		http.Error(w, `{"error":"db delete failed"}`, http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// TestWebhook sends a sample payload to verify connectivity
func TestWebhook(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
		return
	}

	parts := strings.Split(r.URL.Path, "/")
	// URL: /api/v1/webhooks/{id}/test
	id, err := uuid.Parse(parts[len(parts)-2])
	if err != nil {
		http.Error(w, `{"error":"invalid webhook id"}`, http.StatusBadRequest)
		return
	}

	var hookURL, secret string
	err = database.DB.QueryRow(`SELECT url, COALESCE(secret,'') FROM webhooks WHERE id = $1`, id).Scan(&hookURL, &secret)
	if err == sql.ErrNoRows {
		http.Error(w, `{"error":"webhook not found"}`, http.StatusNotFound)
		return
	}

	testPayload := map[string]interface{}{
		"event_type": "TEST",
		"timestamp":  time.Now().Format(time.RFC3339),
		"message":    "This is a test webhook delivery from OpenMDM",
	}
	body, _ := json.Marshal(testPayload)
	sig := sign(body, secret)

	req2, _ := http.NewRequest(http.MethodPost, hookURL, bytes.NewReader(body))
	req2.Header.Set("Content-Type", "application/json")
	req2.Header.Set("X-MDM-Signature", sig)

	resp, err := webhookHTTPClient.Do(req2)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_ = json.NewEncoder(w).Encode(map[string]interface{}{"success": false, "error": err.Error()})
		return
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"success":     resp.StatusCode >= 200 && resp.StatusCode < 300,
		"status_code": resp.StatusCode,
		"response":    string(respBody),
	})
}

// DispatchEvent finds all matching webhooks and fires them asynchronously
func DispatchEvent(deviceID uuid.UUID, serial, deviceModel, eventType string, details map[string]interface{}) {
	rows, err := database.DB.Query(`
		SELECT id, url, COALESCE(secret,'') FROM webhooks
		WHERE enabled = true AND $1 = ANY(event_types)`, eventType)
	if err != nil {
		return
	}
	defer rows.Close()

	type hook struct {
		id     uuid.UUID
		url    string
		secret string
	}
	var hooks []hook
	for rows.Next() {
		var h hook
		if scanErr := rows.Scan(&h.id, &h.url, &h.secret); scanErr == nil {
			hooks = append(hooks, h)
		}
	}

	for _, h := range hooks {
		go dispatch(h.url, h.secret, eventType, deviceID, serial, deviceModel, details)
	}
}

func dispatch(hookURL, secret, eventType string, deviceID uuid.UUID, serial, deviceModel string, details map[string]interface{}) {
	payload := map[string]interface{}{
		"event_type": eventType,
		"timestamp":  time.Now().Format(time.RFC3339),
		"device": map[string]string{
			"id":     deviceID.String(),
			"serial": serial,
			"model":  deviceModel,
		},
		"details": details,
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return
	}

	sig := sign(body, secret)

	var lastErr error
	for attempt := 0; attempt < 3; attempt++ {
		if attempt > 0 {
			time.Sleep(time.Duration(attempt*attempt) * time.Second)
		}

		req, _ := http.NewRequest(http.MethodPost, hookURL, bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("X-MDM-Signature", sig)
		req.Header.Set("X-MDM-Event", eventType)

		resp, err := webhookHTTPClient.Do(req)
		if err != nil {
			lastErr = err
			continue
		}
		resp.Body.Close()

		if resp.StatusCode >= 200 && resp.StatusCode < 300 {
			log.Printf("Webhook delivered to %s (event=%s, attempt=%d)", hookURL, eventType, attempt+1)
			return
		}
		lastErr = fmt.Errorf("HTTP %d", resp.StatusCode)
	}

	log.Printf("Webhook delivery failed after 3 attempts to %s: %v", hookURL, lastErr)
}

func sign(body []byte, secret string) string {
	if secret == "" {
		return ""
	}
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write(body)
	return "sha256=" + hex.EncodeToString(mac.Sum(nil))
}
