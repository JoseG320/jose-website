'use strict';

// Gate for admin-only routes. Redirects to login if not authenticated.
function requireAdmin(req, res, next) {
  if (req.session && req.session.adminId) {
    return next();
  }
  // Remember where users were trying to go, so we can bounce back after login.
  req.session.returnTo = req.originalUrl;
  req.flash('error', 'Please log in to continue.');
  return res.redirect('/admin/login');
}

// If the logged-in admin still has a temporary password, force them to the
// change-password page before anything else. Apply AFTER requireAdmin, and
// NOT on the change-password routes (or you get a redirect loop).
function requirePasswordCurrent(req, res, next) {
  if (req.session && req.session.mustChangePassword) {
    req.flash('error', 'Please set a new password to continue.');
    return res.redirect('/admin/change-password');
  }
  next();
}

// Makes auth state available to every view (e.g. to show/hide an "Admin" link).
function injectAuthLocals(req, res, next) {
  res.locals.isAdmin = Boolean(req.session && req.session.adminId);
  res.locals.adminUsername = req.session ? req.session.adminUsername : null;
  next();
}

module.exports = { requireAdmin, requirePasswordCurrent, injectAuthLocals };