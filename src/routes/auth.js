'use strict';

const express = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../db/pool');
const { loginLimiter } = require('../middleware/rateLimit');
const { verifyToken } = require('../middleware/csrf');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();

// Password strength rules (enforced on CHANGE, not on the temp password).
function passwordProblem(pw) {
  if (typeof pw !== 'string' || pw.length < 12) return 'Password must be at least 12 characters.';
  if (!/[a-z]/.test(pw)) return 'Password must include a lowercase letter.';
  if (!/[A-Z]/.test(pw)) return 'Password must include an uppercase letter.';
  if (!/[0-9]/.test(pw)) return 'Password must include a number.';
  return null;
}

router.get('/login', (req, res) => {
  if (req.session.adminId) return res.redirect('/admin');
  res.render('admin/login', { title: 'Admin Login', layout: 'layout' });
});

router.post('/login', loginLimiter, verifyToken, async (req, res, next) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      req.flash('error', 'Username and password are required.');
      return res.redirect('/admin/login');
    }

    const { rows } = await pool.query('SELECT * FROM admins WHERE username = $1', [username]);
    const admin = rows[0];

    // Always run a compare even if the user doesn't exist (avoids timing leak).
    const hash = admin ? admin.password_hash
      : '$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinv';
    const ok = await bcrypt.compare(password, hash);

    if (!admin || !ok) {
      req.flash('error', 'Invalid credentials.');
      return res.redirect('/admin/login');
    }

    const returnTo = req.session.returnTo;
    req.session.regenerate(async (err) => {
      if (err) return next(err);
      req.session.adminId = admin.id;
      req.session.adminUsername = admin.username;
      req.session.mustChangePassword = admin.must_change_password;
      await pool.query('UPDATE admins SET last_login_at = now() WHERE id = $1', [admin.id]);

      if (admin.must_change_password) return res.redirect('/admin/change-password');
      res.redirect(returnTo && returnTo.startsWith('/admin') ? returnTo : '/admin');
    });
  } catch (e) { next(e); }
});

router.get('/change-password', requireAdmin, (req, res) => {
  res.render('admin/change-password', {
    title: 'Change Password',
    layout: 'layout',
    forced: Boolean(req.session.mustChangePassword),
  });
});

router.post('/change-password', requireAdmin, verifyToken, async (req, res, next) => {
  try {
    const { current_password, new_password, confirm_password } = req.body;

    const { rows } = await pool.query('SELECT * FROM admins WHERE id = $1', [req.session.adminId]);
    const admin = rows[0];
    if (!admin) {
      req.flash('error', 'Account not found.');
      return res.redirect('/admin/login');
    }

    const currentOk = await bcrypt.compare(current_password || '', admin.password_hash);
    if (!currentOk) {
      req.flash('error', 'Current password is incorrect.');
      return res.redirect('/admin/change-password');
    }

    const problem = passwordProblem(new_password);
    if (problem) {
      req.flash('error', problem);
      return res.redirect('/admin/change-password');
    }
    if (new_password !== confirm_password) {
      req.flash('error', 'New passwords do not match.');
      return res.redirect('/admin/change-password');
    }
    if (await bcrypt.compare(new_password, admin.password_hash)) {
      req.flash('error', 'New password must be different from the current one.');
      return res.redirect('/admin/change-password');
    }

    const hash = await bcrypt.hash(new_password, 12);
    await pool.query(
      'UPDATE admins SET password_hash = $1, must_change_password = false WHERE id = $2',
      [hash, admin.id]
    );
    req.session.mustChangePassword = false;

    req.flash('success', 'Password updated.');
    res.redirect('/admin');
  } catch (e) { next(e); }
});

router.post('/logout', verifyToken, (req, res, next) => {
  req.session.destroy((err) => {
    if (err) return next(err);
    res.clearCookie('connect.sid');
    res.redirect('/');
  });
});

module.exports = router;