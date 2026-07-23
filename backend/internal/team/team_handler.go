package team

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

type TeamCreateRequest struct {
	Name string `json:"name"`
}

type BulkDeviceAssignRequest struct {
	DeviceIDs []uuid.UUID `json:"device_ids"`
}

// ListTeams returns all teams with device counts
func ListTeams(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
		return
	}
	claims := r.Context().Value(auth.UserContextKey).(*auth.Claims)

	rows, err := database.DB.Query(`
		SELECT t.id, t.organization_id, t.name, t.created_at,
		       COUNT(d.id) AS device_count
		FROM teams t
		LEFT JOIN devices d ON d.team_id = t.id
		WHERE t.organization_id = $1
		GROUP BY t.id
		ORDER BY t.name`, claims.OrganizationID)
	if err != nil {
		http.Error(w, `{"error":"db query failed"}`, http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var teams []model.Team
	for rows.Next() {
		var t model.Team
		if scanErr := rows.Scan(&t.ID, &t.OrganizationID, &t.Name, &t.CreatedAt, &t.DeviceCount); scanErr == nil {
			teams = append(teams, t)
		}
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(teams)
}

// CreateTeam creates a new team
func CreateTeam(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
		return
	}
	claims := r.Context().Value(auth.UserContextKey).(*auth.Claims)

	var req TeamCreateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Name == "" {
		http.Error(w, `{"error":"name is required"}`, http.StatusBadRequest)
		return
	}

	var t model.Team
	err := database.DB.QueryRow(`
		INSERT INTO teams (organization_id, name) VALUES ($1, $2)
		RETURNING id, organization_id, name, created_at`,
		claims.OrganizationID, req.Name,
	).Scan(&t.ID, &t.OrganizationID, &t.Name, &t.CreatedAt)
	if err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"db insert failed: %v"}`, err), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(t)
}

// UpdateTeam renames a team
func UpdateTeam(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPut {
		http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
		return
	}
	parts := strings.Split(r.URL.Path, "/")
	id, err := uuid.Parse(parts[len(parts)-1])
	if err != nil {
		http.Error(w, `{"error":"invalid team id"}`, http.StatusBadRequest)
		return
	}

	var req TeamCreateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Name == "" {
		http.Error(w, `{"error":"name is required"}`, http.StatusBadRequest)
		return
	}

	_, err = database.DB.Exec(`UPDATE teams SET name = $1 WHERE id = $2`, req.Name, id)
	if err != nil {
		http.Error(w, `{"error":"db update failed"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_, _ = w.Write([]byte(`{"status":"updated"}`))
}

// DeleteTeam removes a team (devices have team_id set to NULL via FK constraint)
func DeleteTeam(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodDelete {
		http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
		return
	}
	parts := strings.Split(r.URL.Path, "/")
	id, err := uuid.Parse(parts[len(parts)-1])
	if err != nil {
		http.Error(w, `{"error":"invalid team id"}`, http.StatusBadRequest)
		return
	}

	if _, err := database.DB.Exec(`DELETE FROM teams WHERE id = $1`, id); err != nil {
		http.Error(w, `{"error":"db delete failed"}`, http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// AssignDevicesToTeam bulk-assigns devices to a team
func AssignDevicesToTeam(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
		return
	}
	parts := strings.Split(r.URL.Path, "/")
	// /api/v1/teams/{id}/devices
	id, err := uuid.Parse(parts[len(parts)-2])
	if err != nil {
		http.Error(w, `{"error":"invalid team id"}`, http.StatusBadRequest)
		return
	}

	var req BulkDeviceAssignRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || len(req.DeviceIDs) == 0 {
		http.Error(w, `{"error":"device_ids array is required"}`, http.StatusBadRequest)
		return
	}

	for _, devID := range req.DeviceIDs {
		_, _ = database.DB.Exec(`UPDATE devices SET team_id = $1, updated_at = NOW() WHERE id = $2`, id, devID)
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"status":   "assigned",
		"team_id":  id,
		"count":    len(req.DeviceIDs),
	})
}

// GetTeamMembers returns all users assigned to a team
func GetTeamMembers(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
		return
	}
	parts := strings.Split(r.URL.Path, "/")
	id, err := uuid.Parse(parts[len(parts)-2])
	if err != nil {
		http.Error(w, `{"error":"invalid team id"}`, http.StatusBadRequest)
		return
	}
	rows, err := database.DB.Query(`
		SELECT u.id, u.organization_id, u.email, u.role, u.created_at, u.updated_at
		FROM team_members tm JOIN users u ON tm.user_id = u.id
		WHERE tm.team_id = $1 ORDER BY u.email`, id)
	if err != nil {
		http.Error(w, `{"error":"db query failed"}`, http.StatusInternalServerError)
		return
	}
	defer rows.Close()
	type Member struct {
		ID    uuid.UUID `json:"id"`
		Email string    `json:"email"`
		Role  string    `json:"role"`
	}
	var members []Member
	for rows.Next() {
		var u struct {
			id, orgID            uuid.UUID
			email, role          string
			createdAt, updatedAt interface{}
		}
		if scanErr := rows.Scan(&u.id, &u.orgID, &u.email, &u.role, &u.createdAt, &u.updatedAt); scanErr == nil {
			members = append(members, Member{ID: u.id, Email: u.email, Role: u.role})
		}
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(members)
}

// AddTeamMember assigns a user to a team
func AddTeamMember(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
		return
	}
	parts := strings.Split(r.URL.Path, "/")
	teamID, err := uuid.Parse(parts[len(parts)-2])
	if err != nil {
		http.Error(w, `{"error":"invalid team id"}`, http.StatusBadRequest)
		return
	}
	var body struct {
		UserID uuid.UUID `json:"user_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, `{"error":"user_id is required"}`, http.StatusBadRequest)
		return
	}
	_, err = database.DB.Exec(
		`INSERT INTO team_members (team_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
		teamID, body.UserID)
	if err != nil {
		http.Error(w, `{"error":"db insert failed"}`, http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_, _ = w.Write([]byte(`{"status":"added"}`))
}

// RemoveTeamMember removes a user from a team
func RemoveTeamMember(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodDelete {
		http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
		return
	}
	parts := strings.Split(r.URL.Path, "/")
	// /api/v1/teams/{teamId}/members/{userId}
	userID, err := uuid.Parse(parts[len(parts)-1])
	if err != nil {
		http.Error(w, `{"error":"invalid user id"}`, http.StatusBadRequest)
		return
	}
	teamID, err := uuid.Parse(parts[len(parts)-3])
	if err != nil {
		http.Error(w, `{"error":"invalid team id"}`, http.StatusBadRequest)
		return
	}
	_, _ = database.DB.Exec(`DELETE FROM team_members WHERE team_id=$1 AND user_id=$2`, teamID, userID)
	w.WriteHeader(http.StatusNoContent)
}
