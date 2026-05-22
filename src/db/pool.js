'use strict';

const { Pool } = require('pg');
const config = require('../config');

const pool = new Pool({
  connectionString: config.databaseUrl,
  // Tune for a small single-instance app. Bump max if you scale out.
  max: 10,
  idleTimeoutMillis: 30000,
});

pool.on('error', (err) => {
  // A pooled client emitted an error after being idle. Log, don't crash.
  console.error('[db] unexpected idle client error:', err.message);
});

module.exports = pool;
