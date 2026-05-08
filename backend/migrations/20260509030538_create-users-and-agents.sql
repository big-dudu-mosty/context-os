-- Migration: create users and agents tables
-- Scope: Context OS P0 identity foundation

-- Up Migration

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(100) NOT NULL,
  email VARCHAR(200) NOT NULL UNIQUE,
  role VARCHAR(50) NOT NULL DEFAULT 'member',
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_active
  ON users (email)
  WHERE deleted_at IS NULL;

COMMENT ON TABLE users IS 'Context OS users. Rows are soft-deleted via deleted_at.';
COMMENT ON COLUMN users.id IS 'Stable user identifier.';
COMMENT ON COLUMN users.email IS 'Unique user email address.';
COMMENT ON COLUMN users.role IS 'System role, such as member, admin, or owner.';
COMMENT ON COLUMN users.deleted_at IS 'Soft delete timestamp. NULL means the user is active.';

CREATE TABLE IF NOT EXISTS agents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_id UUID NOT NULL,
  name VARCHAR(100) NOT NULL,
  type VARCHAR(50) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  last_active_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_agents_owner
    FOREIGN KEY (owner_id)
    REFERENCES users(id)
    ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_agents_owner
  ON agents (owner_id, status);

CREATE INDEX IF NOT EXISTS idx_agents_active
  ON agents (status, last_active_at DESC)
  WHERE status = 'active';

COMMENT ON TABLE agents IS 'AI agents owned by Context OS users.';
COMMENT ON COLUMN agents.owner_id IS 'Owner user. ON DELETE RESTRICT preserves agent history.';
COMMENT ON COLUMN agents.type IS 'Agent runtime type, for example claude-code-cli or codex-cli.';
COMMENT ON COLUMN agents.status IS 'Current agent status.';
COMMENT ON COLUMN agents.last_active_at IS 'Most recent observed activity timestamp.';

-- Down Migration

DROP TABLE IF EXISTS agents;
DROP TABLE IF EXISTS users;
