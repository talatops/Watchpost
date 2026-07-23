-- Migration 004: Policy version history for rollback support

CREATE TABLE IF NOT EXISTS policy_versions (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    policy_id  UUID NOT NULL REFERENCES policies(id) ON DELETE CASCADE,
    version    INTEGER NOT NULL,
    content_yaml TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Unique constraint: one row per (policy_id, version) pair
CREATE UNIQUE INDEX IF NOT EXISTS uq_policy_versions_policy_version
    ON policy_versions (policy_id, version);

-- Backfill version 1 rows for any policies that already exist
INSERT INTO policy_versions (policy_id, version, content_yaml)
SELECT id, version, content_yaml
FROM policies
ON CONFLICT (policy_id, version) DO NOTHING;
