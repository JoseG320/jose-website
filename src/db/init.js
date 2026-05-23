'use strict';

const fs = require('fs');
const path = require('path');
const pool = require('./pool');

const DEFAULT_SETTINGS = {
  display_name: 'My Name Here',
  tagline: 'Tagline Here',
  bio: 'Short Intro Here',
  email: '',
  github_url: '',
  linkedin_url: '',
};

async function init() {
  // 1. Apply schema (idempotent).
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  await pool.query(schema);

  // 2. Seed default settings only for keys that don't exist yet.
  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    await pool.query(
      `INSERT INTO site_settings (key, value) VALUES ($1, $2)
       ON CONFLICT (key) DO NOTHING`,
      [key, value]
    );
  }

  // 3. Admins are not seeded anymore. Create one with: npm run seed
  const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM admins');
  if (rows[0].n === 0) {
    console.warn('[db] No admin account exists yet. Run `npm run seed` to create one.');
  }
}

module.exports = init;
