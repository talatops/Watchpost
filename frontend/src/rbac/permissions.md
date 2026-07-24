# Role-Based Access Control (RBAC) - Permission Matrix

## Role Hierarchy (highest to lowest)
1. **SUPER_ADMIN** - Platform owner, full unrestricted access
2. **ORG_ADMIN** - Organization administrator
3. **TEAM_ADMIN** - Team manager
4. **SUPPORT** - Technical support staff
5. **AUDITOR** - Read-only compliance auditor

---

## Permission Matrix by Feature

### 🏠 Dashboard
| Action | SUPER_ADMIN | ORG_ADMIN | TEAM_ADMIN | SUPPORT | AUDITOR |
|--------|-------------|-----------|------------|---------|---------|
| View   | ✅ | ✅ | ✅ | ✅ | ✅ |

### 📱 Devices
| Action | SUPER_ADMIN | ORG_ADMIN | TEAM_ADMIN | SUPPORT | AUDITOR |
|--------|-------------|-----------|------------|---------|---------|
| View List | ✅ | ✅ | ✅ | ✅ | ✅ |
| View Detail | ✅ | ✅ | ✅ | ✅ | ✅ |
| Execute Commands (SYNC/LOCK/REBOOT) | ✅ | ✅ | ✅ | ✅ | ❌ |
| Execute Wipe (Corporate) | ✅ | ✅ | ✅ | ❌ | ❌ |
| Execute Wipe (Factory Reset) | ✅ | ✅ | ❌ | ❌ | ❌ |
| Bulk Actions | ✅ | ✅ | ✅ | ✅ | ❌ |
| Assign to Team | ✅ | ✅ | ✅ | ❌ | ❌ |
| Assign Policy | ✅ | ✅ | ✅ | ❌ | ❌ |

### 👥 Teams
| Action | SUPER_ADMIN | ORG_ADMIN | TEAM_ADMIN | SUPPORT | AUDITOR |
|--------|-------------|-----------|------------|---------|---------|
| View Teams | ✅ | ✅ | ✅ | ✅ | ✅ |
| Create Team | ✅ | ✅ | ❌ | ❌ | ❌ |
| Edit Team | ✅ | ✅ | ✅ (own teams) | ❌ | ❌ |
| Delete Team | ✅ | ✅ | ❌ | ❌ | ❌ |
| Add/Remove Members | ✅ | ✅ | ✅ (own teams) | ❌ | ❌ |
| Assign Devices | ✅ | ✅ | ✅ (own teams) | ❌ | ❌ |

### 🏷️ Labels
| Action | SUPER_ADMIN | ORG_ADMIN | TEAM_ADMIN | SUPPORT | AUDITOR |
|--------|-------------|-----------|------------|---------|---------|
| View Labels | ✅ | ✅ | ✅ | ✅ | ✅ |
| Create Label | ✅ | ✅ | ✅ | ❌ | ❌ |
| Edit Label | ✅ | ✅ | ✅ | ❌ | ❌ |
| Delete Label | ✅ | ✅ | ✅ | ❌ | ❌ |
| Evaluate Labels | ✅ | ✅ | ✅ | ❌ | ❌ |

### ⚙️ Policies
| Action | SUPER_ADMIN | ORG_ADMIN | TEAM_ADMIN | SUPPORT | AUDITOR |
|--------|-------------|-----------|------------|---------|---------|
| View Policies | ✅ | ✅ | ✅ | ✅ | ✅ |
| Create Policy | ✅ | ✅ | ✅ | ❌ | ❌ |
| Edit Policy | ✅ | ✅ | ✅ | ❌ | ❌ |
| Delete Policy | ✅ | ✅ | ❌ | ❌ | ❌ |
| View History | ✅ | ✅ | ✅ | ✅ | ✅ |
| Rollback Version | ✅ | ✅ | ❌ | ❌ | ❌ |

### 📊 Queries (Telemetry)
| Action | SUPER_ADMIN | ORG_ADMIN | TEAM_ADMIN | SUPPORT | AUDITOR |
|--------|-------------|-----------|------------|---------|---------|
| View Page | ✅ | ✅ | ✅ | ✅ | ✅ |
| Run Query | ✅ | ✅ | ✅ | ✅ | ✅ |
| Save Query | ✅ | ✅ | ✅ | ✅ | ❌ |
| Delete Query | ✅ | ✅ | ✅ (own) | ✅ (own) | ❌ |

