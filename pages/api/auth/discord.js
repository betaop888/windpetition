const crypto = require("crypto");
const cookie = require("cookie");

const { methodNotAllowed } = require("../../../lib/server/http");

const OAUTH_STATE_COOKIE = "windpetition_oauth_state";

module.exports = async function handler(req, res) {
  try {
    if (req.method !== "GET") {
      return methodNotAllowed(req, res, ["GET"]);
    }

    const clientId = process.env.DISCORD_CLIENT_ID;
    const redirectUri = process.env.DISCORD_REDIRECT_URI;

    if (!clientId || !redirectUri) {
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(
        JSON.stringify({
          error: "Discord OAuth is not configured on the server.",
          hasClientId: Boolean(clientId),
          hasRedirectUri: Boolean(redirectUri),
        }),
      );
      return;
    }

    const state = crypto.randomBytes(16).toString("hex");

    const query = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: "identify",
      state,
      prompt: "consent",
    });

    const stateCookie = cookie.serialize(OAUTH_STATE_COOKIE, state, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 10,
    });

    res.statusCode = 302;
    res.setHeader("Set-Cookie", stateCookie);
    res.setHeader("Location", `https://discord.com/oauth2/authorize?${query.toString()}`);
    res.end();
  } catch (error) {
    console.error("Discord OAuth init failed", error);
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ error: "Failed to start Discord OAuth" }));
  }
};

