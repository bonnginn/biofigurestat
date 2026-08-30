CREATE TABLE IF NOT EXISTS usage_events (
  id TEXT PRIMARY KEY,
  received_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  consent_notice_version TEXT NOT NULL,
  install_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  application_version TEXT NOT NULL,
  build_revision TEXT NOT NULL,
  platform TEXT NOT NULL,
  event_kind TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  route TEXT NOT NULL,
  workflow_family TEXT,
  category TEXT,
  event_json TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS usage_events_install_received
  ON usage_events (install_id, received_at);
CREATE INDEX IF NOT EXISTS usage_events_expiry
  ON usage_events (expires_at);
