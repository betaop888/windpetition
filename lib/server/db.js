function isPostgresConnectionString(value) {
  if (typeof value !== "string") {
    return false;
  }

  const normalized = value.trim().toLowerCase();
  return normalized.startsWith("postgres://") || normalized.startsWith("postgresql://");
}

function resolvePostgresConnectionString() {
  const candidates = [
    process.env.POSTGRES_URL,
    process.env.STORAGE_URL,
    process.env.DATABASE_URL,
    process.env.POSTGRES_PRISMA_URL,
    process.env.STORAGE_PRISMA_URL,
    process.env.POSTGRES_URL_NON_POOLING,
    process.env.STORAGE_URL_NON_POOLING,
  ];

  for (const candidate of candidates) {
    if (isPostgresConnectionString(candidate)) {
      return candidate;
    }
  }

  return "";
}

if (!isPostgresConnectionString(process.env.POSTGRES_URL)) {
  const fallbackConnectionString = resolvePostgresConnectionString();
  if (fallbackConnectionString) {
    process.env.POSTGRES_URL = fallbackConnectionString;
  }
}

const { sql } = require("@vercel/postgres");

let schemaPromise;

function isSchemaInitRaceError(error) {
  if (!error || error.code !== "23505") {
    return false;
  }

  const constraint = String(error.constraint || "").toLowerCase();
  return constraint.includes("pg_type_typname_nsp_index");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function createSchemaOnce() {
  await sql`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      discord_id TEXT NOT NULL UNIQUE,
      username TEXT NOT NULL,
      avatar_url TEXT,
      role TEXT NOT NULL DEFAULT 'citizen',
      roles TEXT[] NOT NULL DEFAULT ARRAY['citizen']::TEXT[],
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT users_role_check CHECK (role IN ('citizen', 'chamber', 'minister', 'admin')),
      CONSTRAINT users_roles_check CHECK (
        cardinality(roles) >= 1
        AND 'citizen' = ANY(roles)
        AND roles <@ ARRAY['citizen', 'chamber', 'minister', 'admin']::TEXT[]
      )
    )
  `;

  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS roles TEXT[]`;

  await sql`
    UPDATE users
    SET roles = CASE role
      WHEN 'admin' THEN ARRAY['citizen', 'chamber', 'minister', 'admin']::TEXT[]
      WHEN 'minister' THEN ARRAY['citizen', 'chamber', 'minister']::TEXT[]
      WHEN 'chamber' THEN ARRAY['citizen', 'chamber']::TEXT[]
      ELSE ARRAY['citizen']::TEXT[]
    END
    WHERE roles IS NULL OR cardinality(roles) = 0
  `;

  await sql`
    UPDATE users
    SET roles = ARRAY(
      SELECT item
      FROM unnest(
        COALESCE(roles, ARRAY[]::TEXT[]) || ARRAY[role, 'citizen']::TEXT[]
      ) item
      WHERE item = ANY(ARRAY['citizen', 'chamber', 'minister', 'admin']::TEXT[])
      GROUP BY item
      ORDER BY array_position(ARRAY['citizen', 'chamber', 'minister', 'admin']::TEXT[], item)
    )
  `;

  await sql`
    UPDATE users
    SET role = CASE
      WHEN 'admin' = ANY(roles) THEN 'admin'
      WHEN 'minister' = ANY(roles) THEN 'minister'
      WHEN 'chamber' = ANY(roles) THEN 'chamber'
      ELSE 'citizen'
    END
  `;

  await sql`ALTER TABLE users ALTER COLUMN roles SET DEFAULT ARRAY['citizen']::TEXT[]`;
  await sql`ALTER TABLE users ALTER COLUMN roles SET NOT NULL`;

  await sql`ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check`;
  await sql`ALTER TABLE users DROP CONSTRAINT IF EXISTS users_roles_check`;

  await sql`
    ALTER TABLE users
    ADD CONSTRAINT users_role_check CHECK (role IN ('citizen', 'chamber', 'minister', 'admin'))
  `;
  await sql`
    ALTER TABLE users
    ADD CONSTRAINT users_roles_check CHECK (
      cardinality(roles) >= 1
      AND 'citizen' = ANY(roles)
      AND roles <@ ARRAY['citizen', 'chamber', 'minister', 'admin']::TEXT[]
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS proposals (
      id SERIAL PRIMARY KEY,
      scope TEXT NOT NULL,
      kind TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      author_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      deadline_at TIMESTAMPTZ NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT proposals_scope_check CHECK (scope IN ('public', 'minister')),
      CONSTRAINT proposals_kind_check CHECK (kind IN ('petition', 'law')),
      CONSTRAINT proposals_status_check CHECK (status IN ('open', 'sent_review', 'rejected'))
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS votes (
      id SERIAL PRIMARY KEY,
      proposal_id INTEGER NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      value TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT votes_value_check CHECK (value IN ('for', 'against', 'abstain')),
      CONSTRAINT votes_unique_vote UNIQUE (proposal_id, user_id)
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS registry_entries (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      decision TEXT NOT NULL,
      reason TEXT,
      author_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT registry_decision_check CHECK (decision IN ('accepted', 'rejected'))
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS notifications (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      href TEXT,
      is_read BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await sql`CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_proposals_scope ON proposals(scope)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_proposals_deadline ON proposals(deadline_at)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_votes_proposal_id ON votes(proposal_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_registry_created_at ON registry_entries(created_at DESC)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON notifications(user_id, created_at DESC)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON notifications(user_id, is_read)`;
}

async function createSchemaWithRetry() {
  const maxAttempts = 4;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await createSchemaOnce();
      return;
    } catch (error) {
      if (isSchemaInitRaceError(error) && attempt < maxAttempts) {
        await sleep(120 * attempt);
        continue;
      }

      throw error;
    }
  }
}

async function ensureSchema() {
  if (!schemaPromise) {
    schemaPromise = createSchemaWithRetry().catch((error) => {
      schemaPromise = undefined;
      throw error;
    });
  }

  await schemaPromise;
}

module.exports = {
  ensureSchema,
  sql,
};
