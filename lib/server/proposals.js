const { ensureSchema, sql } = require("./db");

function proposalPublicId(id) {
  const numeric = Number.parseInt(String(id), 10);
  if (!Number.isInteger(numeric) || numeric <= 0) {
    return "0000";
  }

  return String(numeric).padStart(4, "0");
}

function hiddenVotes() {
  return {
    for: null,
    against: null,
    abstain: null,
    total: null,
  };
}

function mapProposalRow(row) {
  const forVotes = Number(row.for_votes || 0);
  const againstVotes = Number(row.against_votes || 0);
  const abstainVotes = Number(row.abstain_votes || 0);
  const totalVotes = Number(row.total_votes || 0);

  return {
    id: row.id,
    publicId: proposalPublicId(row.id),
    scope: row.scope,
    kind: row.kind,
    title: row.title,
    description: row.description,
    status: row.status,
    deadlineAt: row.deadline_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    author: {
      id: row.author_id,
      username: row.author_name,
      avatarUrl: row.author_avatar,
      role: row.author_role,
    },
    votes: {
      for: forVotes,
      against: againstVotes,
      abstain: abstainVotes,
      total: totalVotes,
    },
    voteTotalsHidden: false,
    myVote: row.my_vote || null,
  };
}

function isProposalOpen(proposal) {
  if (!proposal || proposal.status !== "open") {
    return false;
  }

  const deadline = new Date(proposal.deadlineAt);
  if (Number.isNaN(deadline.getTime())) {
    return false;
  }

  return deadline > new Date();
}

function applyVoteVisibility(proposal, options = {}) {
  const canSeeLiveResults = Boolean(options.canSeeLiveResults);
  if (canSeeLiveResults || !isProposalOpen(proposal)) {
    return {
      ...proposal,
      voteTotalsHidden: false,
    };
  }

  return {
    ...proposal,
    votes: hiddenVotes(),
    voteTotalsHidden: true,
  };
}

async function settleExpiredProposals() {
  await ensureSchema();

  await sql`
    WITH tallies AS (
      SELECT
        p.id,
        COALESCE(SUM(CASE WHEN v.value = 'for' THEN 1 ELSE 0 END), 0)::INTEGER AS for_votes,
        COUNT(v.id)::INTEGER AS total_votes
      FROM proposals p
      LEFT JOIN votes v ON v.proposal_id = p.id
      WHERE p.status = 'open'
        AND p.deadline_at <= NOW()
      GROUP BY p.id
    )
    UPDATE proposals p
    SET
      status = CASE
        WHEN t.total_votes > 0
          AND (t.for_votes::DECIMAL / NULLIF(t.total_votes, 0)) * 100 > 50
          THEN 'sent_review'
        ELSE 'rejected'
      END,
      updated_at = NOW()
    FROM tallies t
    WHERE p.id = t.id
      AND p.status = 'open'
  `;
}

module.exports = {
  applyVoteVisibility,
  isProposalOpen,
  mapProposalRow,
  settleExpiredProposals,
};
