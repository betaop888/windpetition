const { getSessionUser, isAdmin } = require("../../../lib/server/auth");
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

    if (!isAdmin(user)) {
      return sendJson(res, 403, { error: "Admin access required" });
    }

    const { rows } = await sql`
      SELECT
        id,
        username,
        avatar_url,
        role,
        created_at
      FROM users
      ORDER BY
        CASE role
          WHEN 'admin' THEN 0
          WHEN 'minister' THEN 1
          ELSE 2
        END,
        username ASC
    `;

    const users = rows.map((row) => ({
      id: row.id,
      username: row.username,
      avatarUrl: row.avatar_url,
      role: row.role,
      createdAt: row.created_at,
    }));

    sendJson(res, 200, { users });
  } catch (error) {
    console.error("Failed to fetch users", error);
    sendJson(res, 500, { error: "Failed to fetch users" });
  }
};

