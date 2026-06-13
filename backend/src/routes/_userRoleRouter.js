'use strict';

/**
 * buildUserRoleRouter — factory CRUD akun pengguna untuk satu role tertentu.
 * Meniru pola viewers.js/supervisors.js agar konsisten. Dipakai untuk role baru
 * 'partner_lokal' dan 'asisten_supervisor'.
 *
 * @param {{ role: string, label: string }} cfg
 *   role  — nilai kolom users.role (mis. 'partner_lokal')
 *   label — untuk pesan & audit (mis. 'Partner Lokal')
 */
const express = require('express');
const bcrypt = require('bcrypt');
const { User, AuditLog } = require('../models');
const { authMiddleware, requireRole } = require('../middleware/auth');
const { validatePassword } = require('../utils/validators');

const SALT_ROUNDS = 12;

function buildUserRoleRouter({ role, label }) {
  const router = express.Router();
  const ACT = role.toUpperCase(); // mis. PARTNER_LOKAL → action CREATE_PARTNER_LOKAL
  const notFound = `${label} tidak ditemukan`;

  function publicView(u) {
    return { id: u.id, name: u.name, email: u.email, is_active: u.is_active, created_at: u.created_at };
  }

  // GET / — daftar pengguna role ini
  router.get('/', authMiddleware, requireRole(['admin', 'supervisor']), async (req, res, next) => {
    try {
      const users = await User.findAll({
        where: { role },
        attributes: ['id', 'name', 'email', 'is_active', 'created_at'],
        order: [['created_at', 'ASC']],
      });
      res.json(users);
    } catch (error) { next(error); }
  });

  // POST / — buat akun
  router.post('/', authMiddleware, requireRole(['admin', 'supervisor']), async (req, res, next) => {
    try {
      const { name, email, password } = req.body;
      if (!validatePassword(password)) {
        return res.status(422).json({ error: 'Password harus minimal 8 karakter, mengandung huruf besar, huruf kecil, dan angka' });
      }
      const existing = await User.findOne({ where: { email } });
      if (existing) return res.status(409).json({ error: 'Email sudah terdaftar' });

      const password_hash = await bcrypt.hash(password, SALT_ROUNDS);
      const user = await User.create({ name, email, password_hash, role, is_active: true });

      await AuditLog.create({
        user_id: req.user.id, action: `CREATE_${ACT}`, entity_type: role, entity_id: user.id,
        old_value: null, new_value: { name: user.name, email: user.email, is_active: user.is_active }, ip_address: req.ip,
      });
      res.status(201).json(publicView(user));
    } catch (error) { next(error); }
  });

  // PUT /:id — ubah data
  router.put('/:id', authMiddleware, requireRole(['admin', 'supervisor']), async (req, res, next) => {
    try {
      const { id } = req.params;
      const { name, email, password } = req.body;
      const user = await User.findOne({ where: { id, role } });
      if (!user) return res.status(404).json({ error: notFound });

      const oldValue = { name: user.name, email: user.email, is_active: user.is_active };
      if (email && email !== user.email) {
        const existing = await User.findOne({ where: { email } });
        if (existing) return res.status(409).json({ error: 'Email sudah terdaftar' });
      }
      if (password !== undefined && password !== null && password !== '') {
        if (!validatePassword(password)) {
          return res.status(422).json({ error: 'Password harus minimal 8 karakter, mengandung huruf besar, huruf kecil, dan angka' });
        }
        user.password_hash = await bcrypt.hash(password, SALT_ROUNDS);
      }
      if (name !== undefined) user.name = name;
      if (email !== undefined) user.email = email;
      await user.save();

      await AuditLog.create({
        user_id: req.user.id, action: `UPDATE_${ACT}`, entity_type: role, entity_id: user.id,
        old_value: oldValue, new_value: { name: user.name, email: user.email, is_active: user.is_active }, ip_address: req.ip,
      });
      res.json(publicView(user));
    } catch (error) { next(error); }
  });

  // PATCH /:id/activate & /deactivate
  function setActive(active, actionPrefix) {
    return async (req, res, next) => {
      try {
        const user = await User.findOne({ where: { id: req.params.id, role } });
        if (!user) return res.status(404).json({ error: notFound });
        const oldValue = { name: user.name, email: user.email, is_active: user.is_active };
        user.is_active = active;
        await user.save();
        await AuditLog.create({
          user_id: req.user.id, action: `${actionPrefix}_${ACT}`, entity_type: role, entity_id: user.id,
          old_value: oldValue, new_value: { name: user.name, email: user.email, is_active: user.is_active }, ip_address: req.ip,
        });
        res.json(publicView(user));
      } catch (error) { next(error); }
    };
  }
  router.patch('/:id/activate', authMiddleware, requireRole(['admin', 'supervisor']), setActive(true, 'ACTIVATE'));
  router.patch('/:id/deactivate', authMiddleware, requireRole(['admin', 'supervisor']), setActive(false, 'DEACTIVATE'));

  // DELETE /:id — hanya admin
  router.delete('/:id', authMiddleware, requireRole('admin'), async (req, res, next) => {
    try {
      const { id } = req.params;
      if (req.user.id === id) return res.status(403).json({ error: 'Tidak dapat menghapus akun sendiri' });
      const user = await User.findOne({ where: { id, role } });
      if (!user) return res.status(404).json({ error: notFound });

      const old_value = { name: user.name, email: user.email, role: user.role, is_active: user.is_active };
      try {
        await AuditLog.create({ user_id: req.user.id, action: `DELETE_${ACT}`, entity_type: role, entity_id: user.id, old_value, new_value: null, ip_address: req.ip });
      } catch {
        return res.status(500).json({ error: 'Terjadi kesalahan internal' });
      }
      try {
        await user.destroy();
      } catch (destroyError) {
        if (destroyError.name === 'SequelizeForeignKeyConstraintError') {
          return res.status(409).json({ error: 'Akun tidak dapat dihapus karena masih memiliki data terkait' });
        }
        throw destroyError;
      }
      res.json({ message: `Akun ${old_value.name} berhasil dihapus` });
    } catch (error) { next(error); }
  });

  return router;
}

module.exports = { buildUserRoleRouter };
