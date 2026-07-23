package app

import (
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"strings"

	"mdm-backend/internal/auth"
	"mdm-backend/internal/database"
	"mdm-backend/internal/model"

	"github.com/google/uuid"
	qrcode "github.com/skip2/go-qrcode"
)

type AppCreateRequest struct {
	PackageName string `json:"package_name"`
	VersionCode int    `json:"version_code"`
	VersionName string `json:"version_name"`
	APKURL      string `json:"apk_url"` // URL to APK on MinIO/S3
}

type DeployRequest struct {
	ApplicationID uuid.UUID        `json:"application_id"`
	DeviceID      *uuid.UUID       `json:"device_id,omitempty"`
	TeamID        *uuid.UUID       `json:"team_id,omitempty"`
	InstallType   model.InstallType `json:"install_type"` // FORCE_INSTALL, AVAILABLE, BLOCKED
}

// ListApps returns all registered applications
func ListApps(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
		return
	}

	rows, err := database.DB.Query(`
		SELECT id, package_name, version_code, version_name, apk_url, created_at
		FROM applications ORDER BY created_at DESC`)
	if err != nil {
		http.Error(w, `{"error":"db query failed"}`, http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var apps []model.Application
	for rows.Next() {
		var a model.Application
		if scanErr := rows.Scan(&a.ID, &a.PackageName, &a.VersionCode, &a.VersionName, &a.APKURL, &a.CreatedAt); scanErr == nil {
			apps = append(apps, a)
		}
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(apps)
}

// CreateApp registers a new application (APK URL should already be uploaded to MinIO/S3)
func CreateApp(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
		return
	}

	claims, ok := r.Context().Value(auth.UserContextKey).(*auth.Claims)
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	var req AppCreateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}
	if req.PackageName == "" || req.APKURL == "" || req.VersionCode == 0 {
		http.Error(w, `{"error":"package_name, apk_url, and version_code are required"}`, http.StatusBadRequest)
		return
	}

	var a model.Application
	err := database.DB.QueryRow(`
		INSERT INTO applications (package_name, version_code, version_name, apk_url)
		VALUES ($1, $2, $3, $4)
		ON CONFLICT (package_name) DO UPDATE
		  SET version_code=$2, version_name=$3, apk_url=$4
		RETURNING id, package_name, version_code, version_name, apk_url, created_at`,
		req.PackageName, req.VersionCode, req.VersionName, req.APKURL,
	).Scan(&a.ID, &a.PackageName, &a.VersionCode, &a.VersionName, &a.APKURL, &a.CreatedAt)
	if err != nil {
		log.Printf("Failed to create app: %v", err)
		http.Error(w, `{"error":"db insert failed"}`, http.StatusInternalServerError)
		return
	}

	// Audit log
	_, _ = database.DB.Exec(`
		INSERT INTO audit_logs (actor_id, action, target_type, target_id, details)
		VALUES ($1, 'APP_CREATE', 'APPLICATION', $2, $3)`,
		claims.UserID, a.ID, fmt.Sprintf(`{"package":"%s","version":"%s"}`, a.PackageName, a.VersionName),
	)

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(a)
}

// DeleteApp removes an application
func DeleteApp(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodDelete {
		http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
		return
	}

	parts := strings.Split(r.URL.Path, "/")
	id, err := uuid.Parse(parts[len(parts)-1])
	if err != nil {
		http.Error(w, `{"error":"invalid app id"}`, http.StatusBadRequest)
		return
	}

	if _, err := database.DB.Exec(`DELETE FROM applications WHERE id = $1`, id); err != nil {
		http.Error(w, `{"error":"db delete failed"}`, http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// DeployApp creates an app deployment assignment
func DeployApp(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
		return
	}

	claims, ok := r.Context().Value(auth.UserContextKey).(*auth.Claims)
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	var req DeployRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}
	if req.DeviceID == nil && req.TeamID == nil {
		http.Error(w, `{"error":"either device_id or team_id must be specified"}`, http.StatusBadRequest)
		return
	}
	if req.InstallType == "" {
		req.InstallType = model.InstallForceInstall
	}

	// Verify app exists
	var appExists bool
	_ = database.DB.QueryRow(`SELECT EXISTS(SELECT 1 FROM applications WHERE id=$1)`, req.ApplicationID).Scan(&appExists)
	if !appExists {
		http.Error(w, `{"error":"application not found"}`, http.StatusNotFound)
		return
	}

	var deployID uuid.UUID
	err := database.DB.QueryRow(`
		INSERT INTO application_deployments (device_id, team_id, application_id, install_type)
		VALUES ($1, $2, $3, $4) RETURNING id`,
		req.DeviceID, req.TeamID, req.ApplicationID, req.InstallType,
	).Scan(&deployID)
	if err != nil {
		log.Printf("Failed to deploy app: %v", err)
		http.Error(w, `{"error":"db insert failed"}`, http.StatusInternalServerError)
		return
	}

	_, _ = database.DB.Exec(`
		INSERT INTO audit_logs (actor_id, action, target_type, target_id, details)
		VALUES ($1, 'APP_DEPLOY', 'APPLICATION', $2, $3)`,
		claims.UserID, req.ApplicationID, fmt.Sprintf(`{"install_type":"%s"}`, req.InstallType),
	)

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"deployment_id":  deployID,
		"application_id": req.ApplicationID,
		"install_type":   req.InstallType,
	})
}

