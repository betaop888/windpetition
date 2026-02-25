function parseCookies(headerValue) {
  if (!headerValue || typeof headerValue !== "string") {
    return {};
  }

  const result = {};
  const parts = headerValue.split(";");

  for (const part of parts) {
    const index = part.indexOf("=");
    if (index <= 0) {
      continue;
    }

    const rawName = part.slice(0, index).trim();
    const rawValue = part.slice(index + 1).trim();

    if (!rawName) {
      continue;
    }

    try {
      result[rawName] = decodeURIComponent(rawValue);
    } catch {
      result[rawName] = rawValue;
    }
  }

  return result;
}

function serializeCookie(name, value, options = {}) {
  const encodedName = String(name).trim();
  const encodedValue = encodeURIComponent(String(value));

  if (!encodedName) {
    throw new Error("Cookie name is required");
  }

  const parts = [`${encodedName}=${encodedValue}`];

  if (Number.isFinite(options.maxAge)) {
    parts.push(`Max-Age=${Math.max(0, Math.floor(options.maxAge))}`);
  }

  if (options.path) {
    parts.push(`Path=${options.path}`);
  }

  if (options.httpOnly) {
    parts.push("HttpOnly");
  }

  if (options.secure) {
    parts.push("Secure");
  }

  if (options.sameSite) {
    parts.push(`SameSite=${options.sameSite}`);
  }

  if (options.expires instanceof Date && !Number.isNaN(options.expires.getTime())) {
    parts.push(`Expires=${options.expires.toUTCString()}`);
  }

  return parts.join("; ");
}

module.exports = {
  parseCookies,
  serializeCookie,
};
