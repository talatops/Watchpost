package policy

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"strings"

	"mdm-backend/internal/auth"
	"mdm-backend/internal/database"
	"mdm-backend/internal/model"

	"github.com/google/uuid"
)

type PolicyCreateRequest struct {
	TeamID      *uuid.UUID `json:"team_id,omitempty"`
	Name        string     `json:"name"`
	Description string     `json:"description"`
	ContentYAML string     `json:"content_yaml"`
}

type PolicyResponse struct {
	ID          uuid.UUID  `json:"id"`
	TeamID      *uuid.UUID `json:"team_id,omitempty"`
	Name        string     `json:"name"`
	Description string     `json:"description"`
	ContentYAML string     `json:"content_yaml"`
	Version     int        `json:"version"`
}

type PolicyVersionResponse struct {
	ID          uuid.UUID `json:"id"`
	PolicyID    uuid.UUID `json:"policy_id"`
	Version     int       `json:"version"`
	ContentYAML string    `json:"content_yaml"`
	CreatedAt   string    `json:"created_at"`
}

type ComplianceSummaryResponse struct {
	TotalDevices   int `json:"total_devices"`
	CompliantCount int `json:"compliant_count"`
	PendingCount   int `json:"pending_count"`
	NonCompliant   int `json:"non_compliant_count"`
}

// GetPolicies lists all policies
func GetPolicies(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
		return
	}

	claims, ok := r.Context().Value(auth.UserContextKey).(*auth.Claims)
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	// Dynamic querying: if user is Team Admin, filter by their team.
	// For Phase 1 we list all policies for both roles.
	var rows *sql.Rows
	var err error
	if claims.Role == string(model.RoleTeamAdmin) {
		rows, err = database.DB.Query(`
			SELECT id, team_id, name, description, content_yaml, version
			FROM policies`)
	} else {
		rows, err = database.DB.Query(`
			SELECT id, team_id, name, description, content_yaml, version
			FROM policies`)
	}

	if err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"database query error: %v"}`, err), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var policies []PolicyResponse
	for rows.Next() {
		var p PolicyResponse
		err = rows.Scan(&p.ID, &p.TeamID, &p.Name, &p.Description, &p.ContentYAML, &p.Version)
		if err != nil {
			http.Error(w, fmt.Sprintf(`{"error":"error scanning policy: %v"}`, err), http.StatusInternalServerError)
			return
		}
		policies = append(policies, p)
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(policies)
}

// CreatePolicy creates a new YAML policy and snapshots version 1 into policy_versions.
func CreatePolicy(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
		return
	}

	claims, ok := r.Context().Value(auth.UserContextKey).(*auth.Claims)
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	var req PolicyCreateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"invalid request body: %v"}`, err), http.StatusBadRequest)
		return
	}

	if req.Name == "" || req.ContentYAML == "" {
		http.Error(w, `{"error":"name and content_yaml are required"}`, http.StatusBadRequest)
		return
	}

	if !strings.Contains(req.ContentYAML, "policy:") {
		http.Error(w, `{"error":"invalid YAML policy content: must contain a 'policy:' block"}`, http.StatusBadRequest)
		return
	}

	var policyID uuid.UUID
	err := database.DB.QueryRow(`
		INSERT INTO policies (team_id, name, description, content_yaml, version)
		VALUES ($1, $2, $3, $4, 1)
		RETURNING id`,
		req.TeamID, req.Name, req.Description, req.ContentYAML,
	).Scan(&policyID)

	if err != nil {
		log.Printf("Failed to save policy: %v", err)
		http.Error(w, `{"error":"database write failed"}`, http.StatusInternalServerError)
		return
	}

	// Snapshot version 1 into policy_versions
	_, err = database.DB.Exec(`
		INSERT INTO policy_versions (policy_id, version, content_yaml)
		VALUES ($1, 1, $2)
		ON CONFLICT (policy_id, version) DO NOTHING`,
		policyID, req.ContentYAML,
	)
	if err != nil {
		log.Printf("Failed to snapshot policy version: %v", err)
		// Non-fatal — continue
	}

	// Audit log
	_, _ = database.DB.Exec(`
		INSERT INTO audit_logs (actor_id, action, target_type, target_id, details)
		VALUES ($1, 'POLICY_CREATE', 'POLICY', $2, $3)`,
		claims.UserID, policyID, fmt.Sprintf(`{"name":"%s"}`, req.Name),
	)

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(PolicyResponse{
		ID:          policyID,
		TeamID:      req.TeamID,
		Name:        req.Name,
		Description: req.Description,
		ContentYAML: req.ContentYAML,
		Version:     1,
	})
}

