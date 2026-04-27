/**
 * Unit Tests for SurveyBuilder page — RatingConfigEditor
 *
 * Tests:
 *   - Dropdown tipe menampilkan opsi "Rating Scale"
 *   - Memilih "Rating Scale" menampilkan section konfigurasi rating
 *   - Mengubah tipe dari "Rating Scale" ke "Teks Pendek" menyembunyikan section konfigurasi
 *   - Nilai default yang ditampilkan: min=1, max=5, display=stars
 *   - Saat submit dengan tipe rating_scale, payload menyertakan options
 *   - Saat edit pertanyaan rating_scale yang sudah ada, nilai konfigurasi tersimpan ditampilkan
 *
 * Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6
 */

import React from 'react';
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import SurveyBuilder from '../SurveyBuilder.jsx';

// ─── Mock api ─────────────────────────────────────────────────────────────────
vi.mock('../../services/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

import api from '../../services/api';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function renderSurveyBuilder(surveyId = 'survey-001') {
  return render(
    <MemoryRouter initialEntries={[`/surveys/${surveyId}/builder`]}>
      <SurveyBuilder />
    </MemoryRouter>
  );
}

const mockSurvey = {
  id: 'survey-001',
  title: 'Test Survey',
  description: 'Test description',
  status: 'draft',
  questions: [],
};

const mockRatingQuestion = {
  id: 'q-rating-001',
  survey_id: 'survey-001',
  text: 'Berikan penilaian Anda',
  type: 'rating_scale',
  order_index: 1,
  is_required: false,
  randomize_options: false,
  options: { min: 2, max: 8, display: 'numbers', labels: { min: 'Buruk', max: 'Bagus' } },
  skip_logic: null,
};

// Helper to open the "Tambah Pertanyaan" modal (header button)
async function openAddModal() {
  await waitFor(() => {
    expect(screen.getByText('Test Survey')).toBeInTheDocument();
  });
  // The header button has aria-label or is the first "Tambah Pertanyaan" button
  const addButtons = screen.getAllByRole('button', { name: /tambah pertanyaan/i });
  // The header button is the one with the "+" icon inside
  fireEvent.click(addButtons[0]);
  await waitFor(() => {
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
}

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  api.get.mockResolvedValue({ data: mockSurvey });
});

afterEach(() => {
  vi.clearAllMocks();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('SurveyBuilder — Rating Scale type option', () => {
  test('dropdown tipe menampilkan opsi "Rating Scale"', async () => {
    renderSurveyBuilder();
    await openAddModal();

    const typeSelect = screen.getByLabelText(/tipe pertanyaan/i);
    const options = Array.from(typeSelect.querySelectorAll('option'));
    const optionValues = options.map((o) => o.value);
    expect(optionValues).toContain('rating_scale');

    const ratingOption = options.find((o) => o.value === 'rating_scale');
    expect(ratingOption?.textContent).toBe('Rating Scale');
  });

  test('memilih "Rating Scale" menampilkan section konfigurasi rating', async () => {
    renderSurveyBuilder();
    await openAddModal();

    const typeSelect = screen.getByLabelText(/tipe pertanyaan/i);
    fireEvent.change(typeSelect, { target: { value: 'rating_scale' } });

    await waitFor(() => {
      expect(screen.getByText('Konfigurasi Rating Scale')).toBeInTheDocument();
    });
  });

  test('mengubah tipe dari "Rating Scale" ke "Teks Pendek" menyembunyikan section konfigurasi', async () => {
    renderSurveyBuilder();
    await openAddModal();

    const typeSelect = screen.getByLabelText(/tipe pertanyaan/i);

    // Select rating_scale first
    fireEvent.change(typeSelect, { target: { value: 'rating_scale' } });

    await waitFor(() => {
      expect(screen.getByText('Konfigurasi Rating Scale')).toBeInTheDocument();
    });

    // Change to short_text
    fireEvent.change(typeSelect, { target: { value: 'short_text' } });

    await waitFor(() => {
      expect(screen.queryByText('Konfigurasi Rating Scale')).not.toBeInTheDocument();
    });
  });

  test('nilai default yang ditampilkan: min=1, max=5, display=stars', async () => {
    renderSurveyBuilder();
    await openAddModal();

    const typeSelect = screen.getByLabelText(/tipe pertanyaan/i);
    fireEvent.change(typeSelect, { target: { value: 'rating_scale' } });

    await waitFor(() => {
      expect(screen.getByText('Konfigurasi Rating Scale')).toBeInTheDocument();
    });

    const minInput = screen.getByLabelText(/nilai minimum rating/i);
    const maxInput = screen.getByLabelText(/nilai maksimum rating/i);
    const displaySelect = screen.getByLabelText(/mode tampilan rating/i);

    expect(minInput.value).toBe('1');
    expect(maxInput.value).toBe('5');
    expect(displaySelect.value).toBe('stars');
  });

  test('saat submit dengan tipe rating_scale, payload menyertakan options dengan konfigurasi yang benar', async () => {
    api.post.mockResolvedValue({
      data: { id: 'new-q', type: 'rating_scale', options: { min: 1, max: 5, display: 'stars', labels: {} } },
    });

    renderSurveyBuilder();
    await openAddModal();

    // Fill in question text
    const textArea = screen.getByLabelText(/teks pertanyaan/i);
    fireEvent.change(textArea, { target: { value: 'Berikan penilaian Anda' } });

    // Select rating_scale type
    const typeSelect = screen.getByLabelText(/tipe pertanyaan/i);
    fireEvent.change(typeSelect, { target: { value: 'rating_scale' } });

    await waitFor(() => {
      expect(screen.getByText('Konfigurasi Rating Scale')).toBeInTheDocument();
    });

    // Submit the form - click the submit button inside the dialog
    const dialog = screen.getByRole('dialog');
    const submitBtn = dialog.querySelector('button[type="submit"]');
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith(
        expect.stringContaining('/questions'),
        expect.objectContaining({
          type: 'rating_scale',
          options: expect.objectContaining({
            min: 1,
            max: 5,
            display: 'stars',
            labels: expect.any(Object),
          }),
        })
      );
    });
  });

  test('saat edit pertanyaan rating_scale yang sudah ada, nilai konfigurasi tersimpan ditampilkan', async () => {
    const surveyWithRating = {
      ...mockSurvey,
      questions: [mockRatingQuestion],
    };
    api.get.mockResolvedValue({ data: surveyWithRating });

    renderSurveyBuilder();

    await waitFor(() => {
      expect(screen.getByText('Berikan penilaian Anda')).toBeInTheDocument();
    });

    // Click edit button for the rating question
    fireEvent.click(screen.getByRole('button', { name: /edit pertanyaan 1/i }));

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByText('Konfigurasi Rating Scale')).toBeInTheDocument();
    });

    const minInput = screen.getByLabelText(/nilai minimum rating/i);
    const maxInput = screen.getByLabelText(/nilai maksimum rating/i);
    const displaySelect = screen.getByLabelText(/mode tampilan rating/i);

    expect(minInput.value).toBe('2');
    expect(maxInput.value).toBe('8');
    expect(displaySelect.value).toBe('numbers');
  });
});

