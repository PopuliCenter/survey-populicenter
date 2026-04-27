/**
 * Unit Tests for UserManagement page
 *
 * Tests:
 *   - Admin sees all three tabs (Admin, Supervisor, Viewer)
 *   - Supervisor sees only the Viewer tab
 *   - Form modal for admin shows role dropdown with three options
 *   - Form modal for supervisor shows only Viewer option (read-only)
 *   - Nonaktifkan button is disabled (rendered as span) for own account
 *   - Table renders user data correctly
 *   - Tab switching fetches data from the correct endpoint
 *
 * Requirements: 9.1, 9.4, 9.5, 9.7, 9.8
 */

import React from 'react';
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import UserManagement from '../UserManagement.jsx';

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

function setUser(role, id = '1') {
  localStorage.setItem(
    'user',
    JSON.stringify({ id, name: 'Test User', email: 'test@test.com', role })
  );
}

function renderPage() {
  return render(
    <MemoryRouter>
      <UserManagement />
    </MemoryRouter>
  );
}

const mockAdmins = [
  { id: '1', name: 'Admin One', email: 'admin1@test.com', is_active: true, created_at: '2024-01-01T00:00:00Z' },
  { id: '2', name: 'Admin Two', email: 'admin2@test.com', is_active: false, created_at: '2024-02-01T00:00:00Z' },
];

const mockSupervisors = [
  { id: '10', name: 'Supervisor One', email: 'sup1@test.com', is_active: true, created_at: '2024-01-15T00:00:00Z' },
];

const mockViewers = [
  { id: '20', name: 'Viewer One', email: 'viewer1@test.com', is_active: true, created_at: '2024-03-01T00:00:00Z' },
];

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  // Default: return empty arrays for all endpoints
  api.get.mockResolvedValue({ data: [] });
});

afterEach(() => {
  localStorage.clear();
});

// ─── Tab visibility tests ─────────────────────────────────────────────────────

describe('Tab visibility — admin role', () => {
  test('admin melihat tiga tab: Admin, Supervisor, Viewer', async () => {
    setUser('admin');
    api.get.mockResolvedValue({ data: mockAdmins });
    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Admin' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Supervisor' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Viewer' })).toBeInTheDocument();
    });
  });

  test('admin default tab adalah Admin', async () => {
    setUser('admin');
    api.get.mockResolvedValue({ data: mockAdmins });
    renderPage();

    await waitFor(() => {
      const adminTab = screen.getByRole('button', { name: 'Admin' });
      expect(adminTab).toHaveAttribute('aria-current', 'page');
    });
  });

  test('admin memanggil endpoint /admins saat tab Admin aktif', async () => {
    setUser('admin');
    api.get.mockResolvedValue({ data: mockAdmins });
    renderPage();

    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith('/admins');
    });
  });
});

describe('Tab visibility — supervisor role', () => {
  test('supervisor hanya melihat tab Viewer', async () => {
    setUser('supervisor');
    api.get.mockResolvedValue({ data: mockViewers });
    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Viewer' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Admin' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Supervisor' })).not.toBeInTheDocument();
    });
  });

  test('supervisor default tab adalah Viewer', async () => {
    setUser('supervisor');
    api.get.mockResolvedValue({ data: mockViewers });
    renderPage();

    await waitFor(() => {
      const viewerTab = screen.getByRole('button', { name: 'Viewer' });
      expect(viewerTab).toHaveAttribute('aria-current', 'page');
    });
  });

  test('supervisor memanggil endpoint /viewers saat tab Viewer aktif', async () => {
    setUser('supervisor');
    api.get.mockResolvedValue({ data: mockViewers });
    renderPage();

    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith('/viewers');
    });
  });
});

// ─── Tab switching tests ──────────────────────────────────────────────────────

