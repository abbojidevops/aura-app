// Authentication: salted scrypt password hashes and opaque session tokens.
const crypto = require('crypto');
const db = require('./db');

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(':');
  const test = crypto.scryptSync(password, salt, 64);
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), test);
}

async function createSession(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  await db.run('INSERT INTO sessions (token, user_id) VALUES (?, ?)', [token, userId]);
  return token;
}

async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Please sign in to continue.' });
    const user = await db.get(
      'SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?',
      [token]
    );
    if (!user) return res.status(401).json({ error: 'Your session has expired. Please sign in again.' });
    if (user.suspended_at) return res.status(403).json({ error: 'Your account has been suspended.' });
    req.user = user;
    req.token = token;
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = { hashPassword, verifyPassword, createSession, requireAuth };