// ─── Mock data for phone_number and unique_id ─────────────────────────────────

const mockPhoneQuestion = {
  id: 'q-phone-001',
  survey_id: 'survey-001',
  text: 'Nomor telepon responden',
  type: 'phone_number',
  order_index: 1,
  is_required: false,
  randomize_options: false,
  options: { min_length: 8, max_length: 15 },
  skip_logic: null,
};

const mockUniqueIdQuestion = {
  id: 'q-uid-001',
  survey_id: 'survey-001',
  text: 'Nomor kuesioner',
  type: 'unique_id',
  order_index: 1,
  is_required: false,
  randomize_options: false,
  options: { min_length: 3, max_length: 10 },
  skip_logic: null,
};

// ─── Phone Number Tests ───────────────────────────────────────────────────────

describe('SurveyBuilder — Phone Number type option', () => {
  test('dropdown tipe menampilkan opsi "Nomor Telepon"', async () => {
    renderSurveyBuilder();
    await openAddModal();

    const typeSelect = screen.getByLabelText(/tipe pertanyaan/i);
    const options = Array.from(typeSelect.querySelectorAll('option'));
    const optionValues = options.map((o) => o.value);
    expect(optionValues).toContain('phone_number');

    const phoneOption = options.find((o) => o.value === 'phone_number');
    expect(phoneOption?.textContent).toBe('Nomor Telepon');
  });

  test('memilih "Nomor Telepon" menampilkan section konfigurasi phone', async () => {
    renderSurveyBuilder();
    await openAddModal();

    const typeSelect = screen.getByLabelText(/tipe pertanyaan/i);
    fireEvent.change(typeSelect, { target: { value: 'phone_number' } });

    await waitFor(() => {
      expect(screen.getByText('Konfigurasi Nomor Telepon')).toBeInTheDocument();
    });
  });

  test('mengubah tipe dari "Nomor Telepon" ke tipe lain menyembunyikan section konfigurasi', async () => {
    renderSurveyBuilder();
    await openAddModal();

    const typeSelect = screen.getByLabelText(/tipe pertanyaan/i);

    fireEvent.change(typeSelect, { target: { value: 'phone_number' } });
    await waitFor(() => {
      expect(screen.getByText('Konfigurasi Nomor Telepon')).toBeInTheDocument();
    });

    fireEvent.change(typeSelect, { target: { value: 'short_text' } });
    await waitFor(() => {
      expect(screen.queryByText('Konfigurasi Nomor Telepon')).not.toBeInTheDocument();
    });
  });

  test('nilai default phone config: min_length=10, max_length=13', async () => {
    renderSurveyBuilder();
    await openAddModal();

    const typeSelect = screen.getByLabelText(/tipe pertanyaan/i);
    fireEvent.change(typeSelect, { target: { value: 'phone_number' } });

    await waitFor(() => {
      expect(screen.getByText('Konfigurasi Nomor Telepon')).toBeInTheDocument();
    });

    // Scope queries within the phone config section
    const section = screen.getByText('Konfigurasi Nomor Telepon').closest('div.space-y-4');
    const minInput = section.querySelector('input[aria-label="Panjang minimum digit"]');
    const maxInput = section.querySelector('input[aria-label="Panjang maksimum digit"]');

    expect(minInput.value).toBe('10');
    expect(maxInput.value).toBe('13');
  });

  test('saat submit dengan tipe phone_number, payload menyertakan options', async () => {
    api.post.mockResolvedValue({
      data: { id: 'new-q', type: 'phone_number', options: { min_length: 10, max_length: 13 } },
    });

    renderSurveyBuilder();
    await openAddModal();

    const textArea = screen.getByLabelText(/teks pertanyaan/i);
    fireEvent.change(textArea, { target: { value: 'Nomor telepon responden' } });

    const typeSelect = screen.getByLabelText(/tipe pertanyaan/i);
    fireEvent.change(typeSelect, { target: { value: 'phone_number' } });

    await waitFor(() => {
      expect(screen.getByText('Konfigurasi Nomor Telepon')).toBeInTheDocument();
    });

    const dialog = screen.getByRole('dialog');
    const submitBtn = dialog.querySelector('button[type="submit"]');
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith(
        expect.stringContaining('/questions'),
        expect.objectContaining({
          type: 'phone_number',
          options: { min_length: 10, max_length: 13 },
        })
      );
    });
  });

  test('saat edit pertanyaan phone_number yang sudah ada, nilai konfigurasi tersimpan ditampilkan', async () => {
    const surveyWithPhone = {
      ...mockSurvey,
      questions: [mockPhoneQuestion],
    };
    api.get.mockResolvedValue({ data: surveyWithPhone });

    renderSurveyBuilder();

    await waitFor(() => {
      expect(screen.getByText('Nomor telepon responden')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /edit pertanyaan 1/i }));

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByText('Konfigurasi Nomor Telepon')).toBeInTheDocument();
    });

    const section = screen.getByText('Konfigurasi Nomor Telepon').closest('div.space-y-4');
    const minInput = section.querySelector('input[aria-label="Panjang minimum digit"]');
    const maxInput = section.querySelector('input[aria-label="Panjang maksimum digit"]');

    expect(minInput.value).toBe('8');
    expect(maxInput.value).toBe('15');
  });
});

