const { getSessionUser } = require("../../../lib/server/auth");
const { sql } = require("../../../lib/server/db");
const { methodNotAllowed, sendJson } = require("../../../lib/server/http");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    return methodNotAllowed(req, res, ["GET"]);
  }

  try {
    const user = await getSessionUser(req);
    if (!user) {
      return sendJson(res, 401, { error: "Authentication required" });
    }

    const { rows } = await sql`
      SELECT
        r.id,
        r.title,
        r.body,
        r.decision,
        r.reason,
        r.created_at,
        r.author_id,
        u.username AS author_name,
        u.avatar_url AS author_avatar,
        u.role AS author_role
      FROM registry_entries r
      JOIN users u ON u.id = r.author_id
      ORDER BY r.created_at DESC
    `;

    const entries = rows.map((row) => ({
      id: row.id,
      title: row.title,
      body: row.body,
      decision: row.decision,
      reason: row.reason,
      createdAt: row.created_at,
      author: {
        id: row.author_id,
        username: row.author_name,
        avatarUrl: row.author_avatar,
        role: row.author_role,
      },
    }));

    sendJson(res, 200, { entries });
  } catch (error) {
    console.error("Failed to fetch registry entries", error);
    sendJson(res, 500, { error: "Failed to fetch registry entries" });
  }
};

