/**
 * Unit Tests for ResponseDetail page — rating_scale display
 *
 * Tests:
 *   - Jawaban rating_scale mode stars dengan nilai "3" dan max=5 menampilkan 3 bintang terisi dan 2 bintang kosong
 *   - Jawaban rating_scale mode numbers dengan nilai "7" menampilkan badge angka "7"
 *   - answer_value kosong menampilkan "—"
 *   - Badge tipe menampilkan teks "Rating Scale"
 *   - labels.min dan labels.max ditampilkan jika tersedia di question_options
 *
 * Requirements: 7.1, 7.2, 7.3, 7.4
 */

import React from 'react';
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ResponseDetail from '../ResponseDetail.jsx';

// ─── Mock api ─────────────────────────────────────────────────────────────────
vi.mock('../../services/api', () => ({
  default: {
    get: vi.fn(),
  },
}));

import api from '../../services/api';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function renderResponseDetail(id = 'response-001') {
  return render(
    <MemoryRouter initialEntries={[`/responses/${id}`]}>
      <ResponseDetail />
    </MemoryRouter>
  );
}

function buildMockResponse(answers = []) {
  return {
    id: 'response-001',
    questionnaire_number: 'SRV-20240101-0001',
    survey_id: 'survey-001',
    survey_title: 'Test Survey',
    surveyor_id: 'surveyor-001',
    surveyor_name: 'Budi',
    start_time: '2024-01-01T08:00:00Z',
    end_time: '2024-01-01T08:30:00Z',
    duration_seconds: 1800,
    latitude: null,
    longitude: null,
    geo_status: 'lokasi_tidak_tersedia',
    created_at: '2024-01-01T08:30:00Z',
    answers,
  };
}

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ResponseDetail — rating_scale display', () => {
  test('jawaban rating_scale mode stars dengan nilai "3" dan max=5 menampilkan 3 bintang terisi dan 2 bintang kosong', async () => {
    api.get.mockResolvedValue({
      data: buildMockResponse([
        {
          id: 'answer-001',
          question_id: 'q-001',
          answer_value: '3',
          answer_json: null,
          photo_path: null,
          question_text: 'Berikan penilaian Anda',
          question_type: 'rating_scale',
          question_order: 1,
          question_options: { min: 1, max: 5, display: 'stars', labels: {} },
        },
      ]),
    });

    renderResponseDetail();

    await waitFor(() => {
      expect(screen.getByText('Berikan penilaian Anda')).toBeInTheDocument();
    });

    // Check that "3/5" is displayed
    expect(screen.getByText('3/5')).toBeInTheDocument();

    // Check stars: 3 amber, 2 gray
    const stars = screen.getAllByText('★');
    expect(stars).toHaveLength(5);

    const amberStars = stars.filter((s) => s.className.includes('text-amber-400'));
    const grayStars = stars.filter((s) => s.className.includes('text-gray-200'));
    expect(amberStars).toHaveLength(3);
    expect(grayStars).toHaveLength(2);
  });

  test('jawaban rating_scale mode numbers dengan nilai "7" menampilkan badge angka "7"', async () => {
    api.get.mockResolvedValue({
      data: buildMockResponse([
        {
          id: 'answer-002',
          question_id: 'q-002',
          answer_value: '7',
          answer_json: null,
          photo_path: null,
          question_text: 'Nilai kepuasan Anda',
          question_type: 'rating_scale',
          question_order: 1,
          question_options: { min: 1, max: 10, display: 'numbers', labels: {} },
        },
      ]),
    });

    renderResponseDetail();

    await waitFor(() => {
      expect(screen.getByText('Nilai kepuasan Anda')).toBeInTheDocument();
    });

    // Badge with value 7
    const badge = screen.getByText('7');
    expect(badge.className).toContain('bg-primary-600');
    expect(screen.getByText('dari 10')).toBeInTheDocument();
  });

  test('answer_value kosong menampilkan "—"', async () => {
    api.get.mockResolvedValue({
      data: buildMockResponse([
        {
          id: 'answer-003',
          question_id: 'q-003',
          answer_value: null,
          answer_json: null,
          photo_path: null,
          question_text: 'Berikan penilaian Anda',
          question_type: 'rating_scale',
          question_order: 1,
          question_options: { min: 1, max: 5, display: 'stars', labels: {} },
        },
      ]),
    });

    renderResponseDetail();

    await waitFor(() => {
      expect(screen.getByText('Berikan penilaian Anda')).toBeInTheDocument();
    });

    // Should show em dash
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  test('badge tipe menampilkan teks "Rating Scale"', async () => {
    api.get.mockResolvedValue({
      data: buildMockResponse([
        {
          id: 'answer-004',
          question_id: 'q-004',
          answer_value: '4',
          answer_json: null,
          photo_path: null,
          question_text: 'Berikan penilaian Anda',
          question_type: 'rating_scale',
          question_order: 1,
          question_options: { min: 1, max: 5, display: 'stars', labels: {} },
        },
      ]),
    });

    renderResponseDetail();

    await waitFor(() => {
      expect(screen.getByText('Rating Scale')).toBeInTheDocument();
    });
  });

  test('labels.min dan labels.max ditampilkan jika tersedia di question_options', async () => {
    api.get.mockResolvedValue({
      data: buildMockResponse([
        {
          id: 'answer-005',
          question_id: 'q-005',
          answer_value: '3',
          answer_json: null,
          photo_path: null,
          question_text: 'Berikan penilaian Anda',
          question_type: 'rating_scale',
          question_order: 1,
          question_options: {
            min: 1,
            max: 5,
            display: 'stars',
            labels: { min: 'Sangat Tidak Puas', max: 'Sangat Puas' },
          },
        },
      ]),
    });

    renderResponseDetail();

    await waitFor(() => {
      expect(screen.getByText('Sangat Tidak Puas')).toBeInTheDocument();
      expect(screen.getByText('Sangat Puas')).toBeInTheDocument();
    });
  });
});


