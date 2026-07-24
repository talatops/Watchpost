/**
 * usePermissions — Frontend RBAC hook
 *
 * Reads the current user's role from /users/me (cached in localStorage after login)
 * and exposes per-feature permission flags.
 *
 * IMPORTANT: This is a UX convenience layer only.
 * The backend must (and does) enforce every permission server-side.
 */

import { useMemo } from 'react';

export type Role = 'SUPER_ADMIN' | 'ORG_ADMIN' | 'TEAM_ADMIN' | 'SUPPORT' | 'AUDITOR' | '';

// ── Permission helpers ─────────────────────────────────────────────────────
function is(role: Role, ...allowed: Role[]): boolean {
  return allowed.includes(role);
}

function atLeast(role: Role, minimum: Role): boolean {
  const RANK: Record<Role, number> = {
    SUPER_ADMIN: 5,
    ORG_ADMIN:   4,
    TEAM_ADMIN:  3,
    SUPPORT:     2,
    AUDITOR:     1,
    '':          0,
  };
  return (RANK[role] ?? 0) >= (RANK[minimum] ?? 0);
}

// ── The hook ──────────────────────────────────────────────────────────────
export function usePermissions(role: Role | string) {
  const r = (role || '') as Role;

  return useMemo(() => ({
    role: r,

    // ── Navigation visibility ──────────────────────────────────────────
    nav: {
      // All roles see these
      dashboard:  true,
      devices:    true,
      teams:      true,
      policies:   true,
      queries:    true,
      reports:    true,
      audits:     true,
      // Restricted nav items
      labels:     atLeast(r, 'TEAM_ADMIN'),
      apps:       atLeast(r, 'TEAM_ADMIN'),
      webhooks:   is(r, 'SUPER_ADMIN', 'ORG_ADMIN', 'AUDITOR'),
      users:      is(r, 'SUPER_ADMIN', 'ORG_ADMIN'),
    },

    // ── Devices ────────────────────────────────────────────────────────
    devices: {
      view:             true,
      execCommand:      atLeast(r, 'SUPPORT'),    // SYNC, LOCK, REBOOT
      execWipeCorp:     atLeast(r, 'TEAM_ADMIN'), // Corporate Wipe
      execWipeFull:     is(r, 'SUPER_ADMIN', 'ORG_ADMIN'), // Factory Reset
      bulkActions:      atLeast(r, 'SUPPORT'),
      assignTeam:       atLeast(r, 'TEAM_ADMIN'),
      assignPolicy:     atLeast(r, 'TEAM_ADMIN'),
    },

    // ── Teams ──────────────────────────────────────────────────────────
    teams: {
      view:             true,
      create:           is(r, 'SUPER_ADMIN', 'ORG_ADMIN'),
      edit:             atLeast(r, 'TEAM_ADMIN'),
      delete:           is(r, 'SUPER_ADMIN', 'ORG_ADMIN'),
      addMember:        atLeast(r, 'TEAM_ADMIN'),
      removeMember:     atLeast(r, 'TEAM_ADMIN'),
      addDevice:        atLeast(r, 'TEAM_ADMIN'),
      removeDevice:     atLeast(r, 'TEAM_ADMIN'),
    },

    // ── Labels ─────────────────────────────────────────────────────────
    labels: {
      view:             atLeast(r, 'TEAM_ADMIN'),
      create:           atLeast(r, 'TEAM_ADMIN'),
      edit:             atLeast(r, 'TEAM_ADMIN'),
      delete:           atLeast(r, 'TEAM_ADMIN'),
      evaluate:         atLeast(r, 'TEAM_ADMIN'),
    },

    // ── Policies ───────────────────────────────────────────────────────
    policies: {
      view:             true,
      create:           atLeast(r, 'TEAM_ADMIN'),
      edit:             atLeast(r, 'TEAM_ADMIN'),
      delete:           is(r, 'SUPER_ADMIN', 'ORG_ADMIN'),
      viewHistory:      true,
      rollback:         is(r, 'SUPER_ADMIN', 'ORG_ADMIN'),
    },

    // ── Queries ────────────────────────────────────────────────────────
    queries: {
      view:             true,
      run:              true,
      save:             atLeast(r, 'SUPPORT'),
      delete:           atLeast(r, 'SUPPORT'),
    },

    // ── Applications ───────────────────────────────────────────────────
    apps: {
      view:             atLeast(r, 'TEAM_ADMIN'),
      register:         is(r, 'SUPER_ADMIN', 'ORG_ADMIN'),
      delete:           is(r, 'SUPER_ADMIN', 'ORG_ADMIN'),
      deploy:           atLeast(r, 'TEAM_ADMIN'),
      createToken:      is(r, 'SUPER_ADMIN', 'ORG_ADMIN'),
      revokeToken:      is(r, 'SUPER_ADMIN', 'ORG_ADMIN'),
      viewQR:           atLeast(r, 'TEAM_ADMIN'),
    },

    // ── Webhooks ───────────────────────────────────────────────────────
    webhooks: {
      view:             is(r, 'SUPER_ADMIN', 'ORG_ADMIN', 'AUDITOR'),
      create:           is(r, 'SUPER_ADMIN', 'ORG_ADMIN'),
      edit:             is(r, 'SUPER_ADMIN', 'ORG_ADMIN'),
      delete:           is(r, 'SUPER_ADMIN', 'ORG_ADMIN'),
      test:             is(r, 'SUPER_ADMIN', 'ORG_ADMIN'),
    },

    // ── Reports ────────────────────────────────────────────────────────
    reports: {
      view:             true,
      export:           true,
    },

    // ── Audit Logs ─────────────────────────────────────────────────────
    audits: {
      view:             true,
    },

    // ── Users ──────────────────────────────────────────────────────────
    users: {
      view:             is(r, 'SUPER_ADMIN', 'ORG_ADMIN'),
      create:           is(r, 'SUPER_ADMIN', 'ORG_ADMIN'),
      changeRole:       is(r, 'SUPER_ADMIN', 'ORG_ADMIN'),
      delete:           is(r, 'SUPER_ADMIN', 'ORG_ADMIN'),
    },

  }), [r]);
}

export type Permissions = ReturnType<typeof usePermissions>;
