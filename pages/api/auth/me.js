const { getSessionUser } = require("../../../lib/server/auth");
const { methodNotAllowed, sendJson } = require("../../../lib/server/http");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    return methodNotAllowed(req, res, ["GET"]);
  }

  try {
    const user = await getSessionUser(req);

    sendJson(res, 200, {
      authenticated: Boolean(user),
      user,
    });
  } catch (error) {
    console.error("Failed to fetch current user", error);
    sendJson(res, 500, { error: "Failed to fetch current user" });
  }
};

