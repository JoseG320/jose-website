// APP CONFIGURATION
'use strict';

require('dotenv').config();

// Fallback function
function required(name, fallback) {
  const v = process.env[name] ?? fallback;
  if (v === undefined) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return v;
}

// Enviroment
// NODE_ENV
const isProd = process.env.NODE_ENV === 'production';

module.exports = {
  isProd,

  // App
  // PORT, TRUST_PROXY
  port: parseInt(process.env.PORT || '3000', 10),

  // set TRUST_PROXY=1 when set up with NGINX!
  trustProxy: process.env.TRUST_PROXY === '1' ? 1 : false,

  // Database: PostgreSQL
  // PGUSER, PGPASSWORD, PGDATABASE
  databaseUrl:
    process.env.DATABASE_URL ||
    `postgres://${process.env.PGUSER || 'portfolio'}:${process.env.PGPASSWORD || 'portfolio'}@${process.env.PGHOST || 'localhost'}:${process.env.PGPORT || '5432'}/${process.env.PGDATABASE || 'portfolio'}`,

  // Session
  // SESSION_SECRET
  sessionSecret: required('SESSION_SECRET', isProd ? undefined : 'dev-insecure-secret-change-me'),

  // Admin
  // ADMIN_USERNAME
  admin: {
    username: process.env.ADMIN_USERNAME || 'admin',
  },

  // Uploads
  // UPLOAD_MAX_BYTES
  uploads: {
    dir: process.env.UPLOAD_DIR || require('path').join(__dirname, '..', 'uploads'),
    maxBytes: parseInt(process.env.UPLOAD_MAX_BYTES || '5242880', 10), // 5 MB
  },
};
