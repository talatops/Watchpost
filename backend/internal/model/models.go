package model

import (
	"time"

	"github.com/google/uuid"
)

type UserRole string

const (
	RoleSuperAdmin UserRole = "SUPER_ADMIN"
	RoleOrgAdmin   UserRole = "ORG_ADMIN"
	RoleTeamAdmin  UserRole = "TEAM_ADMIN"
	RoleSupport    UserRole = "SUPPORT"
	RoleAuditor    UserRole = "AUDITOR"
)

type Organization struct {
	ID        uuid.UUID `json:"id" db:"id"`
	Name      string    `json:"name" db:"name"`
	CreatedAt time.Time `json:"created_at" db:"created_at"`
	UpdatedAt time.Time `json:"updated_at" db:"updated_at"`
}

type User struct {
	ID             uuid.UUID `json:"id" db:"id"`
	OrganizationID uuid.UUID `json:"organization_id" db:"organization_id"`
	Email          string    `json:"email" db:"email"`
	PasswordHash   string    `json:"-" db:"password_hash"`
	Role           UserRole  `json:"role" db:"role"`
	CreatedAt      time.Time `json:"created_at" db:"created_at"`
	UpdatedAt      time.Time `json:"updated_at" db:"updated_at"`
}

type Team struct {
	ID             uuid.UUID `json:"id" db:"id"`
	OrganizationID uuid.UUID `json:"organization_id" db:"organization_id"`
	Name           string    `json:"name" db:"name"`
	DeviceCount    int       `json:"device_count,omitempty"`
	CreatedAt      time.Time `json:"created_at" db:"created_at"`
}

type DeviceEnrollmentStatus string

const (
	StatusPending    DeviceEnrollmentStatus = "PENDING"
	StatusEnrolled   DeviceEnrollmentStatus = "ENROLLED"
	StatusUnenrolled DeviceEnrollmentStatus = "UNENROLLED"
)

type Device struct {
	ID                   uuid.UUID              `json:"id" db:"id"`
	TeamID               *uuid.UUID             `json:"team_id,omitempty" db:"team_id"`
	SerialNumber         string                 `json:"serial_number" db:"serial_number"`
	IMEI                 string                 `json:"imei,omitempty" db:"imei"`
	Model                string                 `json:"model" db:"model"`
	OSVersion            string                 `json:"os_version" db:"os_version"`
	PatchLevel           string                 `json:"patch_level" db:"patch_level"`
	EnrollmentStatus     DeviceEnrollmentStatus `json:"enrollment_status" db:"enrollment_status"`
	LastSeen             time.Time              `json:"last_seen" db:"last_seen"`
	DeviceToken          string                 `json:"-" db:"device_token"`
	FCMRegistrationToken string                 `json:"fcm_registration_token,omitempty" db:"fcm_registration_token"`
	BatteryLevel         *int                   `json:"battery_level,omitempty" db:"battery_level"`
	StorageTotal         *int64                 `json:"storage_total,omitempty" db:"storage_total"`
	StorageAvailable     *int64                 `json:"storage_available,omitempty" db:"storage_available"`
	WifiSSID             *string                `json:"wifi_ssid,omitempty" db:"wifi_ssid"`
	InstalledApps        *string                `json:"installed_apps,omitempty" db:"installed_apps"` // JSON string
	CreatedAt            time.Time              `json:"created_at" db:"created_at"`
	UpdatedAt            time.Time              `json:"updated_at" db:"updated_at"`
}

type Policy struct {
	ID          uuid.UUID  `json:"id" db:"id"`
	TeamID      *uuid.UUID `json:"team_id,omitempty" db:"team_id"`
	Name        string     `json:"name" db:"name"`
	Description string     `json:"description" db:"description"`
	ContentYAML string     `json:"content_yaml" db:"content_yaml"`
	Version     int        `json:"version" db:"version"`
	CreatedAt   time.Time  `json:"created_at" db:"created_at"`
	UpdatedAt   time.Time  `json:"updated_at" db:"updated_at"`
}

type ComplianceStatus string

const (
	ComplianceCompliant    ComplianceStatus = "COMPLIANT"
	ComplianceNonCompliant ComplianceStatus = "NON_COMPLIANT"
	CompliancePending      ComplianceStatus = "PENDING"
)

type PolicyCompliance struct {
	DeviceID     uuid.UUID        `json:"device_id" db:"device_id"`
	PolicyID     uuid.UUID        `json:"policy_id" db:"policy_id"`
	Status       ComplianceStatus `json:"status" db:"status"`
	ErrorMessage string           `json:"error_message,omitempty" db:"error_message"`
	UpdatedAt    time.Time        `json:"updated_at" db:"updated_at"`
}

type Application struct {
	ID          uuid.UUID `json:"id" db:"id"`
	PackageName string    `json:"package_name" db:"package_name"`
	VersionCode int       `json:"version_code" db:"version_code"`
	VersionName string    `json:"version_name" db:"version_name"`
	APKURL      string    `json:"apk_url" db:"apk_url"`
	CreatedAt   time.Time `json:"created_at" db:"created_at"`
}

type InstallType string

