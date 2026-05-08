-- Migration: create projection, collaboration, and retrieval layer tables
-- Scope: Context OS P0 project contexts, handoffs, briefings, chunks, and embeddings

-- Up Migration

CREATE TABLE IF NOT EXISTS project_contexts (
  project_id UUID PRIMARY KEY REFERENCES projects(id),
  current_summary TEXT,
  current_direction TEXT,
  current_progress JSONB,
  active_decisions JSONB,
  active_tasks JSONB,
  open_questions JSONB,
  risks JSONB,
  reducer_version VARCHAR(20) NOT NULL DEFAULT 'v1',
  source_project_event_seq_watermark BIGINT NOT NULL DEFAULT 0,
  last_reduced_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE project_contexts IS 'Rebuildable projection of current project context.';
COMMENT ON COLUMN project_contexts.reducer_version IS 'Reducer version used to build this projection.';
COMMENT ON COLUMN project_contexts.source_project_event_seq_watermark IS 'Highest project_event_seq included in this projection.';
COMMENT ON COLUMN project_contexts.last_reduced_at IS 'Timestamp of the last reducer run.';

CREATE TABLE IF NOT EXISTS handoff_records (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  from_owner_id UUID NOT NULL REFERENCES users(id),
  to_owner_id UUID NOT NULL REFERENCES users(id),
  session_id UUID NOT NULL REFERENCES sessions(id),
  message TEXT NOT NULL,
  context_summary TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_handoff_to
  ON handoff_records (to_owner_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_handoff_from
  ON handoff_records (from_owner_id, created_at DESC);

COMMENT ON TABLE handoff_records IS 'Context handoff messages between users.';
COMMENT ON COLUMN handoff_records.from_owner_id IS 'User handing off context.';
COMMENT ON COLUMN handoff_records.to_owner_id IS 'User receiving context.';
COMMENT ON COLUMN handoff_records.session_id IS 'Session that provides the handoff context.';
COMMENT ON COLUMN handoff_records.status IS 'Handoff status such as pending, accepted, or dismissed.';

CREATE TABLE IF NOT EXISTS briefings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_id UUID NOT NULL REFERENCES users(id),
  date DATE NOT NULL,
  content TEXT NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  viewed_at TIMESTAMPTZ,
  CONSTRAINT uq_briefings_owner_date UNIQUE (owner_id, date)
);

CREATE INDEX IF NOT EXISTS idx_briefings_owner
  ON briefings (owner_id, date DESC);

COMMENT ON TABLE briefings IS 'Generated daily briefings for users.';
COMMENT ON COLUMN briefings.date IS 'Briefing date in the product calendar.';
COMMENT ON COLUMN briefings.viewed_at IS 'Timestamp when the user viewed the briefing.';

CREATE TABLE IF NOT EXISTS context_index_chunks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  package_id UUID NOT NULL REFERENCES context_packages(id),
  project_id UUID REFERENCES projects(id),
  chunk_type VARCHAR(50) NOT NULL,
  source_field VARCHAR(100) NOT NULL,
  entity_id UUID,
  entity_status VARCHAR(20),
  chunk_content TEXT NOT NULL,
  chunk_content_hash VARCHAR(64) NOT NULL,
  owner_id UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chunks_package
  ON context_index_chunks (package_id);

CREATE INDEX IF NOT EXISTS idx_chunks_project
  ON context_index_chunks (project_id, chunk_type, entity_status)
  WHERE project_id IS NOT NULL;

COMMENT ON TABLE context_index_chunks IS 'Field-level chunks used for full text and vector retrieval.';
COMMENT ON COLUMN context_index_chunks.chunk_type IS 'Chunk type, for example summary, decision, task, risk, open_question, or observation.';
COMMENT ON COLUMN context_index_chunks.source_field IS 'Source YAML or extraction field used to produce this chunk.';
COMMENT ON COLUMN context_index_chunks.entity_id IS 'Optional extracted entity identifier represented by this chunk.';
COMMENT ON COLUMN context_index_chunks.entity_status IS 'Entity status snapshot used for retrieval filtering and labeling.';
COMMENT ON COLUMN context_index_chunks.chunk_content_hash IS 'Hash used to deduplicate embedding results.';

CREATE TABLE IF NOT EXISTS embedding_jobs (
  id BIGSERIAL PRIMARY KEY,
  chunk_id UUID NOT NULL REFERENCES context_index_chunks(id),
  chunk_content_hash VARCHAR(64) NOT NULL,
  chunk_content TEXT NOT NULL,
  embedding_model VARCHAR(50) NOT NULL DEFAULT 'text-embedding-3-small',
  embedding_version VARCHAR(20) NOT NULL DEFAULT 'v1',
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  attempts INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 3,
  error_message TEXT,
  locked_at TIMESTAMPTZ,
  locked_by VARCHAR(100),
  next_run_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  CONSTRAINT uq_chunk_embedding UNIQUE (chunk_id, embedding_model, embedding_version),
  CONSTRAINT chk_embedding_jobs_attempts_nonnegative
    CHECK (attempts >= 0 AND max_attempts >= 0),
  CONSTRAINT chk_embedding_jobs_attempts_within_max
    CHECK (attempts <= max_attempts)
);

CREATE INDEX IF NOT EXISTS idx_embedding_jobs_pending
  ON embedding_jobs (status, next_run_at)
  WHERE status = 'pending';

COMMENT ON TABLE embedding_jobs IS 'PostgreSQL-backed embedding job queue.';
COMMENT ON COLUMN embedding_jobs.chunk_id IS 'Context index chunk that needs an embedding.';
COMMENT ON COLUMN embedding_jobs.locked_at IS 'Worker lock timestamp for FOR UPDATE SKIP LOCKED style processing.';
COMMENT ON COLUMN embedding_jobs.locked_by IS 'Worker identifier currently processing this job.';
COMMENT ON COLUMN embedding_jobs.next_run_at IS 'Earliest timestamp when this job should be retried or processed.';

CREATE TABLE IF NOT EXISTS embedding_results (
  id BIGSERIAL PRIMARY KEY,
  chunk_content_hash VARCHAR(64) NOT NULL,
  embedding_model VARCHAR(50) NOT NULL,
  embedding_version VARCHAR(20) NOT NULL,
  embedding VECTOR(1536) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_embedding_cache UNIQUE (chunk_content_hash, embedding_model, embedding_version)
);

CREATE INDEX IF NOT EXISTS idx_embedding_vector
  ON embedding_results
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

COMMENT ON TABLE embedding_results IS 'Deduplicated embedding cache keyed by chunk content hash, model, and version.';
COMMENT ON COLUMN embedding_results.embedding IS '1536-dimensional embedding for text-embedding-3-small.';

-- Down Migration

DROP TABLE IF EXISTS embedding_results;
DROP TABLE IF EXISTS embedding_jobs;
DROP TABLE IF EXISTS context_index_chunks;
DROP TABLE IF EXISTS briefings;
DROP TABLE IF EXISTS handoff_records;
DROP TABLE IF EXISTS project_contexts;
