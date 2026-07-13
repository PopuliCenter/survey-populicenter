/**
 * Unit Tests for SurveyForm — RatingScaleField component
 *
 * Tests:
 *   - Mode stars dengan max=5 merender 5 elemen bintang
 *   - Mode numbers dengan min=1, max=10 merender 10 tombol angka
 *   - Klik bintang ke-3 memanggil onChange dengan "3"
 *   - Klik tombol angka 7 memanggil onChange dengan "7"
 *   - Bintang 1-3 memiliki class text-amber-400 ketika nilai terpilih adalah 3
 *   - Tombol angka 5 memiliki class bg-accent-600 ketika nilai terpilih adalah 5
 *   - Labels.min dan labels.max ditampilkan jika tersedia di options
 *   - Pertanyaan rating_scale required tanpa nilai menampilkan border merah setelah submit
 *
 * Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7
 */

import React from 'react';
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// Mock api
vi.mock('../../../services/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

// Mock useGeolocation
vi.mock('../../../surveyor/hooks/useGeolocation', () => ({
  default: () => ({
    getLocation: vi.fn().mockResolvedValue({ status: 'available', lat: -6.2, lng: 106.8 }),
    // watchLocation(cb) => Promise<() => void> — mirror the real signature so the
    // GPS-watch effect doesn't throw on mount. Resolves to a no-op cleanup function.
    watchLocation: vi.fn().mockResolvedValue(() => {}),
  }),
}));

// Mock useSkipLogic
vi.mock('../../../surveyor/hooks/useSkipLogic', () => ({
  default: (questions) => ({ visibleQuestions: questions }),
}));

// Mock randomizeOptions
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

// Mock storage abstraction (SurveyForm imports from utils/storage, which selects
// IndexedDB/SQLite at runtime — both unavailable in jsdom).
vi.mock('../../../utils/storage', () => ({
  cacheSurvey: vi.fn().mockResolvedValue(undefined),
  getCachedSurvey: vi.fn().mockResolvedValue(null),
  enqueueResponse: vi.fn().mockResolvedValue(1),
  saveMediaFile: vi.fn().mockResolvedValue(1),
  saveDraftMedia: vi.fn().mockResolvedValue(1),
  getDraftMedia: vi.fn().mockResolvedValue([]),
  deleteDraftMedia: vi.fn().mockResolvedValue(undefined),
}));

// Mock useAudioRecorder
vi.mock('../../../surveyor/hooks/useAudioRecorder', () => ({
  default: () => ({
    isSupported: true,
    permissionDenied: false,
    status: 'idle',
    duration: 0,
    audioBlob: null,
    startRecording: vi.fn(),
    pauseRecording: vi.fn(),
    resumeRecording: vi.fn(),
    stopRecording: vi.fn(),
    resetRecording: vi.fn(),
  }),
}));

// Mock usePhotoCapture
vi.mock('../../../surveyor/hooks/usePhotoCapture', () => ({
  default: () => ({
    photos: [],
    addPhoto: vi.fn().mockReturnValue({ success: true }),
    removePhoto: vi.fn(),
    clearPhotos: vi.fn(),
    getPhotoBlobs: vi.fn().mockReturnValue([]),
  }),
}));

// Mock useSignaturePad
vi.mock('../../../surveyor/hooks/useSignaturePad', () => ({
  default: () => ({
    canvasRef: { current: null },
    isEmpty: false,
    strokeCount: 1,
    clear: vi.fn(),
    undo: vi.fn(),
    toBlob: vi.fn().mockResolvedValue(new Blob(['sig'], { type: 'image/png' })),
    toPngDataUrl: vi.fn().mockReturnValue('data:image/png;base64,'),
  }),
}));

// Mock presentation components
vi.mock('../../../surveyor/components/AudioRecorderPanel', () => ({
  default: () => <div data-testid="audio-recorder-panel">AudioRecorderPanel</div>,
}));

vi.mock('../../../surveyor/components/PhotoCapturePanel', () => ({
  default: () => <div data-testid="photo-capture-panel">PhotoCapturePanel</div>,
}));

vi.mock('../../../surveyor/components/SignaturePadCanvas', () => ({
  default: () => <div data-testid="signature-pad-canvas">SignaturePadCanvas</div>,
}));

import api from '../../../services/api';
import { enqueueResponse } from '../../../utils/storage';
import SurveyForm from '../SurveyForm.jsx';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildSurveyWithRating(overrides = {}) {
  return {
    id: 'survey-001',
    title: 'Test Survey',
    description: null,
    questions: [
      {
        id: 'q-rating-001',
        text: 'Berikan penilaian Anda',
        type: 'rating_scale',
        order_index: 1,
        is_required: false,
        randomize_options: false,
        options: { min: 1, max: 5, display: 'stars', labels: {} },
        skip_logic: null,
        ...overrides,
      },
    ],
  };
}

function renderSurveyForm(surveyId = 'survey-001') {
  return render(
    <MemoryRouter initialEntries={[`/surveyor/survey/${surveyId}`]}>
      <SurveyForm />
    </MemoryRouter>
  );
}

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  api.post.mockResolvedValue({ data: { session_token: 'test-token', start_time: new Date().toISOString() } });
  // Mock scrollIntoView which is not available in jsdom
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('RatingScaleField — mode stars', () => {
  test('mode stars dengan max=5 merender 5 elemen bintang', async () => {
    api.get.mockResolvedValue({ data: buildSurveyWithRating({ options: { min: 1, max: 5, display: 'stars', labels: {} } }) });

    renderSurveyForm();

    await waitFor(() => {
      expect(screen.getByText('Berikan penilaian Anda')).toBeInTheDocument();
    });

    // Stars are rendered as buttons with aria-label "Beri rating N dari max"
    const starButtons = screen.getAllByRole('button', { name: /beri rating \d+ dari 5/i });
    expect(starButtons).toHaveLength(5);
  });

  test('klik bintang ke-3 memanggil onChange dengan "3"', async () => {
    api.get.mockResolvedValue({ data: buildSurveyWithRating({ options: { min: 1, max: 5, display: 'stars', labels: {} } }) });

    renderSurveyForm();

    await waitFor(() => {
      expect(screen.getByText('Berikan penilaian Anda')).toBeInTheDocument();
    });

    const star3 = screen.getByRole('button', { name: /beri rating 3 dari 5/i });
    fireEvent.click(star3);

    // After clicking, the value should be "3" - check aria-pressed
    await waitFor(() => {
      expect(star3).toHaveAttribute('aria-pressed', 'true');
    });
  });

  test('bintang 1-3 memiliki class text-amber-400 ketika nilai terpilih adalah 3', async () => {
    api.get.mockResolvedValue({ data: buildSurveyWithRating({ options: { min: 1, max: 5, display: 'stars', labels: {} } }) });

    renderSurveyForm();

    await waitFor(() => {
      expect(screen.getByText('Berikan penilaian Anda')).toBeInTheDocument();
    });

    // Click star 3
    const star3 = screen.getByRole('button', { name: /beri rating 3 dari 5/i });
    fireEvent.click(star3);

    await waitFor(() => {
      const star1 = screen.getByRole('button', { name: /beri rating 1 dari 5/i });
      const star2 = screen.getByRole('button', { name: /beri rating 2 dari 5/i });
      const star3Updated = screen.getByRole('button', { name: /beri rating 3 dari 5/i });
      const star4 = screen.getByRole('button', { name: /beri rating 4 dari 5/i });
      const star5 = screen.getByRole('button', { name: /beri rating 5 dari 5/i });

      expect(star1.className).toContain('text-amber-400');
      expect(star2.className).toContain('text-amber-400');
      expect(star3Updated.className).toContain('text-amber-400');
      expect(star4.className).toContain('text-gray-300');
      expect(star5.className).toContain('text-gray-300');
    });
  });

  test('labels.min dan labels.max ditampilkan jika tersedia di options', async () => {
    api.get.mockResolvedValue({
      data: buildSurveyWithRating({
        options: { min: 1, max: 5, display: 'stars', labels: { min: 'Sangat Buruk', max: 'Sangat Bagus' } },
      }),
    });

    renderSurveyForm();

    await waitFor(() => {
      expect(screen.getByText('Sangat Buruk')).toBeInTheDocument();
      expect(screen.getByText('Sangat Bagus')).toBeInTheDocument();
    });
  });
});

describe('RatingScaleField — mode numbers', () => {
  test('mode numbers dengan min=1, max=10 merender 10 tombol angka', async () => {
    api.get.mockResolvedValue({
      data: buildSurveyWithRating({ options: { min: 1, max: 10, display: 'numbers', labels: {} } }),
    });

    renderSurveyForm();

    await waitFor(() => {
      expect(screen.getByText('Berikan penilaian Anda')).toBeInTheDocument();
    });

    const numberButtons = screen.getAllByRole('button', { name: /pilih nilai \d+/i });
    expect(numberButtons).toHaveLength(10);
  });

  test('klik tombol angka 7 memanggil onChange dengan "7"', async () => {
    api.get.mockResolvedValue({
      data: buildSurveyWithRating({ options: { min: 1, max: 10, display: 'numbers', labels: {} } }),
    });

    renderSurveyForm();

    await waitFor(() => {
      expect(screen.getByText('Berikan penilaian Anda')).toBeInTheDocument();
    });

    const btn7 = screen.getByRole('button', { name: /pilih nilai 7/i });
    fireEvent.click(btn7);

    await waitFor(() => {
      expect(btn7).toHaveAttribute('aria-pressed', 'true');
    });
  });

  test('tombol angka 5 memiliki class bg-accent-600 ketika nilai terpilih adalah 5', async () => {
    api.get.mockResolvedValue({
      data: buildSurveyWithRating({ options: { min: 1, max: 10, display: 'numbers', labels: {} } }),
    });

    renderSurveyForm();

    await waitFor(() => {
      expect(screen.getByText('Berikan penilaian Anda')).toBeInTheDocument();
    });

    const btn5 = screen.getByRole('button', { name: /pilih nilai 5/i });
    fireEvent.click(btn5);

    await waitFor(() => {
      const btn5Updated = screen.getByRole('button', { name: /pilih nilai 5/i });
      expect(btn5Updated.className).toContain('bg-accent-600');
    });
  });
});

describe('RatingScaleField — required validation', () => {
  test('pertanyaan rating_scale required tanpa nilai menampilkan border merah setelah submit', async () => {
    api.get.mockResolvedValue({
      data: buildSurveyWithRating({
        is_required: true,
        options: { min: 1, max: 5, display: 'stars', labels: {} },
      }),
    });

    renderSurveyForm();

    await waitFor(() => {
      expect(screen.getByText('Berikan penilaian Anda')).toBeInTheDocument();
    });

    // Submit without selecting a rating
    const submitBtn = screen.getByRole('button', { name: /simpan data responden/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText('Pertanyaan ini wajib diisi')).toBeInTheDocument();
    });
  });
});


