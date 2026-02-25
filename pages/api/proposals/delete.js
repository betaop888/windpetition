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
    const proposalId = parseInteger(body?.proposalId);
    if (!Number.isInteger(proposalId) || proposalId <= 0) {
      return sendJson(res, 400, { error: "Invalid proposal id" });
    }

    const deletion = await sql`
      DELETE FROM proposals
      WHERE id = ${proposalId}
      RETURNING id
    `;

    if (deletion.rows.length === 0) {
      return sendJson(res, 404, { error: "Proposal not found" });
    }

    sendJson(res, 200, {
      success: true,
      proposalId: deletion.rows[0].id,
    });
  } catch (error) {
    console.error("Failed to delete proposal", error);
    if (error.message === "Invalid JSON payload") {
      return sendJson(res, 400, { error: "Invalid JSON payload" });
    }
    sendJson(res, 500, { error: "Failed to delete proposal" });
  }
};

module.exports = handler;
module.exports.default = handler;