// ─── Unique ID Tests ──────────────────────────────────────────────────────────

describe('SurveyBuilder — Unique ID type option', () => {
  test('dropdown tipe menampilkan opsi "Nomor Kuesioner (Unik)"', async () => {
    renderSurveyBuilder();
    await openAddModal();

    const typeSelect = screen.getByLabelText(/tipe pertanyaan/i);
    const options = Array.from(typeSelect.querySelectorAll('option'));
    const optionValues = options.map((o) => o.value);
    expect(optionValues).toContain('unique_id');

    const uidOption = options.find((o) => o.value === 'unique_id');
    expect(uidOption?.textContent).toBe('Nomor Kuesioner (Unik)');
  });

  test('memilih "Nomor Kuesioner (Unik)" menampilkan section konfigurasi unique_id', async () => {
    renderSurveyBuilder();
    await openAddModal();

    const typeSelect = screen.getByLabelText(/tipe pertanyaan/i);
    fireEvent.change(typeSelect, { target: { value: 'unique_id' } });

    await waitFor(() => {
      expect(screen.getByText('Konfigurasi Nomor Kuesioner (Unik)')).toBeInTheDocument();
    });
  });

  test('mengubah tipe dari "Nomor Kuesioner (Unik)" ke tipe lain menyembunyikan section konfigurasi', async () => {
    renderSurveyBuilder();
    await openAddModal();

    const typeSelect = screen.getByLabelText(/tipe pertanyaan/i);

    fireEvent.change(typeSelect, { target: { value: 'unique_id' } });
    await waitFor(() => {
      expect(screen.getByText('Konfigurasi Nomor Kuesioner (Unik)')).toBeInTheDocument();
    });

    fireEvent.change(typeSelect, { target: { value: 'short_text' } });
    await waitFor(() => {
      expect(screen.queryByText('Konfigurasi Nomor Kuesioner (Unik)')).not.toBeInTheDocument();
    });
  });

  test('nilai default unique_id config: min_length=1, max_length=20', async () => {
    renderSurveyBuilder();
    await openAddModal();

    const typeSelect = screen.getByLabelText(/tipe pertanyaan/i);
    fireEvent.change(typeSelect, { target: { value: 'unique_id' } });

    await waitFor(() => {
      expect(screen.getByText('Konfigurasi Nomor Kuesioner (Unik)')).toBeInTheDocument();
    });

    const section = screen.getByText('Konfigurasi Nomor Kuesioner (Unik)').closest('div.space-y-4');
    const minInput = section.querySelector('input[aria-label="Panjang minimum digit"]');
    const maxInput = section.querySelector('input[aria-label="Panjang maksimum digit"]');

    expect(minInput.value).toBe('1');
    expect(maxInput.value).toBe('20');
  });

  test('saat submit dengan tipe unique_id, payload menyertakan options', async () => {
    api.post.mockResolvedValue({
      data: { id: 'new-q', type: 'unique_id', options: { min_length: 1, max_length: 20 } },
    });

    renderSurveyBuilder();
    await openAddModal();

    const textArea = screen.getByLabelText(/teks pertanyaan/i);
    fireEvent.change(textArea, { target: { value: 'Nomor kuesioner' } });

    const typeSelect = screen.getByLabelText(/tipe pertanyaan/i);
    fireEvent.change(typeSelect, { target: { value: 'unique_id' } });

    await waitFor(() => {
      expect(screen.getByText('Konfigurasi Nomor Kuesioner (Unik)')).toBeInTheDocument();
    });

    const dialog = screen.getByRole('dialog');
    const submitBtn = dialog.querySelector('button[type="submit"]');
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith(
        expect.stringContaining('/questions'),
        expect.objectContaining({
          type: 'unique_id',
          options: { min_length: 1, max_length: 20 },
        })
      );
    });
  });

  test('saat edit pertanyaan unique_id yang sudah ada, nilai konfigurasi tersimpan ditampilkan', async () => {
    const surveyWithUniqueId = {
      ...mockSurvey,
      questions: [mockUniqueIdQuestion],
    };
    api.get.mockResolvedValue({ data: surveyWithUniqueId });

    renderSurveyBuilder();

    await waitFor(() => {
      expect(screen.getByText('Nomor kuesioner')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /edit pertanyaan 1/i }));

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByText('Konfigurasi Nomor Kuesioner (Unik)')).toBeInTheDocument();
    });

    const section = screen.getByText('Konfigurasi Nomor Kuesioner (Unik)').closest('div.space-y-4');
    const minInput = section.querySelector('input[aria-label="Panjang minimum digit"]');
    const maxInput = section.querySelector('input[aria-label="Panjang maksimum digit"]');

    expect(minInput.value).toBe('3');
    expect(maxInput.value).toBe('10');
  });
});
