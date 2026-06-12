/**
 * Unit Tests for Surveys page — Clone/Duplikasi functionality
 *
 * Tests:
 *   - Tombol "Duplikasi" muncul di setiap baris survei (untuk semua status)
 *   - Klik "Duplikasi" memanggil api.post('/surveys/{id}/clone')
 *   - Saat loading, tombol disabled dan teks berubah menjadi "Menduplikasi…"
 *   - Setelah sukses, navigate dipanggil dengan /surveys/{newId}/builder
 *   - Setelah sukses, pesan sukses ditampilkan di halaman
 *   - Setelah error, pesan error ditampilkan dan tombol kembali ke kondisi normal
 *
 * Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6
 */

import React from 'react';
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider } from '../../components/Toast';
import Surveys from '../Surveys.jsx';

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

// ─── Mock react-router-dom navigate ──────────────────────────────────────────
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// ─── Mock Layout ──────────────────────────────────────────────────────────────
vi.mock('../../components/Layout', () => ({
  default: ({ children }) => <div>{children}</div>,
}));

import api from '../../services/api';

// ─── Mock data ────────────────────────────────────────────────────────────────
const mockSurveys = [
  {
    id: 'survey-uuid-001',
    title: 'Survei Draft',
    description: 'Deskripsi draft',
    status: 'draft',
    question_count: 3,
    response_count: 0,
    created_at: '2024-01-01T00:00:00Z',
  },
  {
    id: 'survey-uuid-002',
    title: 'Survei Aktif',
    description: 'Deskripsi aktif',
    status: 'active',
    question_count: 5,
    response_count: 10,
    created_at: '2024-02-01T00:00:00Z',
  },
  {
    id: 'survey-uuid-003',
    title: 'Survei Nonaktif',
    description: 'Deskripsi nonaktif',
    status: 'inactive',
    question_count: 2,
    response_count: 3,
    created_at: '2024-03-01T00:00:00Z',
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function renderPage() {
  return render(
    <MemoryRouter>
      <ToastProvider>
        <Surveys />
      </ToastProvider>
    </MemoryRouter>
  );
}

// ─── Setup ────────────────────────────────────────────────────────────────────
beforeEach(() => {
  vi.clearAllMocks();
  mockNavigate.mockClear();
  // Default: return mock surveys for GET /surveys
  api.get.mockResolvedValue({ data: mockSurveys });
});

afterEach(() => {
  vi.clearAllMocks();
});

// ─── Tombol Duplikasi muncul ──────────────────────────────────────────────────

describe('Tombol Duplikasi — visibilitas', () => {
  test('tombol "Duplikasi" muncul di setiap baris survei', async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Survei Draft')).toBeInTheDocument();
    });

    const duplikasiButtons = screen.getAllByRole('button', { name: /duplikasi survei/i });
    expect(duplikasiButtons).toHaveLength(3);
  });

  test('tombol "Duplikasi" muncul untuk survei berstatus draft', async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Survei Draft')).toBeInTheDocument();
    });

    expect(
      screen.getByRole('button', { name: /duplikasi survei survei draft/i })
    ).toBeInTheDocument();
  });

  test('tombol "Duplikasi" muncul untuk survei berstatus active', async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Survei Aktif')).toBeInTheDocument();
    });

    expect(
      screen.getByRole('button', { name: /duplikasi survei survei aktif/i })
    ).toBeInTheDocument();
  });

  test('tombol "Duplikasi" muncul untuk survei berstatus inactive', async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Survei Nonaktif')).toBeInTheDocument();
    });

    expect(
      screen.getByRole('button', { name: /duplikasi survei survei nonaktif/i })
    ).toBeInTheDocument();
  });
});

// ─── Klik Duplikasi memanggil api.post ───────────────────────────────────────

