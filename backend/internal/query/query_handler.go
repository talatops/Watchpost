package query

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"mdm-backend/internal/auth"
	"mdm-backend/internal/database"
	"mdm-backend/internal/model"

	"github.com/google/uuid"
)

type QueryCreateRequest struct {
	Name         string `json:"name"`
	Description  string `json:"description"`
	QuerySQL     string `json:"query_sql"`
	ScheduleCron string `json:"schedule_cron"`
}

type QueryRunRequest struct {
	QuerySQL string `json:"query_sql"`
}

// Dangerous SQL keywords that are blocked in sandboxed queries
var blockedKeywords = []string{
	"insert", "update", "delete", "drop", "alter", "create",
	"truncate", "grant", "revoke", "exec", "execute", "xp_",
	"--", "/*", "*/",
}

// ListQueries returns all saved telemetry queries
func ListQueries(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
		return
	}
	claims := r.Context().Value(auth.UserContextKey).(*auth.Claims)

	rows, err := database.DB.Query(`
		SELECT id, author_id, name, COALESCE(description,''), query_sql,
		       COALESCE(schedule_cron,''), last_run_at, created_at
		FROM telemetry_queries
		WHERE author_id = $1 OR $1 IN (
			SELECT id FROM users WHERE role IN ('SUPER_ADMIN','ORG_ADMIN')
		)
		ORDER BY created_at DESC`, claims.UserID)
	if err != nil {
		http.Error(w, `{"error":"db query failed"}`, http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var queries []model.TelemetryQuery
	for rows.Next() {
		var q model.TelemetryQuery
		if scanErr := rows.Scan(&q.ID, &q.AuthorID, &q.Name, &q.Description,
			&q.QuerySQL, &q.ScheduleCron, &q.LastRunAt, &q.CreatedAt); scanErr == nil {
			queries = append(queries, q)
		}
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(queries)
}

// CreateQuery saves a new telemetry query
func CreateQuery(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
		return
	}
	claims := r.Context().Value(auth.UserContextKey).(*auth.Claims)

	var req QueryCreateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}
	if req.Name == "" || req.QuerySQL == "" {
		http.Error(w, `{"error":"name and query_sql are required"}`, http.StatusBadRequest)
		return
	}
	if err := validateQuery(req.QuerySQL); err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"%s"}`, err.Error()), http.StatusBadRequest)
		return
	}

	var q model.TelemetryQuery
	err := database.DB.QueryRow(`
		INSERT INTO telemetry_queries (author_id, name, description, query_sql, schedule_cron)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING id, author_id, name, COALESCE(description,''), query_sql,
		          COALESCE(schedule_cron,''), last_run_at, created_at`,
		claims.UserID, req.Name, req.Description, req.QuerySQL, req.ScheduleCron,
	).Scan(&q.ID, &q.AuthorID, &q.Name, &q.Description, &q.QuerySQL, &q.ScheduleCron, &q.LastRunAt, &q.CreatedAt)
	if err != nil {
		http.Error(w, `{"error":"db insert failed"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(q)
}

// DeleteQuery removes a saved query
func DeleteQuery(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodDelete {
		http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
		return
	}
	parts := strings.Split(r.URL.Path, "/")
	id, err := uuid.Parse(parts[len(parts)-1])
	if err != nil {
		http.Error(w, `{"error":"invalid query id"}`, http.StatusBadRequest)
		return
	}

	if _, err := database.DB.Exec(`DELETE FROM telemetry_queries WHERE id = $1`, id); err != nil {
		http.Error(w, `{"error":"db delete failed"}`, http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// RunAdHocQuery executes a one-off sandboxed query against the read-only view
func RunAdHocQuery(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
		return
	}

	var req QueryRunRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}

	if err := validateQuery(req.QuerySQL); err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"%s"}`, err.Error()), http.StatusBadRequest)
		return
	}

	results, columns, err := execSandboxedQuery(req.QuerySQL)
	if err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"query execution failed: %v"}`, err), http.StatusBadRequest)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"columns": columns,
		"rows":    results,
		"count":   len(results),
	})
}

// RunSavedQuery executes a saved query by ID
func RunSavedQuery(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
		return
	}

	parts := strings.Split(r.URL.Path, "/")
	// /api/v1/queries/{id}/run
	id, err := uuid.Parse(parts[len(parts)-2])
	if err != nil {
		http.Error(w, `{"error":"invalid query id"}`, http.StatusBadRequest)
		return
	}

	var querySql string
	err = database.DB.QueryRow(`SELECT query_sql FROM telemetry_queries WHERE id = $1`, id).Scan(&querySql)
	if err == sql.ErrNoRows {
		http.Error(w, `{"error":"query not found"}`, http.StatusNotFound)
		return
	}

	results, columns, err := execSandboxedQuery(querySql)
	if err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"query execution failed: %v"}`, err), http.StatusBadRequest)
		return
	}

	_, _ = database.DB.Exec(`UPDATE telemetry_queries SET last_run_at = $1 WHERE id = $2`, time.Now(), id)

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"columns": columns,
		"rows":    results,
		"count":   len(results),
	})
}

// validateQuery checks that the query is a safe SELECT against the telemetry view
func validateQuery(q string) error {
	trimmed := strings.TrimSpace(strings.ToLower(q))

	if !strings.HasPrefix(trimmed, "select") {
		return fmt.Errorf("only SELECT statements are permitted")
	}

	// Must reference the safe view, not raw tables
	if !strings.Contains(trimmed, "device_telemetry_view") {
		return fmt.Errorf("queries must SELECT from device_telemetry_view")
	}

	for _, kw := range blockedKeywords {
		if strings.Contains(trimmed, kw) {
			return fmt.Errorf("query contains forbidden keyword: %s", kw)
		}
	}

	return nil
}

// execSandboxedQuery runs a query under a 5-second timeout and caps at 500 rows
func execSandboxedQuery(querySql string) ([]map[string]interface{}, []string, error) {
	// Enforce statement timeout via SET LOCAL
	tx, err := database.DB.Begin()
	if err != nil {
		return nil, nil, err
	}
	defer tx.Rollback()

	_, err = tx.Exec(`SET LOCAL statement_timeout = '5000'`)
	if err != nil {
		return nil, nil, err
	}

	// Cap results
	capped := fmt.Sprintf("SELECT * FROM (%s) AS _q LIMIT 500", querySql)
	rows, err := tx.Query(capped)
	if err != nil {
		return nil, nil, err
	}
	defer rows.Close()

	cols, _ := rows.Columns()
	var results []map[string]interface{}

	for rows.Next() {
		vals := make([]interface{}, len(cols))
		valPtrs := make([]interface{}, len(cols))
		for i := range vals {
			valPtrs[i] = &vals[i]
		}
		if scanErr := rows.Scan(valPtrs...); scanErr != nil {
			continue
		}
		row := make(map[string]interface{})
		for i, col := range cols {
			row[col] = vals[i]
		}
		results = append(results, row)
	}

	if results == nil {
		results = []map[string]interface{}{}
	}

	return results, cols, nil
}
