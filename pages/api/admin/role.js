const { getSessionUser, isAdmin } = require("../../../lib/server/auth");
const { sql } = require("../../../lib/server/db");
const { methodNotAllowed, parseInteger, readJsonBody, sendJson } = require("../../../lib/server/http");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return methodNotAllowed(req, res, ["POST"]);
  }

  try {
    const user = await getSessionUser(req);
    if (!user) {
      return sendJson(res, 401, { error: "Authentication required" });
    }

    if (!isAdmin(user)) {
      return sendJson(res, 403, { error: "Admin access required" });
    }

    const body = await readJsonBody(req);
    const userId = parseInteger(body.userId);
    const targetRole = String(body.role || "").trim();

    if (!Number.isInteger(userId) || userId <= 0) {
      return sendJson(res, 400, { error: "Invalid user id" });
    }

    if (!["citizen", "minister"].includes(targetRole)) {
      return sendJson(res, 400, { error: "Role must be citizen or minister" });
    }

    const targetResult = await sql`
      SELECT id, username
      FROM users
      WHERE id = ${userId}
      LIMIT 1
    `;

    if (targetResult.rows.length === 0) {
      return sendJson(res, 404, { error: "User not found" });
    }

    const targetUser = targetResult.rows[0];
    const roleToSave = targetUser.username.toLowerCase() === "nertin0" ? "admin" : targetRole;

    const updateResult = await sql`
      UPDATE users
      SET role = ${roleToSave},
          updated_at = NOW()
      WHERE id = ${userId}
      RETURNING id, username, avatar_url, role, created_at
    `;

    const updated = updateResult.rows[0];

    sendJson(res, 200, {
      success: true,
      user: {
        id: updated.id,
        username: updated.username,
        avatarUrl: updated.avatar_url,
        role: updated.role,
        createdAt: updated.created_at,
      },
    });
  } catch (error) {
    console.error("Failed to update role", error);
    if (error.message === "Invalid JSON payload") {
      return sendJson(res, 400, { error: "Invalid JSON payload" });
    }
    sendJson(res, 500, { error: "Failed to update role" });
  }
};

