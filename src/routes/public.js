'use strict';

const express = require('express');
const path = require('path');
const fs = require('fs');
const pool = require('../db/pool');
const config = require('../config');
const { verifyToken } = require('../middleware/csrf');

const router = express.Router();

// HELPERS
// load site settings into a plain object for templates.
async function getSettings() {
  const { rows } = await pool.query('SELECT key, value FROM site_settings');
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}
// currently active resume row (or null).
async function getActiveResume() {
  const { rows } = await pool.query(
    'SELECT * FROM resumes WHERE is_active = true LIMIT 1'
  );
  return rows[0] || null;
}

router.get('/', async (req, res, next) => {
  try {
    res.render('pages/home', { title: 'Home', settings: await getSettings() });
  } catch (e) { next(e); }
});

router.get('/resume', async (req, res, next) => {
  try {
    res.render('pages/resume', {
      title: 'Resume',
      settings: await getSettings(),
      resume: await getActiveResume(),
    });
  } catch (e) { next(e); }
});

// Serve the active resume file (inline so it renders in the browser PDF viewer).
router.get('/resume/file', async (req, res, next) => {
  try {
    const resume = await getActiveResume();
    if (!resume) return res.status(404).render('errors/404', { title: 'Not found' });

    const filePath = path.join(config.uploads.dir, resume.filename);
    if (!fs.existsSync(filePath)) {
      return res.status(404).render('errors/404', { title: 'Not found' });
    }
    res.setHeader('Content-Type', resume.mime_type);
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${encodeURIComponent(resume.original_name)}"`
    );
    fs.createReadStream(filePath).pipe(res);
  } catch (e) { next(e); }
});

// Public contact form. Honeypot + CSRF; covered by your global rate limiter.
router.post('/contact', verifyToken, async (req, res, next) => {
  try {
    if (req.body.website) return res.redirect('/#contact'); // bot filled the honeypot — drop silently
    const name  = String(req.body.name  || '').trim().slice(0, 200);
    const email = String(req.body.email || '').trim().slice(0, 200);
    const body  = String(req.body.message || '').trim().slice(0, 5000);
    if (!name || !email || !body) {
      req.flash('error', 'Please fill in all fields.');
      return res.redirect('/#contact');
    }
    await pool.query('INSERT INTO messages (name, email, body) VALUES ($1, $2, $3)', [name, email, body]);
    req.flash('success', 'Thanks — your message was sent.');
    res.redirect('/#contact');
  } catch (e) { next(e); }
});

module.exports = router;
