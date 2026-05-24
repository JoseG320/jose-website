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

// Every route below requires an authenticated admin.
router.use(requireAdmin);
router.use(requirePasswordCurrent);

// MULTERS
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
    const allowed = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ];
    if (allowed.includes(file.mimetype)) return cb(null, true);
    cb(new Error('Only PDF and DOCX files are allowed.'));
  },
});

// IMAGE MULTER
const imageStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '../../public/img');
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${req.params.slot}-${Date.now()}${ext}`);
  },
});

const imageUpload = multer({
  storage: imageStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (allowed.includes(file.mimetype)) return cb(null, true);
    cb(new Error('Only JPG, PNG, or WEBP images are allowed.'));
  },
});

const PHOTO_SLOTS = ['photo_hero', 'photo_about_1', 'photo_about_2'];


// DASHBOARD
router.get('/', async (req, res, next) => {
  try {
    const page    = Math.max(1, parseInt(req.query.page) || 1);
    const perPage = 5;
    const offset  = (page - 1) * perPage;

    const [{ rows: resumes }, { rows: settingRows }, { rows: messages }, { rows: countRows }] = await Promise.all([
      pool.query('SELECT * FROM resumes ORDER BY uploaded_at DESC'),
      pool.query('SELECT key, value FROM site_settings ORDER BY key'),
      pool.query('SELECT * FROM messages WHERE verified = true ORDER BY created_at DESC LIMIT $1 OFFSET $2', [perPage, offset]),
      pool.query('SELECT COUNT(*)::int AS n FROM messages WHERE verified = true'),
    ]);

    const totalMessages = countRows[0].n;
    const totalPages    = Math.ceil(totalMessages / perPage);

    res.render('admin/dashboard', {
      title: 'Admin Dashboard',
      layout: 'admin/adminlayout',
      resumes,
      settings: Object.fromEntries(settingRows.map((r) => [r.key, r.value])),
      maxBytes: config.uploads.maxBytes,
      messages,
      page,
      totalPages,
    });
  } catch (e) { next(e); }
});

// RESUME UPLOAD
// NOTE: multer must run BEFORE verifyToken so req.body._csrf is populated.
router.post('/resume', (req, res, next) => {
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
      const fileType = req.file.mimetype === 'application/pdf' ? 'pdf' : 'docx';
      await pool.query('BEGIN');
      await pool.query('UPDATE resumes SET is_active = false WHERE is_active = true AND file_type = $1', [fileType]);
      await pool.query(
        `INSERT INTO resumes (filename, original_name, mime_type, size_bytes, is_active, file_type)
         VALUES ($1, $2, $3, $4, true, $5)`,
        [req.file.filename, req.file.originalname, req.file.mimetype, req.file.size, fileType]
      );
      await pool.query('COMMIT');
      req.flash('success', `${fileType.toUpperCase()} uploaded and set as active.`);
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
    const { rows } = await pool.query('SELECT * FROM resumes WHERE id = $1', [req.params.id]);
    const resume = rows[0];
    if (!resume) {
      req.flash('error', 'Resume not found.');
      return res.redirect('/admin');
    }
    await pool.query('BEGIN');
    await pool.query('UPDATE resumes SET is_active = false WHERE is_active = true AND file_type = $1', [resume.file_type]);
    await pool.query('UPDATE resumes SET is_active = true WHERE id = $1', [req.params.id]);
    await pool.query('COMMIT');
    req.flash('success', 'Active resume updated.');
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
    fs.promises
      .unlink(path.join(config.uploads.dir, resume.filename))
      .catch(() => {});
    req.flash('success', 'Resume deleted.');
    res.redirect('/admin');
  } catch (e) { next(e); }
});

// MARK MESSAGE READ
router.post('/message/:id/read', verifyToken, async (req, res, next) => {
  try {
    await pool.query('UPDATE messages SET read = true WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// DELETE MESSAGE
router.post('/message/:id/delete', verifyToken, async (req, res, next) => {
  try {
    await pool.query('DELETE FROM messages WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// MARK ALL MESSAGES READ
router.post('/messages/read-all', verifyToken, async (req, res, next) => {
  try {
    await pool.query('UPDATE messages SET read = true WHERE verified = true');
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// DELETE ALL MESSAGES
router.post('/messages/delete-all', verifyToken, async (req, res, next) => {
  try {
    await pool.query('DELETE FROM messages WHERE verified = true');
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// UPLOAD PHOTO
router.post(
  '/photo/:slot',
  (req, res, next) => {
    if (!PHOTO_SLOTS.includes(req.params.slot)) return res.redirect('/admin');
    imageUpload.single('photo')(req, res, (err) => {
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

      // Delete old photo if one exists
      const { rows } = await pool.query(
        'SELECT value FROM site_settings WHERE key = $1',
        [req.params.slot]
      );
      if (rows[0] && rows[0].value) {
        const oldPath = path.join(__dirname, '../../public/img', rows[0].value);
        fs.promises.unlink(oldPath).catch(() => {});
      }

      await pool.query(
        `INSERT INTO site_settings (key, value) VALUES ($1, $2)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
        [req.params.slot, req.file.filename]
      );

      req.flash('success', 'Photo updated.');
      res.redirect('/admin');
    } catch (e) { next(e); }
  }
);

// DELETE PHOTO
router.post('/photo/:slot/delete', verifyToken, async (req, res, next) => {
  try {
    if (!PHOTO_SLOTS.includes(req.params.slot)) return res.redirect('/admin');

    const { rows } = await pool.query(
      'SELECT value FROM site_settings WHERE key = $1',
      [req.params.slot]
    );
    if (rows[0] && rows[0].value) {
      const filePath = path.join(__dirname, '../../public/img', rows[0].value);
      fs.promises.unlink(filePath).catch(() => {});
      await pool.query(
        `INSERT INTO site_settings (key, value) VALUES ($1, '')
         ON CONFLICT (key) DO UPDATE SET value = ''`,
        [req.params.slot]
      );
    }

    req.flash('success', 'Photo removed.');
    res.redirect('/admin');
  } catch (e) { next(e); }
});

// SITE SETTINGS UPDATE
router.post('/settings', verifyToken, async (req, res, next) => {
  try {
    const editable = ['status', 'github_url', 'linkedin_url'];
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