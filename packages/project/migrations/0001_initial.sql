PRAGMA foreign_keys = ON;

CREATE TABLE project_state (
  singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
  state_schema_version TEXT NOT NULL,
  metadata_json TEXT NOT NULL,
  active_design_revision_id TEXT NOT NULL,
  active_raw_revision_id TEXT NOT NULL
) STRICT;

CREATE TABLE design_revisions (
  sequence INTEGER PRIMARY KEY,
  id TEXT NOT NULL UNIQUE,
  previous_revision_id TEXT,
  created_at TEXT NOT NULL,
  record_json TEXT NOT NULL
) STRICT;

CREATE TABLE raw_revisions (
  sequence INTEGER PRIMARY KEY,
  id TEXT NOT NULL UNIQUE,
  previous_revision_id TEXT,
  created_at TEXT NOT NULL,
  record_json TEXT NOT NULL
) STRICT;

CREATE TABLE unit_instances (
  sequence INTEGER PRIMARY KEY,
  id TEXT NOT NULL UNIQUE,
  level_id TEXT NOT NULL,
  parent_unit_id TEXT,
  record_json TEXT NOT NULL
) STRICT;

CREATE TABLE observations (
  sequence INTEGER PRIMARY KEY,
  id TEXT NOT NULL,
  raw_revision_id TEXT NOT NULL REFERENCES raw_revisions(id),
  unit_instance_id TEXT NOT NULL REFERENCES unit_instances(id),
  condition_id TEXT NOT NULL,
  outcome_id TEXT NOT NULL,
  record_json TEXT NOT NULL,
  UNIQUE (id, raw_revision_id)
) STRICT;

CREATE INDEX observations_by_revision ON observations(raw_revision_id);
CREATE INDEX observations_by_unit ON observations(unit_instance_id);

CREATE TABLE analysis_runs (
  sequence INTEGER PRIMARY KEY,
  id TEXT NOT NULL UNIQUE,
  input_design_revision_id TEXT NOT NULL REFERENCES design_revisions(id),
  input_raw_revision_id TEXT NOT NULL REFERENCES raw_revisions(id),
  state TEXT NOT NULL CHECK (state IN ('current', 'stale')),
  record_json TEXT NOT NULL
) STRICT;

CREATE TABLE graphs (
  sequence INTEGER PRIMARY KEY,
  id TEXT NOT NULL UNIQUE,
  source_analysis_run_id TEXT NOT NULL REFERENCES analysis_runs(id),
  state TEXT NOT NULL CHECK (state IN ('current', 'stale')),
  record_json TEXT NOT NULL
) STRICT;

CREATE TABLE provenance_events (
  sequence INTEGER PRIMARY KEY,
  id TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL,
  target_id TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  record_json TEXT NOT NULL
) STRICT;

PRAGMA user_version = 1;
