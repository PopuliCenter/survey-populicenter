/**
 * Property-Based Tests for PhoneNumberField (SurveyForm)
 *
 * Feature: phone-and-unique-id-questions, Property Frontend: Filter non-digit
 * Validates: Requirements 9.1, 9.2
 *
 * Property: PhoneNumberField hanya meneruskan digit ke onChange.
 * For any arbitrary string input, the value that appears in the PhoneNumberField
 * input must contain only digit characters (0-9) or be empty.
 */

import fc from 'fast-check';
import React from 'react';
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('../../../services/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

vi.mock('../../../surveyor/hooks/useGeolocation', () => ({
  default: () => ({
    getLocation: vi.fn().mockResolvedValue({ status: 'available', lat: -6.2, lng: 106.8 }),
  }),
}));

vi.mock('../../../surveyor/hooks/useSkipLogic', () => ({
  default: (questions) => ({ visibleQuestions: questions }),
}));

vi.mock('../../../utils/randomizeOptions', () => ({
  getDisplayOptions: (options) => options,
}));

// Mock useSyncManager (uses IndexedDB which is unavailable in jsdom)
vi.mock('../../../surveyor/hooks/useSyncManager', () => ({
  default: () => ({
    isOnline: true,
    isSyncing: false,
    pendingCount: 0,
    failedItems: [],
    syncNow: vi.fn(),
    deleteFailedItem: vi.fn(),
  }),
}));

// Mock offlineDB (uses IndexedDB which is unavailable in jsdom)
vi.mock('../../../utils/offlineDB', () => ({
  cacheSurvey: vi.fn().mockResolvedValue(undefined),
  getCachedSurvey: vi.fn().mockResolvedValue(null),
  enqueueResponse: vi.fn().mockResolvedValue(1),
  saveMediaFile: vi.fn().mockResolvedValue(1),
}));

// Mock field tools hooks
vi.mock('../../../surveyor/hooks/useAudioRecorder', () => ({
  default: () => ({
    isSupported: true, permissionDenied: false, status: 'idle', duration: 0, audioBlob: null,
    startRecording: vi.fn(), pauseRecording: vi.fn(), resumeRecording: vi.fn(), stopRecording: vi.fn(), resetRecording: vi.fn(),
  }),
}));
vi.mock('../../../surveyor/hooks/usePhotoCapture', () => ({
  default: () => ({
    photos: [], addPhoto: vi.fn().mockReturnValue({ success: true }), removePhoto: vi.fn(), clearPhotos: vi.fn(), getPhotoBlobs: vi.fn().mockReturnValue([]),
  }),
}));
vi.mock('../../../surveyor/hooks/useSignaturePad', () => ({
  default: () => ({
    canvasRef: { current: null }, isEmpty: false, strokeCount: 1, clear: vi.fn(), undo: vi.fn(),
    toBlob: vi.fn().mockResolvedValue(new Blob(['sig'], { type: 'image/png' })), toPngDataUrl: vi.fn().mockReturnValue('data:image/png;base64,'),
  }),
}));
vi.mock('../../../surveyor/components/AudioRecorderPanel', () => ({ default: () => <div data-testid="audio-recorder-panel" /> }));
vi.mock('../../../surveyor/components/PhotoCapturePanel', () => ({ default: () => <div data-testid="photo-capture-panel" /> }));
vi.mock('../../../surveyor/components/SignaturePadCanvas', () => ({ default: () => <div data-testid="signature-pad-canvas" /> }));

import api from '../../../services/api';
import SurveyForm from '../SurveyForm.jsx';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildSurveyWithPhone() {
  return {
    id: 'survey-prop-001',
    title: 'Property Test Survey',
    description: null,
    questions: [
      {
        id: 'q-phone-prop-001',
        text: 'Nomor telepon responden',
        type: 'phone_number',
        order_index: 1,
        is_required: false,
        randomize_options: false,
        options: { min_length: 1, max_length: 20 },
        skip_logic: null,
      },
    ],
  };
}

function renderSurveyForm() {
  return render(
    <MemoryRouter initialEntries={['/surveyor/survey/survey-prop-001']}>
      <SurveyForm />
    </MemoryRouter>
  );
}

// ─── Setup / Teardown ─────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  api.post.mockResolvedValue({
    data: { session_token: 'prop-test-token', start_time: new Date().toISOString() },
  });
  api.get.mockResolvedValue({ data: buildSurveyWithPhone() });
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  cleanup();
});

// ─── Property Test ────────────────────────────────────────────────────────────

// Feature: phone-and-unique-id-questions, Property Frontend: Filter non-digit
describe('PhoneNumberField — Property: hanya meneruskan digit ke onChange', () => {
  test('for any arbitrary string, the input value contains only digits or is empty', async () => {
    await fc.assert(
      fc.asyncProperty(fc.string(), async (randomInput) => {
        api.get.mockResolvedValue({ data: buildSurveyWithPhone() });
        api.post.mockResolvedValue({
          data: { session_token: 'prop-test-token', start_time: new Date().toISOString() },
        });

        renderSurveyForm();

        await waitFor(() => {
          expect(screen.getByText('Nomor telepon responden')).toBeInTheDocument();
        });

        const input = screen.getByPlaceholderText('Masukkan nomor telepon');

        // Simulate typing the random string
        fireEvent.change(input, { target: { value: randomInput } });

        // The resulting value must only contain digits (0-9) or be empty
        const resultValue = input.value;
        expect(resultValue).toMatch(/^\d*$/);

        // Additionally, every digit from the original input should be preserved in order
        const expectedDigits = randomInput.replace(/\D/g, '');
        // Account for maxLength truncation (max_length: 20)
        const truncated = expectedDigits.slice(0, 20);
        expect(resultValue).toBe(truncated);

        cleanup();
      }),
      { numRuns: 100 },
    );
  });
});