describe('Tab switching — admin role', () => {
  test('klik tab Supervisor memanggil endpoint /supervisors', async () => {
    setUser('admin');
    api.get
      .mockResolvedValueOnce({ data: mockAdmins })
      .mockResolvedValueOnce({ data: mockSupervisors });
    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Supervisor' })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Supervisor' }));

    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith('/supervisors');
    });
  });

  test('klik tab Viewer memanggil endpoint /viewers', async () => {
    setUser('admin');
    api.get
      .mockResolvedValueOnce({ data: mockAdmins })
      .mockResolvedValueOnce({ data: mockViewers });
    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Viewer' })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Viewer' }));

    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith('/viewers');
    });
  });
});

// ─── Form modal — role dropdown ───────────────────────────────────────────────

describe('Form modal — admin role', () => {
  test('form modal admin menampilkan dropdown role dengan tiga pilihan', async () => {
    setUser('admin');
    api.get.mockResolvedValue({ data: [] });
    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /tambah/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /tambah/i }));

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    const roleSelect = screen.getByLabelText(/role/i);
    expect(roleSelect.tagName).toBe('SELECT');

    const options = Array.from(roleSelect.querySelectorAll('option'));
    const optionValues = options.map(o => o.value);
    expect(optionValues).toContain('admin');
    expect(optionValues).toContain('supervisor');
    expect(optionValues).toContain('viewer');
    expect(options).toHaveLength(3);
  });
});

describe('Form modal — supervisor role', () => {
  test('form modal supervisor menampilkan hanya pilihan Viewer (read-only)', async () => {
    setUser('supervisor');
    api.get.mockResolvedValue({ data: [] });
    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /tambah/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /tambah/i }));

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    // Should show a read-only input (not a select) with "Viewer"
    const roleInput = screen.getByLabelText(/role/i);
    expect(roleInput.tagName).toBe('INPUT');
    expect(roleInput).toHaveAttribute('readonly');
    expect(roleInput.value).toBe('Viewer');
  });
});

// ─── Self-deactivation prevention ────────────────────────────────────────────

describe('Self-deactivation prevention', () => {
  test('tombol Nonaktifkan dinonaktifkan (span) untuk akun sendiri', async () => {
    setUser('admin', '1');
    api.get.mockResolvedValue({ data: mockAdmins }); // mockAdmins[0].id === '1'
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Admin One')).toBeInTheDocument();
    });

    // The self row should have a span (not a button) for Nonaktifkan
    const selfRow = screen.getByText('Admin One').closest('tr');
    const nonaktifkanSpan = selfRow.querySelector('span[title="Tidak dapat menonaktifkan akun sendiri"]');
    expect(nonaktifkanSpan).toBeInTheDocument();

    // The other row should have a button
    const otherRow = screen.getByText('Admin Two').closest('tr');
    // Admin Two is inactive, so no Nonaktifkan button at all
    expect(otherRow.querySelector('span[title="Tidak dapat menonaktifkan akun sendiri"]')).not.toBeInTheDocument();
  });

  test('span self-deactivation memiliki title yang benar', async () => {
    setUser('admin', '1');
    api.get.mockResolvedValue({ data: mockAdmins });
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Admin One')).toBeInTheDocument();
    });

    const selfRow = screen.getByText('Admin One').closest('tr');
    const span = selfRow.querySelector('span[title="Tidak dapat menonaktifkan akun sendiri"]');
    expect(span).toHaveAttribute('title', 'Tidak dapat menonaktifkan akun sendiri');
    expect(span).toHaveAttribute('aria-label', 'Tidak dapat menonaktifkan akun sendiri');
  });
});

// ─── Table rendering ──────────────────────────────────────────────────────────

