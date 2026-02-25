const { getSessionUser, isMinister } = require("../../../lib/server/auth");
const { sql } = require("../../../lib/server/db");
const { methodNotAllowed, sendJson } = require("../../../lib/server/http");
const { mapProposalRow, settleExpiredProposals } = require("../../../lib/server/proposals");

const handler = async function handler(req, res) {
  if (req.method !== "GET") {
    return methodNotAllowed(req, res, ["GET"]);
  }

  try {
    const user = await getSessionUser(req);
    if (!user) {
      return sendJson(res, 401, { error: "Authentication required" });
    }

    const scope = req.query?.scope === "minister" ? "minister" : "public";

    if (scope === "minister" && !isMinister(user)) {
      return sendJson(res, 403, { error: "Minister access required" });
    }

    await settleExpiredProposals();

    const { rows } = await sql`
      SELECT
        p.id,
        p.scope,
        p.kind,
        p.title,
        p.description,
        p.status,
        p.deadline_at,
        p.created_at,
        p.updated_at,
        p.author_id,
        u.username AS author_name,
        u.avatar_url AS author_avatar,
        u.role AS author_role,
        COALESCE(SUM(CASE WHEN v.value = 'for' THEN 1 ELSE 0 END), 0)::INTEGER AS for_votes,
        COALESCE(SUM(CASE WHEN v.value = 'against' THEN 1 ELSE 0 END), 0)::INTEGER AS against_votes,
        COALESCE(SUM(CASE WHEN v.value = 'abstain' THEN 1 ELSE 0 END), 0)::INTEGER AS abstain_votes,
        COUNT(v.id)::INTEGER AS total_votes,
        uv.value AS my_vote
      FROM proposals p
      JOIN users u ON u.id = p.author_id
      LEFT JOIN votes v ON v.proposal_id = p.id
      LEFT JOIN votes uv ON uv.proposal_id = p.id AND uv.user_id = ${user.id}
      WHERE p.scope = ${scope}
      GROUP BY p.id, u.id, uv.value
      ORDER BY p.created_at DESC
    `;

    const proposals = rows.map(mapProposalRow);

    sendJson(res, 200, {
      proposals,
      scope,
    });
  } catch (error) {
    console.error("Failed to fetch proposals", error);
    sendJson(res, 500, { error: "Failed to fetch proposals" });
  }
};

module.exports = handler;
module.exports.default = handler;

