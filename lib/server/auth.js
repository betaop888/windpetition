const crypto = require("crypto");

const { parseCookies: parseCookieHeader, serializeCookie } = require("./cookies");
const { ensureSchema, sql } = require("./db");

const SESSION_COOKIE_NAME = "windpetition_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

function nowPlusSeconds(seconds) {
  return new Date(Date.now() + seconds * 1000);
}

function parseCookies(req) {
  const header = req.headers.cookie;
  return parseCookieHeader(header);
}

function createSessionCookie(token) {
  return serializeCookie(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "Lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

function clearSessionCookie() {
  return serializeCookie(SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "Lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: 0,
  });
}

async function createSession(userId) {
  await ensureSchema();

  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = nowPlusSeconds(SESSION_MAX_AGE_SECONDS).toISOString();

  await sql`
    INSERT INTO sessions (token, user_id, expires_at)
    VALUES (${token}, ${userId}, ${expiresAt})
  `;

  return token;
}

async function deleteSession(token) {
  if (!token) {
    return;
  }

  await ensureSchema();
  await sql`DELETE FROM sessions WHERE token = ${token}`;
}

function mapUser(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    discordId: row.discord_id,
    username: row.username,
    avatarUrl: row.avatar_url,
    role: row.role,
    createdAt: row.created_at,
  };
}

async function getSessionUser(req) {
  await ensureSchema();
  const cookies = parseCookies(req);
  const token = cookies[SESSION_COOKIE_NAME];

  if (!token) {
    return null;
  }

  const { rows } = await sql`
    SELECT u.*
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.token = ${token}
      AND s.expires_at > NOW()
    LIMIT 1
  `;

  if (rows.length === 0) {
    await sql`DELETE FROM sessions WHERE token = ${token}`;
    return null;
  }

  return mapUser(rows[0]);
}

function isAdmin(user) {
  return Boolean(user && user.role === "admin");
}

function isMinister(user) {
  return Boolean(user && (user.role === "minister" || user.role === "admin"));
}

module.exports = {
  SESSION_COOKIE_NAME,
  clearSessionCookie,
  createSession,
  createSessionCookie,
  deleteSession,
  getSessionUser,
  isAdmin,
  isMinister,
  mapUser,
  parseCookies,
};
