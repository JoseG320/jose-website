'use strict';

const crypto = require('crypto');

// A small, dependency-free CSRF implementation using the synchronizer token
// pattern. csurf is deprecated and unmaintained, so we roll a tight version:
//   - generateToken: ensures a per-session token exists and exposes it to views
//   - verifyToken:   route-level guard for state-changing requests
//
// Note that for multipart/form-data routes (file uploads), the
// body isn't parsed until multer runs. So place verifyToken AFTER multer on
// those routes. For normal urlencoded forms, body is already parsed globally.

function generateToken(req, res, next) {
  if (!req.session.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(32).toString('hex');
  }
  res.locals.csrfToken = req.session.csrfToken;
  next();
}

function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

function verifyToken(req, res, next) {
  const sent =
    (req.body && req.body._csrf) ||
    req.get('x-csrf-token') ||
    req.get('x-xsrf-token');

  if (!safeEqual(sent, req.session.csrfToken)) {
    if (req.get('x-requested-with') === 'xmlhttprequest') {
      return res.status(403).json({ ok: false, error: 'Invalid CSRF token.' });
    }
    res.status(403);
    req.flash('error', 'Security check failed (invalid form token). Please try again.');
    return res.redirect(req.get('referer') || '/');
  }
  next();
}

module.exports = { generateToken, verifyToken };
