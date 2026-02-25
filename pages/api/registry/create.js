const { getSessionUser, isAdmin, isMinister } = require("../../../lib/server/auth");
const { sql } = require("../../../lib/server/db");
const { methodNotAllowed, readJsonBody, sendJson } = require("../../../lib/server/http");

function normalizeText(value) {
  return String(value || "").trim();
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return methodNotAllowed(req, res, ["POST"]);
  }

  try {
    const user = await getSessionUser(req);
    if (!user) {
      return sendJson(res, 401, { error: "Authentication required" });
    }

    if (!isAdmin(user) && !isMinister(user)) {
      return sendJson(res, 403, { error: "Only admin or minister can create registry entries" });
    }

    const body = await readJsonBody(req);

    const title = normalizeText(body.title);
    const text = normalizeText(body.body);
    const decision = body.decision === "accepted" ? "accepted" : body.decision === "rejected" ? "rejected" : null;
    const reason = normalizeText(body.reason);

    if (!title || title.length < 4 || title.length > 160) {
      return sendJson(res, 400, { error: "Title must be 4-160 characters" });
    }

    if (!text || text.length < 10 || text.length > 5000) {
      return sendJson(res, 400, { error: "Description must be 10-5000 characters" });
    }

    if (!decision) {
      return sendJson(res, 400, { error: "Invalid decision" });
    }

    const insertResult = await sql`
      INSERT INTO registry_entries (title, body, decision, reason, author_id)
      VALUES (${title}, ${text}, ${decision}, ${reason || null}, ${user.id})
      RETURNING id
    `;

    sendJson(res, 201, {
      success: true,
      entryId: insertResult.rows[0].id,
    });
  } catch (error) {
    console.error("Failed to create registry entry", error);
    if (error.message === "Invalid JSON payload") {
      return sendJson(res, 400, { error: "Invalid JSON payload" });
    }
    sendJson(res, 500, { error: "Failed to create registry entry" });
  }
};

