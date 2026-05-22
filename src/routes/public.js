'use strict';

const express = require('express');
const path = require('path');
const fs = require('fs');
const pool = require('../db/pool');
const config = require('../config');

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

router.get('/about', async (req, res, next) => {
  try {
    res.render('pages/about', { title: 'About', settings: await getSettings() });
  } catch (e) { next(e); }
});

router.get('/projects', async (req, res, next) => {
  try {
    res.render('pages/projects', { title: 'Projects', settings: await getSettings() });
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

router.get('/contact', async (req, res, next) => {
  try {
    res.render('pages/contact', { title: 'Contact', settings: await getSettings() });
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

module.exports = router;
