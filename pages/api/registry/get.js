const { getSessionUser } = require("../../../lib/server/auth");
const { sql } = require("../../../lib/server/db");
const { methodNotAllowed, parseInteger, sendJson } = require("../../../lib/server/http");

const handler = async function handler(req, res) {
  if (req.method !== "GET") {
    return methodNotAllowed(req, res, ["GET"]);
  }

  try {
    const user = await getSessionUser(req);
    if (!user) {
      return sendJson(res, 401, { error: "Authentication required" });
    }

    const entryId = parseInteger(req.query?.id);
    if (!Number.isInteger(entryId) || entryId <= 0) {
      return sendJson(res, 400, { error: "Invalid registry entry id" });
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
      WHERE r.id = ${entryId}
      LIMIT 1
    `;

    if (rows.length === 0) {
      return sendJson(res, 404, { error: "Registry entry not found" });
    }

    const row = rows[0];
    const entry = {
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
    };

    sendJson(res, 200, {
      entry,
      canDelete: user.role === "admin",
    });
  } catch (error) {
    console.error("Failed to fetch registry entry", error);
    sendJson(res, 500, { error: "Failed to fetch registry entry" });
  }
};

module.exports = handler;
module.exports.default = handler;
