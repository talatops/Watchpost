package device

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"

	"mdm-backend/internal/auth"
	"mdm-backend/internal/database"
	"mdm-backend/internal/fcm"
	"mdm-backend/internal/model"
	"mdm-backend/internal/webhook"

	"github.com/google/uuid"
)

type DeviceDetailResponse struct {
	Device           model.Device             `json:"device"`
	PolicyCompliance []model.PolicyCompliance `json:"policy_compliance"`
	Events           []model.DeviceEvent      `json:"events"`
}

type RemoteActionRequest struct {
	Action   string `json:"action"`             // REBOOT, LOCK, WIPE, SYNC
	WipeType string `json:"wipe_type,omitempty"` // FULL | CORPORATE (only for WIPE)
}

// GetDevices lists devices with pagination and filtering
func GetDevices(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
		return
	}

	_, ok := r.Context().Value(auth.UserContextKey).(*auth.Claims)
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	q := r.URL.Query()
	modelFilter := q.Get("model")
	statusFilter := q.Get("status")
	searchFilter := q.Get("search")

	page := 1
	pageSize := 50
	if p, err := strconv.Atoi(q.Get("page")); err == nil && p > 0 {
		page = p
	}
	if ps, err := strconv.Atoi(q.Get("page_size")); err == nil && ps > 0 && ps <= 200 {
		pageSize = ps
	}
	offset := (page - 1) * pageSize

	baseWhere := "WHERE 1=1"
	var args []interface{}
	argIdx := 1

	if modelFilter != "" {
		baseWhere += fmt.Sprintf(" AND model ILIKE $%d", argIdx)
		args = append(args, "%"+modelFilter+"%")
		argIdx++
	}
	if statusFilter != "" {
		baseWhere += fmt.Sprintf(" AND enrollment_status = $%d", argIdx)
		args = append(args, statusFilter)
		argIdx++
	}
	if searchFilter != "" {
		baseWhere += fmt.Sprintf(" AND (serial_number ILIKE $%d OR model ILIKE $%d)", argIdx, argIdx+1)
		args = append(args, "%"+searchFilter+"%", "%"+searchFilter+"%")
		argIdx += 2
	}

	var total int
	_ = database.DB.QueryRow("SELECT COUNT(*) FROM devices "+baseWhere, args...).Scan(&total)

	selectArgs := append(args, pageSize, offset)
	query := fmt.Sprintf(`
		SELECT id, team_id, serial_number, model, os_version, patch_level,
		       enrollment_status, last_seen, created_at,
		       battery_level, storage_total, storage_available, wifi_ssid
		FROM devices %s ORDER BY last_seen DESC LIMIT $%d OFFSET $%d`,
		baseWhere, argIdx, argIdx+1)

	rows, err := database.DB.Query(query, selectArgs...)
	if err != nil {
		log.Printf("Failed to query devices: %v", err)
		http.Error(w, `{"error":"database query failed"}`, http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var devices []model.Device
	for rows.Next() {
		var d model.Device
		err = rows.Scan(
			&d.ID, &d.TeamID, &d.SerialNumber, &d.Model, &d.OSVersion, &d.PatchLevel,
			&d.EnrollmentStatus, &d.LastSeen, &d.CreatedAt,
			&d.BatteryLevel, &d.StorageTotal, &d.StorageAvailable, &d.WifiSSID,
		)
		if err != nil {
			http.Error(w, fmt.Sprintf(`{"error":"scan error: %v"}`, err), http.StatusInternalServerError)
			return
		}
		devices = append(devices, d)
	}

	type PaginatedResponse struct {
		Data     []model.Device `json:"data"`
		Total    int            `json:"total"`
		Page     int            `json:"page"`
		PageSize int            `json:"page_size"`
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(PaginatedResponse{
		Data:     devices,
		Total:    total,
		Page:     page,
		PageSize: pageSize,
	})
}

// GetDeviceDetail returns a single device with compliance and event history
func GetDeviceDetail(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
		return
	}

	_, ok := r.Context().Value(auth.UserContextKey).(*auth.Claims)
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	parts := strings.Split(r.URL.Path, "/")
	devID, err := uuid.Parse(parts[len(parts)-1])
	if err != nil {
		http.Error(w, `{"error":"invalid device id"}`, http.StatusBadRequest)
		return
	}

	var dev model.Device
	err = database.DB.QueryRow(`
		SELECT id, team_id, serial_number, model, os_version, patch_level,
		       enrollment_status, last_seen, created_at, updated_at,
		       battery_level, storage_total, storage_available, wifi_ssid, installed_apps
		FROM devices WHERE id = $1`, devID,
	).Scan(
		&dev.ID, &dev.TeamID, &dev.SerialNumber, &dev.Model, &dev.OSVersion, &dev.PatchLevel,
		&dev.EnrollmentStatus, &dev.LastSeen, &dev.CreatedAt, &dev.UpdatedAt,
		&dev.BatteryLevel, &dev.StorageTotal, &dev.StorageAvailable, &dev.WifiSSID, &dev.InstalledApps,
	)
	if err != nil {
		if err == sql.ErrNoRows {
			http.Error(w, `{"error":"device not found"}`, http.StatusNotFound)
		} else {
			http.Error(w, `{"error":"database query failed"}`, http.StatusInternalServerError)
		}
		return
	}

	var compliances []model.PolicyCompliance
	cRows, _ := database.DB.Query(`
		SELECT device_id, policy_id, status, error_message, updated_at
		FROM policy_compliance WHERE device_id = $1`, devID)
	if cRows != nil {
		defer cRows.Close()
		for cRows.Next() {
			var c model.PolicyCompliance
			if scanErr := cRows.Scan(&c.DeviceID, &c.PolicyID, &c.Status, &c.ErrorMessage, &c.UpdatedAt); scanErr == nil {
				compliances = append(compliances, c)
			}
		}
	}

	var events []model.DeviceEvent
	eRows, _ := database.DB.Query(`
		SELECT id, device_id, event_type, details, created_at
		FROM device_events WHERE device_id = $1 ORDER BY created_at DESC LIMIT 50`, devID)
	if eRows != nil {
		defer eRows.Close()
		for eRows.Next() {
			var e model.DeviceEvent
			if scanErr := eRows.Scan(&e.ID, &e.DeviceID, &e.EventType, &e.Details, &e.CreatedAt); scanErr == nil {
				events = append(events, e)
			}
		}
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(DeviceDetailResponse{
		Device:           dev,
		PolicyCompliance: compliances,
		Events:           events,
	})
}

// ExecuteRemoteAction queues a command, stores in DB, and pushes via FCM
func ExecuteRemoteAction(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
		return
	}

	claims, ok := r.Context().Value(auth.UserContextKey).(*auth.Claims)
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	parts := strings.Split(r.URL.Path, "/")
	// /api/v1/devices/{id}/actions  => parts[-2] is the id
	devID, err := uuid.Parse(parts[len(parts)-2])
	if err != nil {
		http.Error(w, `{"error":"invalid device id"}`, http.StatusBadRequest)
		return
	}

	var req RemoteActionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"invalid request: %v"}`, err), http.StatusBadRequest)
		return
	}

	action := strings.ToUpper(req.Action)
	if action != "REBOOT" && action != "LOCK" && action != "WIPE" && action != "SYNC" {
		http.Error(w, `{"error":"invalid action; must be REBOOT, LOCK, WIPE, or SYNC"}`, http.StatusBadRequest)
		return
	}

	// Normalise wipe_type: default to FULL if not specified
	wipeType := strings.ToUpper(req.WipeType)
	if action == "WIPE" && wipeType != "CORPORATE" {
		wipeType = "FULL"
	}

	var serial, fcmToken string
	err = database.DB.QueryRow(
		`SELECT serial_number, COALESCE(fcm_registration_token,'') FROM devices WHERE id = $1`, devID,
	).Scan(&serial, &fcmToken)
	if err != nil {
		if err == sql.ErrNoRows {
			http.Error(w, `{"error":"device not found"}`, http.StatusNotFound)
		} else {
			http.Error(w, `{"error":"database check failed"}`, http.StatusInternalServerError)
		}
		return
	}

	// Build the command payload — for WIPE it includes the wipe_type so the agent
	// can distinguish corporate vs full wipe when it executes the command.
	cmdPayload := ""
	if action == "WIPE" {
		cmdPayload = wipeType
	}

	// Enqueue command in the DB (payload stored in the command column as "WIPE:CORPORATE" etc.)
	dbCommand := action
	if cmdPayload != "" {
		dbCommand = action + ":" + cmdPayload
	}
	var cmdID uuid.UUID
	_ = database.DB.QueryRow(`
		INSERT INTO device_commands (device_id, command, status)
		VALUES ($1, $2, 'PENDING') RETURNING id`, devID, dbCommand,
	).Scan(&cmdID)

	// Audit log
	auditDetails := fmt.Sprintf(`{"serial":"%s","command_id":"%s"`, serial, cmdID)
	if action == "WIPE" {
		auditDetails += fmt.Sprintf(`,"wipe_type":"%s"`, wipeType)
	}
	auditDetails += "}"
	_, _ = database.DB.Exec(`
		INSERT INTO audit_logs (actor_id, action, target_type, target_id, details)
		VALUES ($1, $2, 'DEVICE', $3, $4)`,
		claims.UserID, "REMOTE_"+action, devID, auditDetails,
	)

	_, _ = database.DB.Exec(`
		INSERT INTO device_events (device_id, event_type, details)
		VALUES ($1, 'COMMAND_QUEUED', $2)`,
		devID, fmt.Sprintf(`{"command":"%s","payload":"%s","command_id":"%s"}`, action, cmdPayload, cmdID),
	)

	// Push via FCM asynchronously — include payload so the agent acts correctly
	if fcmToken != "" {
		go func() {
			pushErr := fcm.SendToDevice(fcmToken, map[string]interface{}{
				"type":       "COMMAND",
				"command":    action,
				"payload":    cmdPayload,
				"command_id": cmdID.String(),
			})
			if pushErr != nil {
				log.Printf("FCM push failed for device %s: %v", serial, pushErr)
				_, _ = database.DB.Exec(
					`UPDATE device_commands SET status='FAILED' WHERE id=$1`, cmdID)
			} else {
				_, _ = database.DB.Exec(
					`UPDATE device_commands SET status='SENT', sent_at=$1 WHERE id=$2`,
					time.Now(), cmdID)
			}
		}()
	}

	// Fire webhook for wipe/lock actions
	if action == "WIPE" || action == "LOCK" {
		go webhook.DispatchEvent(devID, serial, "", "REMOTE_ACTION", map[string]interface{}{
			"action":     action,
			"wipe_type":  wipeType,
			"command_id": cmdID.String(),
			"actor_id":   claims.UserID.String(),
		})
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte(fmt.Sprintf(
		`{"status":"command_queued","command":"%s","wipe_type":"%s","command_id":"%s","timestamp":"%s"}`,
		action, wipeType, cmdID, time.Now().Format(time.RFC3339),
	)))
}