// ─── Helpers for Phone & Unique ID tests ──────────────────────────────────────

function buildSurveyWithPhone(overrides = {}) {
  return {
    id: 'survey-001',
    title: 'Test Survey',
    description: null,
    questions: [
      {
        id: 'q-phone-001',
        text: 'Masukkan nomor telepon responden',
        type: 'phone_number',
        order_index: 1,
        is_required: false,
        randomize_options: false,
        options: { min_length: 10, max_length: 13 },
        skip_logic: null,
        ...overrides,
      },
    ],
  };
}

function buildSurveyWithUniqueId(overrides = {}) {
  return {
    id: 'survey-001',
    title: 'Test Survey',
    description: null,
    questions: [
      {
        id: 'q-uid-001',
        text: 'Masukkan nomor kuesioner',
        type: 'unique_id',
        order_index: 1,
        is_required: false,
        randomize_options: false,
        options: { min_length: 1, max_length: 20 },
        skip_logic: null,
        ...overrides,
      },
    ],
  };
}

// ─── PhoneNumberField Tests ───────────────────────────────────────────────────

describe('PhoneNumberField', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test('merender input type=tel dengan placeholder yang benar', async () => {
    api.get.mockResolvedValue({ data: buildSurveyWithPhone() });

    renderSurveyForm();

    await waitFor(() => {
      expect(screen.getByText('Masukkan nomor telepon responden')).toBeInTheDocument();
    });

    const input = screen.getByPlaceholderText('Masukkan nomor telepon');
    expect(input).toBeInTheDocument();
    expect(input).toHaveAttribute('type', 'tel');
    expect(input).toHaveAttribute('inputmode', 'numeric');
  });

  test('input non-digit difilter (ketik "abc123" -> hanya "123" yang muncul)', async () => {
    api.get.mockResolvedValue({ data: buildSurveyWithPhone() });

    renderSurveyForm();

    await waitFor(() => {
      expect(screen.getByText('Masukkan nomor telepon responden')).toBeInTheDocument();
    });

    const input = screen.getByPlaceholderText('Masukkan nomor telepon');
    fireEvent.change(input, { target: { value: 'abc123' } });

    await waitFor(() => {
      expect(input.value).toBe('123');
    });
  });

  test('pesan panjang ditampilkan jika di luar rentang', async () => {
    api.get.mockResolvedValue({
      data: buildSurveyWithPhone({ options: { min_length: 10, max_length: 13 } }),
    });

    renderSurveyForm();

    await waitFor(() => {
      expect(screen.getByText('Masukkan nomor telepon responden')).toBeInTheDocument();
    });

    const input = screen.getByPlaceholderText('Masukkan nomor telepon');
    // Type only 5 digits — below min_length of 10
    fireEvent.change(input, { target: { value: '12345' } });

    await waitFor(() => {
      expect(screen.getByText(/Masukkan 10-13 digit angka/)).toBeInTheDocument();
    });
  });

  test('pertanyaan phone_number required tanpa nilai menampilkan border merah setelah submit', async () => {
    api.get.mockResolvedValue({
      data: buildSurveyWithPhone({ is_required: true }),
    });

    renderSurveyForm();

    await waitFor(() => {
      expect(screen.getByText('Masukkan nomor telepon responden')).toBeInTheDocument();
    });

    // Submit without entering a value
    const submitBtn = screen.getByRole('button', { name: /simpan data responden/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText('Pertanyaan ini wajib diisi')).toBeInTheDocument();
    });
  });
});

