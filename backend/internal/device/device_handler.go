package device

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"mdm-backend/internal/database"
	"mdm-backend/internal/model"
	"mdm-backend/internal/webhook"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

// DeviceJwtSecret returns the device JWT signing key from env; panics if not set
var DeviceJwtSecret = func() []byte {
	s := os.Getenv("DEVICE_JWT_SECRET")
	if s == "" {
		panic("DEVICE_JWT_SECRET environment variable is not set — refusing to start with an insecure default")
	}
	return []byte(s)
}()

type EnrollRequest struct {
	EnrollmentToken string `json:"enrollment_token"`
	SerialNumber    string `json:"serial_number"`
	Model           string `json:"model"`
	OSVersion       string `json:"os_version"`
	PatchLevel      string `json:"patch_level"`
	IMEI            string `json:"imei"`
}

type EnrollResponse struct {
	DeviceID    uuid.UUID `json:"device_id"`
	DeviceToken string    `json:"device_token"`
}

type SyncRequest struct {
	SerialNumber         string `json:"serial_number"`
	OSVersion            string `json:"os_version"`
	PatchLevel           string `json:"patch_level"`
	BatteryLevel         int    `json:"battery_level"`
	StorageTotal         int64  `json:"storage_total"`
	StorageAvailable     int64  `json:"storage_available"`
	WifiSSID             string `json:"wifi_ssid"`
	InstalledApps        string `json:"installed_apps"` // JSON array string
	FCMRegistrationToken string `json:"fcm_registration_token"`
}

type SyncResponse struct {
	ActivePolicies []model.Policy      `json:"active_policies"`
	AppDeployments []AppDeploymentInfo `json:"app_deployments"`
	PendingActions []string            `json:"pending_actions"`
}

type AppDeploymentInfo struct {
	ApplicationID uuid.UUID         `json:"application_id"`
	PackageName   string            `json:"package_name"`
	VersionCode   int               `json:"version_code"`
	VersionName   string            `json:"version_name"`
	APKURL        string            `json:"apk_url"`
	InstallType   model.InstallType `json:"install_type"`
}

type ComplianceReportRequest struct {
	PolicyReports []PolicyReport `json:"policy_reports"`
}

type PolicyReport struct {
	PolicyID     uuid.UUID              `json:"policy_id"`
	Status       model.ComplianceStatus `json:"status"`
	ErrorMessage string                 `json:"error_message"`
}

// EnrollDevice handles QR-code/Token based provisioning with DB-validated tokens
func EnrollDevice(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
		return
	}

	var req EnrollRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"invalid request: %v"}`, err), http.StatusBadRequest)
		return
	}

	if req.SerialNumber == "" {
		http.Error(w, `{"error":"serial_number is required"}`, http.StatusBadRequest)
		return
	}

	// Validate enrollment token against DB
	var tokenID uuid.UUID
	var maxUses, useCount int
	var expiresAt *time.Time

	err := database.DB.QueryRow(`
		SELECT id, max_uses, use_count, expires_at
		FROM enrollment_tokens
		WHERE token = $1`, req.EnrollmentToken,
	).Scan(&tokenID, &maxUses, &useCount, &expiresAt)

	if err != nil {
		if err == sql.ErrNoRows {
			http.Error(w, `{"error":"invalid enrollment token"}`, http.StatusForbidden)
		} else {
			http.Error(w, `{"error":"database error checking token"}`, http.StatusInternalServerError)
		}
		return
	}

	if expiresAt != nil && time.Now().After(*expiresAt) {
		http.Error(w, `{"error":"enrollment token has expired"}`, http.StatusForbidden)
		return
	}

	if maxUses > 0 && useCount >= maxUses {
		http.Error(w, `{"error":"enrollment token has reached maximum uses"}`, http.StatusForbidden)
		return
	}

	_, _ = database.DB.Exec(`UPDATE enrollment_tokens SET use_count = use_count + 1 WHERE id = $1`, tokenID)

	// Generate device JWT
	claims := jwt.MapClaims{
		"serial_number": req.SerialNumber,
		"type":          "device",
		"exp":           time.Now().Add(365 * 24 * time.Hour).Unix(),
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	tokenStr, err := token.SignedString(DeviceJwtSecret)
	if err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"failed to sign token: %v"}`, err), http.StatusInternalServerError)
		return
	}

	var devID uuid.UUID
	err = database.DB.QueryRow(`
		INSERT INTO devices (serial_number, model, os_version, patch_level, imei, enrollment_status, device_token, last_seen)
		VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
		ON CONFLICT (serial_number) DO UPDATE
		SET model = $2, os_version = $3, patch_level = $4, imei = $5, enrollment_status = $6, device_token = $7, last_seen = NOW()
		RETURNING id`,
		req.SerialNumber, req.Model, req.OSVersion, req.PatchLevel, req.IMEI, model.StatusEnrolled, tokenStr,
	).Scan(&devID)

	if err != nil {
		log.Printf("DB error enrolling device: %v", err)
		http.Error(w, fmt.Sprintf(`{"error":"database error: %v"}`, err), http.StatusInternalServerError)
		return
	}

	_, _ = database.DB.Exec(`
		INSERT INTO device_events (device_id, event_type, details)
		VALUES ($1, 'ENROLLMENT', $2)`,
		devID, fmt.Sprintf(`{"serial":"%s","model":"%s"}`, req.SerialNumber, req.Model),
	)

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(EnrollResponse{
		DeviceID:    devID,
		DeviceToken: tokenStr,
	})
}