describe('Klik Duplikasi — api call', () => {
  test('klik "Duplikasi" memanggil api.post dengan endpoint yang benar', async () => {
    api.post.mockResolvedValue({
      data: { id: 'cloned-uuid-001', title: 'Salinan dari Survei Draft', status: 'draft' },
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Survei Draft')).toBeInTheDocument();
    });

    const duplikasiBtn = screen.getByRole('button', {
      name: /duplikasi survei survei draft/i,
    });
    fireEvent.click(duplikasiBtn);

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/surveys/survey-uuid-001/clone');
    });
  });
});

// ─── Loading state ────────────────────────────────────────────────────────────

describe('Loading state saat duplikasi', () => {
  test('saat loading, tombol disabled dan teks berubah menjadi "Menduplikasi…"', async () => {
    // Never resolves during this test to keep loading state
    let resolveClone;
    api.post.mockReturnValue(
      new Promise((resolve) => {
        resolveClone = resolve;
      })
    );

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Survei Draft')).toBeInTheDocument();
    });

    const duplikasiBtn = screen.getByRole('button', {
      name: /duplikasi survei survei draft/i,
    });
    fireEvent.click(duplikasiBtn);

    await waitFor(() => {
      expect(screen.getByText('Menduplikasi…')).toBeInTheDocument();
    });

    // The button should be disabled
    const loadingBtn = screen.getByText('Menduplikasi…').closest('button');
    expect(loadingBtn).toBeDisabled();

    // Cleanup: resolve the promise
    resolveClone({ data: { id: 'cloned-uuid-001' } });
  });
});

// ─── Setelah sukses ───────────────────────────────────────────────────────────

describe('Setelah duplikasi sukses', () => {
  test('navigate dipanggil dengan /surveys/{newId}/builder', async () => {
    api.post.mockResolvedValue({
      data: { id: 'cloned-uuid-001', title: 'Salinan dari Survei Draft', status: 'draft' },
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Survei Draft')).toBeInTheDocument();
    });

    fireEvent.click(
      screen.getByRole('button', { name: /duplikasi survei survei draft/i })
    );

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/surveys/cloned-uuid-001/builder');
    });
  });

  test('pesan sukses ditampilkan setelah duplikasi berhasil', async () => {
    api.post.mockResolvedValue({
      data: { id: 'cloned-uuid-001', title: 'Salinan dari Survei Draft', status: 'draft' },
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Survei Draft')).toBeInTheDocument();
    });

    fireEvent.click(
      screen.getByRole('button', { name: /duplikasi survei survei draft/i })
    );

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(/berhasil diduplikasi/i);
    });
  });
});

// ─── Setelah error ────────────────────────────────────────────────────────────

describe('Setelah duplikasi error', () => {
  test('pesan error ditampilkan setelah duplikasi gagal', async () => {
    api.post.mockRejectedValue({
      response: { data: { error: 'Gagal menduplikasi survei.' } },
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Survei Draft')).toBeInTheDocument();
    });

    fireEvent.click(
      screen.getByRole('button', { name: /duplikasi survei survei draft/i })
    );

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/gagal menduplikasi survei/i);
    });
  });

  test('tombol kembali ke kondisi normal (tidak disabled) setelah error', async () => {
    api.post.mockRejectedValue({
      response: { data: { error: 'Gagal menduplikasi survei.' } },
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Survei Draft')).toBeInTheDocument();
    });

    fireEvent.click(
      screen.getByRole('button', { name: /duplikasi survei survei draft/i })
    );

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });

    // Button should be back to normal (not disabled, text is "Duplikasi")
    const duplikasiBtn = screen.getByRole('button', {
      name: /duplikasi survei survei draft/i,
    });
    expect(duplikasiBtn).not.toBeDisabled();
    expect(duplikasiBtn).toHaveTextContent('Duplikasi');
  });

  test('navigate tidak dipanggil setelah error', async () => {
    api.post.mockRejectedValue({
      response: { data: { error: 'Survei tidak ditemukan' } },
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Survei Draft')).toBeInTheDocument();
    });

    fireEvent.click(
      screen.getByRole('button', { name: /duplikasi survei survei draft/i })
    );

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });

    expect(mockNavigate).not.toHaveBeenCalledWith(
      expect.stringContaining('/builder')
    );
  });
});
