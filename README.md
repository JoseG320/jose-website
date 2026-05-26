# jose-website: My Portfolio Website!

This is my personal portfolio and content-managed website built with Node.js, Express, and PostgreSQL! Deployed as a containerized application behind an Nginx reverse proxy with automatic TLS.

---

## Features

**Public**
- About, projects, and contact sections
- Resume viewer with inline PDF and DOCX download
- Double opt-in contact form — messages are stored unverified until the sender clicks a verification link, then forwarded by email

**Admin (`/admin`)**
- Upload and manage hero and about-section photos
- Upload and activate PDF and DOCX resumes
- View, mark read, and delete verified contact messages
- Edit bio text and social links stored in the database

---

## Tech stack

| Layer | Choice |
|---|---|
| Runtime | Node.js (CommonJS) |
| Web framework | Express |
| Views | EJS server-side templates with layouts |
| Database | PostgreSQL via the `pg` driver |
| Sessions | `express-session` with a PostgreSQL-backed store |
| Auth | `bcryptjs` password hashing, session-based login |
| Email | Resend (transactional verification + notification) |
| Bot mitigation | Cloudflare Turnstile + honeypot fields |
| Containerization | Docker + Docker Compose |
| Reverse proxy / TLS | Nginx + Let's Encrypt |
| Frontend | Vanilla JS, hand-written CSS with light/dark theming |

---

## Architecture and notable decisions

**Server-side rendering with EJS.** Pages are rendered on the server and dynamic content is injected from the database at request time. A small amount of vanilla JS handles theme toggling, the mobile nav, scroll reveals, and asynchronous dashboard actions. Static assets are cache-busted on each deploy via a version query string so the browser always picks up CSS/JS changes.

**Database as the source of truth for content.** Rather than hardcoding bio text, links, and image references, these live in a `site_settings` table and are edited through the admin panel. The schema is created idempotently on boot, and incremental changes are applied through a small hand-rolled, tracked migration runner. Each migration runs exactly once and is recorded, so deploys are safe and repeatable.

**Resilient startup.** On boot the app retries the database connection before serving traffic and handles `SIGTERM`/`SIGINT` for graceful shutdown. This makes it robust to the container starting before the database is ready, and to clean restarts during redeploys.

**Defense in depth on authentication.** The admin login is protected by per-IP rate limiting, account lockout after repeated failures, constant-time password comparison to resist timing attacks, and a forced password change on first login for seeded accounts. Sessions are regenerated on login to prevent session fixation, and session cookies are HTTP-only, `SameSite`-scoped, and HTTPS-only in production.

**CSRF protection without a dependency.** State-changing requests are guarded with a synchronizer-token pattern implemented from scratch (the once-standard library for this is deprecated). The implementation handles a real-world edge case: on file-upload routes the token must be validated *after* the multipart parser runs, not before.

**Verified contact submissions.** The contact form is a double opt-in flow. A submission is stored unverified with a one-time token and a verification email is sent; only after the visitor clicks the link is the message marked verified and forwarded to the owner. Tokens expire after 24 hours. This is just to verify that the person who submitted the form is exactly who they say they are.

**Separation of static assets from user uploads.** Design assets (project screenshots) are committed to the repository and baked into the image, while admin-uploaded photos live in a separate directory backed by a persistent volume. Keeping these concerns apart means uploads survive redeploys while static assets stay reproducible and version-controlled. They overwrite each other.

**Containerized, reverse-proxied deployment.** The app and database run as containers; the application is not exposed directly to the internet but sits behind an Nginx reverse proxy that terminates TLS and forwards requests locally. Persistent data lives in named volumes so the database and uploaded files survive rebuilds. The server is hardened with key-based access, a default-deny firewall, and automatic security updates.

---

## Project structure

```
.
├── server.js              # Entry point: DB init + retry, graceful shutdown
├── src/
│   ├── app.js             # Express app: middleware, security headers, routes
│   ├── config.js          # Centralized env-driven configuration
│   ├── db/
│   │   ├── pool.js        # PostgreSQL connection pool
│   │   ├── init.js        # Idempotent schema + tracked migration runner
│   │   ├── schema.sql     # Table definitions
│   │   ├── migrations.sql # Incremental, marker-delimited migrations
│   │   └── seed.js        # Interactive admin account seeder
│   ├── middleware/        # Auth gates, CSRF, rate limiting
│   └── routes/            # public, auth, and admin route handlers
├── views/                 # EJS templates, layouts, and partials
├── public/                # CSS, JS, images, and static assets
├── Dockerfile             # Multi-stage build, runs as non-root
└── docker-compose.yaml    # App + PostgreSQL services and volumes
```

---

## Running locally

Requires Node.js 20+ and either Docker or a local PostgreSQL instance.

### With Docker (recommended)

```bash
cp .env.example .env        # then fill in the values
docker compose up --build
```

The app self-migrates the database on startup. Create the first admin account once the stack is running:

```bash
docker compose exec app npm run seed
```

Then visit `http://localhost:3000` and log in at `/admin/login`.

### Without Docker

```bash
npm install
cp .env.example .env        # configure PG* vars to point at your PostgreSQL
npm run seed                # create the admin account
npm run dev                 # starts with file watching
```

---

## Configuration

All configuration is supplied through environment variables; see the `.env.example` file for the full list. Key groups:

- **App** — `PORT`, `SITE_URL`, and `TRUST_PROXY` (set when running behind a reverse proxy).
- **Database** — `PGUSER`, `PGPASSWORD`, `PGDATABASE`; the connection string is assembled automatically.
- **Session** — `SESSION_SECRET` (required in production).
- **Email** — `RESEND_API_KEY`, `RESEND_FROM`, `RESEND_TO`.
- **Bot mitigation** — `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`.

Secrets are never committed; the production environment file lives only on the server.

---

## About

Built and maintained by JoseG320. This site is both my portfolio and a demonstration of building, securing, and operating a full-stack application end to end.