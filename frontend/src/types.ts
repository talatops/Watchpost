export interface User {
  id: string;
  organization_id: string;
  email: string;
  role: string;
  created_at: string;
  updated_at: string;
}

export interface Team {
  id: string;
  organization_id: string;
  name: string;
  device_count: number;
  created_at: string;
}

export interface TeamMember {
  id: string;
  email: string;
  role: string;
}

export interface Device {
  id: string;
  team_id?: string;
  serial_number: string;
  imei?: string;
  model: string;
  os_version: string;
  patch_level: string;
  enrollment_status: string;
  last_seen: string;
  battery_level?: number;
  storage_total?: number;
  storage_available?: number;
  wifi_ssid?: string;
  installed_apps?: string;
  created_at: string;
  updated_at?: string;
}

export interface DevicesPage {
  data: Device[];
  total: number;
  page: number;
  page_size: number;
}

export interface PolicyCompliance {
  policy_id: string;
  status: string;
  error_message?: string;
  updated_at: string;
}

export interface DeviceEvent {
  id: string;
  event_type: string;
  details: string;
  created_at: string;
}

export interface DeviceDetail {
  device: Device;
  policy_compliance: PolicyCompliance[];
  events: DeviceEvent[];
}

export interface Policy {
  id: string;
  team_id?: string;
  name: string;
  description: string;
  content_yaml: string;
  version: number;
}

export interface ComplianceSummary {
  total_devices: number;
  compliant_count: number;
  pending_count: number;
  non_compliant_count: number;
}

export interface Application {
  id: string;
  package_name: string;
  version_code: number;
  version_name: string;
  apk_url: string;
  created_at: string;
}

export interface AppDeployment {
  id: string;
  device_id?: string;
  team_id?: string;
  application_id: string;
  install_type: string;
  package_name: string;
  version_name: string;
  created_at: string;
}

export interface AuditLog {
  id: string;
  actor_id?: string;
  action: string;
  target_type: string;
  target_id: string;
  details: string;
  created_at: string;
}

export interface Label {
  id: string;
  organization_id: string;
  name: string;
  description: string;
  rule_query: string;
  label_type: string;
  device_count: number;
  created_at: string;
  updated_at: string;
}

export interface Webhook {
  id: string;
  organization_id: string;
  name: string;
  url: string;
  event_types: string[];
  enabled: boolean;
  created_at: string;
}

export interface TelemetryQuery {
  id: string;
  author_id: string;
  name: string;
  description: string;
  query_sql: string;
  schedule_cron: string;
  last_run_at?: string;
  created_at: string;
}

export interface QueryResult {
  columns: string[];
  rows: Record<string, unknown>[];
  count: number;
}

export interface OSDistEntry {
  os_version: string;
  count: number;
}

export interface EnrollmentTrendEntry {
  date: string;
  count: number;
}

export interface ComplianceReportEntry {
  serial_number: string;
  model: string;
  os_version: string;
  patch_level: string;
  last_seen: string;
  team_name: string;
  compliance_status: string;
}

export interface EnrollmentToken {
  id: string;
  organization_id: string;
  token: string;
  label: string;
  max_uses: number;
  use_count: number;
  expires_at?: string;
  created_at: string;
}

export interface SavedView {
  id: string;
  user_id: string;
  name: string;
  filters: string;
  created_at: string;
}

export interface PolicyVersion {
  id: string;
  policy_id: string;
  version: number;
  content_yaml: string;
  created_at: string;
}
