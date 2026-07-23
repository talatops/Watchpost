-- Phase 2 Migration: FleetDM-style UX Tables

-- Labels: Dynamic rule-based device groups
CREATE TABLE IF NOT EXISTS labels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    rule_query TEXT NOT NULL,
    label_type VARCHAR(50) NOT NULL DEFAULT 'DYNAMIC',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Device-Label junction
CREATE TABLE IF NOT EXISTS device_labels (
    device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    label_id UUID NOT NULL REFERENCES labels(id) ON DELETE CASCADE,
    assigned_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (device_id, label_id)
);

-- Saved Views: Persisted filter presets
CREATE TABLE IF NOT EXISTS saved_views (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    filters JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Telemetry Queries: Saved/scheduled queries
CREATE TABLE IF NOT EXISTS telemetry_queries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    author_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    query_sql TEXT NOT NULL,
    schedule_cron VARCHAR(100),
    last_run_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Webhooks: Alert delivery endpoints
CREATE TABLE IF NOT EXISTS webhooks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    url VARCHAR(1024) NOT NULL,
    secret VARCHAR(255),
    event_types TEXT[] NOT NULL,
    enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Extend devices with telemetry columns
ALTER TABLE devices ADD COLUMN IF NOT EXISTS battery_level INTEGER;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS storage_total BIGINT;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS storage_available BIGINT;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS wifi_ssid VARCHAR(255);
ALTER TABLE devices ADD COLUMN IF NOT EXISTS installed_apps JSONB;

-- Read-only view for telemetry queries (safe query target)
CREATE OR REPLACE VIEW device_telemetry_view AS
SELECT
    d.id AS device_id,
    d.serial_number,
    d.model,
    d.os_version,
    d.patch_level,
    d.enrollment_status,
    d.last_seen,
    d.battery_level,
    d.storage_total,
    d.storage_available,
    d.wifi_ssid,
    d.installed_apps,
    d.created_at AS enrolled_at,
    t.name AS team_name,
    pc.status AS compliance_status,
    pc.error_message AS compliance_error
FROM devices d
LEFT JOIN teams t ON d.team_id = t.id
LEFT JOIN LATERAL (
    SELECT status, error_message
    FROM policy_compliance
    WHERE device_id = d.id
    ORDER BY updated_at DESC
    LIMIT 1
) pc ON true;
