'use strict';

const app = require('./src/app');
const initDb = require('./src/db/init');
const config = require('./src/config');

// In Docker, the app may boot before Postgres is ready. Retry a few times.
async function waitForDbAndInit(retries = 10, delayMs = 2000) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await initDb();
      return;
    } catch (err) {
      console.warn(`[jose-website] DB not ready (attempt ${attempt}/${retries}): ${err.message}`);
      if (attempt === retries) throw err;
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
}

// APP STARTUP
(async () => {
  try {
    await waitForDbAndInit();
    const server = app.listen(config.port, () => {
      console.log(`[jose-website] Server listening on http://localhost:${config.port}`);
    });

    // Graceful shutdown.
    const shutdown = (sig) => {
      console.log(`[shutdown] received ${sig}, closing server...`);
      server.close(() => process.exit(0));
      setTimeout(() => process.exit(1), 10000).unref();
    };
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  } catch (err) {
    console.error('[startup] fatal:', err);
    process.exit(1);
  }
})();
