// =====================================================================
// Database — SQLite via better-sqlite3, with seed data on first run
// =====================================================================
const Database = require('better-sqlite3');
const path = require('path');
const bcrypt = require('bcryptjs');

const DB_PATH = path.join(__dirname, '..', 'data.db');
const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ── Schema ──────────────────────────────────────────────────────────
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  avatar       TEXT,
  phone        TEXT,
  password     TEXT,
  is_partner   INTEGER DEFAULT 0,
  parent_id    TEXT,
  joined_at    TEXT NOT NULL,
  commission_total REAL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS products (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  subtitle        TEXT,
  category        TEXT,
  spec            TEXT,
  price           REAL NOT NULL,
  original_price  REAL NOT NULL,
  stock           INTEGER DEFAULT 0,
  sold            INTEGER DEFAULT 0,
  image           TEXT,
  gradient        TEXT,
  tags            TEXT,
  description     TEXT,
  commission_rate REAL DEFAULT 0.15,
  active          INTEGER DEFAULT 1,
  created_at      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS orders (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL,
  user_name     TEXT NOT NULL,
  product_id    TEXT NOT NULL,
  product_name  TEXT NOT NULL,
  product_image TEXT,
  spec          TEXT,
  price         REAL NOT NULL,
  qty           INTEGER NOT NULL,
  total         REAL NOT NULL,
  status        TEXT NOT NULL,   -- pending_pay | paid | shipped | delivered | cancelled
  source        TEXT NOT NULL,   -- direct | partner
  partner_id    TEXT,
  address       TEXT,
  tracking_no   TEXT,
  tracking_company TEXT,
  shipping_fee  REAL DEFAULT 0,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS commissions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id    TEXT NOT NULL,
  partner_id  TEXT NOT NULL,
  product_name TEXT,
  amount      REAL NOT NULL,
  rate        REAL NOT NULL,
  status      TEXT NOT NULL,    -- pending | settled
  created_at  TEXT NOT NULL,
  settled_at  TEXT,
  FOREIGN KEY (order_id) REFERENCES orders(id),
  FOREIGN KEY (partner_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS logs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     TEXT,
  user_name   TEXT,
  action      TEXT,
  detail      TEXT,
  created_at  TEXT NOT NULL
);
`);

// ── Seed on first run ───────────────────────────────────────────────
const userCount = db.prepare('SELECT COUNT(*) as n FROM users').get().n;
if (userCount === 0) {
  console.log('[DB] Seeding initial data...');
  const now = new Date().toISOString();

  const pwd = bcrypt.hashSync('123456', 8);

  const insertUser = db.prepare(`INSERT INTO users (id, name, avatar, phone, password, is_partner, parent_id, joined_at, commission_total) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  insertUser.run('U001', '小张', '👨', '138****1234', pwd, 0, null, '2026-08-12', 0);
  insertUser.run('U002', '王芳', '👩', '139****5678', pwd, 1, 'U003', '2026-07-03', 428.5);
  insertUser.run('U003', '李姐·好货推荐官', '🧑', '136****9012', pwd, 1, null, '2026-06-15', 1862.4);
  insertUser.run('U004', '老王', '👨', '137****3456', pwd, 1, 'U003', '2026-08-22', 156.8);
  insertUser.run('admin', '系统管理员', '👨‍💼', 'admin', bcrypt.hashSync('admin123', 8), 0, null, '2026-01-01', 0);

  const insertProduct = db.prepare(`INSERT INTO products (id, name, subtitle, category, spec, price, original_price, stock, sold, image, gradient, tags, description, commission_rate, active, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`);
  const products = [
    ['P001', '云南农家现摘草莓', '红颜奶油 · 当日采摘', '水果', '净含量 500g / 盒', 39.9, 59.9, 86, 234, '🍓', 'linear-gradient(135deg, #ffb3b3 0%, #ff7a8a 100%)', '当日现摘,顺丰冷链', '云南曲靖基地直供，红颜奶油草莓，果实饱满、酸甜适中。清晨采摘、下午发货、24 小时送达您家。', 0.20],
    ['P002', '赣南脐橙 · 农家自种', '赣南丘陵 · 自然成熟', '水果', '净含量 5kg / 箱', 89.0, 128.0, 152, 412, '🍊', 'linear-gradient(135deg, #ffc488 0%, #ff9a3d 100%)', '农家自种,不催熟', '江西赣南山区农家自种脐橙，树龄 8 年以上，自然成熟不催熟。汁水充沛、酸甜适口、果肉细腻。', 0.18],
    ['P003', '云南野生蜂蜜', '土蜂养殖 · 自然结晶', '滋补', '净含量 500g / 罐', 168.0, 218.0, 42, 156, '🍯', 'linear-gradient(135deg, #ffe066 0%, #ffae3d 100%)', '农家土蜂蜜,自然结晶', '云南哀牢山野生土蜂养殖，每年只取 1-2 次，自然结晶无添加。波美度 42° 以上，活性酶丰富。', 0.25],
    ['P004', '东北五常稻花香大米', '稻田鸭除草 · 5KG', '粮油', '净含量 5kg / 袋', 99.0, 138.0, 218, 687, '🍚', 'linear-gradient(135deg, #f7f0d8 0%, #e3d0a3 100%)', '稻鸭共作,当季新米', '黑龙江五常市民乐乡稻花香 2 号稻种，稻田鸭除草、太阳能杀虫灯，不施农药化肥。新米清香、口感软糯。', 0.15],
    ['P005', '云南薄皮核桃', '当季新货 · 手工剥壳', '坚果', '净含量 1kg / 袋', 49.0, 79.0, 128, 320, '🌰', 'linear-gradient(135deg, #d4b896 0%, #a08462 100%)', '当季新货,皮薄易剥', '云南大理高山核桃产地直供，今年新货采收，手工剥壳晾晒。皮薄如纸、一捏即开、油香酥脆。', 0.20],
    ['P006', '山东蒙阴黄桃', '果园直发 · 当季鲜果', '水果', '净含量 4kg / 箱', 69.0, 99.0, 0, 412, '🍑', 'linear-gradient(135deg, #ffe0a8 0%, #ffb86b 100%)', '果园直发,黄肉桃', '山东蒙阴县山坡果园黄桃，果园直发无中间商。果肉金黄、酸甜浓郁、汁水丰富。', 0.18],
  ];
  products.forEach(p => insertProduct.run(p[0], p[1], p[2], p[3], p[4], p[5], p[6], p[7], p[8], p[9], p[10], p[11], p[12], p[13], now));
  // P006 sold out → mark inactive
  db.prepare('UPDATE products SET active = 0 WHERE id = ?').run('P006');

  const insertOrder = db.prepare(`INSERT INTO orders (id, user_id, user_name, product_id, product_name, product_image, spec, price, qty, total, status, source, partner_id, address, tracking_no, tracking_company, shipping_fee, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const orders = [
    ['SO20260824001', 'U001', '小张', 'P001', '云南农家现摘草莓', '🍓', '500g/盒', 39.9, 2, 79.8, 'delivered', 'direct', null, '上海市浦东新区世纪大道 100 号', 'SF1234567890', '顺丰速运', 8, '2026-08-24T10:32:00', '2026-08-26T14:20:00'],
    ['SO20260825001', 'U002', '王芳', 'P002', '赣南脐橙 · 农家自种', '🍊', '5kg/箱', 89.0, 1, 89.0, 'shipped', 'partner', 'U002', '浙江省杭州市西湖区文一路 200 号', 'YT8765432109', '圆通速递', 10, '2026-08-25T14:18:00', '2026-08-25T16:00:00'],
    ['SO20260825002', 'U004', '老王', 'P003', '云南野生蜂蜜', '🍯', '500g/罐', 168.0, 1, 168.0, 'paid', 'partner', 'U004', '江苏省苏州市姑苏区人民路 50 号', null, null, 0, '2026-08-25T16:42:00', '2026-08-25T16:42:00'],
    ['SO20260826001', 'U001', '小张', 'P004', '东北五常稻花香大米', '🍚', '5kg/袋', 99.0, 1, 99.0, 'pending_pay', 'direct', null, '上海市浦东新区世纪大道 100 号', null, null, 6, '2026-08-26T09:15:00', '2026-08-26T09:15:00'],
    ['SO20260826002', 'U004', '老王', 'P005', '云南薄皮核桃', '🌰', '1kg/袋', 49.0, 2, 98.0, 'pending_pay', 'partner', 'U004', '江苏省苏州市姑苏区人民路 50 号', null, null, 0, '2026-08-26T11:08:00', '2026-08-26T11:08:00'],
    ['SO20260827001', 'U002', '王芳', 'P001', '云南农家现摘草莓', '🍓', '500g/盒', 39.9, 3, 119.7, 'shipped', 'partner', 'U002', '浙江省杭州市西湖区文一路 200 号', 'SF2345678901', '顺丰速运', 12, '2026-08-27T08:22:00', '2026-08-27T10:00:00'],
  ];
  orders.forEach(o => insertOrder.run(...o));

  const insertComm = db.prepare(`INSERT INTO commissions (order_id, partner_id, product_name, amount, rate, status, created_at, settled_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
  insertComm.run('SO20260825001', 'U002', '赣南脐橙 · 农家自种', 16.02, 0.18, 'settled', '2026-08-25T14:18:00', '2026-09-01T14:18:00');
  insertComm.run('SO20260825002', 'U004', '云南野生蜂蜜', 42.0, 0.25, 'pending', '2026-08-25T16:42:00', null);
  insertComm.run('SO20260827001', 'U002', '云南农家现摘草莓', 23.94, 0.20, 'pending', '2026-08-27T08:22:00', null);
  insertComm.run('SO20260826002', 'U004', '云南薄皮核桃', 19.6, 0.20, 'pending', '2026-08-26T11:08:00', null);

  const insertLog = db.prepare(`INSERT INTO logs (user_id, user_name, action, detail, created_at) VALUES (?, ?, ?, ?, ?)`);
  const logs = [
    ['U002', '王芳', 'share_earn', '推广「云南农家现摘草莓」获得 ¥23.94 佣金', '2026-08-27T08:32:00'],
    ['U004', '老王', 'order', '通过分享链接下单「云南薄皮核桃」¥98.0', '2026-08-26T11:08:00'],
    ['admin', '系统管理员', 'stock', '调整「赣南脐橙」库存 +30', '2026-08-25T16:42:00'],
    ['U002', '王芳', 'order', '下单「赣南脐橙」¥89.0，渠道：合伙人', '2026-08-25T14:18:00'],
  ];
  logs.forEach(l => insertLog.run(...l));

  console.log('[DB] Seed complete');
}

module.exports = db;
