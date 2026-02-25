const { ensureSchema, sql } = require("./db");

function mapNotificationRow(row) {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    message: row.message,
    href: row.href || null,
    isRead: Boolean(row.is_read),
    createdAt: row.created_at,
  };
}

function sanitizeUserIds(userIds) {
  return [...new Set((userIds || []).filter((value) => Number.isInteger(value) && value > 0))];
}

async function findUserIdsByRoles(roles) {
  const roleList = Array.from(new Set((roles || []).map((value) => String(value || "").trim()).filter(Boolean)));
  if (roleList.length === 0) {
    return [];
  }

  await ensureSchema();

  const { rows } = await sql`
    SELECT id
    FROM users
    WHERE role = ANY(${roleList})
  `;

  return rows.map((row) => row.id).filter((id) => Number.isInteger(id) && id > 0);
}

async function createNotificationsForUsers(userIds, payload) {
  const targets = sanitizeUserIds(userIds);
  if (targets.length === 0) {
    return 0;
  }

  const type = String(payload?.type || "system").trim() || "system";
  const title = String(payload?.title || "").trim();
  const message = String(payload?.message || "").trim();
  const href = String(payload?.href || "").trim() || null;

  if (!title || !message) {
    return 0;
  }

  await ensureSchema();

  await Promise.all(
    targets.map(async (userId) => {
      await sql`
        INSERT INTO notifications (user_id, type, title, message, href)
        VALUES (${userId}, ${type}, ${title}, ${message}, ${href})
      `;
    })
  );

  return targets.length;
}

async function listNotificationsForUser(userId, limit = 30) {
  await ensureSchema();

  const safeLimit = Math.max(1, Math.min(100, Number.parseInt(String(limit), 10) || 30));

  const [listResult, unreadResult] = await Promise.all([
    sql`
      SELECT id, type, title, message, href, is_read, created_at
      FROM notifications
      WHERE user_id = ${userId}
      ORDER BY created_at DESC
      LIMIT ${safeLimit}
    `,
    sql`
      SELECT COUNT(*)::INTEGER AS unread_count
      FROM notifications
      WHERE user_id = ${userId}
        AND is_read = FALSE
    `,
  ]);

  return {
    notifications: listResult.rows.map(mapNotificationRow),
    unreadCount: Number(unreadResult.rows[0]?.unread_count || 0),
  };
}

async function markNotificationsRead(userId, options = {}) {
  await ensureSchema();

  const notificationId = Number.parseInt(String(options.notificationId || ""), 10);
  const markAll = Boolean(options.all);

  if (markAll) {
    await sql`
      UPDATE notifications
      SET is_read = TRUE
      WHERE user_id = ${userId}
        AND is_read = FALSE
    `;
  } else if (Number.isInteger(notificationId) && notificationId > 0) {
    await sql`
      UPDATE notifications
      SET is_read = TRUE
      WHERE id = ${notificationId}
        AND user_id = ${userId}
    `;
  }

  const unreadResult = await sql`
    SELECT COUNT(*)::INTEGER AS unread_count
    FROM notifications
    WHERE user_id = ${userId}
      AND is_read = FALSE
  `;

  return Number(unreadResult.rows[0]?.unread_count || 0);
}

module.exports = {
  createNotificationsForUsers,
  findUserIdsByRoles,
  listNotificationsForUser,
  markNotificationsRead,
};
