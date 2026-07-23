package user

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strings"

	"mdm-backend/internal/auth"
	"mdm-backend/internal/database"
	"mdm-backend/internal/email"
	"mdm-backend/internal/model"

	"github.com/google/uuid"
)

type CreateUserRequest struct {
	Email    string         `json:"email"`
	Password string         `json:"password"`
	Role     model.UserRole `json:"role"`
}

type UpdateUserRequest struct {
	Role model.UserRole `json:"role"`
}

type ChangePasswordRequest struct {
	CurrentPassword string `json:"current_password"`
	NewPassword     string `json:"new_password"`
}

func isValidRole(r model.UserRole) bool {
	switch r {
	case model.RoleSuperAdmin, model.RoleOrgAdmin, model.RoleTeamAdmin, model.RoleSupport, model.RoleAuditor:
		return true
	}
	return false
}

// ListUsers returns all users in the organisation (admin-only)
func ListUsers(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
		return
	}

	claims, ok := r.Context().Value(auth.UserContextKey).(*auth.Claims)
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	// Only admins may list users
	if claims.Role != string(model.RoleSuperAdmin) && claims.Role != string(model.RoleOrgAdmin) {
		http.Error(w, `{"error":"forbidden"}`, http.StatusForbidden)
		return
	}

	rows, err := database.DB.Query(`
		SELECT id, organization_id, email, role, created_at, updated_at
		FROM users WHERE organization_id = $1 ORDER BY created_at`, claims.OrganizationID)
	if err != nil {
		http.Error(w, `{"error":"db query failed"}`, http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var users []model.User
	for rows.Next() {
		var u model.User
		if scanErr := rows.Scan(&u.ID, &u.OrganizationID, &u.Email, &u.Role, &u.CreatedAt, &u.UpdatedAt); scanErr == nil {
			users = append(users, u)
		}
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(users)
}

// CreateUser creates a new user (admin-only)
func CreateUser(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
		return
	}

	claims, ok := r.Context().Value(auth.UserContextKey).(*auth.Claims)
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	if claims.Role != string(model.RoleSuperAdmin) && claims.Role != string(model.RoleOrgAdmin) {
		http.Error(w, `{"error":"forbidden: only admins can create users"}`, http.StatusForbidden)
		return
	}

	var req CreateUserRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}
	if req.Email == "" || req.Password == "" {
		http.Error(w, `{"error":"email and password are required"}`, http.StatusBadRequest)
		return
	}
	if req.Role == "" {
		req.Role = model.RoleSupport
	}
	if !isValidRole(req.Role) {
		http.Error(w, `{"error":"invalid role"}`, http.StatusBadRequest)
		return
	}

	hash, err := auth.HashPassword(req.Password)
	if err != nil {
		http.Error(w, `{"error":"failed to hash password"}`, http.StatusInternalServerError)
		return
	}

	var u model.User
	err = database.DB.QueryRow(`
		INSERT INTO users (organization_id, email, password_hash, role)
		VALUES ($1, $2, $3, $4)
		RETURNING id, organization_id, email, role, created_at, updated_at`,
		claims.OrganizationID, req.Email, hash, req.Role,
	).Scan(&u.ID, &u.OrganizationID, &u.Email, &u.Role, &u.CreatedAt, &u.UpdatedAt)
	if err != nil {
		if strings.Contains(err.Error(), "unique") {
			http.Error(w, `{"error":"email already exists"}`, http.StatusConflict)
		} else {
			http.Error(w, fmt.Sprintf(`{"error":"db insert failed: %v"}`, err), http.StatusInternalServerError)
		}
		return
	}

	// Audit log
	_, _ = database.DB.Exec(`
		INSERT INTO audit_logs (actor_id, action, target_type, target_id, details)
		VALUES ($1, 'USER_CREATE', 'USER', $2, $3)`,
		claims.UserID, u.ID, fmt.Sprintf(`{"email":"%s","role":"%s"}`, u.Email, u.Role),
	)

	// Send invitation email (non-fatal — runs asynchronously)
	go func(inviteeEmail, rawPassword string) {
		mailer := email.LoadConfig()
		if mailer == nil {
			return
		}
		var inviterEmail, orgName string
		_ = database.DB.QueryRow(`SELECT email FROM users WHERE id = $1`, claims.UserID).Scan(&inviterEmail)
		_ = database.DB.QueryRow(`SELECT name FROM organizations WHERE id = $1`, claims.OrganizationID).Scan(&orgName)
		if err := mailer.SendTeamInvitation(inviteeEmail, inviterEmail, orgName, rawPassword); err != nil {
			log.Printf("invitation email failed for %s: %v", inviteeEmail, err)
		}
	}(req.Email, req.Password)

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(u)
}