// ─── UniqueIdField Tests ──────────────────────────────────────────────────────

describe('UniqueIdField', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test('merender input dengan placeholder "Masukkan nomor kuesioner"', async () => {
    api.get.mockResolvedValue({ data: buildSurveyWithUniqueId() });

    renderSurveyForm();

    await waitFor(() => {
      expect(screen.getByText('Masukkan nomor kuesioner')).toBeInTheDocument();
    });

    const input = screen.getByPlaceholderText('Masukkan nomor kuesioner');
    expect(input).toBeInTheDocument();
    expect(input).toHaveAttribute('inputmode', 'numeric');
  });

  test('input non-digit difilter di UniqueIdField', async () => {
    api.get.mockResolvedValue({ data: buildSurveyWithUniqueId() });

    renderSurveyForm();

    await waitFor(() => {
      expect(screen.getByText('Masukkan nomor kuesioner')).toBeInTheDocument();
    });

    const input = screen.getByPlaceholderText('Masukkan nomor kuesioner');
    fireEvent.change(input, { target: { value: 'xyz789' } });

    await waitFor(() => {
      expect(input.value).toBe('789');
    });
  });

  test('indikator ketersediaan "Nomor tersedia" ditampilkan setelah debounce', async () => {
    api.get.mockResolvedValue({ data: buildSurveyWithUniqueId() });
    // Mock check-unique to return available
    api.post.mockImplementation((url) => {
      if (url === '/responses/check-unique') {
        return Promise.resolve({ data: { available: true } });
      }
      // Default: session start
      return Promise.resolve({ data: { session_token: 'test-token', start_time: new Date().toISOString() } });
    });

    renderSurveyForm();

    await waitFor(() => {
      expect(screen.getByText('Masukkan nomor kuesioner')).toBeInTheDocument();
    });

    const input = screen.getByPlaceholderText('Masukkan nomor kuesioner');
    fireEvent.change(input, { target: { value: '12345' } });

    // Should show "Memeriksa ketersediaan..." immediately
    expect(screen.getByText('Memeriksa ketersediaan...')).toBeInTheDocument();

    // Advance timers past the 500ms debounce
    await act(async () => {
      vi.advanceTimersByTime(600);
    });

    await waitFor(() => {
      expect(screen.getByText('Nomor tersedia')).toBeInTheDocument();
    });
  });

  test('indikator "Nomor sudah digunakan" ditampilkan jika tidak tersedia', async () => {
    api.get.mockResolvedValue({ data: buildSurveyWithUniqueId() });
    // Mock check-unique to return not available
    api.post.mockImplementation((url) => {
      if (url === '/responses/check-unique') {
        return Promise.resolve({ data: { available: false } });
      }
      return Promise.resolve({ data: { session_token: 'test-token', start_time: new Date().toISOString() } });
    });

    renderSurveyForm();

    await waitFor(() => {
      expect(screen.getByText('Masukkan nomor kuesioner')).toBeInTheDocument();
    });

    const input = screen.getByPlaceholderText('Masukkan nomor kuesioner');
    fireEvent.change(input, { target: { value: '99999' } });

    // Advance timers past the 500ms debounce
    await act(async () => {
      vi.advanceTimersByTime(600);
    });

    await waitFor(() => {
      expect(screen.getByText('Nomor sudah digunakan')).toBeInTheDocument();
    });
  });
});