// ─── Phone Number & Unique ID display tests ──────────────────────────────────
// Requirements: 11.1, 11.2, 11.3, 11.4, 11.5

describe('ResponseDetail — phone_number and unique_id display', () => {
  test('badge tipe menampilkan "Nomor Telepon" untuk phone_number', async () => {
    api.get.mockResolvedValue({
      data: buildMockResponse([
        {
          id: 'answer-phone-001',
          question_id: 'q-phone-001',
          answer_value: '08123456789',
          answer_json: null,
          photo_path: null,
          question_text: 'Nomor telepon responden',
          question_type: 'phone_number',
          question_order: 1,
          question_options: { min_length: 10, max_length: 13 },
        },
      ]),
    });

    renderResponseDetail();

    await waitFor(() => {
      expect(screen.getByText('Nomor Telepon')).toBeInTheDocument();
    });
  });

  test('badge tipe menampilkan "Nomor Kuesioner (Unik)" untuk unique_id', async () => {
    api.get.mockResolvedValue({
      data: buildMockResponse([
        {
          id: 'answer-uid-001',
          question_id: 'q-uid-001',
          answer_value: '00123',
          answer_json: null,
          photo_path: null,
          question_text: 'Nomor kuesioner manual',
          question_type: 'unique_id',
          question_order: 1,
          question_options: { min_length: 1, max_length: 20 },
        },
      ]),
    });

    renderResponseDetail();

    await waitFor(() => {
      expect(screen.getByText('Nomor Kuesioner (Unik)')).toBeInTheDocument();
    });
  });

  test('nilai answer_value phone_number ditampilkan sebagai teks angka', async () => {
    api.get.mockResolvedValue({
      data: buildMockResponse([
        {
          id: 'answer-phone-002',
          question_id: 'q-phone-002',
          answer_value: '081234567890',
          answer_json: null,
          photo_path: null,
          question_text: 'Nomor telepon responden',
          question_type: 'phone_number',
          question_order: 1,
          question_options: { min_length: 10, max_length: 13 },
        },
      ]),
    });

    renderResponseDetail();

    await waitFor(() => {
      expect(screen.getByText('081234567890')).toBeInTheDocument();
    });
  });

  test('nilai answer_value unique_id ditampilkan sebagai teks angka', async () => {
    api.get.mockResolvedValue({
      data: buildMockResponse([
        {
          id: 'answer-uid-002',
          question_id: 'q-uid-002',
          answer_value: '99887',
          answer_json: null,
          photo_path: null,
          question_text: 'Nomor kuesioner manual',
          question_type: 'unique_id',
          question_order: 1,
          question_options: { min_length: 1, max_length: 20 },
        },
      ]),
    });

    renderResponseDetail();

    await waitFor(() => {
      expect(screen.getByText('99887')).toBeInTheDocument();
    });
  });

  test('answer_value kosong untuk phone_number menampilkan em dash', async () => {
    api.get.mockResolvedValue({
      data: buildMockResponse([
        {
          id: 'answer-phone-003',
          question_id: 'q-phone-003',
          answer_value: null,
          answer_json: null,
          photo_path: null,
          question_text: 'Nomor telepon responden',
          question_type: 'phone_number',
          question_order: 1,
          question_options: { min_length: 10, max_length: 13 },
        },
      ]),
    });

    renderResponseDetail();

    await waitFor(() => {
      expect(screen.getByText('Nomor telepon responden')).toBeInTheDocument();
    });

    // The default renderValue returns answer_value ?? '—'
    const answerSection = screen.getByText('Nomor telepon responden').closest('.space-y-2');
    expect(answerSection).toHaveTextContent('—');
  });

  test('answer_value kosong untuk unique_id menampilkan em dash', async () => {
    api.get.mockResolvedValue({
      data: buildMockResponse([
        {
          id: 'answer-uid-003',
          question_id: 'q-uid-003',
          answer_value: null,
          answer_json: null,
          photo_path: null,
          question_text: 'Nomor kuesioner manual',
          question_type: 'unique_id',
          question_order: 1,
          question_options: { min_length: 1, max_length: 20 },
        },
      ]),
    });

    renderResponseDetail();

    await waitFor(() => {
      expect(screen.getByText('Nomor kuesioner manual')).toBeInTheDocument();
    });

    const answerSection = screen.getByText('Nomor kuesioner manual').closest('.space-y-2');
    expect(answerSection).toHaveTextContent('—');
  });
});
