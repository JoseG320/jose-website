'use strict';

const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const pool = require('./pool');
const config = require('../config');

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

  // 3. Seed the admin account if none exists.
  const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM admins');
  if (rows[0].n === 0) {
    if (!config.admin.password) {
      throw new Error(
        'No admin exists and ADMIN_PASSWORD is not set. Set ADMIN_USERNAME and ADMIN_PASSWORD and restart.'
      );
    }
    const hash = await bcrypt.hash(config.admin.password, 12);
    await pool.query(
      'INSERT INTO admins (username, password_hash) VALUES ($1, $2)',
      [config.admin.username, hash]
    );
    console.log(`[db] seeded admin user "${config.admin.username}"`);
  }
}

module.exports = init;
