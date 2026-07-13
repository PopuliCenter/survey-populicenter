'use strict';

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const User = sequelize.define('User', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      allowNull: false,
    },
    name: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    email: {
      type: DataTypes.STRING(255),
      allowNull: false,
      unique: true,
      validate: {
        isEmail: true,
      },
    },
    password_hash: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    role: {
      type: DataTypes.STRING(20),
      allowNull: false,
      validate: {
        isIn: [['admin', 'supervisor', 'viewer', 'surveyor', 'partner_lokal', 'asisten_supervisor']],
      },
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    // Kunci perangkat (1 user = 1 device). Terikat saat pertama mengisi survei
    // ber-device_lock 'enforced'; admin bisa mereset dari Manajemen TPD.
    device_id: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    device_label: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    device_bound_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  }, {
    tableName: 'users',
    underscored: true,
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  });

  // M1: cabut sesi aktif saat akun dinonaktifkan/dihapus (terpusat via hook agar
  // tak ada jalur yang terlewat). Re-aktivasi membersihkan pembatalan.
  const { revokeUser, clearRevocation } = require('../utils/sessionRevocation');
  User.afterUpdate(async (user) => {
    if (!user.changed('is_active')) return;
    if (user.is_active === false) await revokeUser(user.id);
    else await clearRevocation(user.id);
  });
  User.afterDestroy(async (user) => {
    await revokeUser(user.id);
  });

  return User;
};
