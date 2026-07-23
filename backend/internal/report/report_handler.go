package report

import (
	"encoding/csv"
	"encoding/json"
	"net/http"
	"strconv"

	"mdm-backend/internal/database"
)

type OSDistributionEntry struct {
	OSVersion string `json:"os_version"`
	Count     int    `json:"count"`
}

type EnrollmentTrendEntry struct {
	Date  string `json:"date"`
	Count int    `json:"count"`
}

type ComplianceSnapshotEntry struct {
	SerialNumber string `json:"serial_number"`
	Model        string `json:"model"`
	OSVersion    string `json:"os_version"`
	PatchLevel   string `json:"patch_level"`
	LastSeen     string `json:"last_seen"`
	Status       string `json:"compliance_status"`
	TeamName     string `json:"team_name"`
}

// GetComplianceSnapshot returns a paginated compliance snapshot as JSON
func GetComplianceSnapshot(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
		return
	}

	rows, err := database.DB.Query(`
		SELECT d.serial_number, d.model, d.os_version, d.patch_level,
		       d.last_seen::text,
		       COALESCE(t.name, 'Unassigned'),
		       COALESCE(
		           (SELECT status FROM policy_compliance
		            WHERE device_id = d.id ORDER BY updated_at DESC LIMIT 1),
		           'PENDING'
		       ) AS compliance_status
		FROM devices d
		LEFT JOIN teams t ON d.team_id = t.id
		WHERE d.enrollment_status = 'ENROLLED'
		ORDER BY d.last_seen DESC`)
	if err != nil {
		http.Error(w, `{"error":"db query failed"}`, http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var entries []ComplianceSnapshotEntry
	for rows.Next() {
		var e ComplianceSnapshotEntry
		if scanErr := rows.Scan(&e.SerialNumber, &e.Model, &e.OSVersion, &e.PatchLevel,
			&e.LastSeen, &e.TeamName, &e.Status); scanErr == nil {
			entries = append(entries, e)
		}
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"data":  entries,
		"count": len(entries),
	})
}

// GetComplianceCSV streams a compliance report as CSV
func GetComplianceCSV(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
		return
	}

	rows, err := database.DB.Query(`
		SELECT d.serial_number, d.model, d.os_version, d.patch_level,
		       d.last_seen::text,
		       COALESCE(t.name, 'Unassigned'),
		       COALESCE(
		           (SELECT status FROM policy_compliance
		            WHERE device_id = d.id ORDER BY updated_at DESC LIMIT 1),
		           'PENDING'
		       )
		FROM devices d
		LEFT JOIN teams t ON d.team_id = t.id
		WHERE d.enrollment_status = 'ENROLLED'
		ORDER BY d.last_seen DESC`)
	if err != nil {
		http.Error(w, `{"error":"db query failed"}`, http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	w.Header().Set("Content-Type", "text/csv")
	w.Header().Set("Content-Disposition", `attachment; filename="compliance_report.csv"`)

	cw := csv.NewWriter(w)
	_ = cw.Write([]string{"Serial Number", "Model", "OS Version", "Patch Level", "Last Seen", "Team", "Compliance Status"})

	for rows.Next() {
		var serial, model, osVer, patch, lastSeen, team, status string
		if scanErr := rows.Scan(&serial, &model, &osVer, &patch, &lastSeen, &team, &status); scanErr == nil {
			_ = cw.Write([]string{serial, model, osVer, patch, lastSeen, team, status})
		}
	}
	cw.Flush()
}

// GetOSDistribution returns a breakdown of OS versions
func GetOSDistribution(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
		return
	}

	rows, err := database.DB.Query(`
		SELECT os_version, COUNT(*) AS device_count
		FROM devices
		WHERE enrollment_status = 'ENROLLED'
		GROUP BY os_version
		ORDER BY device_count DESC`)
	if err != nil {
		http.Error(w, `{"error":"db query failed"}`, http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var dist []OSDistributionEntry
	for rows.Next() {
		var e OSDistributionEntry
		if scanErr := rows.Scan(&e.OSVersion, &e.Count); scanErr == nil {
			dist = append(dist, e)
		}
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(dist)
}

// GetEnrollmentTrend returns daily enrollment counts for the last N days
func GetEnrollmentTrend(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
		return
	}

	days := 30
	if d, err := strconv.Atoi(r.URL.Query().Get("days")); err == nil && d > 0 && d <= 90 {
		days = d
	}

	rows, err := database.DB.Query(`
		SELECT TO_CHAR(created_at::date, 'YYYY-MM-DD') AS day, COUNT(*) AS enrollments
		FROM devices
		WHERE created_at >= NOW() - ($1 || ' days')::interval
		GROUP BY day
		ORDER BY day ASC`, days)
	if err != nil {
		http.Error(w, `{"error":"db query failed"}`, http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var trend []EnrollmentTrendEntry
	for rows.Next() {
		var e EnrollmentTrendEntry
		if scanErr := rows.Scan(&e.Date, &e.Count); scanErr == nil {
			trend = append(trend, e)
		}
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(trend)
}
