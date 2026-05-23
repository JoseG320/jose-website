'use strict';

// Admin seeder:  
// npm run seed
// Prompts for a username and a TEMPORARY password, then creates the admin with
// must_change_password = true so the first login forces a strong password.

const readline = require('readline');
const bcrypt = require('bcryptjs');
const initDb = require('./init');
const pool = require('./pool');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

// Mask typed characters for password prompts (TTY only; piped input has no echo).
let muted = false;
const origWrite = rl._writeToOutput.bind(rl);
rl._writeToOutput = (s) => {
  if (muted && !s.includes('\n')) rl.output.write('*');
  else if (!muted) origWrite(s);
};

// Buffer lines so input that arrives all at once is never dropped.
const queue = [];
const waiters = [];
let closed = false;
rl.on('line', (line) => { const w = waiters.shift(); if (w) w(line); else queue.push(line); });
rl.on('close', () => { closed = true; while (waiters.length) waiters.shift()(null); });

function readLine() {
  return new Promise((resolve) => {
    if (queue.length) return resolve(queue.shift());
    if (closed) return resolve(null);
    waiters.push(resolve);
  });
}

async function ask(prompt, hide = false) {
  process.stdout.write(prompt);
  muted = hide;
  const line = await readLine();
  muted = false;
  if (hide) process.stdout.write('\n');
  return (line == null ? '' : line).trim();
}

(async () => {
  try {
    await initDb(); // ensure tables exist

    const username = (await ask('Admin username [admin]: ')) || 'admin';

    const existing = await pool.query('SELECT id FROM admins WHERE username = $1', [username]);
    if (existing.rows.length) {
      const ans = await ask(`User "${username}" already exists. Reset their password? [y/N]: `);
      if (ans.toLowerCase() !== 'y') { console.log('Aborted. No changes made.'); return finish(0); }
    }

    const pw = await ask('Temporary password: ', true);
    const pw2 = await ask('Confirm temporary password: ', true);

    if (!pw || pw.length < 6) { console.error('Temporary password must be at least 6 characters.'); return finish(1); }
    if (pw !== pw2) { console.error('Passwords do not match.'); return finish(1); }

    const hash = await bcrypt.hash(pw, 12);
    await pool.query(
      `INSERT INTO admins (username, password_hash, must_change_password)
       VALUES ($1, $2, true)
       ON CONFLICT (username)
       DO UPDATE SET password_hash = EXCLUDED.password_hash, must_change_password = true`,
      [username, hash]
    );

    console.log(`\n\u2714 Admin "${username}" is ready.`);
    console.log('  Log in at /admin/login with the temporary password.');
    console.log('  You will be asked to set a stronger password on first login.');
    return finish(0);
  } catch (err) {
    console.error('[seed] failed:', err.message);
    return finish(1);
  }
})();

async function finish(code) {
  rl.close();
  await pool.end().catch(() => {});
  process.exitCode = code;
}