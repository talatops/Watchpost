package bulk

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

	"mdm-backend/internal/auth"
	"mdm-backend/internal/database"
	"mdm-backend/internal/fcm"

	"github.com/google/uuid"
)

type BulkActionRequest struct {
	DeviceIDs []uuid.UUID `json:"device_ids"`
	Action    string      `json:"action"` // REBOOT, LOCK, WIPE, SYNC
}

type BulkTeamAssignRequest struct {
	DeviceIDs []uuid.UUID `json:"device_ids"`
	TeamID    uuid.UUID   `json:"team_id"`
}

type BulkPolicyPushRequest struct {
	DeviceIDs []uuid.UUID `json:"device_ids"`
	PolicyID  uuid.UUID   `json:"policy_id"`
}

// BulkAction executes a remote action on multiple devices
func BulkAction(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
		return
	}

	claims, ok := r.Context().Value(auth.UserContextKey).(*auth.Claims)
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	var req BulkActionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}

	action := strings.ToUpper(req.Action)
	if action != "REBOOT" && action != "LOCK" && action != "WIPE" && action != "SYNC" {
		http.Error(w, `{"error":"invalid action"}`, http.StatusBadRequest)
		return
	}

	if len(req.DeviceIDs) == 0 {
		http.Error(w, `{"error":"device_ids is required"}`, http.StatusBadRequest)
		return
	}

	success := 0
	for _, devID := range req.DeviceIDs {
		var serial, fcmToken string
		err := database.DB.QueryRow(
			`SELECT serial_number, COALESCE(fcm_registration_token,'') FROM devices WHERE id = $1`, devID,
		).Scan(&serial, &fcmToken)
		if err != nil {
			continue
		}

		// Enqueue command
		var cmdID uuid.UUID
		_ = database.DB.QueryRow(`
			INSERT INTO device_commands (device_id, command, status)
			VALUES ($1, $2, 'PENDING') RETURNING id`, devID, action,
		).Scan(&cmdID)

		// Audit
		_, _ = database.DB.Exec(`
			INSERT INTO audit_logs (actor_id, action, target_type, target_id, details)
			VALUES ($1, $2, 'DEVICE', $3, $4)`,
			claims.UserID, "BULK_"+action, devID,
			fmt.Sprintf(`{"serial":"%s"}`, serial),
		)

		// FCM push
		if fcmToken != "" {
			go func(token string, cid uuid.UUID) {
				pushErr := fcm.SendToDevice(token, map[string]interface{}{
					"type":       "COMMAND",
					"command":    action,
					"command_id": cid.String(),
				})
				if pushErr == nil {
					_, _ = database.DB.Exec(
						`UPDATE device_commands SET status='SENT', sent_at=NOW() WHERE id=$1`, cid)
				}
			}(fcmToken, cmdID)
		}

		success++
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"status":    "queued",
		"action":    action,
		"queued":    success,
		"requested": len(req.DeviceIDs),
	})
}

// BulkAssignTeam assigns multiple devices to a team
func BulkAssignTeam(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
		return
	}

	var req BulkTeamAssignRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || len(req.DeviceIDs) == 0 {
		http.Error(w, `{"error":"device_ids and team_id are required"}`, http.StatusBadRequest)
		return
	}

	count := 0
	for _, devID := range req.DeviceIDs {
		if _, err := database.DB.Exec(
			`UPDATE devices SET team_id=$1, updated_at=NOW() WHERE id=$2`, req.TeamID, devID,
		); err == nil {
			count++
		}
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"status":  "assigned",
		"team_id": req.TeamID,
		"count":   count,
	})
}

// BulkAssignPolicy creates policy compliance records for multiple devices
func BulkAssignPolicy(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
		return
	}

	var req BulkPolicyPushRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || len(req.DeviceIDs) == 0 {
		http.Error(w, `{"error":"device_ids and policy_id are required"}`, http.StatusBadRequest)
		return
	}

	count := 0
	for _, devID := range req.DeviceIDs {
		_, err := database.DB.Exec(`
			INSERT INTO policy_compliance (device_id, policy_id, status, updated_at)
			VALUES ($1, $2, 'PENDING', NOW())
			ON CONFLICT (device_id, policy_id) DO UPDATE SET status='PENDING', updated_at=NOW()`,
			devID, req.PolicyID,
		)
		if err == nil {
			count++
		}
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"status":    "pushed",
		"policy_id": req.PolicyID,
		"count":     count,
	})
}
