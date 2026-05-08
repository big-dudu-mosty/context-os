-- Enable vector search support for Context OS embeddings.
CREATE EXTENSION IF NOT EXISTS vector;

-- Enable uuid_generate_v4() for primary keys.
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
