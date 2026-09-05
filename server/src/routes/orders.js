// =====================================================================
// Routes — orders: create, list, get, pay, ship, confirm, cancel
// =====================================================================
const express = require('express');
const db = require('../db');
const { authRequired, adminRequired } = require('../auth');

const router = express.Router();

// GET /api/orders?status=&source=&q=&mine=1 — list
router.get('/', authRequired, (req, res) => {
  const { status, source, q, mine } = req.query;
  let sql = 'SELECT * FROM orders WHERE 1=1';
  const args = [];
  if (req.user.is_admin) {
    if (mine === '1') { sql += ' AND user_id = ?'; args.push(req.user.id); }
  } else {
    sql += ' AND user_id = ?';
    args.push(req.user.id);
  }
  if (status) { sql += ' AND status = ?'; args.push(status); }
  if (source) { sql += ' AND source = ?'; args.push(source); }
  if (q) {
    sql += ' AND (id LIKE ? OR user_name LIKE ? OR product_name LIKE ?)';
    const like = '%' + q + '%';
    args.push(like, like, like);
  }
  sql += ' ORDER BY created_at DESC';
  const orders = db.prepare(sql).all(...args).map(rowToDto);
  res.json({ orders });
});

// GET /api/orders/:id
router.get('/:id', authRequired, (req, res) => {
  const o = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
  if (!o) return res.status(404).json({ error: 'not_found' });
  if (!req.user.is_admin && o.user_id !== req.user.id) return res.status(403).json({ error: 'forbidden' });
  res.json({ order: rowToDto(o) });
});

