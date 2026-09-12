const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'ganti-secret-ini-lewat-env';

function authMiddleware(req, res, next) {
  let token = null;

  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) {
    token = header.slice(7);
  }
  // <iframe>/<img> src gak bisa kirim header, jadi izinkan token lewat query juga
  if (!token && req.query.token) {
    token = req.query.token;
  }

  if (!token) {
    return res.status(401).json({ error: 'Belum login.' });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.userId = payload.userId;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Sesi tidak valid, silakan login ulang.' });
  }
}

module.exports = { authMiddleware, JWT_SECRET };
