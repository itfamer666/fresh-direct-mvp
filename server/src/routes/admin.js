// =====================================================================
// Routes — partners (合伙人), commissions, stats, logs
// =====================================================================
const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { authRequired, adminRequired } = require('../auth');

const router = express.Router();

// ── Partners ────────────────────────────────────────────────────────
router.get('/partners', adminRequired, (req, res) => {
  const { q } = req.query;
  let sql = 'SELECT id, name, avatar, phone, is_partner, parent_id, joined_at, commission_total FROM users WHERE is_partner = 1';
  const args = [];
  if (q) {
    sql += ' AND (name LIKE ? OR id LIKE ?)';
    const like = '%' + q + '%';
    args.push(like, like);
  }
  sql += ' ORDER BY joined_at DESC';
  const partners = db.prepare(sql).all(...args).map(rowToUser);
  res.json({ partners });
});

router.get('/users', adminRequired, (req, res) => {
  const { q, partner } = req.query;
  let sql = 'SELECT id, name, avatar, phone, is_partner, parent_id, joined_at, commission_total FROM users WHERE 1=1';
  const args = [];
  if (partner === '1') { sql += ' AND is_partner = 1'; }
  if (partner === '0') { sql += ' AND is_partner = 0'; }
  if (q) {
    sql += ' AND (name LIKE ? OR id LIKE ?)';
    const like = '%' + q + '%';
    args.push(like, like);
  }
  sql += ' ORDER BY joined_at DESC';
  res.json({ users: db.prepare(sql).all(...args).map(rowToUser) });
});

router.post('/users/:id/toggle-partner', adminRequired, (req, res) => {
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!u) return res.status(404).json({ error: 'not_found' });
  const newVal = u.is_partner ? 0 : 1;
  db.prepare('UPDATE users SET is_partner = ? WHERE id = ?').run(newVal, req.params.id);
  log('admin', '系统管理员', 'partner_toggle', `${newVal ? '设置' : '取消'}「${u.name}」为社区合伙人`);
  res.json({ is_partner: !!newVal });
});

// POST /api/users — create user/partner (admin)
router.post('/users', adminRequired, (req, res) => {
  const { name, phone, password, avatar, is_partner, parent_id } = req.body || {};
  if (!name || !phone || !password) {
    return res.status(400).json({ error: 'missing_fields', message: '姓名、手机号、密码为必填项' });
  }
  const exist = db.prepare('SELECT id FROM users WHERE phone = ?').get(phone);
  if (exist) return res.status(400).json({ error: 'phone_exists', message: '该手机号已被使用' });
  const id = 'U' + String(Date.now()).slice(-6);
  const hashed = bcrypt.hashSync(password, 8);
  db.prepare(`
    INSERT INTO users (id, name, avatar, phone, password, is_partner, parent_id, joined_at, commission_total)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
  `).run(id, name, avatar || '👤', phone, hashed, is_partner ? 1 : 0, parent_id || null, new Date().toISOString().slice(0, 10));
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  log('admin', '系统管理员', 'user_create', `新增${is_partner ? '合伙人' : '用户'}「${name}」（${phone}）`);
  res.json({ user: rowToUser(u) });
});

// PATCH /api/users/:id — update user/partner (admin)
router.patch('/users/:id', adminRequired, (req, res) => {
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!u) return res.status(404).json({ error: 'not_found' });
  const { name, phone, avatar, is_partner, parent_id, password } = req.body || {};
  const updates = [];
  const args = [];
  if (name !== undefined) { updates.push('name = ?'); args.push(name); }
  if (phone !== undefined) {
    if (phone !== u.phone) {
      const exist = db.prepare('SELECT id FROM users WHERE phone = ? AND id != ?').get(phone, u.id);
      if (exist) return res.status(400).json({ error: 'phone_exists', message: '该手机号已被其他用户使用' });
    }
    updates.push('phone = ?'); args.push(phone);
  }
  if (avatar !== undefined) { updates.push('avatar = ?'); args.push(avatar); }
  if (is_partner !== undefined) { updates.push('is_partner = ?'); args.push(is_partner ? 1 : 0); }
  if (parent_id !== undefined) { updates.push('parent_id = ?'); args.push(parent_id || null); }
  if (password) { updates.push('password = ?'); args.push(bcrypt.hashSync(password, 8)); }
  if (updates.length === 0) return res.json({ user: rowToUser(u) });
  args.push(req.params.id);
  db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...args);
  const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  log('admin', '系统管理员', 'user_update', `更新${updated.is_partner ? '合伙人' : '用户'}「${updated.name}」信息`);
  res.json({ user: rowToUser(updated) });
});

// ── Commissions ─────────────────────────────────────────────────────
router.get('/commissions', authRequired, (req, res) => {
  const { status } = req.query;
  let sql = 'SELECT c.*, u.name as partner_name, u.avatar as partner_avatar FROM commissions c LEFT JOIN users u ON c.partner_id = u.id WHERE 1=1';
  const args = [];
  if (!req.user.is_admin) {
    sql += ' AND c.partner_id = ?';
    args.push(req.user.id);
  }
  if (status) { sql += ' AND c.status = ?'; args.push(status); }
  sql += ' ORDER BY c.created_at DESC';
  const rows = db.prepare(sql).all(...args);
  res.json({ commissions: rows.map(rowToComm) });
});

