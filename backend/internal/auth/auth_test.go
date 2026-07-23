package auth

import (
	"testing"

	"github.com/google/uuid"
)

func TestHashPassword(t *testing.T) {
	password := "Password123"
	hash, err := HashPassword(password)
	if err != nil {
		t.Fatalf("Failed to hash password: %v", err)
	}

	if hash == "" {
		t.Fatal("Expected non-empty hash string")
	}

	if !CheckPasswordHash(password, hash) {
		t.Fatal("Expected password to match hash")
	}

	if CheckPasswordHash("wrong-password", hash) {
		t.Fatal("Expected wrong password to not match hash")
	}
}

func TestJWTTokenLifecycle(t *testing.T) {
	userID := uuid.New()
	orgID := uuid.New()
	role := "SUPER_ADMIN"

	token, err := GenerateToken(userID, orgID, role)
	if err != nil {
		t.Fatalf("Failed to generate token: %v", err)
	}

	if token == "" {
		t.Fatal("Expected non-empty JWT token string")
	}

	claims, err := ValidateToken(token)
	if err != nil {
		t.Fatalf("Failed to validate token: %v", err)
	}

	if claims.UserID != userID {
		t.Errorf("Expected UserID %v, got %v", userID, claims.UserID)
	}

	if claims.OrganizationID != orgID {
		t.Errorf("Expected OrganizationID %v, got %v", orgID, claims.OrganizationID)
	}

	if claims.Role != role {
		t.Errorf("Expected Role %s, got %s", role, claims.Role)
	}
}
