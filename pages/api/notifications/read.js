const { getSessionUser } = require("../../../lib/server/auth");
const { methodNotAllowed, parseInteger, readJsonBody, sendJson } = require("../../../lib/server/http");
const { markNotificationsRead } = require("../../../lib/server/notifications");

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
    const notificationId = parseInteger(body?.id);
    const markAll = Boolean(body?.all);

    const unreadCount = await markNotificationsRead(user.id, {
      notificationId: markAll ? null : notificationId,
      all: markAll,
    });

    sendJson(res, 200, {
      success: true,
      unreadCount,
    });
  } catch (error) {
    console.error("Failed to mark notifications as read", error);
    if (error.message === "Invalid JSON payload") {
      return sendJson(res, 400, { error: "Invalid JSON payload" });
    }
    sendJson(res, 500, { error: "Failed to mark notifications as read" });
  }
};

module.exports = handler;
module.exports.default = handler;