// DeviceAuthMiddleware validates the device bearer token
func DeviceAuthMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		authHeader := r.Header.Get("Authorization")
		if authHeader == "" {
			http.Error(w, `{"error":"authorization header required"}`, http.StatusUnauthorized)
			return
		}

		parts := strings.Split(authHeader, " ")
		if len(parts) != 2 || strings.ToLower(parts[0]) != "bearer" {
			http.Error(w, `{"error":"invalid authorization header format"}`, http.StatusUnauthorized)
			return
		}

		tok, err := jwt.Parse(parts[1], func(t *jwt.Token) (interface{}, error) {
			if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
				return nil, fmt.Errorf("unexpected signing method: %v", t.Header["alg"])
			}
			return DeviceJwtSecret, nil
		})

		if err != nil || !tok.Valid {
			http.Error(w, `{"error":"invalid device token"}`, http.StatusUnauthorized)
			return
		}

		claims, ok := tok.Claims.(jwt.MapClaims)
		if !ok {
			http.Error(w, `{"error":"invalid claims"}`, http.StatusUnauthorized)
			return
		}

		serialNumber, _ := claims["serial_number"].(string)

		var dev model.Device
		err = database.DB.QueryRow(`
			SELECT id, team_id, serial_number, model, os_version, patch_level, enrollment_status
			FROM devices WHERE serial_number = $1`, serialNumber,
		).Scan(&dev.ID, &dev.TeamID, &dev.SerialNumber, &dev.Model, &dev.OSVersion, &dev.PatchLevel, &dev.EnrollmentStatus)

		if err != nil {
			if err == sql.ErrNoRows {
				http.Error(w, `{"error":"device not found"}`, http.StatusNotFound)
			} else {
				http.Error(w, `{"error":"internal database error"}`, http.StatusInternalServerError)
			}
			return
		}

		ctx := context.WithValue(r.Context(), "device", &dev)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// SyncDevice handles periodic check-ins, writes all telemetry, returns pending commands
