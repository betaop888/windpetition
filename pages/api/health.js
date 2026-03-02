const handler = function handler(req, res) {
  const hasPostgresUrl = Boolean(process.env.POSTGRES_URL);
  const hasStorageUrl = Boolean(process.env.STORAGE_URL);
  const hasDatabaseUrl = Boolean(process.env.DATABASE_URL);
  const hasAnyPostgresLikeUrl = Boolean(
    process.env.POSTGRES_URL ||
      process.env.STORAGE_URL ||
      process.env.DATABASE_URL ||
      process.env.POSTGRES_PRISMA_URL ||
      process.env.STORAGE_PRISMA_URL ||
      process.env.POSTGRES_URL_NON_POOLING ||
      process.env.STORAGE_URL_NON_POOLING,
  );

  res.statusCode = 200;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(
    JSON.stringify({
      ok: true,
      marker: "health-2026-02-25-17-20",
      hasDiscordClientId: Boolean(process.env.DISCORD_CLIENT_ID),
      hasDiscordClientSecret: Boolean(process.env.DISCORD_CLIENT_SECRET),
      hasDiscordRedirectUri: Boolean(process.env.DISCORD_REDIRECT_URI),
      hasPostgresUrl,
      hasStorageUrl,
      hasDatabaseUrl,
      hasAnyPostgresLikeUrl,
      hasPostgresPrismaUrl: Boolean(process.env.POSTGRES_PRISMA_URL),
      hasStoragePrismaUrl: Boolean(process.env.STORAGE_PRISMA_URL),
      hasPostgresNonPoolingUrl: Boolean(process.env.POSTGRES_URL_NON_POOLING),
      hasStorageNonPoolingUrl: Boolean(process.env.STORAGE_URL_NON_POOLING),
      nodeEnv: process.env.NODE_ENV || null,
    }),
  );
};

module.exports = handler;
module.exports.default = handler;

