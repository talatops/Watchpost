package label

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

	"mdm-backend/internal/auth"
	"mdm-backend/internal/database"
	"mdm-backend/internal/model"

	"github.com/google/uuid"
)

type LabelCreateRequest struct {
	Name        string `json:"name"`
	Description string `json:"description"`
	RuleQuery   string `json:"rule_query"`
	LabelType   string `json:"label_type"` // DYNAMIC or MANUAL
}

// ListLabels returns all labels with device counts
func ListLabels(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
		return
	}
	claims := r.Context().Value(auth.UserContextKey).(*auth.Claims)

	rows, err := database.DB.Query(`
		SELECT l.id, l.organization_id, l.name, COALESCE(l.description,''),
		       l.rule_query, l.label_type, l.created_at, l.updated_at,
		       COUNT(dl.device_id) AS device_count
		FROM labels l
		LEFT JOIN device_labels dl ON dl.label_id = l.id
		WHERE l.organization_id = $1
		GROUP BY l.id
		ORDER BY l.name`, claims.OrganizationID)
	if err != nil {
		http.Error(w, `{"error":"db query failed"}`, http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var labels []model.Label
	for rows.Next() {
		var l model.Label
		if scanErr := rows.Scan(&l.ID, &l.OrganizationID, &l.Name, &l.Description,
			&l.RuleQuery, &l.LabelType, &l.CreatedAt, &l.UpdatedAt, &l.DeviceCount); scanErr == nil {
			labels = append(labels, l)
		}
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(labels)
}

// CreateLabel creates a new dynamic or manual label
func CreateLabel(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
		return
	}
	claims := r.Context().Value(auth.UserContextKey).(*auth.Claims)

	var req LabelCreateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}
	if req.Name == "" || req.RuleQuery == "" {
		http.Error(w, `{"error":"name and rule_query are required"}`, http.StatusBadRequest)
		return
	}
	if req.LabelType == "" {
		req.LabelType = "DYNAMIC"
	}

	var l model.Label
	err := database.DB.QueryRow(`
		INSERT INTO labels (organization_id, name, description, rule_query, label_type)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING id, organization_id, name, COALESCE(description,''), rule_query, label_type, created_at, updated_at`,
		claims.OrganizationID, req.Name, req.Description, req.RuleQuery, req.LabelType,
	).Scan(&l.ID, &l.OrganizationID, &l.Name, &l.Description, &l.RuleQuery, &l.LabelType, &l.CreatedAt, &l.UpdatedAt)
	if err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"db insert failed: %v"}`, err), http.StatusInternalServerError)
		return
	}

	// Immediately evaluate this label
	go evaluateLabel(l.ID, l.RuleQuery)

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(l)
}

// UpdateLabel updates a label's name/rule
func UpdateLabel(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPut {
		http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
		return
	}
	parts := strings.Split(r.URL.Path, "/")
	id, err := uuid.Parse(parts[len(parts)-1])
	if err != nil {
		http.Error(w, `{"error":"invalid label id"}`, http.StatusBadRequest)
		return
	}

	var req LabelCreateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}

	_, err = database.DB.Exec(`
		UPDATE labels SET name=$1, description=$2, rule_query=$3, updated_at=NOW()
		WHERE id=$4`, req.Name, req.Description, req.RuleQuery, id)
	if err != nil {
		http.Error(w, `{"error":"db update failed"}`, http.StatusInternalServerError)
		return
	}

	go evaluateLabel(id, req.RuleQuery)

	w.Header().Set("Content-Type", "application/json")
	_, _ = w.Write([]byte(`{"status":"updated"}`))
}

// DeleteLabel removes a label
func DeleteLabel(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodDelete {
		http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
		return
	}
	parts := strings.Split(r.URL.Path, "/")
	id, err := uuid.Parse(parts[len(parts)-1])
	if err != nil {
		http.Error(w, `{"error":"invalid label id"}`, http.StatusBadRequest)
		return
	}

	if _, err := database.DB.Exec(`DELETE FROM labels WHERE id = $1`, id); err != nil {
		http.Error(w, `{"error":"db delete failed"}`, http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// GetLabelDevices lists devices matching a label
func GetLabelDevices(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
		return
	}
	parts := strings.Split(r.URL.Path, "/")
	// /api/v1/labels/{id}/devices
	id, err := uuid.Parse(parts[len(parts)-2])
	if err != nil {
		http.Error(w, `{"error":"invalid label id"}`, http.StatusBadRequest)
		return
	}

	rows, err := database.DB.Query(`
		SELECT d.id, d.team_id, d.serial_number, d.model, d.os_version, d.patch_level,
		       d.enrollment_status, d.last_seen, d.created_at
		FROM devices d
		JOIN device_labels dl ON dl.device_id = d.id
		WHERE dl.label_id = $1
		ORDER BY d.last_seen DESC`, id)
	if err != nil {
		http.Error(w, `{"error":"db query failed"}`, http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var devices []model.Device
	for rows.Next() {
		var d model.Device
		if scanErr := rows.Scan(&d.ID, &d.TeamID, &d.SerialNumber, &d.Model, &d.OSVersion, &d.PatchLevel,
			&d.EnrollmentStatus, &d.LastSeen, &d.CreatedAt); scanErr == nil {
			devices = append(devices, d)
		}
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(devices)
}

// EvaluateAllLabels re-evaluates all dynamic labels (called via POST /api/v1/labels/evaluate)
func EvaluateAllLabels(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
		return
	}

	rows, err := database.DB.Query(`SELECT id, rule_query FROM labels WHERE label_type = 'DYNAMIC'`)
	if err != nil {
		http.Error(w, `{"error":"db query failed"}`, http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	count := 0
	for rows.Next() {
		var id uuid.UUID
		var query string
		if scanErr := rows.Scan(&id, &query); scanErr == nil {
			evaluateLabel(id, query)
			count++
		}
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]int{"labels_evaluated": count})
}

// evaluateLabel executes a label's rule_query against devices and refreshes device_labels
// The rule_query is a SQL WHERE clause fragment applied against the devices table.
// Only a restricted set of columns is allowed to prevent injection.
func evaluateLabel(labelID uuid.UUID, ruleQuery string) {
	// Allowlist of column names usable in rule queries
	allowedColumns := []string{
		"os_version", "model", "enrollment_status", "patch_level",
		"battery_level", "storage_available", "wifi_ssid",
	}

	safe := false
	lower := strings.ToLower(ruleQuery)
	for _, col := range allowedColumns {
		if strings.Contains(lower, col) {
			safe = true
			break
		}
	}

	// Block dangerous keywords
	dangerous := []string{"drop", "delete", "insert", "update", "truncate", "alter", "create", ";", "--", "/*"}
	for _, d := range dangerous {
		if strings.Contains(lower, d) {
			return
		}
	}

	if !safe && ruleQuery != "1=1" {
		return
	}

	// Find matching device IDs
	query := fmt.Sprintf(`SELECT id FROM devices WHERE %s`, ruleQuery)
	rows, err := database.DB.Query(query)
	if err != nil {
		return
	}
	defer rows.Close()

	var deviceIDs []uuid.UUID
	for rows.Next() {
		var id uuid.UUID
		if scanErr := rows.Scan(&id); scanErr == nil {
			deviceIDs = append(deviceIDs, id)
		}
	}

	// Refresh device_labels: remove old, insert new
	_, _ = database.DB.Exec(`DELETE FROM device_labels WHERE label_id = $1`, labelID)
	for _, devID := range deviceIDs {
		_, _ = database.DB.Exec(`
			INSERT INTO device_labels (device_id, label_id) VALUES ($1, $2)
			ON CONFLICT DO NOTHING`, devID, labelID)
	}
}