// ─── Penyimpanan offline / jaring pengaman jaringan ───────────────────────────
// Regresi untuk bug: saat offline, data tidak tersimpan & tersapu ke halaman
// login (Realme Narzo 50 / IQOO Z10R). Penyebab: submit memakai navigator.onLine
// (tidak akurat di WebView) alih-alih status @capacitor/network. Perbaikan:
// deteksi jaringan andal + jaring pengaman enqueue offline saat kirim gagal.

// Survei tanpa field tools (GPS/tanda tangan/audio/foto) agar submit langsung
// sampai ke cabang jaringan tanpa terhalang validasi alat lapangan.
function buildSubmittableSurvey() {
  return {
    id: 'survey-001',
    title: 'Test Survey',
    description: null,
    field_tools_settings: {
      signature_mode: 'disabled',
      audio_mode: 'disabled',
      photo_mode: 'disabled',
      gps_mode: 'disabled',
    },
    questions: [
      {
        id: 'q-txt-001',
        text: 'Catatan tambahan',
        type: 'short_text',
        order_index: 1,
        is_required: false,
        randomize_options: false,
        options: {},
        skip_logic: null,
      },
    ],
  };
}

// ─── Auto-isi jenis kelamin dari paritas Nomor Kuesioner ──────────────────────
function buildSurveyGenderAutoFill() {
  return {
    id: 'survey-001',
    title: 'Test Survey',
    description: null,
    form_mode: 'scroll', // tampilkan semua pertanyaan sekaligus
    field_tools_settings: {
      signature_mode: 'disabled',
      audio_mode: 'disabled',
      photo_mode: 'disabled',
      gps_mode: 'disabled',
    },
    questions: [
      {
        id: 'q-uid',
        text: 'Nomor kuesioner',
        type: 'unique_id',
        order_index: 1,
        is_required: false,
        randomize_options: false,
        options: { min_length: 1, max_length: 20 },
        skip_logic: null,
      },
      {
        id: 'q-gender',
        text: 'Jenis kelamin',
        type: 'single_choice',
        order_index: 2,
        is_required: false,
        randomize_options: false,
        options: [
          { value: 'L', label: 'Laki-laki' },
          { value: 'P', label: 'Perempuan' },
        ],
        skip_logic: null,
        auto_fill: { source: 'questionnaire_number_parity', odd_value: 'L', even_value: 'P' },
      },
    ],
  };
}

