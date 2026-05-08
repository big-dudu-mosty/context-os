-- Migration: create domain_events, context_packages, and session_packages tables
-- Scope: Context OS P0 event and context package foundation

-- Up Migration

CREATE TABLE IF NOT EXISTS domain_events (
  id BIGSERIAL PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES projects(id),
  project_event_seq BIGINT NOT NULL,
  event_type VARCHAR(50) NOT NULL,
  event_version VARCHAR(20) NOT NULL DEFAULT 'v1',
  aggregate_type VARCHAR(50) NOT NULL,
  aggregate_id UUID NOT NULL,
  owner_id UUID NOT NULL REFERENCES users(id),
  agent_id UUID NOT NULL REFERENCES agents(id),
  session_id UUID REFERENCES sessions(id),
  payload JSONB NOT NULL,
  idempotency_key VARCHAR(100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_project_event_seq UNIQUE (project_id, project_event_seq)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_domain_events_idempotency_key
  ON domain_events (project_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_domain_events_project
  ON domain_events (project_id, project_event_seq);

CREATE INDEX IF NOT EXISTS idx_domain_events_aggregate
  ON domain_events (aggregate_type, aggregate_id, project_event_seq);

COMMENT ON TABLE domain_events IS 'Append-only project domain events used by reducers and rebuilds.';
COMMENT ON COLUMN domain_events.project_event_seq IS 'Project-local monotonic event sequence allocated under the project lock.';
COMMENT ON COLUMN domain_events.event_version IS 'Schema version of the event payload.';
COMMENT ON COLUMN domain_events.aggregate_type IS 'Type of aggregate affected by this event.';
COMMENT ON COLUMN domain_events.aggregate_id IS 'Identifier of aggregate affected by this event.';
COMMENT ON COLUMN domain_events.payload IS 'Event payload. This is an immutable fact once written.';
COMMENT ON COLUMN domain_events.idempotency_key IS 'Optional project-scoped idempotency key for retry-safe writes.';

CREATE TABLE IF NOT EXISTS context_packages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  source_type VARCHAR(20) NOT NULL,
  owner_id UUID NOT NULL REFERENCES users(id),
  agent_id UUID NOT NULL REFERENCES agents(id),
  title VARCHAR(500) NOT NULL,
  summary TEXT,
  raw_yaml TEXT NOT NULL,
  raw_yaml_hash VARCHAR(64) NOT NULL,
  project_ids UUID[] NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_context_packages_owner
  ON context_packages (owner_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_context_packages_projects
  ON context_packages
  USING GIN (project_ids);

COMMENT ON TABLE context_packages IS 'Submitted or generated context packages. Raw YAML remains immutable source material.';
COMMENT ON COLUMN context_packages.source_type IS 'Source kind, for example manual, session, or generated.';
COMMENT ON COLUMN context_packages.raw_yaml IS 'Original YAML content submitted to the system.';
COMMENT ON COLUMN context_packages.raw_yaml_hash IS 'Hash of original YAML content for integrity and deduplication checks.';
COMMENT ON COLUMN context_packages.project_ids IS 'Projects referenced by this package; session_packages is the source for session-package links.';

CREATE TABLE IF NOT EXISTS session_packages (
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  package_id UUID NOT NULL REFERENCES context_packages(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (session_id, package_id)
);

CREATE INDEX IF NOT EXISTS idx_session_packages_package
  ON session_packages (package_id);

COMMENT ON TABLE session_packages IS 'Join table linking sessions to context packages.';
COMMENT ON COLUMN session_packages.session_id IS 'Source session linked to a context package.';
COMMENT ON COLUMN session_packages.package_id IS 'Context package produced from or associated with a session.';

-- Down Migration

DROP TABLE IF EXISTS session_packages;
DROP TABLE IF EXISTS context_packages;
DROP TABLE IF EXISTS domain_events;
