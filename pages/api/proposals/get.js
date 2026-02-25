const { getSessionUser, isAdmin, isMinister } = require("../../../lib/server/auth");
const { sql } = require("../../../lib/server/db");
const { methodNotAllowed, parseInteger, sendJson } = require("../../../lib/server/http");
const { applyVoteVisibility, mapProposalRow, settleExpiredProposals } = require("../../../lib/server/proposals");

const handler = async function handler(req, res) {
  if (req.method !== "GET") {
    return methodNotAllowed(req, res, ["GET"]);
  }

  try {
    const user = await getSessionUser(req);
    if (!user) {
      return sendJson(res, 401, { error: "Authentication required" });
    }

    const proposalId = parseInteger(req.query?.id);
    if (!Number.isInteger(proposalId) || proposalId <= 0) {
      return sendJson(res, 400, { error: "Invalid proposal id" });
    }

    await settleExpiredProposals();

    const result = await sql`
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
      WHERE p.id = ${proposalId}
      GROUP BY p.id, u.id, uv.value
      LIMIT 1
    `;

    if (result.rows.length === 0) {
      return sendJson(res, 404, { error: "Proposal not found" });
    }

    const canSeeVoters = isAdmin(user);
    const proposal = applyVoteVisibility(mapProposalRow(result.rows[0]), {
      canSeeLiveResults: canSeeVoters,
    });

    if (proposal.scope === "minister" && !isMinister(user)) {
      return sendJson(res, 403, { error: "Minister access required" });
    }

    const voters = {
      for: [],
      against: [],
      abstain: [],
    };

    if (canSeeVoters) {
      const votersResult = await sql`
        SELECT v.value, u.id, u.username, u.avatar_url
        FROM votes v
        JOIN users u ON u.id = v.user_id
        WHERE v.proposal_id = ${proposalId}
        ORDER BY v.created_at ASC
      `;

      for (const row of votersResult.rows) {
        if (!voters[row.value]) {
          continue;
        }

        voters[row.value].push({
          id: row.id,
          username: row.username,
          avatarUrl: row.avatar_url,
        });
      }
    }

    sendJson(res, 200, {
      proposal,
      canSeeVoters,
      voters,
    });
  } catch (error) {
    console.error("Failed to fetch proposal", error);
    sendJson(res, 500, { error: "Failed to fetch proposal" });
  }
};

module.exports = handler;
module.exports.default = handler;