describe('Auto-isi jenis kelamin dari Nomor Kuesioner', () => {
  test('ganjil → Laki-laki, genap → Perempuan, & tetap bisa diubah', async () => {
    api.get.mockResolvedValue({ data: buildSurveyGenderAutoFill() });
    api.post.mockResolvedValue({ data: { session_token: 'test-token' } });

    renderSurveyForm();
    await waitFor(() => {
      expect(screen.getByText('Jenis kelamin')).toBeInTheDocument();
    });

    const numInput = screen.getByPlaceholderText('Masukkan nomor kuesioner');

    // Nomor ganjil → Laki-laki terpilih otomatis
    fireEvent.change(numInput, { target: { value: '3' } });
    await waitFor(() => {
      expect(screen.getByRole('radio', { name: /laki-laki/i })).toHaveAttribute('aria-checked', 'true');
    });

    // Nomor genap → Perempuan terpilih otomatis
    fireEvent.change(numInput, { target: { value: '4' } });
    await waitFor(() => {
      expect(screen.getByRole('radio', { name: /perempuan/i })).toHaveAttribute('aria-checked', 'true');
    });

    // Koreksi manual dipertahankan selama nomor tidak berubah (editable)
    fireEvent.click(screen.getByRole('radio', { name: /laki-laki/i }));
    await waitFor(() => {
      expect(screen.getByRole('radio', { name: /laki-laki/i })).toHaveAttribute('aria-checked', 'true');
    });
    expect(screen.getByRole('radio', { name: /perempuan/i })).toHaveAttribute('aria-checked', 'false');
  });
});

