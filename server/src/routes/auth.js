// =====================================================================
// Routes — auth: login (user + admin), current user info
// =====================================================================
const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { sign, authRequired } = require('../auth');

const router = express.Router();

// POST /api/auth/login { phone, password }
router.post('/login', (req, res) => {
  const { phone, password } = req.body || {};
  if (!phone || !password) return res.status(400).json({ error: 'missing_fields' });
  const user = db.prepare('SELECT * FROM users WHERE phone = ? OR id = ?').get(phone, phone);
  if (!user) return res.status(401).json({ error: 'invalid_credentials', message: '账号不存在' });
  if (!bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: 'invalid_credentials', message: '密码错误' });
  }
  const token = sign(user);
  res.json({ token, user: sanitize(user) });
});

// GET /api/auth/me — current user
router.get('/me', authRequired, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ error: 'not_found' });
  res.json({ user: sanitize(user) });
});

// POST /api/auth/switch-user — demo helper for switching identity
router.post('/switch-user', (req, res) => {
  const { userId } = req.body || {};
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!user) return res.status(404).json({ error: 'not_found' });
  const token = sign(user);
  res.json({ token, user: sanitize(user) });
});

function sanitize(u) {
  const { password, ...rest } = u;
  return {
    ...rest,
    is_partner: !!u.is_partner,
    is_admin: u.id === 'admin',
  };
}

module.exports = router;
