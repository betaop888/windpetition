const {
  clearSessionCookie,
  createSession,
  createSessionCookie,
  parseCookies,
} = require("../../../lib/server/auth");
const { serializeCookie } = require("../../../lib/server/cookies");
const { ensureSchema, sql } = require("../../../lib/server/db");
const { methodNotAllowed } = require("../../../lib/server/http");
const { createNotificationsForUsers, findUserIdsByRoles } = require("../../../lib/server/notifications");

const OAUTH_STATE_COOKIE = "windpetition_oauth_state";

function resolveDiscordAvatar(discordUser) {
  if (discordUser.avatar) {
    const ext = discordUser.avatar.startsWith("a_") ? "gif" : "png";
    return `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.${ext}?size=256`;
  }

  if (discordUser.discriminator && discordUser.discriminator !== "0") {
    const index = Number(discordUser.discriminator) % 5;
    return `https://cdn.discordapp.com/embed/avatars/${index}.png`;
  }

  const index = Number((BigInt(discordUser.id) >> 22n) % 6n);
  return `https://cdn.discordapp.com/embed/avatars/${index}.png`;
}

function clearOAuthStateCookie() {
  return serializeCookie(OAUTH_STATE_COOKIE, "", {
    httpOnly: true,
    sameSite: "Lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: 0,
  });
}

const handler = async function handler(req, res) {
  if (req.method !== "GET") {
    return methodNotAllowed(req, res, ["GET"]);
  }

  const clientId = process.env.DISCORD_CLIENT_ID;
  const clientSecret = process.env.DISCORD_CLIENT_SECRET;
  const redirectUri = process.env.DISCORD_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.end("Discord OAuth is not configured on the server.");
    return;
  }

  const code = req.query?.code;
  const state = req.query?.state;
  const cookies = parseCookies(req);

  if (!code || !state || state !== cookies[OAUTH_STATE_COOKIE]) {
    res.statusCode = 302;
    res.setHeader("Set-Cookie", [clearOAuthStateCookie(), clearSessionCookie()]);
    res.setHeader("Location", "/?auth=failed");
    res.end();
    return;
  }

  try {
    const tokenPayload = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
    });

    const tokenResponse = await fetch("https://discord.com/api/oauth2/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: tokenPayload,
    });

    if (!tokenResponse.ok) {
      throw new Error(`Token exchange failed with status ${tokenResponse.status}`);
    }

    const tokenData = await tokenResponse.json();
    if (!tokenData.access_token) {
      throw new Error("Discord did not return access token");
    }

    const userResponse = await fetch("https://discord.com/api/users/@me", {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
      },
    });

    if (!userResponse.ok) {
      throw new Error(`User fetch failed with status ${userResponse.status}`);
    }

    const discordUser = await userResponse.json();
    const username = String(discordUser.username || discordUser.global_name || "").trim();

    if (!username) {
      throw new Error("Discord username is empty");
    }

    const avatarUrl = resolveDiscordAvatar(discordUser);

    await ensureSchema();

    const existingResult = await sql`
      SELECT id, role
      FROM users
      WHERE discord_id = ${discordUser.id}
      LIMIT 1
    `;

    const existing = existingResult.rows[0] || null;
    let nextRole = existing?.role || "citizen";

    if (username.toLowerCase() === "nertin0") {
      nextRole = "admin";
    }

    let user;

    if (existing) {
      const updated = await sql`
        UPDATE users
        SET username = ${username},
            avatar_url = ${avatarUrl},
            role = ${nextRole},
            updated_at = NOW()
        WHERE id = ${existing.id}
        RETURNING *
      `;

      user = updated.rows[0];
    } else {
      const inserted = await sql`
        INSERT INTO users (discord_id, username, avatar_url, role)
        VALUES (${discordUser.id}, ${username}, ${avatarUrl}, ${nextRole})
        RETURNING *
      `;

      user = inserted.rows[0];

      const adminIds = await findUserIdsByRoles(["admin"]);
      await createNotificationsForUsers(adminIds, {
        type: "user_registered",
        title: "Новая регистрация",
        message: `Пользователь ${username} зарегистрировался через Discord.`,
        href: `/profile?userId=${user.id}`,
      });

      if (nextRole === "citizen") {
        await createNotificationsForUsers([user.id], {
          type: "welcome",
          title: "Добро пожаловать",
          message: "Добро пожаловать в Wind Petition. Теперь вы можете участвовать в голосованиях и создавать публичные инициативы.",
          href: "/",
        });
      }
    }

    const sessionToken = await createSession(user.id);

    res.statusCode = 302;
    res.setHeader("Set-Cookie", [createSessionCookie(sessionToken), clearOAuthStateCookie()]);
    res.setHeader("Location", "/");
    res.end();
  } catch (error) {
    console.error("Discord callback failed", error);

    res.statusCode = 302;
    res.setHeader("Set-Cookie", [clearOAuthStateCookie(), clearSessionCookie()]);
    res.setHeader("Location", "/?auth=failed");
    res.end();
  }
};

module.exports = handler;
module.exports.default = handler;
