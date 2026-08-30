CREATE TABLE IF NOT EXISTS problem_reports (
  report_id TEXT PRIMARY KEY,
  submission_id TEXT NOT NULL UNIQUE,
  reporter_id TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  received_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  notice_version TEXT NOT NULL,
  report_type TEXT NOT NULL,
  screen TEXT NOT NULL,
  attempted TEXT NOT NULL,
  observed TEXT NOT NULL,
  reproducibility TEXT NOT NULL,
  user_severity TEXT NOT NULL,
  diagnostic_json TEXT,
  contact_ciphertext TEXT,
  contact_iv TEXT,
  contact_expires_at TEXT,
  current_status TEXT NOT NULL DEFAULT 'new'
);

CREATE INDEX IF NOT EXISTS problem_reports_received ON problem_reports (received_at);
CREATE INDEX IF NOT EXISTS problem_reports_expiry ON problem_reports (expires_at);
CREATE INDEX IF NOT EXISTS problem_reports_reporter_received ON problem_reports (reporter_id, received_at);
CREATE INDEX IF NOT EXISTS problem_reports_content_received ON problem_reports (content_hash, received_at);

CREATE TABLE IF NOT EXISTS problem_report_status_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  report_id TEXT NOT NULL,
  status TEXT NOT NULL,
  changed_at TEXT NOT NULL,
  actor TEXT NOT NULL,
  note TEXT,
  duplicate_of TEXT,
  FOREIGN KEY (report_id) REFERENCES problem_reports(report_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS problem_report_history_report ON problem_report_status_history (report_id, changed_at);
