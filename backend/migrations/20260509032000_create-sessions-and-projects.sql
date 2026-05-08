-- Migration: create projects, project_members, and sessions tables
-- Scope: Context OS P0 project/session foundation

-- Up Migration

CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  lock_id BIGSERIAL UNIQUE,
  slug VARCHAR(100) NOT NULL UNIQUE,
  name VARCHAR(200) NOT NULL,
  description TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_projects_slug
  ON projects (slug);

CREATE INDEX IF NOT EXISTS idx_projects_status
  ON projects (status, created_at DESC);

COMMENT ON TABLE projects IS 'Context OS project workspaces.';
COMMENT ON COLUMN projects.lock_id IS 'Stable numeric lock key for project-scoped advisory locking.';
COMMENT ON COLUMN projects.slug IS 'Unique project slug used by CLI commands.';
COMMENT ON COLUMN projects.created_by IS 'User that created the project.';

CREATE TABLE IF NOT EXISTS project_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(50) NOT NULL DEFAULT 'member',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_project_members_project_user UNIQUE (project_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_project_members_user
  ON project_members (user_id, project_id);

COMMENT ON TABLE project_members IS 'Project membership and role assignments.';
COMMENT ON COLUMN project_members.role IS 'Project role, such as owner, admin, member, or viewer.';

ALTER TABLE agents
  ADD CONSTRAINT uq_agents_id_owner UNIQUE (id, owner_id);

CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agent_id UUID NOT NULL,
  owner_id UUID NOT NULL REFERENCES users(id),
  project_id UUID REFERENCES projects(id),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  transcript_path VARCHAR(500),
  transcript_hash VARCHAR(64),
  dream_status VARCHAR(20) NOT NULL DEFAULT 'pending',
  dream_attempts INT NOT NULL DEFAULT 0,
  dream_max_attempts INT NOT NULL DEFAULT 3,
  dreamed_at TIMESTAMPTZ,
  CONSTRAINT fk_sessions_agent
    FOREIGN KEY (agent_id)
    REFERENCES agents(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_sessions_agent_owner_match
    FOREIGN KEY (agent_id, owner_id)
    REFERENCES agents(id, owner_id)
    ON DELETE CASCADE,
  CONSTRAINT chk_sessions_dream_attempts_nonnegative
    CHECK (dream_attempts >= 0 AND dream_max_attempts >= 0),
  CONSTRAINT chk_sessions_dream_attempts_within_max
    CHECK (dream_attempts <= dream_max_attempts)
);

CREATE INDEX IF NOT EXISTS idx_sessions_agent
  ON sessions (agent_id, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_sessions_dream
  ON sessions (dream_status, started_at)
  WHERE dream_status = 'pending';

COMMENT ON TABLE sessions IS 'Agent work sessions that can later be dreamed into context packages.';
COMMENT ON COLUMN sessions.agent_id IS 'Agent that produced this session. Deleted agents cascade to sessions.';
COMMENT ON COLUMN sessions.owner_id IS 'Session owner; enforced to match the referenced agent owner.';
COMMENT ON CONSTRAINT fk_sessions_agent_owner_match ON sessions IS 'Enforces sessions.owner_id = agents.owner_id without an invalid subquery CHECK.';
COMMENT ON COLUMN sessions.dream_status IS 'Dream processing state for session summarization.';
COMMENT ON COLUMN sessions.dream_attempts IS 'Number of dream processing attempts already made.';
COMMENT ON COLUMN sessions.dream_max_attempts IS 'Maximum dream processing attempts before manual intervention.';

-- Down Migration

DROP TABLE IF EXISTS sessions;
ALTER TABLE agents DROP CONSTRAINT IF EXISTS uq_agents_id_owner;
DROP TABLE IF EXISTS project_members;
DROP TABLE IF EXISTS projects;
