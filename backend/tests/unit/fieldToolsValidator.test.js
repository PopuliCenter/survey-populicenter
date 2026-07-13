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
