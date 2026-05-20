'use strict';

/**
 * Migration: tambah tipe pertanyaan 'indonesia_region' ke constraint kolom type
 * pada tabel questions.
 *
 * Tipe ini menampilkan dropdown wilayah Indonesia berjenjang:
 * Provinsi → Kabupaten/Kota → Kecamatan → Desa/Kelurahan
 * dengan kedalaman yang dapat dikonfigurasi oleh admin/supervisor.
 *
 * Jawaban disimpan sebagai JSONB (answer_json) dengan format:
 * {
 *   province_id, province_name,
 *   regency_id, regency_name,
 *   district_id, district_name,
 *   village_id, village_name
 * }
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    // PostgreSQL CHECK constraint tidak bisa di-ALTER secara langsung,
    // harus drop lama lalu tambah yang baru.
    // Nama constraint default Sequelize: questions_type_check
    await queryInterface.sequelize.query(`
      ALTER TABLE questions
        DROP CONSTRAINT IF EXISTS questions_type_check;
    `);

    await queryInterface.sequelize.query(`
      ALTER TABLE questions
        ADD CONSTRAINT questions_type_check
        CHECK (type IN (
          'single_choice',
          'multiple_choice',
          'short_text',
          'long_text',
          'numeric_scale',
          'date',
          'photo',
          'rating_scale',
          'phone_number',
          'unique_id',
          'time',
          'matrix',
          'indonesia_region'
        ));
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE questions
        DROP CONSTRAINT IF EXISTS questions_type_check;
    `);

    await queryInterface.sequelize.query(`
      ALTER TABLE questions
        ADD CONSTRAINT questions_type_check
        CHECK (type IN (
          'single_choice',
          'multiple_choice',
          'short_text',
          'long_text',
          'numeric_scale',
          'date',
          'photo',
          'rating_scale',
          'phone_number',
          'unique_id',
          'time',
          'matrix'
        ));
    `);
  },
};
