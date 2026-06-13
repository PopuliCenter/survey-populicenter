const express = require('express');
const bcrypt = require('bcrypt');
const { User, AuditLog } = require('../models');
const { authMiddleware, requireRole } = require('../middleware/auth');
const { validatePassword } = require('../utils/validators');

const router = express.Router();

const SALT_ROUNDS = 12;

/**
 * GET /supervisors
 * List all supervisors (role='supervisor')
 * Accessible by: admin, supervisor
 */
router.get('/', authMiddleware, requireRole(['admin', 'supervisor']), async (req, res, next) => {
  try {
    const supervisors = await User.findAll({
      where: { role: 'supervisor' },
      attributes: ['id', 'name', 'email', 'is_active', 'created_at'],
      order: [['created_at', 'ASC']],
    });

    res.json(supervisors);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /supervisors
 * Create a new supervisor account
 * Accessible by: admin only
 */
router.post('/', authMiddleware, requireRole('admin'), async (req, res, next) => {
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

    // Create supervisor
    const supervisor = await User.create({
      name,
      email,
      password_hash,
      role: 'supervisor',
      is_active: true,
    });

    // Audit log
    await AuditLog.create({
      user_id: req.user.id,
      action: 'CREATE_SUPERVISOR',
      entity_type: 'supervisor',
      entity_id: supervisor.id,
      old_value: null,
      new_value: { name: supervisor.name, email: supervisor.email, is_active: supervisor.is_active },
      ip_address: req.ip,
    });

    res.status(201).json({
      id: supervisor.id,
      name: supervisor.name,
      email: supervisor.email,
      is_active: supervisor.is_active,
      created_at: supervisor.created_at,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /supervisors/:id
 * Update supervisor data (name, email, optionally password)
 * Accessible by: admin (any), supervisor (self only)
 */
router.put('/:id', authMiddleware, requireRole(['admin', 'supervisor']), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, email, password } = req.body;

    // Supervisor & asisten supervisor hanya boleh mengubah akun sendiri
    if (['supervisor', 'asisten_supervisor'].includes(req.user.role) && id !== String(req.user.id)) {
      return res.status(403).json({ error: 'Anda tidak memiliki izin untuk mengakses resource ini' });
    }

    const supervisor = await User.findOne({ where: { id, role: 'supervisor' } });
    if (!supervisor) {
      return res.status(404).json({ error: 'Supervisor tidak ditemukan' });
    }

    // Save old values for audit log
    const oldValue = { name: supervisor.name, email: supervisor.email, is_active: supervisor.is_active };

    // Check for duplicate email (exclude current supervisor)
    if (email && email !== supervisor.email) {
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
      supervisor.password_hash = await bcrypt.hash(password, SALT_ROUNDS);
    }

    // Update fields
    if (name !== undefined) supervisor.name = name;
    if (email !== undefined) supervisor.email = email;

    await supervisor.save();

    // Audit log
    await AuditLog.create({
      user_id: req.user.id,
      action: 'UPDATE_SUPERVISOR',
      entity_type: 'supervisor',
      entity_id: supervisor.id,
      old_value: oldValue,
      new_value: { name: supervisor.name, email: supervisor.email, is_active: supervisor.is_active },
      ip_address: req.ip,
    });

    res.json({
      id: supervisor.id,
      name: supervisor.name,
      email: supervisor.email,
      is_active: supervisor.is_active,
      created_at: supervisor.created_at,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /supervisors/:id
 * Permanently delete a supervisor account
 * Accessible by: admin only
 */
router.delete('/:id', authMiddleware, requireRole('admin'), async (req, res, next) => {
  try {
    const { id } = req.params;

    // Self-delete guard
    if (req.user.id === id) {
      return res.status(403).json({ error: 'Tidak dapat menghapus akun sendiri' });
    }

    const user = await User.findOne({ where: { id, role: 'supervisor' } });
    if (!user) {
      return res.status(404).json({ error: 'Supervisor tidak ditemukan' });
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
        action: 'DELETE_SUPERVISOR',
        entity_type: 'supervisor',
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
 * PATCH /supervisors/:id/deactivate
 * Deactivate a supervisor account
 * Accessible by: admin only
 */
router.patch('/:id/deactivate', authMiddleware, requireRole('admin'), async (req, res, next) => {
  try {
    const { id } = req.params;

    // Prevent self-deactivation
    if (req.user.id === id) {
      return res.status(403).json({ error: 'Tidak dapat menonaktifkan akun sendiri' });
    }

    const supervisor = await User.findOne({ where: { id, role: 'supervisor' } });
    if (!supervisor) {
      return res.status(404).json({ error: 'Supervisor tidak ditemukan' });
    }

    const oldValue = { name: supervisor.name, email: supervisor.email, is_active: supervisor.is_active };

    supervisor.is_active = false;
    await supervisor.save();

    // Audit log
    await AuditLog.create({
      user_id: req.user.id,
      action: 'DEACTIVATE_SUPERVISOR',
      entity_type: 'supervisor',
      entity_id: supervisor.id,
      old_value: oldValue,
      new_value: { name: supervisor.name, email: supervisor.email, is_active: supervisor.is_active },
      ip_address: req.ip,
    });

    res.json({
      id: supervisor.id,
      name: supervisor.name,
      email: supervisor.email,
      is_active: supervisor.is_active,
      created_at: supervisor.created_at,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /supervisors/:id/activate
 * Activate a supervisor account
 * Accessible by: admin only
 */
router.patch('/:id/activate', authMiddleware, requireRole('admin'), async (req, res, next) => {
  try {
    const { id } = req.params;

    const supervisor = await User.findOne({ where: { id, role: 'supervisor' } });
    if (!supervisor) {
      return res.status(404).json({ error: 'Supervisor tidak ditemukan' });
    }

    const oldValue = { name: supervisor.name, email: supervisor.email, is_active: supervisor.is_active };

    supervisor.is_active = true;
    await supervisor.save();

    // Audit log
    await AuditLog.create({
      user_id: req.user.id,
      action: 'ACTIVATE_SUPERVISOR',
      entity_type: 'supervisor',
      entity_id: supervisor.id,
      old_value: oldValue,
      new_value: { name: supervisor.name, email: supervisor.email, is_active: supervisor.is_active },
      ip_address: req.ip,
    });

    res.json({
      id: supervisor.id,
      name: supervisor.name,
      email: supervisor.email,
      is_active: supervisor.is_active,
      created_at: supervisor.created_at,
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
