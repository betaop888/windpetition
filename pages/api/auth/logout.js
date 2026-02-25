const {
  clearSessionCookie,
  deleteSession,
  parseCookies,
  SESSION_COOKIE_NAME,
} = require("../../../lib/server/auth");
const { methodNotAllowed, sendJson } = require("../../../lib/server/http");

const handler = async function handler(req, res) {
  if (req.method !== "POST") {
    return methodNotAllowed(req, res, ["POST"]);
  }

  try {
    const cookies = parseCookies(req);
    const token = cookies[SESSION_COOKIE_NAME];

    await deleteSession(token);

    res.setHeader("Set-Cookie", clearSessionCookie());
    sendJson(res, 200, { success: true });
  } catch (error) {
    console.error("Logout failed", error);
    sendJson(res, 500, { error: "Logout failed" });
  }
};

module.exports = handler;
module.exports.default = handler;

