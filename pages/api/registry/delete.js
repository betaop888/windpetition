const { getSessionUser, isAdmin } = require("../../../lib/server/auth");
const { sql } = require("../../../lib/server/db");
const { methodNotAllowed, parseInteger, readJsonBody, sendJson } = require("../../../lib/server/http");

const handler = async function handler(req, res) {
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
    const entryId = parseInteger(body?.entryId);
    if (!Number.isInteger(entryId) || entryId <= 0) {
      return sendJson(res, 400, { error: "Invalid registry entry id" });
    }

    const deletion = await sql`
      DELETE FROM registry_entries
      WHERE id = ${entryId}
      RETURNING id
    `;

    if (deletion.rows.length === 0) {
      return sendJson(res, 404, { error: "Registry entry not found" });
    }

    sendJson(res, 200, {
      success: true,
      entryId: deletion.rows[0].id,
    });
  } catch (error) {
    console.error("Failed to delete registry entry", error);
    if (error.message === "Invalid JSON payload") {
      return sendJson(res, 400, { error: "Invalid JSON payload" });
    }
    sendJson(res, 500, { error: "Failed to delete registry entry" });
  }
};

module.exports = handler;
module.exports.default = handler;
