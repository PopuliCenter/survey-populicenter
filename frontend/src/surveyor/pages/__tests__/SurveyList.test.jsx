/**
 * Unit Tests for SurveyList page
 *
 * Tests:
 *   - renders list of active surveys
 *   - shows quota progress when quota is set
 *   - shows "Tidak ada target" when no quota
 *   - shows "Target Terpenuhi" when filled >= quota
 *   - shows session counter from sessionStorage
 *
 * Requirements: 9.4, 14.3, 14.4, 14.5, 14.8
 */

import React from 'react';
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// Mock the api module
vi.mock('../../../services/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

import api from '../../../services/api';
import SurveyList from '../SurveyList.jsx';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function renderSurveyList() {
  return render(
    <MemoryRouter>
      <SurveyList />
    </MemoryRouter>
  );
}

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  localStorage.clear();

  // Default: user in localStorage
  localStorage.setItem('user', JSON.stringify({ id: 'user-1', name: 'Budi', email: 'budi@test.com' }));
});

afterEach(() => {
  sessionStorage.clear();
  localStorage.clear();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('SurveyList', () => {
  test('menampilkan daftar survei aktif', async () => {
    api.get.mockImplementation((url) => {
      if (url === '/surveys') {
        return Promise.resolve({
          data: [
            { id: 'survey-1', title: 'Survei Kesehatan', description: 'Deskripsi survei' },
            { id: 'survey-2', title: 'Survei Pendidikan', description: null },
          ],
        });
      }
      if (url.includes('/quota')) {
        return Promise.resolve({ data: [] });
      }
      return Promise.resolve({ data: [] });
    });

    renderSurveyList();

    await waitFor(() => {
      expect(screen.getByText('Survei Kesehatan')).toBeInTheDocument();
      expect(screen.getByText('Survei Pendidikan')).toBeInTheDocument();
    });
  });

  test('menampilkan progres kuota ketika kuota ditetapkan', async () => {
    api.get.mockImplementation((url) => {
      if (url === '/surveys') {
        return Promise.resolve({
          data: [{ id: 'survey-1', title: 'Survei A', description: null }],
        });
      }
      if (url.includes('/quota')) {
        return Promise.resolve({
          data: [{ survey_id: 'survey-1', quota: 10, filled: 5 }],
        });
      }
      return Promise.resolve({ data: [] });
    });

    renderSurveyList();

    await waitFor(() => {
      // QuotaProgress renders "5 / 10"
      expect(screen.getByText('5 / 10')).toBeInTheDocument();
    });
  });

  test('menampilkan "Tidak ada target" ketika kuota tidak ditetapkan', async () => {
    api.get.mockImplementation((url) => {
      if (url === '/surveys') {
        return Promise.resolve({
          data: [{ id: 'survey-1', title: 'Survei Tanpa Kuota', description: null }],
        });
      }
      if (url.includes('/quota')) {
        return Promise.resolve({ data: [] }); // no quota data
      }
      return Promise.resolve({ data: [] });
    });

    renderSurveyList();

    await waitFor(() => {
      expect(screen.getByText('Tidak ada target')).toBeInTheDocument();
    });
  });

  test('menampilkan "Target Terpenuhi" ketika filled >= quota', async () => {
    api.get.mockImplementation((url) => {
      if (url === '/surveys') {
        return Promise.resolve({
          data: [{ id: 'survey-1', title: 'Survei Terpenuhi', description: null }],
        });
      }
      if (url.includes('/quota')) {
        return Promise.resolve({
          data: [{ survey_id: 'survey-1', quota: 10, filled: 10 }],
        });
      }
      return Promise.resolve({ data: [] });
    });

    renderSurveyList();

    await waitFor(() => {
      // Both the QuotaProgress badge and the SurveyList notification should show
      const targetMet = screen.getAllByText('Target Terpenuhi');
      expect(targetMet.length).toBeGreaterThan(0);
    });
  });

  test('menampilkan penghitung sesi dari sessionStorage', async () => {
    // Set session count in sessionStorage
    sessionStorage.setItem('session_response_count', '7');

    api.get.mockImplementation((url) => {
      if (url === '/surveys') {
        return Promise.resolve({ data: [] });
      }
      if (url.includes('/quota')) {
        return Promise.resolve({ data: [] });
      }
      return Promise.resolve({ data: [] });
    });

    renderSurveyList();

    await waitFor(() => {
      expect(screen.getByText('7')).toBeInTheDocument();
    });
  });

  test('menampilkan 0 sebagai penghitung sesi ketika sessionStorage kosong', async () => {
    api.get.mockImplementation((url) => {
      if (url === '/surveys') {
        return Promise.resolve({ data: [] });
      }
      if (url.includes('/quota')) {
        return Promise.resolve({ data: [] });
      }
      return Promise.resolve({ data: [] });
    });

    renderSurveyList();

    await waitFor(() => {
      expect(screen.getByText('0')).toBeInTheDocument();
    });
  });

  // ─── Requirement 6.2: disable button and show "Kuota Tercapai" when quota met ─

  test('menonaktifkan tombol dan menampilkan "Kuota Tercapai" saat kuota tercapai', async () => {
    api.get.mockImplementation((url) => {
      if (url === '/surveys') {
        return Promise.resolve({
          data: [{ id: 'survey-1', title: 'Survei Full', description: null }],
        });
      }
      if (url.includes('/quota')) {
        return Promise.resolve({
          data: [{ survey_id: 'survey-1', quota: 5, filled: 5 }],
        });
      }
      return Promise.resolve({ data: [] });
    });

    renderSurveyList();

    await waitFor(() => {
      const button = screen.getByRole('button', { name: /kuota tercapai/i });
      expect(button).toBeInTheDocument();
      expect(button).toBeDisabled();
      expect(button).toHaveTextContent('Kuota Tercapai');
    });
  });

  test('menampilkan tombol "Mulai Isi" yang aktif saat kuota belum tercapai', async () => {
    api.get.mockImplementation((url) => {
      if (url === '/surveys') {
        return Promise.resolve({
          data: [{ id: 'survey-1', title: 'Survei Aktif', description: null }],
        });
      }
      if (url.includes('/quota')) {
        return Promise.resolve({
          data: [{ survey_id: 'survey-1', quota: 10, filled: 3 }],
        });
      }
      return Promise.resolve({ data: [] });
    });

    renderSurveyList();

    await waitFor(() => {
      const button = screen.getByRole('button', { name: /mulai isi/i });
      expect(button).toBeInTheDocument();
      expect(button).not.toBeDisabled();
      expect(button).toHaveTextContent('Mulai Isi');
    });
  });

  test('menonaktifkan tombol saat kuota melebihi (filled > quota)', async () => {
    api.get.mockImplementation((url) => {
      if (url === '/surveys') {
        return Promise.resolve({
          data: [{ id: 'survey-1', title: 'Survei Overflow', description: null }],
        });
      }
      if (url.includes('/quota')) {
        return Promise.resolve({
          data: [{ survey_id: 'survey-1', quota: 5, filled: 7 }],
        });
      }
      return Promise.resolve({ data: [] });
    });

    renderSurveyList();

    await waitFor(() => {
      const button = screen.getByRole('button', { name: /kuota tercapai/i });
      expect(button).toBeDisabled();
      expect(button).toHaveTextContent('Kuota Tercapai');
    });
  });

  test('menampilkan pesan ketika tidak ada survei aktif', async () => {
    api.get.mockImplementation((url) => {
      if (url === '/surveys') {
        return Promise.resolve({ data: [] });
      }
      if (url.includes('/quota')) {
        return Promise.resolve({ data: [] });
      }
      return Promise.resolve({ data: [] });
    });

    renderSurveyList();

    await waitFor(() => {
      expect(screen.getByText('Tidak ada survei aktif saat ini.')).toBeInTheDocument();
    });
  });
});
