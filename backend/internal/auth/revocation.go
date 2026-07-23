package auth

import (
	"log"
	"sync"
	"time"

	"mdm-backend/internal/database"
)

// In-memory revocation cache (also persisted to revoked_tokens table on logout)
var (
	revokedMu    sync.RWMutex
	revokedCache = map[string]struct{}{}
)

// RevokeToken adds a JTI to the revocation list (DB + cache)
func RevokeToken(jti string, expiresAt time.Time) {
	revokedMu.Lock()
	revokedCache[jti] = struct{}{}
	revokedMu.Unlock()

	if database.DB != nil {
		_, err := database.DB.Exec(
			`INSERT INTO revoked_tokens (jti, expires_at) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
			jti, expiresAt,
		)
		if err != nil {
			log.Printf("Failed to persist token revocation: %v", err)
		}
	}
}

// IsRevoked checks if a JTI is in the revocation list
func IsRevoked(jti string) bool {
	revokedMu.RLock()
	_, found := revokedCache[jti]
	revokedMu.RUnlock()
	if found {
		return true
	}

	// Fallback to DB (e.g. after server restart)
	if database.DB != nil {
		var exists bool
		_ = database.DB.QueryRow(
			`SELECT EXISTS(SELECT 1 FROM revoked_tokens WHERE jti=$1 AND expires_at > NOW())`, jti,
		).Scan(&exists)
		if exists {
			// Warm the cache
			revokedMu.Lock()
			revokedCache[jti] = struct{}{}
			revokedMu.Unlock()
			return true
		}
	}
	return false
}

// PurgeExpiredRevocations removes expired entries from DB and cache
// Call this periodically in the background.
func PurgeExpiredRevocations() {
	if database.DB != nil {
		_, _ = database.DB.Exec(`DELETE FROM revoked_tokens WHERE expires_at <= NOW()`)
	}
}