func SyncDevice(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
		return
	}

	dev, ok := r.Context().Value("device").(*model.Device)
	if !ok {
		http.Error(w, `{"error":"unauthorized device"}`, http.StatusUnauthorized)
		return
	}

	var req SyncRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"invalid request: %v"}`, err), http.StatusBadRequest)
		return
	}

	// Sanitize installed_apps JSON; default to empty array
	installedApps := req.InstalledApps
	if installedApps == "" {
		installedApps = "[]"
	}

	// Write ALL telemetry columns
	_, err := database.DB.Exec(`
		UPDATE devices
		SET os_version          = $1,
		    patch_level         = $2,
		    fcm_registration_token = $3,
		    battery_level       = $4,
		    storage_total       = $5,
		    storage_available   = $6,
		    wifi_ssid           = $7,
		    installed_apps      = $8::jsonb,
		    last_seen           = NOW(),
		    updated_at          = NOW()
		WHERE id = $9`,
		req.OSVersion, req.PatchLevel, req.FCMRegistrationToken,
		req.BatteryLevel, req.StorageTotal, req.StorageAvailable,
		req.WifiSSID, installedApps, dev.ID,
	)
	if err != nil {
		log.Printf("DB error updating device sync: %v", err)
		http.Error(w, `{"error":"database update failed"}`, http.StatusInternalServerError)
		return
	}

	// Fetch active policies
	var policies []model.Policy
	var rows *sql.Rows
	if dev.TeamID != nil {
		rows, err = database.DB.Query(`
			SELECT id, team_id, name, description, content_yaml, version, created_at, updated_at
			FROM policies WHERE team_id = $1 OR team_id IS NULL`, *dev.TeamID)
	} else {
		rows, err = database.DB.Query(`
			SELECT id, team_id, name, description, content_yaml, version, created_at, updated_at
			FROM policies WHERE team_id IS NULL`)
	}
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var p model.Policy
			if scanErr := rows.Scan(&p.ID, &p.TeamID, &p.Name, &p.Description, &p.ContentYAML, &p.Version, &p.CreatedAt, &p.UpdatedAt); scanErr == nil {
				policies = append(policies, p)
			}
		}
	}

	// Fetch app deployments
	var apps []AppDeploymentInfo
	var appRows *sql.Rows
	if dev.TeamID != nil {
		appRows, err = database.DB.Query(`
			SELECT a.id, a.package_name, a.version_code, a.version_name, a.apk_url, ad.install_type
			FROM application_deployments ad
			JOIN applications a ON ad.application_id = a.id
			WHERE ad.device_id = $1 OR ad.team_id = $2 OR (ad.device_id IS NULL AND ad.team_id IS NULL)`,
			dev.ID, *dev.TeamID)
	} else {
		appRows, err = database.DB.Query(`
			SELECT a.id, a.package_name, a.version_code, a.version_name, a.apk_url, ad.install_type
			FROM application_deployments ad
			JOIN applications a ON ad.application_id = a.id
			WHERE ad.device_id = $1 OR (ad.device_id IS NULL AND ad.team_id IS NULL)`,
			dev.ID)
	}
	if err == nil {
		defer appRows.Close()
		for appRows.Next() {
			var app AppDeploymentInfo
			if scanErr := appRows.Scan(&app.ApplicationID, &app.PackageName, &app.VersionCode, &app.VersionName, &app.APKURL, &app.InstallType); scanErr == nil {
				apps = append(apps, app)
			}
		}
	}

	// Fetch pending commands from the queue
	pendingActions := []string{}
	cmdRows, cmdErr := database.DB.Query(`
		SELECT id, command FROM device_commands
		WHERE device_id = $1 AND status = 'PENDING'
		ORDER BY created_at ASC`, dev.ID)
	if cmdErr == nil {
		defer cmdRows.Close()
		var cmdIDs []uuid.UUID
		for cmdRows.Next() {
			var cmdID uuid.UUID
			var cmd string
			if scanErr := cmdRows.Scan(&cmdID, &cmd); scanErr == nil {
				pendingActions = append(pendingActions, cmd)
				cmdIDs = append(cmdIDs, cmdID)
			}
		}
		for _, cid := range cmdIDs {
			_, _ = database.DB.Exec(`UPDATE device_commands SET status = 'SENT', sent_at = NOW() WHERE id = $1`, cid)
		}
	}

	_, _ = database.DB.Exec(`
		INSERT INTO device_events (device_id, event_type, details)
		VALUES ($1, 'SYNC', $2)`,
		dev.ID, fmt.Sprintf(`{"battery":%d,"storage_available":%d,"wifi":"%s"}`,
			req.BatteryLevel, req.StorageAvailable, req.WifiSSID),
	)

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(SyncResponse{
		ActivePolicies: policies,
		AppDeployments: apps,
		PendingActions: pendingActions,
	})
}

// ReportCompliance updates compliance records and fires webhooks on violations
func ReportCompliance(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
		return
	}

	dev, ok := r.Context().Value("device").(*model.Device)
	if !ok {
		http.Error(w, `{"error":"unauthorized device"}`, http.StatusUnauthorized)
		return
	}

	var req ComplianceReportRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"invalid request: %v"}`, err), http.StatusBadRequest)
		return
	}

	for _, report := range req.PolicyReports {
		_, err := database.DB.Exec(`
			INSERT INTO policy_compliance (device_id, policy_id, status, error_message, updated_at)
			VALUES ($1, $2, $3, $4, NOW())
			ON CONFLICT (device_id, policy_id) DO UPDATE
			SET status = $3, error_message = $4, updated_at = NOW()`,
			dev.ID, report.PolicyID, report.Status, report.ErrorMessage,
		)
		if err != nil {
			log.Printf("Failed to update policy compliance: %v", err)
		}

		_, _ = database.DB.Exec(`
			INSERT INTO device_events (device_id, event_type, details)
			VALUES ($1, 'COMPLIANCE_REPORT', $2)`,
			dev.ID, fmt.Sprintf(`{"policy_id":"%s","status":"%s"}`, report.PolicyID, report.Status),
		)

		if report.Status == model.ComplianceNonCompliant {
			go webhook.DispatchEvent(dev.ID, dev.SerialNumber, dev.Model, "COMPLIANCE_VIOLATION", map[string]interface{}{
				"policy_id": report.PolicyID.String(),
				"status":    string(report.Status),
				"error":     report.ErrorMessage,
			})
		}
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte(`{"status":"success"}`))
}
