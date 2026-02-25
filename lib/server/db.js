const { sql } = require("@vercel/postgres");

let schemaPromise;

async function ensureSchema() {
  if (!schemaPromise) {
    schemaPromise = (async () => {
      await sql`
        CREATE TABLE IF NOT EXISTS users (
          id SERIAL PRIMARY KEY,
          discord_id TEXT NOT NULL UNIQUE,
          username TEXT NOT NULL,
          avatar_url TEXT,
          role TEXT NOT NULL DEFAULT 'citizen',
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          CONSTRAINT users_role_check CHECK (role IN ('citizen', 'minister', 'admin'))
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

      await sql`CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id)`;
      await sql`CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at)`;
      await sql`CREATE INDEX IF NOT EXISTS idx_proposals_scope ON proposals(scope)`;
      await sql`CREATE INDEX IF NOT EXISTS idx_proposals_deadline ON proposals(deadline_at)`;
      await sql`CREATE INDEX IF NOT EXISTS idx_votes_proposal_id ON votes(proposal_id)`;
      await sql`CREATE INDEX IF NOT EXISTS idx_registry_created_at ON registry_entries(created_at DESC)`;
    })().catch((error) => {
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
