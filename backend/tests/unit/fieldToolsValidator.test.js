'use strict';

const {
  validateFieldToolsSettings,
  validateFieldToolsSubmission,
  getDefaultFieldToolsSettings,
} = require('../../src/utils/fieldToolsValidator');

describe('fieldToolsValidator', () => {
  describe('getDefaultFieldToolsSettings', () => {
    it('returns default settings with all modes set to required', () => {
      const defaults = getDefaultFieldToolsSettings();
      expect(defaults).toEqual({
        signature_mode: 'required',
        audio_mode: 'required',
        photo_mode: 'required',
        gps_mode: 'required',
        audio_indicator: 'shown',
        device_lock: 'off',
      });
    });

    it('returns a new object each time', () => {
      const a = getDefaultFieldToolsSettings();
      const b = getDefaultFieldToolsSettings();
      expect(a).not.toBe(b);
      expect(a).toEqual(b);
    });
  });

  describe('validateFieldToolsSettings', () => {
    it('accepts valid settings with all required modes', () => {
      const result = validateFieldToolsSettings({
        signature_mode: 'required',
        audio_mode: 'required',
        photo_mode: 'required',
        gps_mode: 'required',
      });
      expect(result).toEqual({ valid: true });
    });

    it('accepts valid settings with mixed modes', () => {
      const result = validateFieldToolsSettings({
        signature_mode: 'optional',
        audio_mode: 'disabled',
        photo_mode: 'required',
        gps_mode: 'optional',
      });
      expect(result).toEqual({ valid: true });
    });

    it('rejects null settings', () => {
      const result = validateFieldToolsSettings(null);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('harus memiliki properti');
    });

    it('rejects undefined settings', () => {
      const result = validateFieldToolsSettings(undefined);
      expect(result.valid).toBe(false);
    });

    it('rejects array settings', () => {
      const result = validateFieldToolsSettings([]);
      expect(result.valid).toBe(false);
    });

    it('rejects settings with missing properties', () => {
      const result = validateFieldToolsSettings({
        signature_mode: 'required',
        audio_mode: 'required',
      });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('harus memiliki properti');
    });

    it('rejects settings with extra properties', () => {
      const result = validateFieldToolsSettings({
        signature_mode: 'required',
        audio_mode: 'required',
        photo_mode: 'required',
        gps_mode: 'required',
        extra_mode: 'required',
      });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('harus memiliki properti');
    });

    it('rejects settings with invalid mode value', () => {
      const result = validateFieldToolsSettings({
        signature_mode: 'invalid',
        audio_mode: 'required',
        photo_mode: 'required',
        gps_mode: 'required',
      });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Nilai field tool mode tidak valid');
    });

    const baseModes = {
      signature_mode: 'required',
      audio_mode: 'required',
      photo_mode: 'required',
      gps_mode: 'required',
    };

    it('menerima audio_indicator "shown" / "hidden"', () => {
      expect(validateFieldToolsSettings({ ...baseModes, audio_indicator: 'shown' })).toEqual({ valid: true });
      expect(validateFieldToolsSettings({ ...baseModes, audio_indicator: 'hidden' })).toEqual({ valid: true });
    });

    it('kompatibel mundur: valid tanpa audio_indicator', () => {
      expect(validateFieldToolsSettings({ ...baseModes })).toEqual({ valid: true });
    });

    it('menolak nilai audio_indicator tak dikenal', () => {
      const result = validateFieldToolsSettings({ ...baseModes, audio_indicator: 'maybe' });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('audio_indicator');
    });

    it('menerima device_lock "enforced" / "off"; menolak nilai lain', () => {
      expect(validateFieldToolsSettings({ ...baseModes, device_lock: 'enforced' })).toEqual({ valid: true });
      expect(validateFieldToolsSettings({ ...baseModes, device_lock: 'off' })).toEqual({ valid: true });
      const bad = validateFieldToolsSettings({ ...baseModes, device_lock: 'yes' });
      expect(bad.valid).toBe(false);
      expect(bad.error).toContain('device_lock');
    });

    it('menerima aturan waktu rekaman audio dalam rentang valid', () => {
      expect(validateFieldToolsSettings({ ...baseModes, audio_start_delay_sec: 0 })).toEqual({ valid: true });
      expect(validateFieldToolsSettings({ ...baseModes, audio_start_delay_sec: 120 })).toEqual({ valid: true });
      expect(validateFieldToolsSettings({ ...baseModes, audio_total_max_sec: 300 })).toEqual({ valid: true });
      expect(validateFieldToolsSettings({
        ...baseModes, audio_start_delay_sec: 90, audio_total_max_sec: 240,
      })).toEqual({ valid: true });
    });

    it('kompatibel mundur: valid tanpa aturan waktu rekaman', () => {
      expect(validateFieldToolsSettings({ ...baseModes })).toEqual({ valid: true });
    });

    it('menolak audio_start_delay_sec di luar rentang / non-integer', () => {
      expect(validateFieldToolsSettings({ ...baseModes, audio_start_delay_sec: -1 }).valid).toBe(false);
      expect(validateFieldToolsSettings({ ...baseModes, audio_start_delay_sec: 5000 }).valid).toBe(false);
      const frac = validateFieldToolsSettings({ ...baseModes, audio_start_delay_sec: 45.5 });
      expect(frac.valid).toBe(false);
      expect(frac.error).toContain('audio_start_delay_sec');
    });

    it('menolak audio_total_max_sec di luar rentang / tipe salah', () => {
      expect(validateFieldToolsSettings({ ...baseModes, audio_total_max_sec: 10 }).valid).toBe(false); // < 30
      expect(validateFieldToolsSettings({ ...baseModes, audio_total_max_sec: 1000 }).valid).toBe(false); // > 900
      const str = validateFieldToolsSettings({ ...baseModes, audio_total_max_sec: '180' });
      expect(str.valid).toBe(false);
      expect(str.error).toContain('audio_total_max_sec');
    });

    it('menerima min_duration_sec (ambang QC durasi) dalam rentang; 0 = nonaktif', () => {
      expect(validateFieldToolsSettings({ ...baseModes, min_duration_sec: 0 })).toEqual({ valid: true });
      expect(validateFieldToolsSettings({ ...baseModes, min_duration_sec: 30 })).toEqual({ valid: true });
      expect(validateFieldToolsSettings({ ...baseModes, min_duration_sec: 3600 })).toEqual({ valid: true });
    });

    it('menerima gender_parity_lock "locked" / "off"; menolak nilai lain', () => {
      expect(validateFieldToolsSettings({ ...baseModes, gender_parity_lock: 'locked' })).toEqual({ valid: true });
      expect(validateFieldToolsSettings({ ...baseModes, gender_parity_lock: 'off' })).toEqual({ valid: true });
      const bad = validateFieldToolsSettings({ ...baseModes, gender_parity_lock: 'yes' });
      expect(bad.valid).toBe(false);
      expect(bad.error).toContain('gender_parity_lock');
    });

    it('menerima rt_selection "enabled" / "off"; menolak nilai lain', () => {
      expect(validateFieldToolsSettings({ ...baseModes, rt_selection: 'enabled' })).toEqual({ valid: true });
      expect(validateFieldToolsSettings({ ...baseModes, rt_selection: 'off' })).toEqual({ valid: true });
      const bad = validateFieldToolsSettings({ ...baseModes, rt_selection: 'aktif' });
      expect(bad.valid).toBe(false);
      expect(bad.error).toContain('rt_selection');
    });

    it('menerima rt_selection_count 1–10; menolak di luar rentang / non-integer', () => {
      expect(validateFieldToolsSettings({ ...baseModes, rt_selection_count: 1 })).toEqual({ valid: true });
      expect(validateFieldToolsSettings({ ...baseModes, rt_selection_count: 2 })).toEqual({ valid: true });
      expect(validateFieldToolsSettings({ ...baseModes, rt_selection_count: 10 })).toEqual({ valid: true });
      expect(validateFieldToolsSettings({ ...baseModes, rt_selection_count: 0 }).valid).toBe(false);
      expect(validateFieldToolsSettings({ ...baseModes, rt_selection_count: 11 }).valid).toBe(false);
      const frac = validateFieldToolsSettings({ ...baseModes, rt_selection_count: 2.5 });
      expect(frac.valid).toBe(false);
      expect(frac.error).toContain('rt_selection_count');
    });

    it('menolak min_duration_sec di luar rentang / non-integer', () => {
      expect(validateFieldToolsSettings({ ...baseModes, min_duration_sec: -5 }).valid).toBe(false);
      expect(validateFieldToolsSettings({ ...baseModes, min_duration_sec: 4000 }).valid).toBe(false);
      const frac = validateFieldToolsSettings({ ...baseModes, min_duration_sec: 30.5 });
      expect(frac.valid).toBe(false);
      expect(frac.error).toContain('min_duration_sec');
    });

    it('menerima tampilan huruf (form_font_scale/family); menolak nilai lain', () => {
      for (const scale of ['normal', 'large', 'xlarge']) {
        expect(validateFieldToolsSettings({ ...baseModes, form_font_scale: scale })).toEqual({ valid: true });
      }
      for (const family of ['default', 'serif']) {
        expect(validateFieldToolsSettings({ ...baseModes, form_font_family: family })).toEqual({ valid: true });
      }
      const badScale = validateFieldToolsSettings({ ...baseModes, form_font_scale: 'raksasa' });
      expect(badScale.valid).toBe(false);
      expect(badScale.error).toContain('form_font_scale');
      const badFamily = validateFieldToolsSettings({ ...baseModes, form_font_family: 'comic-sans' });
      expect(badFamily.valid).toBe(false);
      expect(badFamily.error).toContain('form_font_family');
    });
  });

  describe('validateFieldToolsSubmission', () => {
    it('returns valid when settings is null', () => {
      const result = validateFieldToolsSubmission({}, null);
      expect(result).toEqual({ valid: true });
    });

    it('rejects missing signature when signature_mode is required', () => {
      const settings = { signature_mode: 'required', audio_mode: 'disabled', photo_mode: 'disabled', gps_mode: 'disabled' };
      const result = validateFieldToolsSubmission({}, settings);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Tanda tangan wajib diisi');
    });

    it('accepts missing signature when signature_mode is optional', () => {
      const settings = { signature_mode: 'optional', audio_mode: 'disabled', photo_mode: 'disabled', gps_mode: 'disabled' };
      const result = validateFieldToolsSubmission({}, settings);
      expect(result).toEqual({ valid: true });
    });

    it('accepts missing signature when signature_mode is disabled', () => {
      const settings = { signature_mode: 'disabled', audio_mode: 'disabled', photo_mode: 'disabled', gps_mode: 'disabled' };
      const result = validateFieldToolsSubmission({}, settings);
      expect(result).toEqual({ valid: true });
    });

    it('rejects missing audio when audio_mode is required', () => {
      const settings = { signature_mode: 'disabled', audio_mode: 'required', photo_mode: 'disabled', gps_mode: 'disabled' };
      const result = validateFieldToolsSubmission({}, settings);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Rekaman audio wajib diisi');
    });

    it('rejects missing photo when photo_mode is required', () => {
      const settings = { signature_mode: 'disabled', audio_mode: 'disabled', photo_mode: 'required', gps_mode: 'disabled' };
      const result = validateFieldToolsSubmission({}, settings);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Foto wajib diisi');
    });

    it('rejects empty photo_paths array when photo_mode is required', () => {
      const settings = { signature_mode: 'disabled', audio_mode: 'disabled', photo_mode: 'required', gps_mode: 'disabled' };
      const result = validateFieldToolsSubmission({ photo_paths: [] }, settings);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Foto wajib diisi');
    });

    it('rejects missing GPS when gps_mode is required', () => {
      const settings = { signature_mode: 'disabled', audio_mode: 'disabled', photo_mode: 'disabled', gps_mode: 'required' };
      const result = validateFieldToolsSubmission({}, settings);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Lokasi GPS wajib diisi');
    });

    it('rejects when only latitude is provided for required GPS', () => {
      const settings = { signature_mode: 'disabled', audio_mode: 'disabled', photo_mode: 'disabled', gps_mode: 'required' };
      const result = validateFieldToolsSubmission({ latitude: -6.2 }, settings);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Lokasi GPS wajib diisi');
    });

    it('accepts complete submission when all modes are required', () => {
      const settings = { signature_mode: 'required', audio_mode: 'required', photo_mode: 'required', gps_mode: 'required' };
      const submission = {
        signature_path: '/uploads/sig.png',
        audio_path: '/uploads/audio.mp3',
        photo_paths: ['/uploads/photo1.jpg'],
        latitude: -6.2,
        longitude: 106.8,
      };
      const result = validateFieldToolsSubmission(submission, settings);
      expect(result).toEqual({ valid: true });
    });

    it('accepts submission when all modes are disabled', () => {
      const settings = { signature_mode: 'disabled', audio_mode: 'disabled', photo_mode: 'disabled', gps_mode: 'disabled' };
      const result = validateFieldToolsSubmission({}, settings);
      expect(result).toEqual({ valid: true });
    });
  });
});
