const express = require('express');
const bcrypt = require('bcrypt');
const { User, AuditLog } = require('../models');
const { authMiddleware, requireRole } = require('../middleware/auth');
const { validatePassword } = require('../utils/validators');

const router = express.Router();

const SALT_ROUNDS = 12;

// All admin routes require authentication + admin role
router.use(authMiddleware, requireRole('admin'));

/**
 * GET /admins
 * List all admins (role='admin')
 */
router.get('/', async (req, res, next) => {
  try {
    const admins = await User.findAll({
      where: { role: 'admin' },
      attributes: ['id', 'name', 'email', 'is_active', 'created_at'],
      order: [['created_at', 'ASC']],
    });

    res.json(admins);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /admins
 * Create a new admin account
 */
router.post('/', async (req, res, next) => {
  try {
    const { name, email, password } = req.body;

    // Validate password
    if (!validatePassword(password)) {
      return res.status(422).json({
        error: 'Password harus minimal 8 karakter, mengandung huruf besar, huruf kecil, dan angka',
      });
    }

    // Check for duplicate email
    const existing = await User.findOne({ where: { email } });
    if (existing) {
      return res.status(409).json({ error: 'Email sudah terdaftar' });
    }

    // Hash password
    const password_hash = await bcrypt.hash(password, SALT_ROUNDS);

    // Create admin
    const admin = await User.create({
      name,
      email,
      password_hash,
      role: 'admin',
      is_active: true,
    });

    // Audit log
    await AuditLog.create({
      user_id: req.user.id,
      action: 'CREATE_ADMIN',
      entity_type: 'admin',
      entity_id: admin.id,
      old_value: null,
      new_value: { name: admin.name, email: admin.email, is_active: admin.is_active },
      ip_address: req.ip,
    });

    res.status(201).json({
      id: admin.id,
      name: admin.name,
      email: admin.email,
      is_active: admin.is_active,
      created_at: admin.created_at,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /admins/:id
 * Update admin data (name, email, optionally password)
 */
router.put('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, email, password } = req.body;

    const admin = await User.findOne({ where: { id, role: 'admin' } });
    if (!admin) {
      return res.status(404).json({ error: 'Admin tidak ditemukan' });
    }

    // Save old values for audit log
    const oldValue = { name: admin.name, email: admin.email, is_active: admin.is_active };

    // Check for duplicate email (exclude current admin)
    if (email && email !== admin.email) {
      const existing = await User.findOne({ where: { email } });
      if (existing) {
        return res.status(409).json({ error: 'Email sudah terdaftar' });
      }
    }

    // Validate and hash new password if provided
    if (password !== undefined && password !== null && password !== '') {
      if (!validatePassword(password)) {
        return res.status(422).json({
          error: 'Password harus minimal 8 karakter, mengandung huruf besar, huruf kecil, dan angka',
        });
      }
      admin.password_hash = await bcrypt.hash(password, SALT_ROUNDS);
    }

    // Update fields
    if (name !== undefined) admin.name = name;
    if (email !== undefined) admin.email = email;

    await admin.save();

    // Audit log
    await AuditLog.create({
      user_id: req.user.id,
      action: 'UPDATE_ADMIN',
      entity_type: 'admin',
      entity_id: admin.id,
      old_value: oldValue,
      new_value: { name: admin.name, email: admin.email, is_active: admin.is_active },
      ip_address: req.ip,
    });

    res.json({
      id: admin.id,
      name: admin.name,
      email: admin.email,
      is_active: admin.is_active,
      created_at: admin.created_at,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /admins/:id
 * Permanently delete an admin account
 */
router.delete('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;

    // Self-delete guard
    if (req.user.id === id) {
      return res.status(403).json({ error: 'Tidak dapat menghapus akun sendiri' });
    }

    const user = await User.findOne({ where: { id, role: 'admin' } });
    if (!user) {
      return res.status(404).json({ error: 'Admin tidak ditemukan' });
    }

    // Snapshot old value before deletion
    const old_value = {
      name: user.name,
      email: user.email,
      role: user.role,
      is_active: user.is_active,
    };

    // Create audit log BEFORE deletion — if this fails, do NOT delete
    try {
      await AuditLog.create({
        user_id: req.user.id,
        action: 'DELETE_ADMIN',
        entity_type: 'admin',
        entity_id: user.id,
        old_value,
        new_value: null,
        ip_address: req.ip,
      });
    } catch (auditError) {
      return res.status(500).json({ error: 'Terjadi kesalahan internal' });
    }

    // Permanently delete the user
    try {
      await user.destroy();
    } catch (destroyError) {
      // Constraint violation
      if (destroyError.name === 'SequelizeForeignKeyConstraintError') {
        return res.status(409).json({ error: 'Akun tidak dapat dihapus karena masih memiliki data terkait' });
      }
      throw destroyError;
    }

    res.json({ message: `Akun ${old_value.name} berhasil dihapus` });
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /admins/:id/deactivate
 * Deactivate an admin account
 */
router.patch('/:id/deactivate', async (req, res, next) => {
  try {
    const { id } = req.params;

    // Prevent self-deactivation
    if (req.user.id === id) {
      return res.status(403).json({ error: 'Tidak dapat menonaktifkan akun sendiri' });
    }

    const admin = await User.findOne({ where: { id, role: 'admin' } });
    if (!admin) {
      return res.status(404).json({ error: 'Admin tidak ditemukan' });
    }

    const oldValue = { name: admin.name, email: admin.email, is_active: admin.is_active };

    admin.is_active = false;
    await admin.save();

    // Audit log
    await AuditLog.create({
      user_id: req.user.id,
      action: 'DEACTIVATE_ADMIN',
      entity_type: 'admin',
      entity_id: admin.id,
      old_value: oldValue,
      new_value: { name: admin.name, email: admin.email, is_active: admin.is_active },
      ip_address: req.ip,
    });

    res.json({
      id: admin.id,
      name: admin.name,
      email: admin.email,
      is_active: admin.is_active,
      created_at: admin.created_at,
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
