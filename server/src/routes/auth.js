// =====================================================================
// Routes — auth: register, login, profile, password
// =====================================================================
const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { sign, authRequired } = require('../auth');

const router = express.Router();

// 手机号格式：1[3-9]开头的 11 位数字（注册时严格校验；登录兼容已脱敏账号如 138****1234）
const PHONE_RE = /^1[3-9]\d{9}$/;
function isValidPhone(p) { return typeof p === 'string' && PHONE_RE.test(p); }

// 工具：从已存在的用户中挑选下一个 U0xx ID
function nextUserId() {
  const row = db.prepare("SELECT id FROM users WHERE id LIKE 'U0%' ORDER BY id DESC LIMIT 1").get();
  if (!row) return 'U001';
  const n = parseInt(row.id.slice(1), 10);
  return 'U' + String(n + 1).padStart(3, '0');
}

// 工具：脱敏手机号显示
function maskPhone(phone) {
  if (!phone || phone.length < 11) return phone || '';
  return phone.slice(0, 3) + '****' + phone.slice(7);
}

function sanitize(u) {
  if (!u) return null;
  const { password, ...rest } = u;
  return {
    ...rest,
    phone: maskPhone(u.phone),
    is_partner: !!u.is_partner,
    is_admin: u.id === 'admin',
  };
}

// POST /api/auth/register { phone, password, name, avatar? }
router.post('/register', (req, res) => {
  const { phone, password, name, avatar } = req.body || {};
  if (!phone || !password || !name) return res.status(400).json({ error: 'missing_fields', message: '手机号、密码、昵称必填' });
  if (!isValidPhone(phone)) return res.status(400).json({ error: 'invalid_phone', message: '手机号格式错误（需 11 位数字，1[3-9] 开头）' });
  if (String(password).length < 6) return res.status(400).json({ error: 'weak_password', message: '密码至少 6 位' });
  if (String(name).length > 20) return res.status(400).json({ error: 'name_too_long', message: '昵称不能超过 20 个字符' });

  // 唯一性：手机号（已脱敏或完整）都不能重复
  const exists = db.prepare('SELECT id FROM users WHERE phone = ?').get(phone);
  if (exists) return res.status(409).json({ error: 'phone_taken', message: '该手机号已注册' });

  const now = new Date().toISOString();
  const id = nextUserId();
  const pwd = bcrypt.hashSync(String(password), 8);
  const finalAvatar = (avatar && String(avatar).length <= 4) ? String(avatar) : '👤';
  db.prepare(`INSERT INTO users (id, name, avatar, phone, password, is_partner, parent_id, joined_at, commission_total) VALUES (?, ?, ?, ?, ?, 0, NULL, ?, 0)`)
    .run(id, String(name).trim(), finalAvatar, phone, pwd, now);
  db.prepare('INSERT INTO logs (user_id, user_name, action, detail, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(id, String(name).trim(), 'register', '注册新用户', now);

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  const token = sign(user);
  res.json({ token, user: sanitize(user) });
});

// POST /api/auth/login { phone, password }
router.post('/login', (req, res) => {
  const { phone, password } = req.body || {};
  if (!phone || !password) return res.status(400).json({ error: 'missing_fields' });
  // 登录时兼容「完整手机号」「已脱敏的手机号（138****1234）」「用户 ID」
  let user = db.prepare('SELECT * FROM users WHERE phone = ? OR id = ?').get(phone, phone);
  if (!user) {
    // 尝试按脱敏格式还原后匹配
    const m = String(phone).match(/^(\d{3})\*{4}(\d{4})$/);
    if (m) user = db.prepare('SELECT * FROM users WHERE phone LIKE ?').get(m[1] + '%' + m[2]);
  }
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

// PATCH /api/auth/me — 修改昵称 / 头像（不允许改手机号、不允许改 is_partner）
router.patch('/me', authRequired, (req, res) => {
  const { name, avatar } = req.body || {};
  const me = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!me) return res.status(404).json({ error: 'not_found' });
  if (me.is_admin) return res.status(403).json({ error: 'forbidden', message: '管理员账号不可通过此接口修改' });

  const fields = [];
  const args = [];
  if (typeof name === 'string' && name.trim()) {
    if (name.trim().length > 20) return res.status(400).json({ error: 'name_too_long' });
    fields.push('name = ?'); args.push(name.trim());
  }
  if (typeof avatar === 'string' && avatar.length > 0 && avatar.length <= 4) {
    fields.push('avatar = ?'); args.push(avatar);
  }
  if (!fields.length) return res.status(400).json({ error: 'no_fields', message: '没有可修改的字段' });

  args.push(req.user.id);
  db.prepare(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`).run(...args);
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  res.json({ user: sanitize(user) });
});

// POST /api/auth/change-password { oldPassword, newPassword }
router.post('/change-password', authRequired, (req, res) => {
  const { oldPassword, newPassword } = req.body || {};
  if (!oldPassword || !newPassword) return res.status(400).json({ error: 'missing_fields', message: '请填写原密码和新密码' });
  if (String(newPassword).length < 6) return res.status(400).json({ error: 'weak_password', message: '新密码至少 6 位' });
  const me = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!me) return res.status(404).json({ error: 'not_found' });
  if (me.is_admin) return res.status(403).json({ error: 'forbidden', message: '管理员账号不可通过此接口修改' });
  if (!bcrypt.compareSync(String(oldPassword), me.password)) {
    return res.status(401).json({ error: 'wrong_old_password', message: '原密码错误' });
  }
  const pwd = bcrypt.hashSync(String(newPassword), 8);
  db.prepare('UPDATE users SET password = ? WHERE id = ?').run(pwd, req.user.id);
  res.json({ ok: true });
});

// POST /api/auth/switch-user — demo helper for switching identity
router.post('/switch-user', (req, res) => {
  const { userId } = req.body || {};
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!user) return res.status(404).json({ error: 'not_found' });
  const token = sign(user);
  res.json({ token, user: sanitize(user) });
});

module.exports = router;