describe('Table rendering', () => {
  test('menampilkan data pengguna dengan kolom yang benar', async () => {
    setUser('admin');
    api.get.mockResolvedValue({ data: mockAdmins });
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Admin One')).toBeInTheDocument();
      expect(screen.getByText('admin1@test.com')).toBeInTheDocument();
      expect(screen.getByText('Admin Two')).toBeInTheDocument();
      expect(screen.getByText('admin2@test.com')).toBeInTheDocument();
    });

    // Status badges
    expect(screen.getByText('Aktif')).toBeInTheDocument();
    expect(screen.getByText('Nonaktif')).toBeInTheDocument();
  });

  test('menampilkan pesan kosong ketika tidak ada data', async () => {
    setUser('admin');
    api.get.mockResolvedValue({ data: [] });
    renderPage();

    await waitFor(() => {
      expect(screen.getByText(/belum ada data admin/i)).toBeInTheDocument();
    });
  });

  test('menampilkan pesan loading saat data sedang dimuat', () => {
    setUser('admin');
    // Never resolves during this test
    api.get.mockReturnValue(new Promise(() => {}));
    renderPage();

    expect(screen.getByText(/memuat daftar admin/i)).toBeInTheDocument();
  });

  test('menampilkan pesan error ketika fetch gagal', async () => {
    setUser('admin');
    api.get.mockRejectedValue({ message: 'Network Error' });
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Network Error')).toBeInTheDocument();
    });
  });

  test('menampilkan label (Anda) untuk akun sendiri', async () => {
    setUser('admin', '1');
    api.get.mockResolvedValue({ data: mockAdmins });
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('(Anda)')).toBeInTheDocument();
    });
  });
});

// ─── Inline deactivation confirmation ────────────────────────────────────────

describe('Inline deactivation confirmation', () => {
  test('klik Nonaktifkan menampilkan konfirmasi Ya/Batal', async () => {
    setUser('admin', '99'); // different id so not self
    api.get.mockResolvedValue({ data: mockAdmins });
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Admin One')).toBeInTheDocument();
    });

    // Admin One is active and not self
    const nonaktifkanBtn = screen.getByRole('button', {
      name: /nonaktifkan admin admin one/i,
    });
    fireEvent.click(nonaktifkanBtn);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /konfirmasi nonaktifkan admin one/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /batal nonaktifkan/i })).toBeInTheDocument();
    });
  });

  test('klik Batal menyembunyikan konfirmasi', async () => {
    setUser('admin', '99');
    api.get.mockResolvedValue({ data: mockAdmins });
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Admin One')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /nonaktifkan admin admin one/i }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /batal nonaktifkan/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /batal nonaktifkan/i }));

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /batal nonaktifkan/i })).not.toBeInTheDocument();
    });
  });
});

// ─── Page header ─────────────────────────────────────────────────────────────

describe('Page header', () => {
  test('menampilkan judul halaman "Manajemen Pengguna"', async () => {
    setUser('admin');
    api.get.mockResolvedValue({ data: [] });
    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Manajemen Pengguna' })).toBeInTheDocument();
    });
  });

  test('menampilkan tombol Tambah', async () => {
    setUser('admin');
    api.get.mockResolvedValue({ data: [] });
    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /tambah/i })).toBeInTheDocument();
    });
  });
});

// ─── Delete user functionality ────────────────────────────────────────────────

