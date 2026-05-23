'use strict';

const express = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../db/pool');
const { loginLimiter } = require('../middleware/rateLimit');
const { verifyToken } = require('../middleware/csrf');

const router = express.Router();

// GET /admin/login — show the form (skip if already logged in).
router.get('/login', (req, res) => {
  if (req.session.adminId) return res.redirect('/admin');
  res.render('admin/login', { title: 'Admin Login', layout: 'layout' });
});

// POST /admin/login — rate-limited + CSRF-checked.
router.post('/login', loginLimiter, verifyToken, async (req, res, next) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      req.flash('error', 'Username and password are required.');
      return res.redirect('/admin/login');
    }

    const { rows } = await pool.query(
      'SELECT * FROM admins WHERE username = $1',
      [username]
    );
    const admin = rows[0];

    // Always run a hash compare even when the user doesn't exist, to avoid
    // leaking which usernames are valid via timing differences.
    const hash = admin ? admin.password_hash : '$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinv';
    const ok = await bcrypt.compare(password, hash);

    if (!admin || !ok) {
      req.flash('error', 'Invalid credentials.');
      return res.redirect('/admin/login');
    }

    // Prevent session fixation: regenerate the session on privilege change.
    const returnTo = req.session.returnTo;
    req.session.regenerate(async (err) => {
      if (err) return next(err);
      req.session.adminId = admin.id;
      req.session.adminUsername = admin.username;
      await pool.query('UPDATE admins SET last_login_at = now() WHERE id = $1', [admin.id]);
      res.redirect(returnTo && returnTo.startsWith('/admin') ? returnTo : '/admin');
    });
  } catch (e) { next(e); }
});

// POST /admin/logout — CSRF-checked.
router.post('/logout', verifyToken, (req, res, next) => {
  req.session.destroy((err) => {
    if (err) return next(err);
    res.clearCookie('connect.sid');
    res.redirect('/');
  });
});

module.exports = router;
