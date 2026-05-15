-- Migration: add workbench action support
-- Scope: Handoff inbox metadata and Dream review approval queue

-- Up Migration

ALTER TABLE handoff_records
  ADD COLUMN IF NOT EXISTS title TEXT,
  ADD COLUMN IF NOT EXISTS related_document_id UUID REFERENCES archived_documents(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS package_id UUID REFERENCES context_packages(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_handoff_document
  ON handoff_records (related_document_id)
  WHERE related_document_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_handoff_package
  ON handoff_records (package_id)
  WHERE package_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS dream_review_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  package_id UUID REFERENCES context_packages(id) ON DELETE SET NULL,
  source_type TEXT NOT NULL CHECK (
    source_type IN (
      'decision',
      'task',
      'risk',
      'open_question',
      'observation',
      'artifact',
      'handoff'
    )
  ),
  source_id UUID,
  title TEXT NOT NULL,
  summary TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'approved', 'rejected', 'edited')
  ),
  confidence NUMERIC(3,2),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_dream_review_owner
  ON dream_review_items (owner_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_dream_review_project
  ON dream_review_items (project_id, status, created_at DESC)
  WHERE project_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_dream_review_source
  ON dream_review_items (owner_id, source_type, source_id)
  WHERE source_id IS NOT NULL;

-- Down Migration

DROP TABLE IF EXISTS dream_review_items;

DROP INDEX IF EXISTS idx_handoff_package;
DROP INDEX IF EXISTS idx_handoff_document;

ALTER TABLE handoff_records
  DROP COLUMN IF EXISTS package_id,
  DROP COLUMN IF EXISTS related_document_id,
  DROP COLUMN IF EXISTS title;
