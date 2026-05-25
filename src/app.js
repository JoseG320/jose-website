'use strict';

const path = require('path');
const express = require('express');
const session = require('express-session');
const PgSession = require('connect-pg-simple')(session);
const expressLayouts = require('express-ejs-layouts');
const helmet = require('helmet');
const morgan = require('morgan');
const flash = require('connect-flash');

const config = require('./config');
const pool = require('./db/pool');
const { injectAuthLocals } = require('./middleware/auth');
const { generateToken } = require('./middleware/csrf');
const { globalLimiter } = require('./middleware/rateLimit');

// ROUTES
const publicRoutes = require('./routes/public');
const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');

const app = express();

// Behind a reverse proxy? Trust it so secure cookies + client IPs work.
if (config.trustProxy) app.set('trust proxy', config.trustProxy);

// VIEWS
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '..', 'views'));
app.use(expressLayouts);
app.set('layout', 'layout');

// HELMET SECURITY HEADERS
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", 'https://challenges.cloudflare.com'],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:'],
        objectSrc: ["'self'"], // important for embedding the resume PDF
        frameSrc: ["'self'", 'https://challenges.cloudflare.com'],
        upgradeInsecureRequests: config.isProd ? [] : null,
      },
    },
  })
);

// LOGGING
app.use(morgan(config.isProd ? 'combined' : 'dev'));

// BODY PARSING
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

// ASSETS
// In dev: never cache, so edits show up immediately.
// In prod: cache hard (1 year) BUT we bust the cache via ?v= below.
app.use(express.static(path.join(__dirname, '..', 'public'), {
  etag: true,
  maxAge: config.isProd ? '1y' : 0,
  setHeaders: (res) => {
    if (!config.isProd) res.setHeader('Cache-Control', 'no-store');
  },
}));

// RATE LIMITING
app.use(globalLimiter);

// SESSIONS
app.use(
  session({
    store: new PgSession({ pool, tableName: 'session', createTableIfMissing: false }),
    name: 'connect.sid',
    secret: config.sessionSecret,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: config.isProd, // requires HTTPS in prod
      maxAge: 1000 * 60 * 60 * 8, // 8 hours
    },
  })
);

// FLASH
app.use(flash());
app.use(injectAuthLocals);
app.use(generateToken);
app.use((req, res, next) => {
  res.locals.flashSuccess = req.flash('success');
  res.locals.flashError = req.flash('error');
  res.locals.currentPath = req.path;
  next();
});

// A value that changes whenever the server restarts, used to bust CSS/JS caches.
const ASSET_VERSION = String(Date.now());
app.use((req, res, next) => {
  res.locals.assetVersion = ASSET_VERSION;
  next();
});

app.use((req, res, next) => {
  res.locals.siteUrl     = config.siteUrl;
  res.locals.currentPath = req.path;
  next();
});

// PAGE ROUTES
app.use('/', publicRoutes);
app.use('/admin', authRoutes); // /admin/login, /admin/logout
app.use('/admin', adminRoutes); // /admin dashboard


module.exports = app;
