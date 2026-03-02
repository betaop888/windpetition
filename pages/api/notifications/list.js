const { getSessionUser } = require("../../../lib/server/auth");
const { methodNotAllowed, parseInteger, sendJson } = require("../../../lib/server/http");
const { listNotificationsForUser } = require("../../../lib/server/notifications");

const handler = async function handler(req, res) {
  if (req.method !== "GET") {
    return methodNotAllowed(req, res, ["GET"]);
  }

  try {
    const user = await getSessionUser(req);
    if (!user) {
      return sendJson(res, 401, { error: "Authentication required" });
    }

    const limit = parseInteger(req.query?.limit);
    const data = await listNotificationsForUser(user.id, Number.isInteger(limit) ? limit : 30);

    sendJson(res, 200, data);
  } catch (error) {
    console.error("Failed to fetch notifications", error);
    sendJson(res, 500, { error: "Failed to fetch notifications" });
  }
};

module.exports = handler;
module.exports.default = handler;