// UpdateUserRole changes a user's role (admin-only)
func UpdateUserRole(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPut {
		http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
		return
	}

	claims, ok := r.Context().Value(auth.UserContextKey).(*auth.Claims)
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}
	if claims.Role != string(model.RoleSuperAdmin) && claims.Role != string(model.RoleOrgAdmin) {
		http.Error(w, `{"error":"forbidden"}`, http.StatusForbidden)
		return
	}

	parts := strings.Split(r.URL.Path, "/")
	userID, err := uuid.Parse(parts[len(parts)-1])
	if err != nil {
		http.Error(w, `{"error":"invalid user id"}`, http.StatusBadRequest)
		return
	}

	var req UpdateUserRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || !isValidRole(req.Role) {
		http.Error(w, `{"error":"valid role is required"}`, http.StatusBadRequest)
		return
	}

	_, err = database.DB.Exec(`UPDATE users SET role=$1, updated_at=NOW() WHERE id=$2`, req.Role, userID)
	if err != nil {
		http.Error(w, `{"error":"db update failed"}`, http.StatusInternalServerError)
		return
	}

	_, _ = database.DB.Exec(`
		INSERT INTO audit_logs (actor_id, action, target_type, target_id, details)
		VALUES ($1, 'USER_ROLE_UPDATE', 'USER', $2, $3)`,
		claims.UserID, userID, fmt.Sprintf(`{"new_role":"%s"}`, req.Role),
	)

	w.Header().Set("Content-Type", "application/json")
	_, _ = w.Write([]byte(`{"status":"updated"}`))
}

// DeleteUser removes a user (admin-only, cannot self-delete)
func DeleteUser(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodDelete {
		http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
		return
	}

	claims, ok := r.Context().Value(auth.UserContextKey).(*auth.Claims)
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}
	if claims.Role != string(model.RoleSuperAdmin) && claims.Role != string(model.RoleOrgAdmin) {
		http.Error(w, `{"error":"forbidden"}`, http.StatusForbidden)
		return
	}

	parts := strings.Split(r.URL.Path, "/")
	userID, err := uuid.Parse(parts[len(parts)-1])
	if err != nil {
		http.Error(w, `{"error":"invalid user id"}`, http.StatusBadRequest)
		return
	}

	if userID == claims.UserID {
		http.Error(w, `{"error":"cannot delete your own account"}`, http.StatusBadRequest)
		return
	}

	result, err := database.DB.Exec(`DELETE FROM users WHERE id=$1 AND organization_id=$2`, userID, claims.OrganizationID)
	if err != nil {
		http.Error(w, `{"error":"db delete failed"}`, http.StatusInternalServerError)
		return
	}
	affected, _ := result.RowsAffected()
	if affected == 0 {
		http.Error(w, `{"error":"user not found"}`, http.StatusNotFound)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// GetMe returns the current user's profile
func GetMe(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
		return
	}

	claims, ok := r.Context().Value(auth.UserContextKey).(*auth.Claims)
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	var u model.User
	err := database.DB.QueryRow(`
		SELECT id, organization_id, email, role, created_at, updated_at
		FROM users WHERE id = $1`, claims.UserID,
	).Scan(&u.ID, &u.OrganizationID, &u.Email, &u.Role, &u.CreatedAt, &u.UpdatedAt)
	if err == sql.ErrNoRows {
		http.Error(w, `{"error":"user not found"}`, http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(u)
}
