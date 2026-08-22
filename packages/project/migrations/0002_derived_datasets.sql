CREATE TABLE transformations (
  sequence INTEGER PRIMARY KEY,
  id TEXT NOT NULL UNIQUE,
  record_json TEXT NOT NULL
) STRICT;

CREATE TABLE derived_dataset_revisions (
  sequence INTEGER PRIMARY KEY,
  id TEXT NOT NULL UNIQUE,
  source_raw_revision_id TEXT NOT NULL REFERENCES raw_revisions(id),
  transformation_id TEXT NOT NULL REFERENCES transformations(id),
  state TEXT NOT NULL CHECK (state IN ('current', 'stale')),
  record_json TEXT NOT NULL
) STRICT;

CREATE TABLE derived_values (
  sequence INTEGER PRIMARY KEY,
  id TEXT NOT NULL UNIQUE,
  derived_dataset_revision_id TEXT NOT NULL REFERENCES derived_dataset_revisions(id),
  experimental_unit_id TEXT NOT NULL REFERENCES unit_instances(id),
  condition_id TEXT NOT NULL,
  outcome_id TEXT NOT NULL,
  record_json TEXT NOT NULL
) STRICT;

CREATE INDEX derived_values_by_revision ON derived_values(derived_dataset_revision_id);
CREATE INDEX derived_values_by_unit ON derived_values(experimental_unit_id);

PRAGMA user_version = 2;
