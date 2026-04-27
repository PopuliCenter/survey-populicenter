const jwt = require('jsonwebtoken');
const redis = require('../config/redis');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

/**
 * authMiddleware - Verify JWT and attach user to req.user
 * Returns 401 for invalid/expired token
 */
async function authMiddleware(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Sesi telah berakhir, silakan login kembali' });
    }

    const token = authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({ error: 'Sesi telah berakhir, silakan login kembali' });
    }

    // Check if token is blacklisted
    const isBlacklisted = await redis.get(`blacklist:${token}`);
    if (isBlacklisted) {
      return res.status(401).json({ error: 'Sesi telah berakhir, silakan login kembali' });
    }

    // Verify JWT
    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        return res.status(401).json({ error: 'Sesi telah berakhir, silakan login kembali' });
      }
      return res.status(401).json({ error: 'Sesi telah berakhir, silakan login kembali' });
    }

    // Attach user payload to request
    req.user = {
      id: decoded.id,
      role: decoded.role,
      email: decoded.email,
    };

    next();
  } catch (error) {
    next(error);
  }
}

/**
 * requireRole - Check req.user.role matches one of the allowed roles
 * Returns 403 for access denied
 * @param {string | string[]} roles - Single role or array of allowed roles
 */
function requireRole(roles) {
  const allowedRoles = Array.isArray(roles) ? roles : [roles];
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Sesi telah berakhir, silakan login kembali' });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Anda tidak memiliki izin untuk mengakses resource ini' });
    }

    next();
  };
}

/**
 * isValidRole - Check if a string is one of the four valid role values
 * @param {string} roleStr - Role string to validate
 * @returns {boolean} true if roleStr is 'admin', 'supervisor', 'viewer', or 'surveyor'
 */
function isValidRole(roleStr) {
  return ['admin', 'supervisor', 'viewer', 'surveyor'].includes(roleStr);
}

module.exports = {
  authMiddleware,
  requireRole,
  isValidRole,
};
