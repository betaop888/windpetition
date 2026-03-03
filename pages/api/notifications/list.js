const { getSessionUser } = require("../../../lib/server/auth");
const { methodNotAllowed, parseInteger, sendJson } = require("../../../lib/server/http");
const { listNotificationsForUser } = require("../../../lib/server/notifications");

function asBoolean(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

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
    const all = asBoolean(req.query?.all);
    const data = await listNotificationsForUser(user.id, Number.isInteger(limit) ? limit : 30, {
      all,
    });

    sendJson(res, 200, data);
  } catch (error) {
    console.error("Failed to fetch notifications", error);
    sendJson(res, 500, { error: "Failed to fetch notifications" });
  }
};

module.exports = handler;
module.exports.default = handler;
