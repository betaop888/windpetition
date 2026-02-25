const { getSessionUser, isMinister } = require("../../../lib/server/auth");
const { sql } = require("../../../lib/server/db");
const { methodNotAllowed, parseInteger, readJsonBody, sendJson } = require("../../../lib/server/http");
const { settleExpiredProposals } = require("../../../lib/server/proposals");

const ALLOWED_VOTES = new Set(["for", "against", "abstain"]);

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return methodNotAllowed(req, res, ["POST"]);
  }

  try {
    const user = await getSessionUser(req);
    if (!user) {
      return sendJson(res, 401, { error: "Authentication required" });
    }

    const body = await readJsonBody(req);
    const proposalId = parseInteger(body.proposalId);
    const voteValue = String(body.value || "").trim();

    if (!Number.isInteger(proposalId) || proposalId <= 0) {
      return sendJson(res, 400, { error: "Invalid proposal id" });
    }

    if (!ALLOWED_VOTES.has(voteValue)) {
      return sendJson(res, 400, { error: "Invalid vote value" });
    }

    await settleExpiredProposals();

    const proposalResult = await sql`
      SELECT id, scope, status, deadline_at
      FROM proposals
      WHERE id = ${proposalId}
      LIMIT 1
    `;

    if (proposalResult.rows.length === 0) {
      return sendJson(res, 404, { error: "Proposal not found" });
    }

    const proposal = proposalResult.rows[0];

    if (proposal.scope === "minister" && !isMinister(user)) {
      return sendJson(res, 403, { error: "Minister access required" });
    }

    const isClosed = proposal.status !== "open" || new Date(proposal.deadline_at) <= new Date();
    if (isClosed) {
      return sendJson(res, 409, { error: "Voting is already closed" });
    }

    const existingVote = await sql`
      SELECT id
      FROM votes
      WHERE proposal_id = ${proposalId}
        AND user_id = ${user.id}
      LIMIT 1
    `;

    if (existingVote.rows.length > 0) {
      return sendJson(res, 409, { error: "You have already voted" });
    }

    await sql`
      INSERT INTO votes (proposal_id, user_id, value)
      VALUES (${proposalId}, ${user.id}, ${voteValue})
    `;

    const totalsResult = await sql`
      SELECT
        COALESCE(SUM(CASE WHEN value = 'for' THEN 1 ELSE 0 END), 0)::INTEGER AS for_votes,
        COALESCE(SUM(CASE WHEN value = 'against' THEN 1 ELSE 0 END), 0)::INTEGER AS against_votes,
        COALESCE(SUM(CASE WHEN value = 'abstain' THEN 1 ELSE 0 END), 0)::INTEGER AS abstain_votes,
        COUNT(*)::INTEGER AS total_votes
      FROM votes
      WHERE proposal_id = ${proposalId}
    `;

    sendJson(res, 200, {
      success: true,
      votes: {
        for: totalsResult.rows[0].for_votes,
        against: totalsResult.rows[0].against_votes,
        abstain: totalsResult.rows[0].abstain_votes,
        total: totalsResult.rows[0].total_votes,
      },
    });
  } catch (error) {
    console.error("Failed to vote", error);
    if (error.message === "Invalid JSON payload") {
      return sendJson(res, 400, { error: "Invalid JSON payload" });
    }
    sendJson(res, 500, { error: "Failed to submit vote" });
  }
};

