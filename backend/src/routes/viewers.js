const express = require('express');
const bcrypt = require('bcrypt');
const { User, AuditLog } = require('../models');
const { authMiddleware, requireRole } = require('../middleware/auth');
const { validatePassword } = require('../utils/validators');

const router = express.Router();

const SALT_ROUNDS = 12;

/**
 * GET /viewers
 * List all viewers (role='viewer')
 * Accessible by: admin, supervisor
 */
router.get('/', authMiddleware, requireRole(['admin', 'supervisor']), async (req, res, next) => {
  try {
    const viewers = await User.findAll({
      where: { role: 'viewer' },
      attributes: ['id', 'name', 'email', 'is_active', 'created_at'],
      order: [['created_at', 'ASC']],
    });

    res.json(viewers);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /viewers
 * Create a new viewer account
 * Accessible by: admin, supervisor
 */
router.post('/', authMiddleware, requireRole(['admin', 'supervisor']), async (req, res, next) => {
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

    // Create viewer
    const viewer = await User.create({
      name,
      email,
      password_hash,
      role: 'viewer',
      is_active: true,
    });

    // Audit log
    await AuditLog.create({
      user_id: req.user.id,
      action: 'CREATE_VIEWER',
      entity_type: 'viewer',
      entity_id: viewer.id,
      old_value: null,
      new_value: { name: viewer.name, email: viewer.email, is_active: viewer.is_active },
      ip_address: req.ip,
    });

    res.status(201).json({
      id: viewer.id,
      name: viewer.name,
      email: viewer.email,
      is_active: viewer.is_active,
      created_at: viewer.created_at,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /viewers/:id
 * Update viewer data (name, email, optionally password)
 * Accessible by: admin, supervisor
 */
router.put('/:id', authMiddleware, requireRole(['admin', 'supervisor']), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, email, password } = req.body;

    const viewer = await User.findOne({ where: { id, role: 'viewer' } });
    if (!viewer) {
      return res.status(404).json({ error: 'Viewer tidak ditemukan' });
    }

    // Save old values for audit log
    const oldValue = { name: viewer.name, email: viewer.email, is_active: viewer.is_active };

    // Check for duplicate email (exclude current viewer)
    if (email && email !== viewer.email) {
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
      viewer.password_hash = await bcrypt.hash(password, SALT_ROUNDS);
    }

    // Update fields
    if (name !== undefined) viewer.name = name;
    if (email !== undefined) viewer.email = email;

    await viewer.save();

    // Audit log
    await AuditLog.create({
      user_id: req.user.id,
      action: 'UPDATE_VIEWER',
      entity_type: 'viewer',
      entity_id: viewer.id,
      old_value: oldValue,
      new_value: { name: viewer.name, email: viewer.email, is_active: viewer.is_active },
      ip_address: req.ip,
    });

    res.json({
      id: viewer.id,
      name: viewer.name,
      email: viewer.email,
      is_active: viewer.is_active,
      created_at: viewer.created_at,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /viewers/:id/deactivate
 * Deactivate a viewer account
 * Accessible by: admin, supervisor
 */
router.patch('/:id/deactivate', authMiddleware, requireRole(['admin', 'supervisor']), async (req, res, next) => {
  try {
    const { id } = req.params;

    const viewer = await User.findOne({ where: { id, role: 'viewer' } });
    if (!viewer) {
      return res.status(404).json({ error: 'Viewer tidak ditemukan' });
    }

    const oldValue = { name: viewer.name, email: viewer.email, is_active: viewer.is_active };

    viewer.is_active = false;
    await viewer.save();

    // Audit log
    await AuditLog.create({
      user_id: req.user.id,
      action: 'DEACTIVATE_VIEWER',
      entity_type: 'viewer',
      entity_id: viewer.id,
      old_value: oldValue,
      new_value: { name: viewer.name, email: viewer.email, is_active: viewer.is_active },
      ip_address: req.ip,
    });

    res.json({
      id: viewer.id,
      name: viewer.name,
      email: viewer.email,
      is_active: viewer.is_active,
      created_at: viewer.created_at,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /viewers/:id
 * Permanently delete a viewer account
 * Accessible by: admin only
 */
router.delete('/:id', authMiddleware, requireRole('admin'), async (req, res, next) => {
  try {
    const { id } = req.params;

    // Self-delete guard
    if (req.user.id === id) {
      return res.status(403).json({ error: 'Tidak dapat menghapus akun sendiri' });
    }

    const user = await User.findOne({ where: { id, role: 'viewer' } });
    if (!user) {
      return res.status(404).json({ error: 'Viewer tidak ditemukan' });
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
        action: 'DELETE_VIEWER',
        entity_type: 'viewer',
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
 * PATCH /viewers/:id/activate
 * Activate a viewer account
 * Accessible by: admin, supervisor
 */
router.patch('/:id/activate', authMiddleware, requireRole(['admin', 'supervisor']), async (req, res, next) => {
  try {
    const { id } = req.params;

    const viewer = await User.findOne({ where: { id, role: 'viewer' } });
    if (!viewer) {
      return res.status(404).json({ error: 'Viewer tidak ditemukan' });
    }

    const oldValue = { name: viewer.name, email: viewer.email, is_active: viewer.is_active };

    viewer.is_active = true;
    await viewer.save();

    // Audit log
    await AuditLog.create({
      user_id: req.user.id,
      action: 'ACTIVATE_VIEWER',
      entity_type: 'viewer',
      entity_id: viewer.id,
      old_value: oldValue,
      new_value: { name: viewer.name, email: viewer.email, is_active: viewer.is_active },
      ip_address: req.ip,
    });

    res.json({
      id: viewer.id,
      name: viewer.name,
      email: viewer.email,
      is_active: viewer.is_active,
      created_at: viewer.created_at,
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
