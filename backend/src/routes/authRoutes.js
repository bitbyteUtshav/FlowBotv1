
const express = require('express');
const crypto = require('crypto');
const pool = require('../config/db');
const { requireAuth, issueSession } = require('../middleware/auth');
const router = express.Router();
const validEmail = v => typeof v === 'string' && v.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
const hashPassword = (password, salt = crypto.randomBytes(16).toString('hex')) => new Promise((resolve, reject) =>
  crypto.scrypt(password, salt, 64, (e, k) => e ? reject(e) : resolve({ salt, hash: k.toString('hex') })));
const verifyPassword = async (password, salt, hash) => {
  const actual = Buffer.from((await hashPassword(password, salt)).hash, 'hex');
  const expected = Buffer.from(hash || '', 'hex');
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
};
const sessionMeta = req => ({ userAgent: req.get('user-agent'), ip: req.ip });
router.post('/register', async (req, res, next) => {
  const name = String(req.body?.name || '').trim().slice(0, 120);
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = req.body?.password;
  if (!name || !validEmail(email) || typeof password !== 'string' || password.length < 6 || password.length > 256)
    return res.status(400).json({ error: 'নাম, সঠিক ইমেইল এবং কমপক্ষে ৬ অক্ষরের পাসওয়ার্ড দিন।' });
  let client;
  try {
    client = await pool.connect();
    const h = await hashPassword(password);
    await client.query('BEGIN');
    const u = (await client.query('INSERT INTO users(name,email,password_hash,password_salt) VALUES($1,$2,$3,$4) RETURNING id,name,email', [name,email,h.hash,h.salt])).rows[0];
    const ws = (await client.query('INSERT INTO workspaces(name,owner_user_id) VALUES($1,$2) RETURNING id,name', [`${name}'s Workspace`,u.id])).rows[0];
    await client.query("INSERT INTO workspace_members(workspace_id,user_id,role) VALUES($1,$2,'owner')", [ws.id,u.id]);
    await client.query('COMMIT');
    const token = await issueSession(u.id, 43200, sessionMeta(req));
    res.status(201).json({ success: true, token, user: u, workspace: ws });
  } catch (e) {
    if (client) await client.query('ROLLBACK').catch(()=>{});
    if (e.code === '23505') return res.status(409).json({ error: 'এই ইমেইল দিয়ে অ্যাকাউন্ট রয়েছে।' });
    next(e);
  } finally { if (client) client.release(); }
});
router.post('/login', async (req, res, next) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase(), password = req.body?.password;
    if (!validEmail(email) || typeof password !== 'string') return res.status(400).json({ error: 'সঠিক ইমেইল ও পাসওয়ার্ড দিন।' });
    const u = (await pool.query('SELECT id,name,email,password_hash,password_salt FROM users WHERE email=$1', [email])).rows[0];
    if (!u || !u.password_salt || !(await verifyPassword(password, u.password_salt, u.password_hash)))
      return res.status(401).json({ error: 'ইমেইল অথবা পাসওয়ার্ড সঠিক নয়।' });
    const token = await issueSession(u.id, 43200, sessionMeta(req));
    res.json({ success: true, token, user: { id: u.id, name: u.name, email: u.email } });
  } catch (e) { next(e); }
});
router.get('/me', requireAuth, (req, res) => res.json({ user: req.user }));
router.post('/logout', requireAuth, async (req, res, next) => {
  try {
    await pool.query('UPDATE auth_sessions SET revoked_at=NOW() WHERE id=$1 AND revoked_at IS NULL', [req.sessionId]);
    res.json({ success: true });
  } catch (e) { next(e); }
});
router.post('/logout-all', requireAuth, async (req, res, next) => {
  try {
    await pool.query('UPDATE auth_sessions SET revoked_at=NOW() WHERE user_id=$1 AND revoked_at IS NULL', [req.user.id]);
    res.json({ success: true });
  } catch (e) { next(e); }
});
module.exports = router;
