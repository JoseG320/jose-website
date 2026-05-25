'use strict';

const fs = require('fs');
const path = require('path');
const pool = require('./pool');

const DEFAULT_SETTINGS = {
  status:       'Short Status Here',
  github_url:   '',
  linkedin_url: '',
  photo_hero:    '',
  photo_about_1: '',
  photo_about_2: '',
};

async function runMigrations(client) {
  const sql = fs.readFileSync(path.join(__dirname, 'migrations.sql'), 'utf8');

  // Split on migration block markers.
  const blockRe = /--\s*migration:\s*(\S+)\n([\s\S]*?)--\s*migration:\s*\1_end/g;
  let match;

  while ((match = blockRe.exec(sql)) !== null) {
    const name = match[1];
    const body = match[2].trim();

    const { rows } = await client.query(
      'SELECT id FROM migrations WHERE name = $1',
      [name]
    );

    if (rows.length > 0) {
      continue;
    }

    if (!body) {
      console.log(`[migrations] skipping empty block: ${name}`);
      continue;
    }

    console.log(`[migrations] applying: ${name}`);
    await client.query(body);
    await client.query(
      'INSERT INTO migrations (name) VALUES ($1)',
      [name]
    );
    console.log(`[migrations] done: ${name}`);
  }
}

async function init() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Apply schema (idempotent CREATE IF NOT EXISTS statements).
    const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
    await client.query(schema);

    // 2. Run any pending migrations.
    await runMigrations(client);

    // 3. Seed default settings only for keys that don't exist yet.
    for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
      await client.query(
        `INSERT INTO site_settings (key, value) VALUES ($1, $2)
         ON CONFLICT (key) DO NOTHING`,
        [key, value]
      );
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  // 4. Warn if no admin exists.
  const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM admins');
  if (rows[0].n === 0) {
    console.warn('[db] No admin account exists yet. Run `npm run seed` to create one.');
  }
}

module.exports = init;