// POST /api/orders — create order
router.post('/', authRequired, (req, res) => {
  const { productId, qty, address, source, partnerId } = req.body || {};
  if (!productId || !qty) return res.status(400).json({ error: 'missing_fields' });
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(productId);
  if (!product) return res.status(404).json({ error: 'product_not_found' });
  if (!product.active) return res.status(400).json({ error: 'product_inactive', message: '商品已下架' });
  if (product.stock < qty) return res.status(400).json({ error: 'insufficient_stock', message: '库存不足' });

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  const orderId = 'SO' + Date.now();
  const now = new Date().toISOString();
  const total = +(product.price * qty).toFixed(2);
  const shippingFee = qty * 4;
  const finalSource = source || (user.is_partner ? 'partner' : 'direct');
  const finalPartner = finalSource === 'partner' ? (partnerId || user.id) : null;

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO orders (id, user_id, user_name, product_id, product_name, product_image, spec, price, qty, total, status, source, partner_id, address, shipping_fee, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'paid', ?, ?, ?, ?, ?, ?)
    `).run(orderId, user.id, user.name, product.id, product.name, product.image, product.spec, product.price, qty, total, finalSource, finalPartner, address || '上海市浦东新区世纪大道 100 号', shippingFee, now, now);
    db.prepare('UPDATE products SET stock = stock - ?, sold = sold + ? WHERE id = ?').run(qty, qty, productId);
    if (finalSource === 'partner' && finalPartner) {
      const commAmount = +(total * product.commission_rate).toFixed(2);
      db.prepare(`
        INSERT INTO commissions (order_id, partner_id, product_name, amount, rate, status, created_at)
        VALUES (?, ?, ?, ?, ?, 'pending', ?)
      `).run(orderId, finalPartner, product.name, commAmount, product.commission_rate, now);
    }
    db.prepare('INSERT INTO logs (user_id, user_name, action, detail, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(user.id, user.name, 'order', `${finalSource === 'partner' ? '通过合伙人渠道' : '直接'}下单「${product.name}」¥${total}`, now);
  });
  tx();
  const o = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
  res.json({ order: rowToDto(o) });
});

// POST /api/orders/:id/pay — simulate pay
router.post('/:id/pay', authRequired, (req, res) => {
  const o = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
  if (!o) return res.status(404).json({ error: 'not_found' });
  if (o.user_id !== req.user.id && !req.user.is_admin) return res.status(403).json({ error: 'forbidden' });
  if (o.status !== 'pending_pay') return res.status(400).json({ error: 'invalid_state' });
  const now = new Date().toISOString();
  db.prepare("UPDATE orders SET status = 'paid', updated_at = ? WHERE id = ?").run(now, req.params.id);
  log(o.user_id, o.user_name, 'pay', `订单「${req.params.id}」已完成支付`, now);
  res.json({ order: rowToDto(db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id)) });
});

// POST /api/orders/:id/ship — admin ships
router.post('/:id/ship', adminRequired, (req, res) => {
  const o = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
  if (!o) return res.status(404).json({ error: 'not_found' });
  if (o.status !== 'paid') return res.status(400).json({ error: 'invalid_state', message: '只能对待发货订单发货' });
  const companies = ['顺丰速运', '圆通速递', '中通快递', '京东物流'];
  const company = companies[Math.floor(Math.random() * companies.length)];
  const trackingNo = 'TN' + Math.floor(Math.random() * 1e10).toString().padStart(10, '0');
  const now = new Date().toISOString();
  db.prepare("UPDATE orders SET status = 'shipped', tracking_company = ?, tracking_no = ?, updated_at = ? WHERE id = ?").run(company, trackingNo, now, req.params.id);
  log(o.user_id, o.user_name, 'ship', `订单「${req.params.id}」已发货，${company} ${trackingNo}`, now);
  res.json({ order: rowToDto(db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id)) });
});

// POST /api/orders/:id/confirm — user confirms delivery
router.post('/:id/confirm', authRequired, (req, res) => {
  const o = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
  if (!o) return res.status(404).json({ error: 'not_found' });
  if (o.user_id !== req.user.id && !req.user.is_admin) return res.status(403).json({ error: 'forbidden' });
  if (o.status !== 'shipped') return res.status(400).json({ error: 'invalid_state' });
  const now = new Date().toISOString();
  const tx = db.transaction(() => {
    db.prepare("UPDATE orders SET status = 'delivered', updated_at = ? WHERE id = ?").run(now, req.params.id);
    // Settle commission
    db.prepare("UPDATE commissions SET status = 'settled', settled_at = ? WHERE order_id = ? AND status = 'pending'").run(now, req.params.id);
    // Update partner commission total
    const comm = db.prepare("SELECT * FROM commissions WHERE order_id = ?").get(req.params.id);
    if (comm) {
      db.prepare('UPDATE users SET commission_total = commission_total + ? WHERE id = ?').run(comm.amount, comm.partner_id);
    }
  });
  tx();
  log(o.user_id, o.user_name, 'confirm', `订单「${req.params.id}」已确认收货`, now);
  res.json({ order: rowToDto(db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id)) });
});

// POST /api/orders/:id/cancel
router.post('/:id/cancel', authRequired, (req, res) => {
  const o = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
  if (!o) return res.status(404).json({ error: 'not_found' });
  if (o.user_id !== req.user.id && !req.user.is_admin) return res.status(403).json({ error: 'forbidden' });
  if (!['pending_pay', 'paid'].includes(o.status)) return res.status(400).json({ error: 'invalid_state' });
  const now = new Date().toISOString();
  const tx = db.transaction(() => {
    db.prepare("UPDATE orders SET status = 'cancelled', updated_at = ? WHERE id = ?").run(now, req.params.id);
    // Restore stock
    db.prepare('UPDATE products SET stock = stock + ?, sold = sold - ? WHERE id = ?').run(o.qty, o.qty, o.product_id);
  });
  tx();
  log(o.user_id, o.user_name, 'cancel', `订单「${req.params.id}」已取消`, now);
  res.json({ order: rowToDto(db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id)) });
});

// DELETE /api/orders/:id — 用户删除已结束订单（仅 delivered/cancelled，且仅本人）
router.delete('/:id', authRequired, (req, res) => {
  const o = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
  if (!o) return res.status(404).json({ error: 'not_found' });
  if (o.user_id !== req.user.id && !req.user.is_admin) return res.status(403).json({ error: 'forbidden' });
  if (!['delivered', 'cancelled'].includes(o.status)) {
    return res.status(400).json({ error: 'invalid_state', message: '仅已完成或已取消的订单可删除' });
  }
  db.prepare('DELETE FROM orders WHERE id = ?').run(req.params.id);
  res.json({ ok: true, id: req.params.id });
});

const ORDER_STATUS_LABEL = {
  pending_pay: '待付款',
  paid: '待发货',
  shipped: '已发货',
  delivered: '已送达',
  cancelled: '已取消',
};
const ORDER_STATUS_COLOR = {
  pending_pay: '#f59e0b',
  paid: '#2b6cb0',
  shipped: '#7c3aed',
  delivered: '#2bb673',
  cancelled: '#8590a3',
};
router.get('/_meta/statuses', (req, res) => {
  res.json({ statuses: ORDER_STATUS_LABEL, colors: ORDER_STATUS_COLOR });
});

function rowToDto(o) {
  return {
    id: o.id,
    userId: o.user_id,
    userName: o.user_name,
    productId: o.product_id,
    productName: o.product_name,
    productImage: o.product_image,
    spec: o.spec,
    price: o.price,
    qty: o.qty,
    total: o.total,
    status: o.status,
    statusLabel: ORDER_STATUS_LABEL[o.status] || o.status,
    statusColor: ORDER_STATUS_COLOR[o.status] || '#666',
    source: o.source,
    partnerId: o.partner_id,
    address: o.address,
    trackingNo: o.tracking_no,
    trackingCompany: o.tracking_company,
    shippingFee: o.shipping_fee,
    createdAt: o.created_at,
    updatedAt: o.updated_at,
  };
}

function log(uid, uname, action, detail, time) {
  db.prepare('INSERT INTO logs (user_id, user_name, action, detail, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(uid, uname, action, detail, time || new Date().toISOString());
}

module.exports = router;
