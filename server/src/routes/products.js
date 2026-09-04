// =====================================================================
// Routes — products
// =====================================================================
const express = require('express');
const db = require('../db');
const { authRequired, adminRequired } = require('../auth');

const router = express.Router();

// GET /api/products?category=&active= — list
router.get('/', (req, res) => {
  const { category, active } = req.query;
  let sql = 'SELECT * FROM products WHERE 1=1';
  const args = [];
  if (category) { sql += ' AND category = ?'; args.push(category); }
  if (active === '1' || active === 'true') { sql += ' AND active = 1'; }
  if (active === '0' || active === 'false') { sql += ' AND active = 0'; }
  sql += ' ORDER BY created_at DESC';
  const products = db.prepare(sql).all(...args).map(rowToDto);
  res.json({ products });
});

// GET /api/products/categories
router.get('/categories', (req, res) => {
  const rows = db.prepare('SELECT DISTINCT category FROM products WHERE category IS NOT NULL ORDER BY category').all();
  res.json({ categories: rows.map(r => r.category) });
});

// GET /api/products/:id
router.get('/:id', (req, res) => {
  const p = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!p) return res.status(404).json({ error: 'not_found' });
  res.json({ product: rowToDto(p) });
});

// POST /api/products — create (admin)
router.post('/', adminRequired, (req, res) => {
  const { name, subtitle, category, spec, price, original_price, stock, image, gradient, tags, description, commission_rate, active } = req.body || {};
  if (!name || !price) return res.status(400).json({ error: 'missing_fields' });
  const id = 'P' + String(Date.now()).slice(-6);
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO products (id, name, subtitle, category, spec, price, original_price, stock, sold, image, gradient, tags, description, commission_rate, active, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, name, subtitle, category, spec, price, original_price, stock || 0, image || '📦', gradient || 'linear-gradient(135deg, #ddd 0%, #bbb 100%)', (tags || []).join(','), description, commission_rate || 0.15, active === false ? 0 : 1, now);
  const p = db.prepare('SELECT * FROM products WHERE id = ?').get(id);
  res.json({ product: rowToDto(p) });
});

// PATCH /api/products/:id — update (admin)
router.patch('/:id', adminRequired, (req, res) => {
  const p = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!p) return res.status(404).json({ error: 'not_found' });
  const fields = ['name', 'subtitle', 'category', 'spec', 'price', 'original_price', 'stock', 'image', 'gradient', 'description', 'commission_rate', 'active'];
  const updates = [];
  const args = [];
  for (const f of fields) {
    if (req.body && req.body[f] !== undefined) {
      updates.push(`${f} = ?`);
      args.push(typeof req.body[f] === 'boolean' ? (req.body[f] ? 1 : 0) : req.body[f]);
    }
  }
  if (req.body && req.body.tags) {
    updates.push('tags = ?');
    args.push((req.body.tags || []).join(','));
  }
  if (updates.length === 0) return res.json({ product: rowToDto(p) });
  args.push(req.params.id);
  db.prepare(`UPDATE products SET ${updates.join(', ')} WHERE id = ?`).run(...args);
  const updated = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  log('admin', '系统管理员', 'product_update', `更新商品「${updated.name}」`, null);
  res.json({ product: rowToDto(updated) });
});

// POST /api/products/:id/stock — adjust stock (admin)
router.post('/:id/stock', adminRequired, (req, res) => {
  const { delta } = req.body || {};
  const p = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!p) return res.status(404).json({ error: 'not_found' });
  const newStock = Math.max(0, p.stock + Number(delta || 0));
  db.prepare('UPDATE products SET stock = ? WHERE id = ?').run(newStock, req.params.id);
  log('admin', '系统管理员', 'stock', `调整「${p.name}」库存 ${delta > 0 ? '+' : ''}${delta}（当前 ${newStock}）`, null);
  res.json({ stock: newStock });
});

// POST /api/products/:id/toggle-active — toggle active status
router.post('/:id/toggle-active', adminRequired, (req, res) => {
  const p = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!p) return res.status(404).json({ error: 'not_found' });
  const newActive = p.active ? 0 : 1;
  db.prepare('UPDATE products SET active = ? WHERE id = ?').run(newActive, req.params.id);
  log('admin', '系统管理员', 'product_toggle', `${newActive ? '上架' : '下架'}了「${p.name}」`, null);
  res.json({ active: !!newActive });
});

function rowToDto(p) {
  return {
    id: p.id,
    name: p.name,
    subtitle: p.subtitle,
    category: p.category,
    spec: p.spec,
    price: p.price,
    originalPrice: p.original_price,
    stock: p.stock,
    sold: p.sold,
    image: p.image,
    gradient: p.gradient,
    tags: p.tags ? p.tags.split(',') : [],
    description: p.description,
    commissionRate: p.commission_rate,
    active: !!p.active,
    createdAt: p.created_at,
  };
}

function log(uid, uname, action, detail, req) {
  db.prepare('INSERT INTO logs (user_id, user_name, action, detail, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(uid, uname, action, detail, new Date().toISOString());
}

module.exports = router;
