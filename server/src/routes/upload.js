// =====================================================================
// Routes — upload: product image upload (admin only, multer)
// =====================================================================
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('../db');
const { adminRequired } = require('../auth');

const router = express.Router();

const UPLOAD_DIR = path.join(__dirname, '..', '..', 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// 允许的图片类型 → 扩展名
const MIME_WHITELIST = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
};

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = MIME_WHITELIST[file.mimetype] || '.jpg';
    cb(null, Date.now() + '-' + Math.random().toString(36).slice(2, 8) + ext);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
  fileFilter: (req, file, cb) => {
    if (!MIME_WHITELIST[file.mimetype]) {
      return cb(new Error('仅支持 JPG / PNG / WEBP / GIF 格式图片'));
    }
    cb(null, true);
  },
});

// POST /api/upload — multipart/form-data, field name: file
router.post('/upload', adminRequired, (req, res) => {
  upload.single('file')(req, res, (err) => {
    if (err) {
      const msg = err.code === 'LIMIT_FILE_SIZE' ? '图片不能超过 2MB' : (err.message || '上传失败');
      return res.status(400).json({ error: 'upload_failed', message: msg });
    }
    if (!req.file) return res.status(400).json({ error: 'no_file', message: '未收到文件' });
    db.prepare('INSERT INTO logs (user_id, user_name, action, detail, created_at) VALUES (?, ?, ?, ?, ?)')
      .run('admin', '系统管理员', 'upload', `上传商品图片 ${req.file.filename}（${(req.file.size / 1024).toFixed(1)}KB）`, new Date().toISOString());
    res.json({ url: '/uploads/' + req.file.filename, filename: req.file.filename, size: req.file.size });
  });
});

module.exports = router;
