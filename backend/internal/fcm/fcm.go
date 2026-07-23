// Package fcm provides Firebase Cloud Messaging push notification support.
// Uses the FCM HTTP v1 API authenticated with a Google service account.
//
// Configuration (set ONE of the following):
//   FCM_SERVICE_ACCOUNT_FILE — path to the service account JSON file
//                               e.g. /run/secrets/firebase-sa.json
//   FCM_SERVICE_ACCOUNT_JSON — the full service account JSON as a string
//                               (useful for Docker/k8s environment injection)
//   FIREBASE_PROJECT_ID      — Firebase project ID (e.g. openmdm-bf458)
//                               Falls back to the project_id inside the SA JSON.
//
// How to get the service account JSON:
//   1. Firebase Console → Project Settings → Service accounts tab
//   2. Click "Generate new private key" → Download the JSON file
//   3. Store it securely (NEVER commit to git)
//   4. Set FCM_SERVICE_ACCOUNT_FILE=/path/to/file.json in your .env
//      OR set FCM_SERVICE_ACCOUNT_JSON=$(cat file.json) for container injection
package fcm

import (
	"bytes"
	"crypto/rsa"
	"crypto/x509"
	"encoding/json"
	"encoding/pem"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

const (
	fcmV1Endpoint  = "https://fcm.googleapis.com/v1/projects/%s/messages:send"
	googleTokenURL = "https://oauth2.googleapis.com/token"
	fcmScope       = "https://www.googleapis.com/auth/firebase.messaging"
	tokenExpiry    = 55 * time.Minute // refresh 5 min before Google's 60-min expiry
)

// serviceAccountJSON mirrors the fields we need from the SA JSON file.
type serviceAccountJSON struct {
	Type         string `json:"type"`
	ProjectID    string `json:"project_id"`
	PrivateKeyID string `json:"private_key_id"`
	PrivateKey   string `json:"private_key"`
	ClientEmail  string `json:"client_email"`
	TokenURI     string `json:"token_uri"`
}

// tokenCache holds a cached OAuth2 access token and its expiry.
type tokenCache struct {
	mu          sync.Mutex
	accessToken string
	expiresAt   time.Time
}

var (
	httpClient = &http.Client{Timeout: 15 * time.Second}
	cache      = &tokenCache{}
)

// loadServiceAccount reads the service account JSON from env var or file.
// Returns nil, nil if FCM is not configured (graceful no-op).
func loadServiceAccount() (*serviceAccountJSON, error) {
	var raw []byte

	// Prefer inline JSON (good for Docker secrets / k8s env injection)
	if inline := os.Getenv("FCM_SERVICE_ACCOUNT_JSON"); inline != "" {
		raw = []byte(inline)
	} else if filePath := os.Getenv("FCM_SERVICE_ACCOUNT_FILE"); filePath != "" {
		var err error
		raw, err = os.ReadFile(filePath)
		if err != nil {
			return nil, fmt.Errorf("FCM: cannot read service account file %q: %w", filePath, err)
		}
	} else {
		// Neither configured — FCM is disabled
		return nil, nil
	}

	var sa serviceAccountJSON
	if err := json.Unmarshal(raw, &sa); err != nil {
		return nil, fmt.Errorf("FCM: invalid service account JSON: %w", err)
	}
	if sa.PrivateKey == "" || sa.ClientEmail == "" {
		return nil, fmt.Errorf("FCM: service account JSON missing private_key or client_email")
	}
	// Allow FIREBASE_PROJECT_ID to override the project_id in the SA file
	if override := os.Getenv("FIREBASE_PROJECT_ID"); override != "" {
		sa.ProjectID = override
	}
	if sa.TokenURI == "" {
		sa.TokenURI = googleTokenURL
	}
	return &sa, nil
}

// parseRSAPrivateKey decodes a PEM-encoded RSA private key.
func parseRSAPrivateKey(pemStr string) (*rsa.PrivateKey, error) {
	// Service account keys may use PKCS#8 ("PRIVATE KEY") or PKCS#1 ("RSA PRIVATE KEY")
	block, _ := pem.Decode([]byte(pemStr))
	if block == nil {
		return nil, fmt.Errorf("FCM: failed to decode PEM block from private key")
	}
	switch block.Type {
	case "RSA PRIVATE KEY":
		return x509.ParsePKCS1PrivateKey(block.Bytes)
	case "PRIVATE KEY":
		key, err := x509.ParsePKCS8PrivateKey(block.Bytes)
		if err != nil {
			return nil, err
		}
		rsaKey, ok := key.(*rsa.PrivateKey)
		if !ok {
			return nil, fmt.Errorf("FCM: PKCS#8 key is not RSA")
		}
		return rsaKey, nil
	default:
		return nil, fmt.Errorf("FCM: unsupported PEM block type: %s", block.Type)
	}
}

// getAccessToken returns a valid OAuth2 Bearer token, using the cache.
func getAccessToken(sa *serviceAccountJSON) (string, error) {
	cache.mu.Lock()
	defer cache.mu.Unlock()

	if cache.accessToken != "" && time.Now().Before(cache.expiresAt) {
		return cache.accessToken, nil
	}

	privateKey, err := parseRSAPrivateKey(sa.PrivateKey)
	if err != nil {
		return "", fmt.Errorf("FCM: %w", err)
	}

	now := time.Now()
	jwtClaims := jwt.MapClaims{
		"iss":   sa.ClientEmail,
		"sub":   sa.ClientEmail,
		"aud":   sa.TokenURI,
		"scope": fcmScope,
		"iat":   now.Unix(),
		"exp":   now.Add(time.Hour).Unix(),
	}

	tok := jwt.NewWithClaims(jwt.SigningMethodRS256, jwtClaims)
	if sa.PrivateKeyID != "" {
		tok.Header["kid"] = sa.PrivateKeyID
	}
	signedJWT, err := tok.SignedString(privateKey)
	if err != nil {
		return "", fmt.Errorf("FCM: failed to sign service account JWT: %w", err)
	}

	// Exchange the signed JWT for a Google OAuth2 access token
	resp, err := httpClient.PostForm(sa.TokenURI, url.Values{
		"grant_type": {"urn:ietf:params:oauth:grant-type:jwt-bearer"},
		"assertion":  {signedJWT},
	})
	if err != nil {
		return "", fmt.Errorf("FCM: token exchange HTTP error: %w", err)
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("FCM: token exchange failed (%d): %s", resp.StatusCode, string(body))
	}

	var tokenResp struct {
		AccessToken string `json:"access_token"`
		ExpiresIn   int    `json:"expires_in"`
	}
	if err := json.Unmarshal(body, &tokenResp); err != nil {
		return "", fmt.Errorf("FCM: failed to parse token response: %w", err)
	}

	cache.accessToken = tokenResp.AccessToken
	cache.expiresAt = now.Add(tokenExpiry)
	log.Printf("FCM: OAuth2 access token refreshed (expires in %ds)", tokenResp.ExpiresIn)
	return cache.accessToken, nil
}

// fcmV1Message is the FCM v1 API request body.
type fcmV1Message struct {
	Message struct {
		Token string            `json:"token"`
		Data  map[string]string `json:"data,omitempty"`
	} `json:"message"`
}

// SendToDevice sends a data message to a single device via the FCM HTTP v1 API.
// All values in data must be strings (FCM v1 requirement).
// Gracefully no-ops if FCM is not configured.
func SendToDevice(fcmToken string, data map[string]interface{}) error {
	if fcmToken == "" {
		return fmt.Errorf("FCM: empty device token")
	}

	sa, err := loadServiceAccount()
	if err != nil {
		log.Printf("FCM: configuration error — %v", err)
		return err
	}
	if sa == nil {
		log.Printf("FCM: not configured — skipping push to %s", truncate(fcmToken, 20))
		return nil
	}
	if sa.ProjectID == "" {
		log.Printf("FCM: FIREBASE_PROJECT_ID not set — skipping push")
		return nil
	}

	accessToken, err := getAccessToken(sa)
	if err != nil {
		return fmt.Errorf("FCM: %w", err)
	}

	// FCM v1 requires all data values to be strings
	stringData := make(map[string]string, len(data))
	for k, v := range data {
		stringData[k] = fmt.Sprintf("%v", v)
	}

	var msg fcmV1Message
	msg.Message.Token = fcmToken
	msg.Message.Data = stringData

	payload, err := json.Marshal(msg)
	if err != nil {
		return fmt.Errorf("FCM: failed to marshal message: %w", err)
	}

	endpoint := fmt.Sprintf(fcmV1Endpoint, sa.ProjectID)
	req, err := http.NewRequest(http.MethodPost, endpoint, bytes.NewReader(payload))
	if err != nil {
		return fmt.Errorf("FCM: failed to build request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+accessToken)
	req.Header.Set("Content-Type", "application/json")

	resp, err := httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("FCM: HTTP error: %w", err)
	}
	defer resp.Body.Close()

	raw, _ := io.ReadAll(resp.Body)

	if resp.StatusCode == http.StatusUnauthorized {
		// Token may have been revoked — clear the cache so next call re-fetches
		cache.mu.Lock()
		cache.accessToken = ""
		cache.mu.Unlock()
		return fmt.Errorf("FCM: unauthorized (401) — check service account permissions: %s", string(raw))
	}

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("FCM: server returned %d: %s", resp.StatusCode, string(raw))
	}

	log.Printf("FCM v1: push delivered to %s", truncate(fcmToken, 20))
	return nil
}

// InvalidateTokenCache forces the next SendToDevice call to fetch a fresh access token.
// Call this if you rotate the service account key.
func InvalidateTokenCache() {
	cache.mu.Lock()
	cache.accessToken = ""
	cache.mu.Unlock()
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "..."
}

// IsConfigured returns true if FCM credentials are present in the environment.
// Exported for health-check endpoints.
func IsConfigured() bool {
	return os.Getenv("FCM_SERVICE_ACCOUNT_JSON") != "" ||
		os.Getenv("FCM_SERVICE_ACCOUNT_FILE") != ""
}

// legacyFallback checks for the old FCM_SERVER_KEY and logs a helpful migration message.
// Called once at startup.
func init() {
	if os.Getenv("FCM_SERVER_KEY") != "" && !IsConfigured() {
		log.Println("FCM: WARNING — FCM_SERVER_KEY is set but the Legacy API is no longer supported.")
		log.Println("FCM: Migrate to FCM v1: Firebase Console → Project Settings → Service accounts → Generate new private key")
		log.Println("FCM: Then set FCM_SERVICE_ACCOUNT_FILE or FCM_SERVICE_ACCOUNT_JSON in your .env")
	}
}

// Ensure strings package is used (url.Values uses it internally via net/url)
var _ = strings.TrimSpace