### 📦 Applications
| Action | SUPER_ADMIN | ORG_ADMIN | TEAM_ADMIN | SUPPORT | AUDITOR |
|--------|-------------|-----------|------------|---------|---------|
| View Apps | ✅ | ✅ | ✅ | ✅ | ✅ |
| Register App | ✅ | ✅ | ❌ | ❌ | ❌ |
| Delete App | ✅ | ✅ | ❌ | ❌ | ❌ |
| Deploy App | ✅ | ✅ | ✅ | ❌ | ❌ |
| Create Enrollment Token | ✅ | ✅ | ❌ | ❌ | ❌ |
| Revoke Token | ✅ | ✅ | ❌ | ❌ | ❌ |

### ⚡ Webhooks
| Action | SUPER_ADMIN | ORG_ADMIN | TEAM_ADMIN | SUPPORT | AUDITOR |
|--------|-------------|-----------|------------|---------|---------|
| View Webhooks | ✅ | ✅ | ✅ | ❌ | ✅ |
| Create Webhook | ✅ | ✅ | ❌ | ❌ | ❌ |
| Edit Webhook | ✅ | ✅ | ❌ | ❌ | ❌ |
| Delete Webhook | ✅ | ✅ | ❌ | ❌ | ❌ |
| Test Webhook | ✅ | ✅ | ✅ | ❌ | ❌ |

### 📈 Reports
| Action | SUPER_ADMIN | ORG_ADMIN | TEAM_ADMIN | SUPPORT | AUDITOR |
|--------|-------------|-----------|------------|---------|---------|
| View Reports | ✅ | ✅ | ✅ | ✅ | ✅ |
| Export CSV | ✅ | ✅ | ✅ | ✅ | ✅ |
| Refresh Data | ✅ | ✅ | ✅ | ✅ | ✅ |

### 📝 Audit Logs
| Action | SUPER_ADMIN | ORG_ADMIN | TEAM_ADMIN | SUPPORT | AUDITOR |
|--------|-------------|-----------|------------|---------|---------|
| View Logs | ✅ | ✅ | ✅ | ✅ | ✅ |
| Search/Filter | ✅ | ✅ | ✅ | ✅ | ✅ |

### 👤 Users
| Action | SUPER_ADMIN | ORG_ADMIN | TEAM_ADMIN | SUPPORT | AUDITOR |
|--------|-------------|-----------|------------|---------|---------|
| View Users | ✅ | ✅ | ❌ | ❌ | ❌ |
| Create User | ✅ | ✅ | ❌ | ❌ | ❌ |
| Change Role | ✅ | ✅ | ❌ | ❌ | ❌ |
| Delete User | ✅ | ✅ | ❌ | ❌ | ❌ |

---

## Summary by Role

### 🔴 SUPER_ADMIN
- **Full unrestricted access** to all features
- Can perform **all destructive actions** (factory reset, delete policies, delete users)
- Platform owner capabilities

### 🟠 ORG_ADMIN
- **Near-full access**, manages organization
- Can create/delete teams, users, webhooks, apps
- Can execute factory resets and manage policies
- Cannot access other organizations

### 🔵 TEAM_ADMIN
- **Team-focused management**
- Can manage their assigned teams (devices, members, policies)
- Can execute device commands (except factory reset)
- Cannot create/delete teams or manage users

### 🟢 SUPPORT
- **Operational support role**
- Can view all data and execute **safe commands** (SYNC, LOCK, REBOOT)
- Can run queries to diagnose issues
- **Cannot modify configuration** (no create/edit/delete)
- **Cannot execute destructive commands** (wipes)

### ⚫ AUDITOR
- **Strict read-only access**
- Can view all pages for compliance auditing
- **Cannot execute any commands** or modify any data
- Ideal for compliance officers, external auditors

---

## Navigation Menu Access

### Available to ALL roles:
- Dashboard
- Devices (read)
- Reports
- Audit Logs

### Conditional Access:
- **Teams**: All can view, only SUPER_ADMIN/ORG_ADMIN can create
- **Labels**: Hidden from AUDITOR
- **Policies**: All can view, write access varies
- **Queries**: All can access
- **Apps**: All can view, create restricted
- **Webhooks**: Hidden from SUPPORT
- **Users**: Only SUPER_ADMIN and ORG_ADMIN

---

## Implementation Notes

1. **Frontend enforcement** (UX only - NOT security boundary)
   - Hide unavailable actions/buttons
   - Disable inputs for read-only roles
   - Show informative messages when actions are restricted

2. **Backend enforcement** (REQUIRED - security boundary)
   - All mutations MUST verify role permissions server-side
   - Return 403 Forbidden for unauthorized actions
   - Log all permission denials for audit trail

3. **Graceful degradation**
   - Users see only what they can access
   - No "permission denied" errors on page load
   - Clear feedback when attempting restricted actions
