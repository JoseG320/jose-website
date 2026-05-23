'use strict';

const express = require('express');
const multer = require('multer');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const pool = require('../db/pool');
const config = require('../config');
const { requireAdmin, requirePasswordCurrent } = require('../middleware/auth');
const { verifyToken } = require('../middleware/csrf');

const router = express.Router();

// Every route below requires an authenticated admin. Require passwor
router.use(requireAdmin);
router.use(requirePasswordCurrent);

// MULTER
fs.mkdirSync(config.uploads.dir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, config.uploads.dir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: config.uploads.maxBytes },
  fileFilter: (req, file, cb) => {
    // Only allow PDFs. Loosen this if you want to accept .docx etc.
    if (file.mimetype === 'application/pdf') return cb(null, true);
    cb(new Error('Only PDF files are allowed.'));
  },
});

// DASHBOARD
router.get('/', async (req, res, next) => {
  try {
    const [{ rows: resumes }, { rows: settingRows }] = await Promise.all([
      pool.query('SELECT * FROM resumes ORDER BY uploaded_at DESC'),
      pool.query('SELECT key, value FROM site_settings ORDER BY key'),
    ]);
    res.render('admin/dashboard', {
      title: 'Admin Dashboard',
      layout: 'layout',
      resumes,
      settings: Object.fromEntries(settingRows.map((r) => [r.key, r.value])),
      maxBytes: config.uploads.maxBytes,
    });
  } catch (e) { next(e); }
});

// RESUME UPLOAD
// NOTE: multer must run BEFORE verifyToken so req.body._csrf is populated.
router.post(
  '/resume',
  (req, res, next) => {
    upload.single('resume')(req, res, (err) => {
      if (err) {
        req.flash('error', err.message || 'Upload failed.');
        return res.redirect('/admin');
      }
      next();
    });
  },
  verifyToken,
  async (req, res, next) => {
    try {
      if (!req.file) {
        req.flash('error', 'No file received.');
        return res.redirect('/admin');
      }
      // New uploads become the active resume; deactivate any current one.
      await pool.query('BEGIN');
      await pool.query('UPDATE resumes SET is_active = false WHERE is_active = true');
      await pool.query(
        `INSERT INTO resumes (filename, original_name, mime_type, size_bytes, is_active)
         VALUES ($1, $2, $3, $4, true)`,
        [req.file.filename, req.file.originalname, req.file.mimetype, req.file.size]
      );
      await pool.query('COMMIT');
      req.flash('success', 'Resume uploaded and set as active.');
      res.redirect('/admin');
    } catch (e) {
      await pool.query('ROLLBACK').catch(() => {});
      next(e);
    }
  }
);

// SET ACTIVE RESUME
router.post('/resume/:id/activate', verifyToken, async (req, res, next) => {
  try {
    await pool.query('BEGIN');
    await pool.query('UPDATE resumes SET is_active = false WHERE is_active = true');
    const { rowCount } = await pool.query(
      'UPDATE resumes SET is_active = true WHERE id = $1',
      [req.params.id]
    );
    await pool.query('COMMIT');
    req.flash(rowCount ? 'success' : 'error', rowCount ? 'Active resume updated.' : 'Resume not found.');
    res.redirect('/admin');
  } catch (e) {
    await pool.query('ROLLBACK').catch(() => {});
    next(e);
  }
});

// DELETE RESUME
router.post('/resume/:id/delete', verifyToken, async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT * FROM resumes WHERE id = $1', [req.params.id]);
    const resume = rows[0];
    if (!resume) {
      req.flash('error', 'Resume not found.');
      return res.redirect('/admin');
    }
    await pool.query('DELETE FROM resumes WHERE id = $1', [req.params.id]);
    // Best-effort file cleanup.
    fs.promises
      .unlink(path.join(config.uploads.dir, resume.filename))
      .catch(() => {});
    req.flash('success', 'Resume deleted.');
    res.redirect('/admin');
  } catch (e) { next(e); }
});

// SITE SETTINGS UPDATE
router.post('/settings', verifyToken, async (req, res, next) => {
  try {
    const editable = ['display_name', 'tagline', 'bio', 'email', 'github_url', 'linkedin_url'];
    for (const key of editable) {
      if (key in req.body) {
        await pool.query(
          `INSERT INTO site_settings (key, value) VALUES ($1, $2)
           ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
          [key, String(req.body[key]).slice(0, 5000)]
        );
      }
    }
    req.flash('success', 'Settings saved.');
    res.redirect('/admin');
  } catch (e) { next(e); }
});

module.exports = router;