const (
	InstallForceInstall InstallType = "FORCE_INSTALL"
	InstallBlocked      InstallType = "BLOCKED"
	InstallAvailable    InstallType = "AVAILABLE"
)

type ApplicationDeployment struct {
	ID            uuid.UUID   `json:"id" db:"id"`
	DeviceID      *uuid.UUID  `json:"device_id,omitempty" db:"device_id"`
	TeamID        *uuid.UUID  `json:"team_id,omitempty" db:"team_id"`
	ApplicationID uuid.UUID   `json:"application_id" db:"application_id"`
	InstallType   InstallType `json:"install_type" db:"install_type"`
	CreatedAt     time.Time   `json:"created_at" db:"created_at"`
}

type DeviceEvent struct {
	ID        uuid.UUID `json:"id" db:"id"`
	DeviceID  uuid.UUID `json:"device_id" db:"device_id"`
	EventType string    `json:"event_type" db:"event_type"`
	Details   string    `json:"details" db:"details"`
	CreatedAt time.Time `json:"created_at" db:"created_at"`
}

type AuditLog struct {
	ID         uuid.UUID  `json:"id" db:"id"`
	ActorID    *uuid.UUID `json:"actor_id,omitempty" db:"actor_id"`
	Action     string     `json:"action" db:"action"`
	TargetType string     `json:"target_type" db:"target_type"`
	TargetID   uuid.UUID  `json:"target_id" db:"target_id"`
	Details    string     `json:"details" db:"details"`
	CreatedAt  time.Time  `json:"created_at" db:"created_at"`
}

// EnrollmentToken represents a time-limited device enrollment token
type EnrollmentToken struct {
	ID             uuid.UUID  `json:"id" db:"id"`
	OrganizationID uuid.UUID  `json:"organization_id" db:"organization_id"`
	Token          string     `json:"token" db:"token"`
	Label          string     `json:"label" db:"label"`
	MaxUses        int        `json:"max_uses" db:"max_uses"`   // 0 = unlimited
	UseCount       int        `json:"use_count" db:"use_count"`
	ExpiresAt      *time.Time `json:"expires_at,omitempty" db:"expires_at"`
	CreatedAt      time.Time  `json:"created_at" db:"created_at"`
}

// DeviceCommand represents a queued remote command for a device
type DeviceCommand struct {
	ID        uuid.UUID  `json:"id" db:"id"`
	DeviceID  uuid.UUID  `json:"device_id" db:"device_id"`
	Command   string     `json:"command" db:"command"` // REBOOT, LOCK, WIPE, SYNC
	Status    string     `json:"status" db:"status"`   // PENDING, SENT, EXECUTED, FAILED
	CreatedAt time.Time  `json:"created_at" db:"created_at"`
	SentAt    *time.Time `json:"sent_at,omitempty" db:"sent_at"`
}

// Label represents a dynamic rule-based device group
type Label struct {
	ID             uuid.UUID `json:"id" db:"id"`
	OrganizationID uuid.UUID `json:"organization_id" db:"organization_id"`
	Name           string    `json:"name" db:"name"`
	Description    string    `json:"description,omitempty" db:"description"`
	RuleQuery      string    `json:"rule_query" db:"rule_query"`
	LabelType      string    `json:"label_type" db:"label_type"` // DYNAMIC or MANUAL
	DeviceCount    int       `json:"device_count,omitempty"`
	CreatedAt      time.Time `json:"created_at" db:"created_at"`
	UpdatedAt      time.Time `json:"updated_at" db:"updated_at"`
}

// SavedView represents a persisted filter preset
type SavedView struct {
	ID        uuid.UUID `json:"id" db:"id"`
	UserID    uuid.UUID `json:"user_id" db:"user_id"`
	Name      string    `json:"name" db:"name"`
	Filters   string    `json:"filters" db:"filters"` // JSONB as string
	CreatedAt time.Time `json:"created_at" db:"created_at"`
}

// TelemetryQuery represents a saved/scheduled telemetry query
type TelemetryQuery struct {
	ID           uuid.UUID  `json:"id" db:"id"`
	AuthorID     uuid.UUID  `json:"author_id" db:"author_id"`
	Name         string     `json:"name" db:"name"`
	Description  string     `json:"description,omitempty" db:"description"`
	QuerySQL     string     `json:"query_sql" db:"query_sql"`
	ScheduleCron string     `json:"schedule_cron,omitempty" db:"schedule_cron"`
	LastRunAt    *time.Time `json:"last_run_at,omitempty" db:"last_run_at"`
	CreatedAt    time.Time  `json:"created_at" db:"created_at"`
}

// Webhook represents an alert delivery endpoint
type Webhook struct {
	ID             uuid.UUID `json:"id" db:"id"`
	OrganizationID uuid.UUID `json:"organization_id" db:"organization_id"`
	Name           string    `json:"name" db:"name"`
	URL            string    `json:"url" db:"url"`
	Secret         string    `json:"-" db:"secret"` // HMAC secret, never serialized
	EventTypes     []string  `json:"event_types" db:"event_types"`
	Enabled        bool      `json:"enabled" db:"enabled"`
	CreatedAt      time.Time `json:"created_at" db:"created_at"`
}
