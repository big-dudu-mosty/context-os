-- Migration: create extraction layer tables
-- Scope: Context OS P0 decisions, tasks, risks, open questions, and observations

-- Up Migration

CREATE TABLE IF NOT EXISTS decisions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  package_id UUID NOT NULL REFERENCES context_packages(id),
  project_id UUID NOT NULL REFERENCES projects(id),
  decision_key VARCHAR(200) NOT NULL,
  title VARCHAR(500) NOT NULL,
  detail TEXT,
  confidence DECIMAL(3,2),
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  supersedes_decision_id UUID REFERENCES decisions(id),
  overridden_by_decision_id UUID,
  conflict_group_id UUID,
  owner_id UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_decision_key_active_no_conflict
  ON decisions (project_id, decision_key, status)
  WHERE status = 'active' AND conflict_group_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_decisions_project
  ON decisions (project_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_decisions_package
  ON decisions (package_id);

CREATE INDEX IF NOT EXISTS idx_decisions_conflict
  ON decisions (conflict_group_id)
  WHERE conflict_group_id IS NOT NULL;

COMMENT ON TABLE decisions IS 'Structured decisions extracted from context packages.';
COMMENT ON COLUMN decisions.decision_key IS 'Stable key used to detect related or conflicting decisions.';
COMMENT ON COLUMN decisions.status IS 'Decision lifecycle status such as active, deprecated, or overridden.';
COMMENT ON COLUMN decisions.supersedes_decision_id IS 'Explicit prior decision superseded by this decision.';
COMMENT ON COLUMN decisions.overridden_by_decision_id IS 'Projection pointer to the decision that overrides this one.';
COMMENT ON COLUMN decisions.conflict_group_id IS 'Conflict group for active decisions that require human resolution.';

CREATE TABLE IF NOT EXISTS tasks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  package_id UUID NOT NULL REFERENCES context_packages(id),
  project_id UUID NOT NULL REFERENCES projects(id),
  title VARCHAR(500) NOT NULL,
  description TEXT,
  assignee_id UUID REFERENCES users(id),
  status VARCHAR(20) NOT NULL DEFAULT 'todo',
  priority VARCHAR(20),
  owner_id UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tasks_project
  ON tasks (project_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_tasks_assignee
  ON tasks (assignee_id, status);

COMMENT ON TABLE tasks IS 'Structured tasks extracted from context packages.';
COMMENT ON COLUMN tasks.assignee_id IS 'User assigned to the task when known.';
COMMENT ON COLUMN tasks.status IS 'Task status such as todo, in_progress, done, or cancelled.';
COMMENT ON COLUMN tasks.priority IS 'Optional priority label extracted from source context.';

CREATE TABLE IF NOT EXISTS risks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  package_id UUID NOT NULL REFERENCES context_packages(id),
  project_id UUID NOT NULL REFERENCES projects(id),
  title VARCHAR(500) NOT NULL,
  description TEXT,
  mitigation TEXT,
  severity VARCHAR(20),
  status VARCHAR(20) NOT NULL DEFAULT 'open',
  owner_id UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_risks_project
  ON risks (project_id, status, created_at DESC);

COMMENT ON TABLE risks IS 'Structured project risks extracted from context packages.';
COMMENT ON COLUMN risks.mitigation IS 'Suggested or agreed mitigation for the risk.';
COMMENT ON COLUMN risks.severity IS 'Risk severity label such as low, medium, high, or critical.';
COMMENT ON COLUMN risks.status IS 'Risk status such as open, monitoring, mitigated, or closed.';

CREATE TABLE IF NOT EXISTS open_questions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  package_id UUID NOT NULL REFERENCES context_packages(id),
  project_id UUID NOT NULL REFERENCES projects(id),
  question TEXT NOT NULL,
  context TEXT,
  priority VARCHAR(20),
  status VARCHAR(20) NOT NULL DEFAULT 'open',
  answered_at TIMESTAMPTZ,
  answer TEXT,
  owner_id UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_open_questions_project
  ON open_questions (project_id, status, created_at DESC);

COMMENT ON TABLE open_questions IS 'Open questions extracted from context packages.';
COMMENT ON COLUMN open_questions.context IS 'Additional context needed to understand the question.';
COMMENT ON COLUMN open_questions.answer IS 'Answer captured when the question is resolved.';
COMMENT ON COLUMN open_questions.answered_at IS 'Timestamp when the question was answered.';

CREATE TABLE IF NOT EXISTS observations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  package_id UUID NOT NULL REFERENCES context_packages(id),
  project_id UUID REFERENCES projects(id),
  type VARCHAR(50) NOT NULL,
  content TEXT NOT NULL,
  relevance VARCHAR(50),
  confidence DECIMAL(3,2),
  tags TEXT[],
  related_to_type VARCHAR(50),
  related_to_id UUID,
  owner_id UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_observations_package
  ON observations (package_id);

CREATE INDEX IF NOT EXISTS idx_observations_project
  ON observations (project_id, type, created_at DESC)
  WHERE project_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_observations_tags
  ON observations
  USING GIN (tags);

COMMENT ON TABLE observations IS 'General observations extracted from context packages. project_id may be NULL for personal observations.';
COMMENT ON COLUMN observations.project_id IS 'Optional project reference; NULL means this is a personal observation.';
COMMENT ON COLUMN observations.type IS 'Observation type, for example insight, note, constraint, or preference.';
COMMENT ON COLUMN observations.tags IS 'Searchable observation tags.';
COMMENT ON COLUMN observations.related_to_type IS 'Optional type of related entity.';
COMMENT ON COLUMN observations.related_to_id IS 'Optional identifier of related entity.';

-- Down Migration

DROP TABLE IF EXISTS observations;
DROP TABLE IF EXISTS open_questions;
DROP TABLE IF EXISTS risks;
DROP TABLE IF EXISTS tasks;
DROP TABLE IF EXISTS decisions;
