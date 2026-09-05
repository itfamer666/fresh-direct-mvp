// =====================================================================
// Unified server: API + static files for both PC admin and mobile
// =====================================================================
const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('./db');

const authRoutes = require('./routes/auth');
const productRoutes = require('./routes/products');
const orderRoutes = require('./routes/orders');
const adminRoutes = require('./routes/admin');
const uploadRoutes = require('./routes/upload');

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

// API
app.get('/api/health', (req, res) => {
  const userCount = db.prepare('SELECT COUNT(*) as n FROM users').get().n;
  const productCount = db.prepare('SELECT COUNT(*) as n FROM products').get().n;
  const orderCount = db.prepare('SELECT COUNT(*) as n FROM orders').get().n;
  res.json({ status: 'ok', time: new Date().toISOString(), counts: { users: userCount, products: productCount, orders: orderCount } });
});

app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api', uploadRoutes);
app.use('/api', adminRoutes);

// Static — PC admin at /admin, mobile at / (root), uploads at /uploads
const ADMIN_DIR = path.join(__dirname, '..', '..', 'public-admin');
const MP_DIR    = path.join(__dirname, '..', '..', 'public-mp');
const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');

app.use('/admin', express.static(ADMIN_DIR));
app.use('/mp',    express.static(MP_DIR));
app.use('/uploads', express.static(UPLOADS_DIR, { maxAge: '7d' }));
app.use('/',      express.static(MP_DIR));  // mobile is the default root

// Fallback for SPA routes (rare since we use hash)
app.get('*', (req, res) => {
  if (req.path.startsWith('/admin')) return res.sendFile(path.join(ADMIN_DIR, 'index.html'));
  if (req.path.startsWith('/mp')) return res.sendFile(path.join(MP_DIR, 'index.html'));
  res.sendFile(path.join(MP_DIR, 'index.html'));
});

app.use((req, res) => res.status(404).json({ error: 'not_found', path: req.path }));
app.use((err, req, res, next) => {
  console.error('[ERR]', err);
  res.status(500).json({ error: 'server_error', message: err.message });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🚀 鲜直达 全栈服务已启动`);
  console.log(`   PC 后台:  http://localhost:${PORT}/admin/`);
  console.log(`   移动端:    http://localhost:${PORT}/mp/`);
  console.log(`   API:       http://localhost:${PORT}/api/health\n`);
});