// ListDeployments returns all app deployment assignments
func ListDeployments(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
		return
	}

	rows, err := database.DB.Query(`
		SELECT ad.id, ad.device_id, ad.team_id, ad.application_id, ad.install_type, ad.created_at,
		       a.package_name, a.version_name
		FROM application_deployments ad
		JOIN applications a ON ad.application_id = a.id
		ORDER BY ad.created_at DESC`)
	if err != nil {
		http.Error(w, `{"error":"db query failed"}`, http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	type DeployRow struct {
		model.ApplicationDeployment
		PackageName string `json:"package_name"`
		VersionName string `json:"version_name"`
	}

	var deployments []DeployRow
	for rows.Next() {
		var d DeployRow
		if scanErr := rows.Scan(&d.ID, &d.DeviceID, &d.TeamID, &d.ApplicationID, &d.InstallType, &d.CreatedAt,
			&d.PackageName, &d.VersionName); scanErr == nil {
			deployments = append(deployments, d)
		}
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(deployments)
}

// GetEnrollmentTokens lists enrollment tokens
func GetEnrollmentTokens(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
		return
	}
	claims := r.Context().Value(auth.UserContextKey).(*auth.Claims)

	rows, err := database.DB.Query(`
		SELECT id, organization_id, token, label, max_uses, use_count, expires_at, created_at
		FROM enrollment_tokens WHERE organization_id = $1
		ORDER BY created_at DESC`, claims.OrganizationID)
	if err != nil {
		http.Error(w, `{"error":"db query failed"}`, http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var tokens []model.EnrollmentToken
	for rows.Next() {
		var t model.EnrollmentToken
		if scanErr := rows.Scan(&t.ID, &t.OrganizationID, &t.Token, &t.Label,
			&t.MaxUses, &t.UseCount, &t.ExpiresAt, &t.CreatedAt); scanErr == nil {
			tokens = append(tokens, t)
		}
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(tokens)
}

// CreateEnrollmentToken generates a new enrollment token
func CreateEnrollmentToken(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
		return
	}
	claims := r.Context().Value(auth.UserContextKey).(*auth.Claims)

	type TokenReq struct {
		Label     string `json:"label"`
		MaxUses   int    `json:"max_uses"`
		ExpiresAt string `json:"expires_at"` // RFC3339 or empty
	}
	var req TokenReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}

	// Generate a random token
	tokenValue := uuid.New().String()

	var expiresAt *string
	if req.ExpiresAt != "" {
		expiresAt = &req.ExpiresAt
	}

	var t model.EnrollmentToken
	var err error
	if expiresAt != nil {
		err = database.DB.QueryRow(`
			INSERT INTO enrollment_tokens (organization_id, token, label, max_uses, expires_at)
			VALUES ($1, $2, $3, $4, $5::timestamptz)
			RETURNING id, organization_id, token, label, max_uses, use_count, expires_at, created_at`,
			claims.OrganizationID, tokenValue, req.Label, req.MaxUses, *expiresAt,
		).Scan(&t.ID, &t.OrganizationID, &t.Token, &t.Label, &t.MaxUses, &t.UseCount, &t.ExpiresAt, &t.CreatedAt)
	} else {
		err = database.DB.QueryRow(`
			INSERT INTO enrollment_tokens (organization_id, token, label, max_uses)
			VALUES ($1, $2, $3, $4)
			RETURNING id, organization_id, token, label, max_uses, use_count, expires_at, created_at`,
			claims.OrganizationID, tokenValue, req.Label, req.MaxUses,
		).Scan(&t.ID, &t.OrganizationID, &t.Token, &t.Label, &t.MaxUses, &t.UseCount, &t.ExpiresAt, &t.CreatedAt)
	}

	if err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"db insert failed: %v"}`, err), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(t)
}

// RevokeEnrollmentToken deletes a token
func RevokeEnrollmentToken(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodDelete {
		http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
		return
	}
	parts := strings.Split(r.URL.Path, "/")
	id, err := uuid.Parse(parts[len(parts)-1])
	if err != nil {
		http.Error(w, `{"error":"invalid token id"}`, http.StatusBadRequest)
		return
	}

	var exists bool
	_ = database.DB.QueryRow(`SELECT EXISTS(SELECT 1 FROM enrollment_tokens WHERE id=$1)`, id).Scan(&exists)
	if !exists {
		http.Error(w, `{"error":"token not found"}`, http.StatusNotFound)
		return
	}

	if _, err := database.DB.Exec(`DELETE FROM enrollment_tokens WHERE id = $1`, id); err != nil {
		http.Error(w, `{"error":"db delete failed"}`, http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// GenerateEnrollmentQR generates a QR code PNG for a given enrollment token.
// GET /api/v1/enrollment-tokens/{id}/qr
// Returns: {"qr_data": "<base64 PNG>", "payload": {...}}
func GenerateEnrollmentQR(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
		return
	}

	_, ok := r.Context().Value(auth.UserContextKey).(*auth.Claims)
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	// URL: /api/v1/enrollment-tokens/{id}/qr  → parts[-2] is the token id
	parts := strings.Split(r.URL.Path, "/")
	if len(parts) < 2 {
		http.Error(w, `{"error":"invalid URL path"}`, http.StatusBadRequest)
		return
	}
	tokenID, err := uuid.Parse(parts[len(parts)-2])
	if err != nil {
		http.Error(w, `{"error":"invalid token id"}`, http.StatusBadRequest)
		return
	}

	// Load the token record
	var t model.EnrollmentToken
	err = database.DB.QueryRow(`
		SELECT id, organization_id, token, label, max_uses, use_count, expires_at, created_at
		FROM enrollment_tokens WHERE id = $1`, tokenID,
	).Scan(&t.ID, &t.OrganizationID, &t.Token, &t.Label,
		&t.MaxUses, &t.UseCount, &t.ExpiresAt, &t.CreatedAt)
	if err != nil {
		if err == sql.ErrNoRows {
			http.Error(w, `{"error":"token not found"}`, http.StatusNotFound)
		} else {
			http.Error(w, `{"error":"database query failed"}`, http.StatusInternalServerError)
		}
		return
	}

	// Build the server URL from environment (default to localhost for dev)
	serverURL := os.Getenv("SERVER_URL")
	if serverURL == "" {
		serverURL = "http://localhost:8080"
	}

	// JSON payload that the Android agent will parse from the QR code
	qrPayload := map[string]interface{}{
		"server_url": serverURL,
		"token":      t.Token,
		"label":      t.Label,
	}
	payloadBytes, err := json.Marshal(qrPayload)
	if err != nil {
		http.Error(w, `{"error":"failed to build QR payload"}`, http.StatusInternalServerError)
		return
	}

	// Generate QR code as a 256×256 PNG in memory
	pngBytes, err := qrcode.Encode(string(payloadBytes), qrcode.Medium, 256)
	if err != nil {
		log.Printf("Failed to generate QR code: %v", err)
		http.Error(w, `{"error":"failed to generate QR code"}`, http.StatusInternalServerError)
		return
	}

	b64PNG := base64.StdEncoding.EncodeToString(pngBytes)

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"qr_data": b64PNG,
		"payload": qrPayload,
	})
}

// GetSavedViews returns saved filter presets for the current user
func GetSavedViews(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
		return
	}
	claims := r.Context().Value(auth.UserContextKey).(*auth.Claims)

	rows, err := database.DB.Query(`
		SELECT id, user_id, name, filters, created_at
		FROM saved_views WHERE user_id = $1 ORDER BY created_at DESC`, claims.UserID)
	if err != nil {
		http.Error(w, `{"error":"db query failed"}`, http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var views []model.SavedView
	for rows.Next() {
		var v model.SavedView
		if scanErr := rows.Scan(&v.ID, &v.UserID, &v.Name, &v.Filters, &v.CreatedAt); scanErr == nil {
			views = append(views, v)
		}
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(views)
}

// CreateSavedView saves a new filter preset
func CreateSavedView(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
		return
	}
	claims := r.Context().Value(auth.UserContextKey).(*auth.Claims)

	type ViewReq struct {
		Name    string `json:"name"`
		Filters string `json:"filters"` // JSON object
	}
	var req ViewReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Name == "" {
		http.Error(w, `{"error":"name and filters are required"}`, http.StatusBadRequest)
		return
	}

	var v model.SavedView
	err := database.DB.QueryRow(`
		INSERT INTO saved_views (user_id, name, filters)
		VALUES ($1, $2, $3::jsonb)
		RETURNING id, user_id, name, filters, created_at`,
		claims.UserID, req.Name, req.Filters,
	).Scan(&v.ID, &v.UserID, &v.Name, &v.Filters, &v.CreatedAt)
	if err != nil {
		http.Error(w, `{"error":"db insert failed"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(v)
}

// DeleteSavedView removes a saved view
func DeleteSavedView(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodDelete {
		http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
		return
	}
	claims := r.Context().Value(auth.UserContextKey).(*auth.Claims)

	parts := strings.Split(r.URL.Path, "/")
	id, err := uuid.Parse(parts[len(parts)-1])
	if err != nil {
		http.Error(w, `{"error":"invalid view id"}`, http.StatusBadRequest)
		return
	}

	// Only delete own views
	result, err := database.DB.Exec(`DELETE FROM saved_views WHERE id=$1 AND user_id=$2`, id, claims.UserID)
	if err != nil {
		http.Error(w, `{"error":"db delete failed"}`, http.StatusInternalServerError)
		return
	}
	affected, _ := result.RowsAffected()
	if affected == 0 {
		http.Error(w, `{"error":"view not found or not owned by user"}`, http.StatusNotFound)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// placeholder to satisfy import
var _ = sql.ErrNoRows