describe('Delete user functionality', () => {
  test('tombol "Hapus" muncul untuk setiap baris ketika currentUser.role === "admin"', async () => {
    setUser('admin', '99'); // id 99 so not self
    api.get.mockResolvedValue({ data: mockAdmins });
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Admin One')).toBeInTheDocument();
    });

    // Both rows should have a "Hapus" button
    const hapusButtons = screen.getAllByRole('button', { name: /hapus admin/i });
    expect(hapusButtons).toHaveLength(2);
  });

  test('tombol "Hapus" tidak muncul ketika currentUser.role === "supervisor"', async () => {
    setUser('supervisor', '99');
    api.get.mockResolvedValue({ data: mockViewers });
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Viewer One')).toBeInTheDocument();
    });

    expect(screen.queryByRole('button', { name: /hapus/i })).not.toBeInTheDocument();
  });

  test('tombol "Hapus" tidak muncul ketika currentUser.role === "viewer"', async () => {
    setUser('viewer', '99');
    api.get.mockResolvedValue({ data: mockViewers });
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Viewer One')).toBeInTheDocument();
    });

    expect(screen.queryByRole('button', { name: /hapus/i })).not.toBeInTheDocument();
  });

  test('tombol "Hapus" disabled untuk baris currentUser (self) dengan title yang benar', async () => {
    setUser('admin', '1'); // id 1 matches mockAdmins[0]
    api.get.mockResolvedValue({ data: mockAdmins });
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Admin One')).toBeInTheDocument();
    });

    const selfRow = screen.getByText('Admin One').closest('tr');
    const hapusBtn = selfRow.querySelector('button[aria-label*="Hapus admin Admin One"]');
    expect(hapusBtn).toBeInTheDocument();
    expect(hapusBtn).toBeDisabled();
    expect(hapusBtn).toHaveAttribute('title', 'Tidak dapat menghapus akun sendiri');
  });

  test('klik tombol "Hapus" menampilkan confirmation inline dengan nama user', async () => {
    setUser('admin', '99');
    api.get.mockResolvedValue({ data: mockAdmins });
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Admin One')).toBeInTheDocument();
    });

    const hapusBtn = screen.getByRole('button', { name: /hapus admin admin one/i });
    fireEvent.click(hapusBtn);

    await waitFor(() => {
      expect(screen.getByText('Hapus permanen?')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /konfirmasi hapus admin one/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /batal hapus/i })).toBeInTheDocument();
    });
  });

  test('klik "Batal" menutup confirmation tanpa memanggil api.delete', async () => {
    setUser('admin', '99');
    api.get.mockResolvedValue({ data: mockAdmins });
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Admin One')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /hapus admin admin one/i }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /batal hapus/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /batal hapus/i }));

    await waitFor(() => {
      expect(screen.queryByText('Hapus permanen?')).not.toBeInTheDocument();
    });

    expect(api.delete).not.toHaveBeenCalled();
  });

  test('klik "Ya, Hapus" memanggil api.delete dengan endpoint yang sesuai', async () => {
    setUser('admin', '99');
    api.get.mockResolvedValue({ data: mockAdmins });
    api.delete.mockResolvedValue({ data: { message: 'Akun Admin One berhasil dihapus' } });
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Admin One')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /hapus admin admin one/i }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /konfirmasi hapus admin one/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /konfirmasi hapus admin one/i }));

    await waitFor(() => {
      expect(api.delete).toHaveBeenCalledWith('/admins/1');
    });
  });

  test('setelah sukses — pesan sukses muncul, api.get dipanggil ulang', async () => {
    setUser('admin', '99');
    api.get.mockResolvedValue({ data: mockAdmins });
    api.delete.mockResolvedValue({ data: { message: 'Akun Admin One berhasil dihapus' } });
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Admin One')).toBeInTheDocument();
    });

    const initialGetCallCount = api.get.mock.calls.length;

    fireEvent.click(screen.getByRole('button', { name: /hapus admin admin one/i }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /konfirmasi hapus admin one/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /konfirmasi hapus admin one/i }));

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(/berhasil dihapus/i);
    });

    expect(api.get.mock.calls.length).toBeGreaterThan(initialGetCallCount);
  });

  test('setelah error — pesan error muncul, dialog ditutup', async () => {
    setUser('admin', '99');
    api.get.mockResolvedValue({ data: mockAdmins });
    api.delete.mockRejectedValue({
      response: { data: { error: 'Gagal menghapus akun.' } },
    });
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Admin One')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /hapus admin admin one/i }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /konfirmasi hapus admin one/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /konfirmasi hapus admin one/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/gagal menghapus akun/i);
    });

    // Confirmation dialog should be closed
    expect(screen.queryByText('Hapus permanen?')).not.toBeInTheDocument();
  });
});
