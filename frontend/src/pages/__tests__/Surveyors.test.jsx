/**
 * Unit Tests for Surveyors page — Delete surveyor functionality
 *
 * Tests:
 *   - Tombol "Hapus" muncul untuk setiap baris ketika currentUser.role === 'admin'
 *   - Tombol "Hapus" tidak muncul ketika currentUser.role === 'supervisor'
 *   - Klik tombol "Hapus" menampilkan confirmation inline dengan nama surveyor
 *   - Klik "Batal" menutup confirmation tanpa memanggil api.delete
 *   - Klik "Ya, Hapus" memanggil api.delete('/surveyors/{id}')
 *   - Setelah sukses — pesan sukses muncul, list di-refresh
 *
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 7.2, 7.3, 7.5
 */

import React from 'react';
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Surveyors from '../Surveyors.jsx';

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

// ─── Mock Layout ──────────────────────────────────────────────────────────────
vi.mock('../../components/Layout', () => ({
  default: ({ children }) => <div>{children}</div>,
}));

// ─── Mock QuotaProgress ───────────────────────────────────────────────────────
vi.mock('../../components/QuotaProgress', () => ({
  default: () => <div data-testid="quota-progress" />,
}));

import api from '../../services/api';

// ─── Mock data ────────────────────────────────────────────────────────────────
const mockSurveyors = [
  { id: '1', name: 'Surveyor One', email: 'surveyor1@test.com', is_active: true, response_count: 5, created_at: '2024-01-01T00:00:00Z' },
  { id: '2', name: 'Surveyor Two', email: 'surveyor2@test.com', is_active: false, response_count: 0, created_at: '2024-02-01T00:00:00Z' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function setUser(role, id = '1') {
  localStorage.setItem('user', JSON.stringify({ id, name: 'Test User', email: 'test@test.com', role }));
}

function renderPage() {
  return render(
    <MemoryRouter>
      <Surveyors />
    </MemoryRouter>
  );
}

// ─── Setup ────────────────────────────────────────────────────────────────────
beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  api.get.mockResolvedValue({ data: mockSurveyors });
});

afterEach(() => {
  localStorage.clear();
});

// ─── Delete surveyor functionality ───────────────────────────────────────────

describe('Delete surveyor functionality', () => {
  test('tombol "Hapus" muncul untuk setiap baris ketika currentUser.role === "admin"', async () => {
    setUser('admin', '99'); // id 99 so not matching any surveyor
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Surveyor One')).toBeInTheDocument();
    });

    // Both rows should have a "Hapus" button
    const hapusButtons = screen.getAllByRole('button', { name: /hapus surveyor/i });
    expect(hapusButtons).toHaveLength(2);
  });

  test('tombol "Hapus" tidak muncul ketika currentUser.role === "supervisor"', async () => {
    setUser('supervisor', '99');
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Surveyor One')).toBeInTheDocument();
    });

    expect(screen.queryByRole('button', { name: /hapus surveyor/i })).not.toBeInTheDocument();
  });

  test('klik tombol "Hapus" menampilkan confirmation inline dengan nama surveyor', async () => {
    setUser('admin', '99');
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Surveyor One')).toBeInTheDocument();
    });

    const hapusBtn = screen.getByRole('button', { name: /hapus surveyor surveyor one/i });
    fireEvent.click(hapusBtn);

    await waitFor(() => {
      expect(screen.getByText('Hapus permanen?')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /konfirmasi hapus surveyor one/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /batal hapus/i })).toBeInTheDocument();
    });
  });

  test('klik "Batal" menutup confirmation tanpa memanggil api.delete', async () => {
    setUser('admin', '99');
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Surveyor One')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /hapus surveyor surveyor one/i }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /batal hapus/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /batal hapus/i }));

    await waitFor(() => {
      expect(screen.queryByText('Hapus permanen?')).not.toBeInTheDocument();
    });

    expect(api.delete).not.toHaveBeenCalled();
  });

  test('klik "Ya, Hapus" memanggil api.delete(\'/surveyors/{id}\')', async () => {
    setUser('admin', '99');
    api.delete.mockResolvedValue({ data: { message: 'Akun Surveyor One berhasil dihapus' } });
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Surveyor One')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /hapus surveyor surveyor one/i }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /konfirmasi hapus surveyor one/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /konfirmasi hapus surveyor one/i }));

    await waitFor(() => {
      expect(api.delete).toHaveBeenCalledWith('/surveyors/1');
    });
  });

  test('setelah sukses — pesan sukses muncul, list di-refresh', async () => {
    setUser('admin', '99');
    api.delete.mockResolvedValue({ data: { message: 'Akun Surveyor One berhasil dihapus' } });
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Surveyor One')).toBeInTheDocument();
    });

    const initialGetCallCount = api.get.mock.calls.length;

    fireEvent.click(screen.getByRole('button', { name: /hapus surveyor surveyor one/i }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /konfirmasi hapus surveyor one/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /konfirmasi hapus surveyor one/i }));

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(/berhasil dihapus/i);
    });

    expect(api.get.mock.calls.length).toBeGreaterThan(initialGetCallCount);
  });
});