describe('GPS wajib di web (mis. iPhone) — best-effort', () => {
  const originalOnLine = Object.getOwnPropertyDescriptor(window.navigator, 'onLine');
  afterEach(() => {
    if (originalOnLine) Object.defineProperty(window.navigator, 'onLine', originalOnLine);
  });

  function buildSurveyGpsRequired() {
    return {
      id: 'survey-001',
      title: 'Test Survey',
      description: null,
      form_mode: 'scroll',
      field_tools_settings: {
        signature_mode: 'disabled',
        audio_mode: 'disabled',
        photo_mode: 'disabled',
        gps_mode: 'required',
      },
      questions: [
        {
          id: 'q-txt-001',
          text: 'Catatan tambahan',
          type: 'short_text',
          order_index: 1,
          is_required: false,
          randomize_options: false,
          options: {},
          skip_logic: null,
        },
      ],
    };
  }

  test('GPS wajib TIDAK memblokir submit di web meski lokasi belum terkunci', async () => {
    Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: true });
    api.get.mockResolvedValue({ data: buildSurveyGpsRequired() });
    api.post.mockResolvedValue({ data: { session_token: 'test-token', questionnaire_number: '0001' } });

    renderSurveyForm();
    await waitFor(() => {
      expect(screen.getByText('Catatan tambahan')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /simpan data responden/i }));

    // Submit online tetap jalan (tidak terhalang gate GPS wajib di web).
    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/responses/submit', expect.anything());
    });
    // Tidak menampilkan pesan blokir GPS wajib.
    expect(screen.queryByText(/Lokasi GPS wajib/i)).not.toBeInTheDocument();
  });
});

describe('Offline submit & jaring pengaman jaringan', () => {
  const originalOnLine = Object.getOwnPropertyDescriptor(window.navigator, 'onLine');

  afterEach(() => {
    if (originalOnLine) Object.defineProperty(window.navigator, 'onLine', originalOnLine);
  });

  test('offline terdeteksi → data disimpan ke antrean, TIDAK dikirim online', async () => {
    Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: false });
    api.get.mockResolvedValue({ data: buildSubmittableSurvey() });
    api.post.mockResolvedValue({ data: { session_token: 'test-token' } });

    renderSurveyForm();
    await waitFor(() => {
      expect(screen.getByText('Catatan tambahan')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /simpan data responden/i }));

    await waitFor(() => {
      expect(enqueueResponse).toHaveBeenCalledTimes(1);
    });
    // Tidak boleh mencoba mengirim response ke server saat offline.
    expect(api.post).not.toHaveBeenCalledWith('/responses/submit', expect.anything());
  });

  test('kirim online gagal (network error) → jatuh ke antrean offline, data tak hilang', async () => {
    Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: true });
    api.get.mockResolvedValue({ data: buildSubmittableSurvey() });
    // /responses/start sukses; /responses/submit gagal tanpa .response (network error).
    api.post.mockImplementation((url) => {
      if (url === '/responses/submit') {
        return Promise.reject({ message: 'Network Error' }); // tidak ada .response
      }
      return Promise.resolve({ data: { session_token: 'test-token' } });
    });

    renderSurveyForm();
    await waitFor(() => {
      expect(screen.getByText('Catatan tambahan')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /simpan data responden/i }));

    // Meskipun jalur online dicoba lalu gagal, data harus tetap masuk antrean.
    await waitFor(() => {
      expect(enqueueResponse).toHaveBeenCalledTimes(1);
    });
  });

  test('sesi kedaluwarsa (401) → data diselamatkan ke antrean offline lebih dulu', async () => {
    Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: true });
    api.get.mockResolvedValue({ data: buildSubmittableSurvey() });
    api.post.mockImplementation((url) => {
      if (url === '/responses/submit') {
        return Promise.reject({ response: { status: 401, data: {} } });
      }
      return Promise.resolve({ data: { session_token: 'test-token' } });
    });

    renderSurveyForm();
    await waitFor(() => {
      expect(screen.getByText('Catatan tambahan')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /simpan data responden/i }));

    await waitFor(() => {
      expect(enqueueResponse).toHaveBeenCalledTimes(1);
    });
  });
});
