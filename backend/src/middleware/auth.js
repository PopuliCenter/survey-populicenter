const jwt = require('jsonwebtoken');
const redis = require('../config/redis');

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error('[FATAL] JWT_SECRET environment variable is not set. Server cannot start.');
  process.exit(1);
}

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
 * Pewarisan role: role turunan mewarisi izin role dasarnya.
 *   - partner_lokal (PL)        → seperti viewer (lihat saja)
 *   - asisten_supervisor        → seperti supervisor (kecuali yang di-deny)
 */
const ROLE_INHERITS = {
  partner_lokal: 'viewer',
  asisten_supervisor: 'supervisor',
};

/**
 * requireRole - Check req.user.role matches one of the allowed roles
 * (atau role dasarnya bila role turunan). Returns 403 for access denied.
 * @param {string | string[]} roles - Single role or array of allowed roles
 * @param {{ deny?: string[] }} [options] - role yang ditolak walau mewarisi
 *        (mis. asisten_supervisor pada rute manajemen survei).
 */
function requireRole(roles, options = {}) {
  const allowedRoles = new Set(Array.isArray(roles) ? roles : [roles]);
  const denied = new Set(options.deny || []);
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Sesi telah berakhir, silakan login kembali' });
    }

    const role = req.user.role;
    const base = ROLE_INHERITS[role];
    const permitted = !denied.has(role) && (allowedRoles.has(role) || (base && allowedRoles.has(base)));

    if (!permitted) {
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
  return ['admin', 'supervisor', 'viewer', 'surveyor', 'partner_lokal', 'asisten_supervisor'].includes(roleStr);
}

module.exports = {
  authMiddleware,
  requireRole,
  isValidRole,
};
