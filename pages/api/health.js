module.exports = function handler(req, res) {
  res.statusCode = 200;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(
    JSON.stringify({
      ok: true,
      marker: "health-2026-02-25-17-20",
      hasDiscordClientId: Boolean(process.env.DISCORD_CLIENT_ID),
      hasDiscordClientSecret: Boolean(process.env.DISCORD_CLIENT_SECRET),
      hasDiscordRedirectUri: Boolean(process.env.DISCORD_REDIRECT_URI),
      nodeEnv: process.env.NODE_ENV || null,
    }),
  );
};
