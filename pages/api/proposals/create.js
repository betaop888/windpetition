const { getSessionUser, isMinister } = require("../../../lib/server/auth");
const { ensureSchema, sql } = require("../../../lib/server/db");
const { methodNotAllowed, readJsonBody, sendJson } = require("../../../lib/server/http");

const PUBLIC_PROPOSAL_LIMIT = 2;
const PUBLIC_PROPOSAL_LIMIT_WINDOW = "24 hours";

function normalizeText(value) {
  return String(value || "").trim();
}

const handler = async function handler(req, res) {
  if (req.method !== "POST") {
    return methodNotAllowed(req, res, ["POST"]);
  }

  try {
    const user = await getSessionUser(req);
    if (!user) {
      return sendJson(res, 401, { error: "Authentication required" });
    }

    const body = await readJsonBody(req);

    const scope = body.scope === "minister" ? "minister" : "public";
    const kind = body.kind === "law" ? "law" : "petition";
    const title = normalizeText(body.title);
    const description = normalizeText(body.description);
    const deadlineAtRaw = normalizeText(body.deadlineAt);

    if (!title || title.length < 4 || title.length > 160) {
      return sendJson(res, 400, { error: "Title must be 4-160 characters" });
    }

    if (!description || description.length < 10 || description.length > 5000) {
      return sendJson(res, 400, { error: "Description must be 10-5000 characters" });
    }

    const deadline = new Date(deadlineAtRaw);
    if (Number.isNaN(deadline.getTime())) {
      return sendJson(res, 400, { error: "Invalid deadline date" });
    }

    if (deadline <= new Date()) {
      return sendJson(res, 400, { error: "Deadline must be in the future" });
    }

    if (scope === "minister" && !isMinister(user)) {
      return sendJson(res, 403, { error: "Only ministers can create minister proposals" });
    }

    await ensureSchema();

    if (scope === "public") {
      const limitResult = await sql`
        SELECT COUNT(*)::INTEGER AS created_count
        FROM proposals
        WHERE scope = 'public'
          AND author_id = ${user.id}
          AND created_at >= NOW() - INTERVAL '24 hours'
      `;

      const createdCount = Number(limitResult.rows[0]?.created_count || 0);
      if (createdCount >= PUBLIC_PROPOSAL_LIMIT) {
        return sendJson(res, 429, {
          error: `Можно создать не более ${PUBLIC_PROPOSAL_LIMIT} публичных голосований за ${PUBLIC_PROPOSAL_LIMIT_WINDOW}.`,
        });
      }
    }

    const insertResult = await sql`
      INSERT INTO proposals (
        scope,
        kind,
        title,
        description,
        author_id,
        deadline_at
      )
      VALUES (
        ${scope},
        ${kind},
        ${title},
        ${description},
        ${user.id},
        ${deadline.toISOString()}
      )
      RETURNING id
    `;

    sendJson(res, 201, {
      success: true,
      proposalId: insertResult.rows[0].id,
    });
  } catch (error) {
    console.error("Failed to create proposal", error);
    if (error.message === "Invalid JSON payload") {
      return sendJson(res, 400, { error: "Invalid JSON payload" });
    }
    sendJson(res, 500, { error: "Failed to create proposal" });
  }
};

module.exports = handler;
module.exports.default = handler;

