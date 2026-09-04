// =====================================================================
// Auth middleware — JWT based
// =====================================================================
const jwt = require('jsonwebtoken');

const SECRET = process.env.JWT_SECRET || 'xzd-mvp-dev-secret-key-change-in-prod';

function sign(user) {
  return jwt.sign(
    { id: user.id, name: user.name, is_partner: user.is_partner, is_admin: user.id === 'admin' },
    SECRET,
    { expiresIn: '7d' }
  );
}

function authRequired(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'unauthorized', message: '请先登录' });
  }
  try {
    const payload = jwt.verify(auth.slice(7), SECRET);
    req.user = payload;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'invalid_token', message: '登录已过期，请重新登录' });
  }
}

function adminRequired(req, res, next) {
  authRequired(req, res, () => {
    if (!req.user.is_admin) return res.status(403).json({ error: 'forbidden', message: '需要管理员权限' });
    next();
  });
}

module.exports = { sign, authRequired, adminRequired };
