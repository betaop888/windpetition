const { getSessionUser } = require("../../../lib/server/auth");
const { sql } = require("../../../lib/server/db");
const { methodNotAllowed, sendJson } = require("../../../lib/server/http");

const handler = async function handler(req, res) {
  if (req.method !== "GET") {
    return methodNotAllowed(req, res, ["GET"]);
  }

  try {
    const user = await getSessionUser(req);
    if (!user) {
      return sendJson(res, 401, { error: "Authentication required" });
    }

    const [usersResult, proposalsResult] = await Promise.all([
      sql`SELECT COUNT(*)::INTEGER AS users_count FROM users`,
      sql`SELECT COUNT(*)::INTEGER AS proposals_count FROM proposals`,
    ]);

    sendJson(res, 200, {
      usersCount: Number(usersResult.rows[0]?.users_count || 0),
      proposalsCount: Number(proposalsResult.rows[0]?.proposals_count || 0),
    });
  } catch (error) {
    console.error("Failed to fetch public stats", error);
    sendJson(res, 500, { error: "Failed to fetch public stats" });
  }
};

module.exports = handler;
module.exports.default = handler;
