const crypto = require("crypto");

const { parseCookies: parseCookieHeader, serializeCookie } = require("./cookies");
const { ensureSchema, sql } = require("./db");

const SESSION_COOKIE_NAME = "windpetition_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;
const ROLE_CITIZEN = "citizen";
const ROLE_CHAMBER = "chamber";
const ROLE_MINISTER = "minister";
const ROLE_ADMIN = "admin";
const VALID_ROLES = [ROLE_CITIZEN, ROLE_CHAMBER, ROLE_MINISTER, ROLE_ADMIN];

function normalizeRoles(inputRoles, fallbackRole = ROLE_CITIZEN) {
  const source = [];

  if (Array.isArray(inputRoles)) {
    source.push(...inputRoles);
  } else if (typeof inputRoles === "string") {
    source.push(inputRoles);
  }

  if (typeof fallbackRole === "string") {
    source.push(fallbackRole);
  }

  source.push(ROLE_CITIZEN);

  const normalizedSet = new Set(
    source
      .map((value) => String(value || "").trim().toLowerCase())
      .filter((value) => VALID_ROLES.includes(value))
  );

  const normalized = VALID_ROLES.filter((role) => normalizedSet.has(role));
  return normalized.length > 0 ? normalized : [ROLE_CITIZEN];
}

function derivePrimaryRole(roles, fallbackRole = ROLE_CITIZEN) {
  const normalized = normalizeRoles(roles, fallbackRole);

  if (normalized.includes(ROLE_ADMIN)) {
    return ROLE_ADMIN;
  }

  if (normalized.includes(ROLE_MINISTER)) {
    return ROLE_MINISTER;
  }

  if (normalized.includes(ROLE_CHAMBER)) {
    return ROLE_CHAMBER;
  }

  return ROLE_CITIZEN;
}

function hasRole(user, role) {
  if (!user || !role) {
    return false;
  }

  const targetRole = String(role).trim().toLowerCase();
  if (!VALID_ROLES.includes(targetRole)) {
    return false;
  }

  return normalizeRoles(user.roles, user.role).includes(targetRole);
}

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

  const roles = normalizeRoles(row.roles, row.role);
  const role = derivePrimaryRole(roles, row.role);

  return {
    id: row.id,
    discordId: row.discord_id,
    username: row.username,
    avatarUrl: row.avatar_url,
    role,
    roles,
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
  return hasRole(user, ROLE_ADMIN);
}

function isChamberMember(user) {
  return Boolean(user && (hasRole(user, ROLE_CHAMBER) || hasRole(user, ROLE_MINISTER) || hasRole(user, ROLE_ADMIN)));
}

function isMinister(user) {
  return Boolean(user && (hasRole(user, ROLE_MINISTER) || hasRole(user, ROLE_ADMIN)));
}

module.exports = {
  ROLE_ADMIN,
  ROLE_CHAMBER,
  ROLE_CITIZEN,
  ROLE_MINISTER,
  SESSION_COOKIE_NAME,
  VALID_ROLES,
  clearSessionCookie,
  createSession,
  createSessionCookie,
  deleteSession,
  derivePrimaryRole,
  getSessionUser,
  hasRole,
  isAdmin,
  isChamberMember,
  isMinister,
  mapUser,
  normalizeRoles,
  parseCookies,
};
