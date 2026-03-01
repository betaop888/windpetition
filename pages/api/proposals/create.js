const { getSessionUser, isChamberMember, isMinister } = require("../../../lib/server/auth");
const { ensureSchema, sql } = require("../../../lib/server/db");
const { methodNotAllowed, readJsonBody, sendJson } = require("../../../lib/server/http");
const { createNotificationsForUsers, findUserIdsByRoles } = require("../../../lib/server/notifications");

const PUBLIC_PROPOSAL_LIMIT = 2;
const PUBLIC_PROPOSAL_LIMIT_WINDOW = "24 часа";

function normalizeText(value) {
  return String(value || "")
    .replace(/\r\n?/g, "\n")
    .trim();
}

function normalizeSingleLineText(value) {
  return normalizeText(value).replace(/\s+/g, " ");
}

function normalizeMultilineText(value) {
  const text = normalizeText(value);
  if (!text) {
    return "";
  }

  const lines = text.split("\n").map((line) => line.replace(/[ \t]+$/g, ""));
  const normalizedLines = [];
  let consecutiveEmptyLines = 0;

  for (const line of lines) {
    if (!line.trim()) {
      if (consecutiveEmptyLines >= 1) {
        continue;
      }
      normalizedLines.push("");
      consecutiveEmptyLines += 1;
      continue;
    }

    consecutiveEmptyLines = 0;
    normalizedLines.push(line);
  }

  return normalizedLines.join("\n");
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
    const title = normalizeSingleLineText(body.title);
    const description = normalizeMultilineText(body.description);
    const deadlineAtRaw = normalizeText(body.deadlineAt);

    if (!title || title.length < 4 || title.length > 160) {
      return sendJson(res, 400, { error: "Заголовок должен быть от 4 до 160 символов" });
    }

    if (!description || description.length < 10 || description.length > 5000) {
      return sendJson(res, 400, { error: "Описание должно быть от 10 до 5000 символов" });
    }

    const deadline = new Date(deadlineAtRaw);
    if (Number.isNaN(deadline.getTime())) {
      return sendJson(res, 400, { error: "Некорректная дата дедлайна" });
    }

    if (deadline <= new Date()) {
      return sendJson(res, 400, { error: "Дедлайн должен быть в будущем" });
    }

    if (scope === "minister" && !isMinister(user)) {
      return sendJson(res, 403, { error: "Для этого раздела нужны права министра" });
    }

    if (scope === "public" && kind === "law" && !isChamberMember(user)) {
      return sendJson(res, 403, {
        error: "Законопроекты в публичном разделе может создавать только член палаты или выше",
      });
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

    const proposalId = insertResult.rows[0].id;
    const targetIds = await findUserIdsByRoles(["admin", "minister"]);
    await createNotificationsForUsers(targetIds, {
      type: "proposal_created",
      title: "Создано новое голосование",
      message: `${user.username} создал(а) ${kind === "law" ? "законопроект" : "петицию"}: ${title}`,
      href: `/petition-detail?id=${proposalId}`,
    });

    sendJson(res, 201, {
      success: true,
      proposalId,
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