router.post('/commissions/:id/settle', adminRequired, (req, res) => {
  const c = db.prepare('SELECT * FROM commissions WHERE id = ?').get(req.params.id);
  if (!c) return res.status(404).json({ error: 'not_found' });
  if (c.status === 'settled') return res.status(400).json({ error: 'already_settled' });
  const now = new Date().toISOString();
  const tx = db.transaction(() => {
    db.prepare("UPDATE commissions SET status = 'settled', settled_at = ? WHERE id = ?").run(now, req.params.id);
    db.prepare('UPDATE users SET commission_total = commission_total + ? WHERE id = ?').run(c.amount, c.partner_id);
  });
  tx();
  log('admin', '系统管理员', 'commission_settle', `结算佣金 ¥${c.amount} → ${c.partner_id}`);
  res.json({ commission: rowToComm(db.prepare('SELECT * FROM commissions WHERE id = ?').get(req.params.id)) });
});

// ── Stats ───────────────────────────────────────────────────────────
router.get('/stats/dashboard', adminRequired, (req, res) => {
  const all = db.prepare("SELECT * FROM orders WHERE status != 'cancelled'").all();
  const direct = all.filter(o => o.source === 'direct');
  const partner = all.filter(o => o.source === 'partner');
  const totalGMV = all.reduce((s, o) => s + o.total, 0);
  const directGMV = direct.reduce((s, o) => s + o.total, 0);
  const partnerGMV = partner.reduce((s, o) => s + o.total, 0);
  const pendingShip = all.filter(o => o.status === 'paid').length;
  const pendingComm = db.prepare("SELECT COALESCE(SUM(amount),0) as v FROM commissions WHERE status = 'pending'").get().v;
  const settledComm = db.prepare("SELECT COALESCE(SUM(amount),0) as v FROM commissions WHERE status = 'settled'").get().v;

  // Last 7 days GMV
  const today = new Date();
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today); d.setDate(today.getDate() - i);
    const stamp = d.toISOString().slice(0, 10);
    const gmv = all.filter(o => o.created_at.startsWith(stamp)).reduce((s, o) => s + o.total, 0);
    days.push({ date: `${d.getMonth() + 1}/${d.getDate()}`, gmv });
  }

  // Product ranking
  const products = db.prepare('SELECT * FROM products').all();
  const rank = products.map(p => ({
    ...p,
    soldCount: all.filter(o => o.product_id === p.id).reduce((s, o) => s + o.qty, 0),
    gmv: all.filter(o => o.product_id === p.id).reduce((s, o) => s + o.total, 0),
  })).sort((a, b) => b.gmv - a.gmv).slice(0, 5).map(p => ({
    id: p.id,
    name: p.name,
    image: p.image,
    gradient: p.gradient,
    soldCount: p.soldCount,
    gmv: p.gmv,
  }));

  // Channel split
  const total = directGMV + partnerGMV || 1;
  const channel = {
    direct: { count: direct.length, gmv: directGMV, percent: (directGMV / total * 100).toFixed(1) },
    partner: { count: partner.length, gmv: partnerGMV, percent: (partnerGMV / total * 100).toFixed(1) },
  };

  // Partner contribution
  const partners = db.prepare('SELECT * FROM users WHERE is_partner = 1').all();
  const partnerContribution = partners.map(p => ({
    id: p.id,
    name: p.name,
    avatar: p.avatar,
    gmv: all.filter(o => o.partner_id === p.id).reduce((s, o) => s + o.total, 0),
    orderCount: all.filter(o => o.partner_id === p.id).length,
  })).sort((a, b) => b.gmv - a.gmv);

  res.json({
    totalGMV, directGMV, partnerGMV, pendingShip,
    pendingComm, settledComm,
    directCount: direct.length, partnerCount: partner.length,
    days, rank, channel, partnerContribution,
  });
});

// ── Logs ────────────────────────────────────────────────────────────
router.get('/logs', adminRequired, (req, res) => {
  const rows = db.prepare('SELECT * FROM logs ORDER BY created_at DESC LIMIT 20').all();
  res.json({ logs: rows.map(r => ({
    id: r.id,
    userId: r.user_id,
    userName: r.user_name,
    action: r.action,
    detail: r.detail,
    time: r.created_at,
  })) });
});

// ── Partner self info ───────────────────────────────────────────────
router.get('/me/overview', authRequired, (req, res) => {
  if (!req.user.is_partner) {
    return res.json({ is_partner: false });
  }
  const myComm = db.prepare('SELECT * FROM commissions WHERE partner_id = ?').all(req.user.id);
  const myOrders = db.prepare('SELECT * FROM orders WHERE partner_id = ?').all(req.user.id);
  const total = myComm.reduce((s, c) => s + c.amount, 0);
  const settled = myComm.filter(c => c.status === 'settled').reduce((s, c) => s + c.amount, 0);
  const pending = myComm.filter(c => c.status === 'pending').reduce((s, c) => s + c.amount, 0);
  res.json({
    is_partner: true,
    total, settled, pending,
    orderCount: myOrders.length,
    commissions: myComm.map(rowToComm),
  });
});

function rowToUser(u) {
  return {
    id: u.id,
    name: u.name,
    avatar: u.avatar,
    phone: u.phone,
    is_partner: !!u.is_partner,
    parent_id: u.parent_id,
    joinedAt: u.joined_at,
    commissionTotal: u.commission_total || 0,
  };
}

function rowToComm(c) {
  return {
    id: c.id,
    orderId: c.order_id,
    partnerId: c.partner_id,
    partnerName: c.partner_name,
    partnerAvatar: c.partner_avatar,
    productName: c.product_name,
    amount: c.amount,
    rate: c.rate,
    status: c.status,
    createdAt: c.created_at,
    settledAt: c.settled_at,
  };
}

function log(uid, uname, action, detail) {
  db.prepare('INSERT INTO logs (user_id, user_name, action, detail, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(uid, uname, action, detail, new Date().toISOString());
}

module.exports = router;
