'use strict';

const express = require('express');
const path = require('path');
const fs = require('fs');
const pool = require('../db/pool');
const config = require('../config');
const { verifyToken } = require('../middleware/csrf');
const { Resend } = require('resend');

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

async function getActivePdf() {
  const { rows } = await pool.query(
    "SELECT * FROM resumes WHERE is_active = true AND file_type = 'pdf' LIMIT 1"
  );
  return rows[0] || null;
}

async function getActiveDocx() {
  const { rows } = await pool.query(
    "SELECT * FROM resumes WHERE is_active = true AND file_type = 'docx' LIMIT 1"
  );
  return rows[0] || null;
}

router.get('/', async (req, res, next) => {
  try {
    res.render('pages/home', { title: 'Home', settings: await getSettings(), turnstileSiteKey: config.turnstile.siteKey });
  } catch (e) { next(e); }
});

router.get('/resume', async (req, res, next) => {
  try {
    res.render('pages/resume', {
      title: 'Resume',
      settings: await getSettings(),
      resume:  await getActivePdf(),
      docx:    await getActiveDocx(),
    });
  } catch (e) { next(e); }
});

// Serve the active resume file (inline so it renders in the browser PDF viewer).
router.get('/resume/file/:filename', async (req, res, next) => {
  try {
    const resume = await getActivePdf();
    if (!resume) return res.status(404).render('errors/404', { title: 'Not found' });
    const filePath = path.join(config.uploads.dir, resume.filename);
    if (!fs.existsSync(filePath)) return res.status(404).render('errors/404', { title: 'Not found' });
    res.setHeader('Content-Type', resume.mime_type);
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(resume.original_name)}"`);
    fs.createReadStream(filePath).pipe(res);
  } catch (e) { next(e); }
});

router.get('/resume/docx/:filename', async (req, res, next) => {
  try {
    const docx = await getActiveDocx();
    if (!docx) return res.status(404).render('errors/404', { title: 'Not found' });
    const filePath = path.join(config.uploads.dir, docx.filename);
    if (!fs.existsSync(filePath)) return res.status(404).render('errors/404', { title: 'Not found' });
    res.setHeader('Content-Type', docx.mime_type);
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(docx.original_name)}"`);
    fs.createReadStream(filePath).pipe(res);
  } catch (e) { next(e); }
});

// Public contact form. Honeypot + CSRF + Verification; covered by your global rate limiter.
router.post('/contact', verifyToken, async (req, res, next) => {
  try {
    if (req.body.website) return res.redirect('/#contact');

    const name  = String(req.body.name    || '').trim().slice(0, 200);
    const email = String(req.body.email   || '').trim().slice(0, 200);
    const body  = String(req.body.message || '').trim().slice(0, 5000);

    if (!name || !email || !body) {
      req.flash('error', 'Please fill in all fields.');
      return res.redirect('/#contact');
    }

    const token = req.body['cf-turnstile-response'];
    if (!token) {
      req.flash('error', 'Please complete the CAPTCHA.');
      return res.redirect('/#contact');
    }
    const verify = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret: config.turnstile.secretKey, response: token }),
    });
    const verifyResult = await verify.json();
    if (!verifyResult.success) {
      req.flash('error', 'CAPTCHA check failed. Please try again.');
      return res.redirect('/#contact');
    }

    const crypto = require('crypto');
    const verifyToken = crypto.randomBytes(32).toString('hex');

    await pool.query(
      'INSERT INTO messages (name, email, body, token) VALUES ($1, $2, $3, $4)',
      [name, email, body, verifyToken]
    );

    if (config.resend.apiKey) {
      try {
        const { Resend } = require('resend');
        const resend = new Resend(config.resend.apiKey);
        const verifyUrl = `${config.siteUrl}/contact/verify/${verifyToken}`;
        await resend.emails.send({
          from: `Contact - josegasparmarin.com <${config.resend.from}>`,
          to:      email,
          subject: 'Please verify your message',
          text:    `Hi ${name},\n\nThank you so much for reaching out to me. Please click the link below to verify your message and send it.\n\n${verifyUrl}\n\nThis link expires in 24 hours. If you didn't submit this form, just ignore this email.`,
        });
      } catch (mailErr) {
        console.error('[contact] verification email failed:', mailErr.message);
      }
    }

    req.flash('success', 'Almost there! Check your email for a verification link.');
    res.redirect('/#contact');
  } catch (e) { next(e); }
});

router.get('/contact/verify/:token', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `UPDATE messages
       SET verified = true, token = null
       WHERE token = $1
         AND verified = false
         AND created_at > now() - interval '24 hours'
       RETURNING *`,
      [req.params.token]
    );

    if (!rows[0]) {
      return res.render('pages/verify', { title: 'Verification Failed', layout: 'layout', success: false });
    }

    const m = rows[0];

    if (config.resend.apiKey && config.resend.to) {
      try {
        const { Resend } = require('resend');
        const resend = new Resend(config.resend.apiKey);
        await resend.emails.send({
          from: `Contact - josegasparmarin.com <${config.resend.from}>`,
          to:       config.resend.to,
          reply_to: m.email,
          subject:  `New message from ${m.name}`,
          text:     `From: ${m.name} <${m.email}>\n\n${m.body}`,
        });
      } catch (mailErr) {
        console.error('[contact] notification email failed:', mailErr.message);
      }
    }

    res.render('pages/verify', { title: 'Message Verified', layout: 'layout', success: true });
  } catch (e) { next(e); }
});

module.exports = router;