// UpdatePolicy updates an existing policy, increments version, and snapshots into policy_versions.
func UpdatePolicy(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPut {
		http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
		return
	}

	claims, ok := r.Context().Value(auth.UserContextKey).(*auth.Claims)
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	parts := strings.Split(r.URL.Path, "/")
	if len(parts) < 5 {
		http.Error(w, `{"error":"invalid URL path"}`, http.StatusBadRequest)
		return
	}
	idStr := parts[len(parts)-1]
	policyID, err := uuid.Parse(idStr)
	if err != nil {
		http.Error(w, `{"error":"invalid policy id"}`, http.StatusBadRequest)
		return
	}

	var req PolicyCreateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"invalid request body: %v"}`, err), http.StatusBadRequest)
		return
	}

	// Read current version
	var currentVersion int
	err = database.DB.QueryRow(`SELECT version FROM policies WHERE id = $1`, policyID).Scan(&currentVersion)
	if err != nil {
		if err == sql.ErrNoRows {
			http.Error(w, `{"error":"policy not found"}`, http.StatusNotFound)
		} else {
			http.Error(w, `{"error":"database read error"}`, http.StatusInternalServerError)
		}
		return
	}

	nextVersion := currentVersion + 1

	_, err = database.DB.Exec(`
		UPDATE policies
		SET name = $1, description = $2, content_yaml = $3, version = $4, updated_at = NOW()
		WHERE id = $5`,
		req.Name, req.Description, req.ContentYAML, nextVersion, policyID,
	)
	if err != nil {
		log.Printf("Failed to update policy: %v", err)
		http.Error(w, `{"error":"database update failed"}`, http.StatusInternalServerError)
		return
	}

	// Snapshot new version into policy_versions
	_, err = database.DB.Exec(`
		INSERT INTO policy_versions (policy_id, version, content_yaml)
		VALUES ($1, $2, $3)
		ON CONFLICT (policy_id, version) DO NOTHING`,
		policyID, nextVersion, req.ContentYAML,
	)
	if err != nil {
		log.Printf("Failed to snapshot policy version %d: %v", nextVersion, err)
		// Non-fatal — continue
	}

	// Audit log
	_, _ = database.DB.Exec(`
		INSERT INTO audit_logs (actor_id, action, target_type, target_id, details)
		VALUES ($1, 'POLICY_UPDATE', 'POLICY', $2, $3)`,
		claims.UserID, policyID, fmt.Sprintf(`{"name":"%s","version":%d}`, req.Name, nextVersion),
	)

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(PolicyResponse{
		ID:          policyID,
		TeamID:      req.TeamID,
		Name:        req.Name,
		Description: req.Description,
		ContentYAML: req.ContentYAML,
		Version:     nextVersion,
	})
}

// GetPolicyVersions returns the version history for a single policy.
// GET /api/v1/policies/{id}/versions
func GetPolicyVersions(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
		return
	}

	_, ok := r.Context().Value(auth.UserContextKey).(*auth.Claims)
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	// URL: /api/v1/policies/{id}/versions  → parts[-2] is the id
	parts := strings.Split(r.URL.Path, "/")
	if len(parts) < 2 {
		http.Error(w, `{"error":"invalid URL path"}`, http.StatusBadRequest)
		return
	}
	policyID, err := uuid.Parse(parts[len(parts)-2])
	if err != nil {
		http.Error(w, `{"error":"invalid policy id"}`, http.StatusBadRequest)
		return
	}

	rows, err := database.DB.Query(`
		SELECT id, policy_id, version, content_yaml, created_at
		FROM policy_versions
		WHERE policy_id = $1
		ORDER BY version DESC`, policyID)
	if err != nil {
		http.Error(w, `{"error":"database query failed"}`, http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var versions []PolicyVersionResponse
	for rows.Next() {
		var v PolicyVersionResponse
		var createdAt interface{}
		if scanErr := rows.Scan(&v.ID, &v.PolicyID, &v.Version, &v.ContentYAML, &createdAt); scanErr == nil {
			v.CreatedAt = fmt.Sprintf("%v", createdAt)
			versions = append(versions, v)
		}
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(versions)
}

// RollbackPolicy restores a policy to a previous version snapshot.
// POST /api/v1/policies/{id}/rollback  body: {"version": N}
func RollbackPolicy(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
		return
	}

	claims, ok := r.Context().Value(auth.UserContextKey).(*auth.Claims)
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	// URL: /api/v1/policies/{id}/rollback  → parts[-2] is the id
	parts := strings.Split(r.URL.Path, "/")
	if len(parts) < 2 {
		http.Error(w, `{"error":"invalid URL path"}`, http.StatusBadRequest)
		return
	}
	policyID, err := uuid.Parse(parts[len(parts)-2])
	if err != nil {
		http.Error(w, `{"error":"invalid policy id"}`, http.StatusBadRequest)
		return
	}

	type RollbackRequest struct {
		Version int `json:"version"`
	}
	var req RollbackRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Version < 1 {
		http.Error(w, `{"error":"body must be {\"version\": N} with N >= 1"}`, http.StatusBadRequest)
		return
	}

	// Load the snapshot content for the requested version
	var snapshotContent string
	err = database.DB.QueryRow(`
		SELECT content_yaml FROM policy_versions
		WHERE policy_id = $1 AND version = $2`, policyID, req.Version,
	).Scan(&snapshotContent)
	if err != nil {
		if err == sql.ErrNoRows {
			http.Error(w, fmt.Sprintf(`{"error":"version %d not found for this policy"}`, req.Version), http.StatusNotFound)
		} else {
			http.Error(w, `{"error":"database read failed"}`, http.StatusInternalServerError)
		}
		return
	}

	// Read current policy to get name/description and bump version
	var currentVersion int
	var policyName, policyDesc string
	var teamID *uuid.UUID
	err = database.DB.QueryRow(`
		SELECT version, name, description, team_id FROM policies WHERE id = $1`, policyID,
	).Scan(&currentVersion, &policyName, &policyDesc, &teamID)
	if err != nil {
		if err == sql.ErrNoRows {
			http.Error(w, `{"error":"policy not found"}`, http.StatusNotFound)
		} else {
			http.Error(w, `{"error":"database read failed"}`, http.StatusInternalServerError)
		}
		return
	}

	nextVersion := currentVersion + 1

	// Apply the rollback: update the policy content and bump the version counter
	_, err = database.DB.Exec(`
		UPDATE policies
		SET content_yaml = $1, version = $2, updated_at = NOW()
		WHERE id = $3`,
		snapshotContent, nextVersion, policyID,
	)
	if err != nil {
		http.Error(w, `{"error":"database update failed"}`, http.StatusInternalServerError)
		return
	}

	// Snapshot the rolled-back content as the new version so history stays linear
	_, _ = database.DB.Exec(`
		INSERT INTO policy_versions (policy_id, version, content_yaml)
		VALUES ($1, $2, $3)
		ON CONFLICT (policy_id, version) DO NOTHING`,
		policyID, nextVersion, snapshotContent,
	)

	// Audit log
	_, _ = database.DB.Exec(`
		INSERT INTO audit_logs (actor_id, action, target_type, target_id, details)
		VALUES ($1, 'POLICY_ROLLBACK', 'POLICY', $2, $3)`,
		claims.UserID, policyID,
		fmt.Sprintf(`{"rolled_back_to_version":%d,"new_version":%d}`, req.Version, nextVersion),
	)

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(PolicyResponse{
		ID:          policyID,
		TeamID:      teamID,
		Name:        policyName,
		Description: policyDesc,
		ContentYAML: snapshotContent,
		Version:     nextVersion,
	})
}

// GetComplianceSummary gets summary count of device compliance states
func GetComplianceSummary(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
		return
	}

	var totalDevices, compliant, pending, nonCompliant int

	_ = database.DB.QueryRow(`SELECT COUNT(*) FROM devices WHERE enrollment_status = 'ENROLLED'`).Scan(&totalDevices)
	_ = database.DB.QueryRow(`SELECT COUNT(DISTINCT device_id) FROM policy_compliance WHERE status = 'COMPLIANT'`).Scan(&compliant)
	_ = database.DB.QueryRow(`SELECT COUNT(DISTINCT device_id) FROM policy_compliance WHERE status = 'NON_COMPLIANT'`).Scan(&nonCompliant)

	pending = totalDevices - compliant - nonCompliant
	if pending < 0 {
		pending = 0
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(ComplianceSummaryResponse{
		TotalDevices:   totalDevices,
		CompliantCount: compliant,
		PendingCount:   pending,
		NonCompliant:   nonCompliant,
	})
}

// DeletePolicy removes a policy by ID
func DeletePolicy(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodDelete {
		http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
		return
	}

	claims, ok := r.Context().Value(auth.UserContextKey).(*auth.Claims)
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	parts := strings.Split(r.URL.Path, "/")
	policyID, err := uuid.Parse(parts[len(parts)-1])
	if err != nil {
		http.Error(w, `{"error":"invalid policy id"}`, http.StatusBadRequest)
		return
	}

	result, err := database.DB.Exec(`DELETE FROM policies WHERE id = $1`, policyID)
	if err != nil {
		log.Printf("Failed to delete policy: %v", err)
		http.Error(w, `{"error":"database delete failed"}`, http.StatusInternalServerError)
		return
	}
	affected, _ := result.RowsAffected()
	if affected == 0 {
		http.Error(w, `{"error":"policy not found"}`, http.StatusNotFound)
		return
	}

	_, _ = database.DB.Exec(`
		INSERT INTO audit_logs (actor_id, action, target_type, target_id, details)
		VALUES ($1, 'POLICY_DELETE', 'POLICY', $2, '{}')`,
		claims.UserID, policyID,
	)

	w.WriteHeader(http.StatusNoContent)
}

// ensure strconv is used by GetPolicyVersions query param parsing (reserved for future pagination)
var _ = strconv.Itoa
