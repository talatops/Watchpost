package main

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"

	"mdm-backend/internal/app"
	"mdm-backend/internal/auth"
	"mdm-backend/internal/bulk"
	"mdm-backend/internal/database"
	"mdm-backend/internal/device"
	"mdm-backend/internal/label"
	"mdm-backend/internal/model"
	"mdm-backend/internal/policy"
	"mdm-backend/internal/query"
	"mdm-backend/internal/report"
	"mdm-backend/internal/team"
	"mdm-backend/internal/user"
	"mdm-backend/internal/webhook"

	"github.com/google/uuid"
)

// ---- Rate Limiter ----

type rateLimiter struct {
	mu       sync.Mutex
	requests map[string][]time.Time
	limit    int
	window   time.Duration
}

func newRateLimiter(limit int, window time.Duration) *rateLimiter {
	rl := &rateLimiter{requests: make(map[string][]time.Time), limit: limit, window: window}
	go func() {
		for range time.Tick(time.Minute) {
			rl.mu.Lock()
			cutoff := time.Now().Add(-window)
			for k, ts := range rl.requests {
				var kept []time.Time
				for _, t := range ts {
					if t.After(cutoff) {
						kept = append(kept, t)
					}
				}
				if len(kept) == 0 {
					delete(rl.requests, k)
				} else {
					rl.requests[k] = kept
				}
			}
			rl.mu.Unlock()
		}
	}()
	return rl
}

func (rl *rateLimiter) allow(ip string) bool {
	rl.mu.Lock()
	defer rl.mu.Unlock()
	now := time.Now()
	cutoff := now.Add(-rl.window)
	var recent []time.Time
	for _, t := range rl.requests[ip] {
		if t.After(cutoff) {
			recent = append(recent, t)
		}
	}
	if len(recent) >= rl.limit {
		rl.requests[ip] = recent
		return false
	}
	rl.requests[ip] = append(recent, now)
	return true
}

func (rl *rateLimiter) middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ip := r.RemoteAddr
		if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
			ip = strings.Split(xff, ",")[0]
		}
		if !rl.allow(ip) {
			http.Error(w, `{"error":"rate limit exceeded"}`, http.StatusTooManyRequests)
			return
		}
		next.ServeHTTP(w, r)
	})
}

// ---- Auth handlers ----

type LoginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

type LoginResponse struct {
	Token string     `json:"token"`
	User  model.User `json:"user"`
}

func loginHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
		return
	}

	var req LoginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}

	var u model.User
	err := database.DB.QueryRow(`
		SELECT id, organization_id, email, password_hash, role, created_at, updated_at
		FROM users WHERE email = $1`, req.Email,
	).Scan(&u.ID, &u.OrganizationID, &u.Email, &u.PasswordHash, &u.Role, &u.CreatedAt, &u.UpdatedAt)

	if err != nil {
		if err == sql.ErrNoRows {
			http.Error(w, `{"error":"invalid email or password"}`, http.StatusUnauthorized)
		} else {
			http.Error(w, `{"error":"internal database error"}`, http.StatusInternalServerError)
		}
		return
	}

	if !auth.CheckPasswordHash(req.Password, u.PasswordHash) {
		http.Error(w, `{"error":"invalid email or password"}`, http.StatusUnauthorized)
		return
	}

	token, err := auth.GenerateToken(u.ID, u.OrganizationID, string(u.Role))
	if err != nil {
		http.Error(w, `{"error":"failed to generate token"}`, http.StatusInternalServerError)
		return
	}

	_, _ = database.DB.Exec(`
		INSERT INTO audit_logs (actor_id, action, target_type, target_id, details)
		VALUES ($1, 'USER_LOGIN', 'USER', $1, '{}')`, u.ID)

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(LoginResponse{Token: token, User: u})
}

func logoutHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
		return
	}

	authHeader := r.Header.Get("Authorization")
	if authHeader == "" {
		http.Error(w, `{"error":"authorization header required"}`, http.StatusUnauthorized)
		return
	}

	parts := strings.Split(authHeader, " ")
	if len(parts) != 2 {
		http.Error(w, `{"error":"invalid authorization header"}`, http.StatusUnauthorized)
		return
	}

	claims, err := auth.ValidateToken(parts[1])
	if err != nil {
		http.Error(w, `{"error":"invalid token"}`, http.StatusUnauthorized)
		return
	}

	if claims.JTI != "" && claims.ExpiresAt != nil {
		auth.RevokeToken(claims.JTI, claims.ExpiresAt.Time)
	}

	w.Header().Set("Content-Type", "application/json")
	_, _ = w.Write([]byte(`{"status":"logged out"}`))
}

func getAuditLogsHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
		return
	}

	rows, err := database.DB.Query(`
		SELECT id, actor_id, action, target_type, target_id, details, created_at
		FROM audit_logs ORDER BY created_at DESC LIMIT 200`)
	if err != nil {
		http.Error(w, `{"error":"failed to query audit logs"}`, http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var logs []model.AuditLog
	for rows.Next() {
		var l model.AuditLog
		if err = rows.Scan(&l.ID, &l.ActorID, &l.Action, &l.TargetType, &l.TargetID, &l.Details, &l.CreatedAt); err == nil {
			logs = append(logs, l)
		}
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(logs)
}

// ---- Seed ----

func seedDefaultData(db *sql.DB) {
	var count int
	_ = db.QueryRow("SELECT COUNT(*) FROM organizations").Scan(&count)
	if count > 0 {
		return
	}

	log.Println("Seeding default organization and superadmin user...")

	var orgID uuid.UUID
	seedOrgName := os.Getenv("SEED_ORG_NAME")
	if seedOrgName == "" {
		seedOrgName = "Watchpost Organization"
	}
	if err := db.QueryRow(`INSERT INTO organizations (name) VALUES ($1) RETURNING id`, seedOrgName).Scan(&orgID); err != nil {
		log.Fatalf("Failed to seed org: %v", err)
	}

	seedPassword := os.Getenv("SEED_ADMIN_PASSWORD")
	if seedPassword == "" {
		seedPassword = "WatchpostAdmin2024ChangeMe"
	}
	hashedPassword, err := auth.HashPassword(seedPassword)
	if err != nil {
		log.Fatalf("Failed to hash password: %v", err)
	}

	seedEmail := os.Getenv("SEED_ADMIN_EMAIL")
	if seedEmail == "" {
		seedEmail = "admin@example.com"
	}
	if _, err = db.Exec(`INSERT INTO users (organization_id, email, password_hash, role) VALUES ($1, $2, $3, $4)`,
		orgID, seedEmail, hashedPassword, model.RoleSuperAdmin); err != nil {
		log.Fatalf("Failed to seed admin: %v", err)
	}

	log.Printf("Default admin seeded: %s (password set from SEED_ADMIN_PASSWORD env var)", seedEmail)

	// Seed the default enrollment token from environment
	defaultToken := os.Getenv("DEFAULT_ENROLLMENT_TOKEN")
	if defaultToken == "" {
		defaultToken = "WatchpostAgent2024DeviceEnrollSecureTokenABC123XYZ"
	}
	var tokenCount int
	_ = db.QueryRow("SELECT COUNT(*) FROM enrollment_tokens").Scan(&tokenCount)
	if tokenCount == 0 {
		_, _ = db.Exec(`
			INSERT INTO enrollment_tokens (organization_id, token, label, max_uses, use_count)
			VALUES ($1, $2, 'Default Enrollment Token', 0, 0)`,
			orgID, defaultToken)
		log.Printf("Default enrollment token seeded: %s", defaultToken[:8]+"...")
	}
}

// ---- Main ----

func main() {
	log.Println("Starting Watchpost — Device Fleet Management Backend...")

	db, err := database.InitDB()
	if err != nil {
		log.Fatalf("Database initialization failed: %v", err)
	}
	defer db.Close()

	seedDefaultData(db)

	// Background: purge expired revoked tokens every hour
	go func() {
		for range time.Tick(time.Hour) {
			auth.PurgeExpiredRevocations()
		}
	}()

	// Rate limiters
	authRL := newRateLimiter(10, time.Minute)    // 10 login attempts/min
	enrollRL := newRateLimiter(30, time.Minute)  // 30 enrollments/min

	// CORS
	allowedOrigins := os.Getenv("ALLOWED_ORIGINS")
	if allowedOrigins == "" {
		allowedOrigins = "*"
	}

	corsMiddleware := func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			origin := r.Header.Get("Origin")
			if allowedOrigins == "*" {
				w.Header().Set("Access-Control-Allow-Origin", "*")
			} else {
				for _, allowed := range strings.Split(allowedOrigins, ",") {
					if strings.TrimSpace(allowed) == origin {
						w.Header().Set("Access-Control-Allow-Origin", origin)
						w.Header().Set("Vary", "Origin")
						break
					}
				}
			}
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
			if r.Method == http.MethodOptions {
				w.WriteHeader(http.StatusOK)
				return
			}
			next.ServeHTTP(w, r)
		})
	}

	mux := http.NewServeMux()

	// ---- Public routes ----
	mux.Handle("/api/v1/auth/login", authRL.middleware(http.HandlerFunc(loginHandler)))
	mux.HandleFunc("/api/v1/auth/logout", logoutHandler)

	// ---- Device routes ----
	mux.Handle("/api/v1/device/enroll", enrollRL.middleware(http.HandlerFunc(device.EnrollDevice)))
	mux.Handle("/api/v1/device/sync", device.DeviceAuthMiddleware(http.HandlerFunc(device.SyncDevice)))
	mux.Handle("/api/v1/device/compliance", device.DeviceAuthMiddleware(http.HandlerFunc(device.ReportCompliance)))

	// ---- Admin routes (JWT protected) ----
	admin := http.NewServeMux()

	// Devices
	admin.HandleFunc("/api/v1/devices", device.GetDevices)
	admin.HandleFunc("/api/v1/devices/", func(w http.ResponseWriter, r *http.Request) {
		path := r.URL.Path
		switch {
		case strings.HasSuffix(path, "/actions"):
			device.ExecuteRemoteAction(w, r)
		default:
			device.GetDeviceDetail(w, r)
		}
	})

	// Bulk device actions
	admin.HandleFunc("/api/v1/devices/bulk/action", bulk.BulkAction)
	admin.HandleFunc("/api/v1/devices/bulk/assign-team", bulk.BulkAssignTeam)
	admin.HandleFunc("/api/v1/devices/bulk/assign-policy", bulk.BulkAssignPolicy)

	// Policies
	admin.HandleFunc("/api/v1/policies", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			policy.GetPolicies(w, r)
		case http.MethodPost:
			policy.CreatePolicy(w, r)
		default:
			http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
		}
	})
	admin.HandleFunc("/api/v1/policies/", func(w http.ResponseWriter, r *http.Request) {
		path := r.URL.Path
		switch {
		case strings.HasSuffix(path, "/versions"):
			policy.GetPolicyVersions(w, r)
		case strings.HasSuffix(path, "/rollback"):
			policy.RollbackPolicy(w, r)
		default:
			switch r.Method {
			case http.MethodPut:
				policy.UpdatePolicy(w, r)
			case http.MethodDelete:
				policy.DeletePolicy(w, r)
			default:
				http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
			}
		}
	})

	// Compliance
	admin.HandleFunc("/api/v1/compliance/summary", policy.GetComplianceSummary)

	// Audit logs
	admin.HandleFunc("/api/v1/audits", getAuditLogsHandler)

	// Teams
	admin.HandleFunc("/api/v1/teams", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			team.ListTeams(w, r)
		case http.MethodPost:
			team.CreateTeam(w, r)
		default:
			http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
		}
	})
	admin.HandleFunc("/api/v1/teams/", func(w http.ResponseWriter, r *http.Request) {
		path := r.URL.Path
		switch {
		case strings.HasSuffix(path, "/devices"):
			team.AssignDevicesToTeam(w, r)
		case strings.HasSuffix(path, "/members"):
			switch r.Method {
			case http.MethodGet:
				team.GetTeamMembers(w, r)
			case http.MethodPost:
				team.AddTeamMember(w, r)
			default:
				http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
			}
		case strings.Contains(path, "/members/"):
			team.RemoveTeamMember(w, r)
		default:
			switch r.Method {
			case http.MethodPut:
				team.UpdateTeam(w, r)
			case http.MethodDelete:
				team.DeleteTeam(w, r)
			default:
				http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
			}
		}
	})

	// Labels
	admin.HandleFunc("/api/v1/labels", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			label.ListLabels(w, r)
		case http.MethodPost:
			label.CreateLabel(w, r)
		default:
			http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
		}
	})
	admin.HandleFunc("/api/v1/labels/evaluate", label.EvaluateAllLabels)
	admin.HandleFunc("/api/v1/labels/", func(w http.ResponseWriter, r *http.Request) {
		path := r.URL.Path
		if strings.HasSuffix(path, "/devices") {
			label.GetLabelDevices(w, r)
			return
		}
		switch r.Method {
		case http.MethodPut:
			label.UpdateLabel(w, r)
		case http.MethodDelete:
			label.DeleteLabel(w, r)
		default:
			http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
		}
	})

	// Applications
	admin.HandleFunc("/api/v1/apps", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			app.ListApps(w, r)
		case http.MethodPost:
			app.CreateApp(w, r)
		default:
			http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
		}
	})
	admin.HandleFunc("/api/v1/apps/deploy", app.DeployApp)
	admin.HandleFunc("/api/v1/apps/deployments", app.ListDeployments)
	admin.HandleFunc("/api/v1/apps/", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodDelete {
			app.DeleteApp(w, r)
		} else {
			http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
		}
	})

	// Enrollment tokens
	admin.HandleFunc("/api/v1/enrollment-tokens", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			app.GetEnrollmentTokens(w, r)
		case http.MethodPost:
			app.CreateEnrollmentToken(w, r)
		default:
			http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
		}
	})
	admin.HandleFunc("/api/v1/enrollment-tokens/", func(w http.ResponseWriter, r *http.Request) {
		path := r.URL.Path
		if strings.HasSuffix(path, "/qr") {
			app.GenerateEnrollmentQR(w, r)
			return
		}
		if r.Method == http.MethodDelete {
			app.RevokeEnrollmentToken(w, r)
		} else {
			http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
		}
	})

	// Saved views
	admin.HandleFunc("/api/v1/views", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			app.GetSavedViews(w, r)
		case http.MethodPost:
			app.CreateSavedView(w, r)
		default:
			http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
		}
	})
	admin.HandleFunc("/api/v1/views/", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodDelete {
			app.DeleteSavedView(w, r)
		} else {
			http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
		}
	})

	// Telemetry queries
	admin.HandleFunc("/api/v1/queries", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			query.ListQueries(w, r)
		case http.MethodPost:
			query.CreateQuery(w, r)
		default:
			http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
		}
	})
	admin.HandleFunc("/api/v1/queries/run", query.RunAdHocQuery)
	admin.HandleFunc("/api/v1/queries/", func(w http.ResponseWriter, r *http.Request) {
		path := r.URL.Path
		if strings.HasSuffix(path, "/run") {
			query.RunSavedQuery(w, r)
			return
		}
		if r.Method == http.MethodDelete {
			query.DeleteQuery(w, r)
		} else {
			http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
		}
	})

	// Webhooks
	admin.HandleFunc("/api/v1/webhooks", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			webhook.ListWebhooks(w, r)
		case http.MethodPost:
			webhook.CreateWebhook(w, r)
		default:
			http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
		}
	})
	admin.HandleFunc("/api/v1/webhooks/", func(w http.ResponseWriter, r *http.Request) {
		path := r.URL.Path
		if strings.HasSuffix(path, "/test") {
			webhook.TestWebhook(w, r)
			return
		}
		switch r.Method {
		case http.MethodPut:
			webhook.UpdateWebhook(w, r)
		case http.MethodDelete:
			webhook.DeleteWebhook(w, r)
		default:
			http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
		}
	})

	// Reports
	admin.HandleFunc("/api/v1/reports/compliance", report.GetComplianceSnapshot)
	admin.HandleFunc("/api/v1/reports/compliance/csv", report.GetComplianceCSV)
	admin.HandleFunc("/api/v1/reports/os-distribution", report.GetOSDistribution)
	admin.HandleFunc("/api/v1/reports/enrollment-trend", report.GetEnrollmentTrend)

	// Users
	admin.HandleFunc("/api/v1/users", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			user.ListUsers(w, r)
		case http.MethodPost:
			user.CreateUser(w, r)
		default:
			http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
		}
	})
	admin.HandleFunc("/api/v1/users/me", user.GetMe)
	admin.HandleFunc("/api/v1/users/", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodPut:
			user.UpdateUserRole(w, r)
		case http.MethodDelete:
			user.DeleteUser(w, r)
		default:
			http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
		}
	})

	// Wrap all admin routes with JWT middleware
	protected := auth.JWTMiddleware(admin)
	for _, prefix := range []string{
		"/api/v1/devices", "/api/v1/policies", "/api/v1/compliance",
		"/api/v1/audits", "/api/v1/teams", "/api/v1/labels",
		"/api/v1/apps", "/api/v1/enrollment-tokens", "/api/v1/views",
		"/api/v1/queries", "/api/v1/webhooks", "/api/v1/reports",
		"/api/v1/users",
	} {
		mux.Handle(prefix, protected)
		mux.Handle(prefix+"/", protected)
	}

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	server := &http.Server{
		Addr:         ":" + port,
		Handler:      corsMiddleware(mux),
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
	}

	log.Printf("Server listening on port %s", port)
	if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Fatalf("Server listen failed: %v", err)
	}
}

// Ensure fmt is used
var _ = fmt.Sprintf
