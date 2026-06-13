'use strict';

/**
 * Migration: Buat tabel published_results untuk menayangkan hasil survei
 * (agregat) secara publik di website (populicenter.org).
 *
 * Konsep:
 *   - Satu baris per survei (opt-in oleh admin).
 *   - "Snapshot": angka agregat DIBEKUKAN saat admin klik "Publikasikan" dan
 *     disimpan di kolom `snapshot` (JSONB). Website membaca artefak ini — TIDAK
 *     pernah query langsung ke tabel responses, sehingga aman & ringan.
 *   - HANYA agregat (distribusi jawaban, jumlah responden, sebaran wilayah).
 *     Tidak ada jawaban individual, PII, GPS mentah, atau teks bebas.
 *   - `is_published=false` menyembunyikan dari publik tanpa menghapus snapshot.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('published_results', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.literal('gen_random_uuid()'),
        primaryKey: true,
        allowNull: false,
      },
      survey_id: {
        type: Sequelize.UUID,
        allowNull: false,
        unique: true,
        references: {
          model: 'surveys',
          key: 'id',
        },
        onDelete: 'CASCADE',
      },
      slug: {
        type: Sequelize.STRING(255),
        allowNull: false,
        unique: true,
        comment: 'Kunci URL publik, mis. "survei-kepuasan-2026"',
      },
      title: {
        type: Sequelize.STRING(500),
        allowNull: false,
        comment: 'Judul saat publish (di-snapshot agar stabil walau judul survei berubah)',
      },
      survey_type: {
        type: Sequelize.STRING(20),
        allowNull: false,
        defaultValue: 'lainnya',
      },
      summary: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: 'Pengantar opsional. Naratif utama dikelola di CMS WordPress.',
      },
      response_count: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      snapshot: {
        type: Sequelize.JSONB,
        allowNull: false,
        comment: 'Payload agregat beku: { survey, response_count, questions[], map }',
      },
      is_published: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      published_by: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'users',
          key: 'id',
        },
        onDelete: 'SET NULL',
      },
      published_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn('NOW'),
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn('NOW'),
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn('NOW'),
      },
    });

    // Index untuk listing publik (hanya yang is_published).
    await queryInterface.sequelize.query(`
      CREATE INDEX idx_published_results_public
      ON published_results (is_published, published_at DESC);
    `);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('published_results');
  },
};
