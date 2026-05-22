'use strict';

const rateLimit = require('express-rate-limit');

// Aggressive limiter for the login endpoint to slow brute-force attempts.
// 5 attempts per 15 minutes per IP. Successful logins don't count against it.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: 'Too many login attempts. Try again in 15 minutes.',
});

// Gentle catch-all limiter for the whole site to blunt scrapers/bots.
const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
});

module.exports = { loginLimiter, globalLimiter };
