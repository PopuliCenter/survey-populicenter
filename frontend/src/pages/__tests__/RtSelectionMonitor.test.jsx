/**
 * Unit Tests — halaman Pengawasan Pemilihan RT
 *
 * Nilai halaman ini terletak pada MENYOROTI UNDIAN YANG TIDAK LOLOS VERIFIKASI.
 * Kalau baris gagal-verifikasi tampil sama saja dengan yang normal, supervisor
 * tak punya alasan membuka halaman ini. Karena itu yang diuji:
 *   - status verifikasi per baris tampil benar
 *   - ada peringatan menonjol saat ada baris yang tidak cocok
 *   - ringkasan menghitung dengan benar
 *   - survei tanpa rt_selection aktif diberi petunjuk cara menyalakannya
 */

import React from 'react';
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import RtSelectionMonitor from '../RtSelectionMonitor.jsx';

vi.mock('../../services/api', () => ({
  default: { get: vi.fn(), post: vi.fn() },
}));

vi.mock('../../services/mediaToken', () => ({
  getMediaToken: vi.fn().mockResolvedValue('media-token-abc'),
  openMediaInNewTab: vi.fn().mockResolvedValue(undefined),
}));

import api from '../../services/api';

const SURVEI_AKTIF = {
  id: 'srv-1',
  title: 'Survei Nasional 2026',
  field_tools_settings: { rt_selection: 'enabled', rt_selection_count: 2 },
};
const SURVEI_NONAKTIF = {
  id: 'srv-2',
  title: 'Survei Lama',
  field_tools_settings: { rt_selection: 'off' },
};

function baris(over = {}) {
  return {
    id: 'sel-1',
    village: 'TEGAL PARANG',
    district: 'MAMPANG PRAPATAN',
    surveyor_name: 'SAEFUDIN',
    total_rt: 25,
    selected: [1, 3],
    official_name: 'AJI',
    official_position: 'Kepala Desa',
    form_b_photo_path: 'uploads/photos/formb.jpg',
    verified: true,
    locked_at: '2026-07-20T03:00:00.000Z',
    ...over,
  };
}

// GET /surveys mengembalikan LARIK langsung (bukan { surveys: [...] }) — bentuk
// inilah yang dipakai produksi, jadi tiruan di sini harus sama.
function mockApi({ surveys = [SURVEI_AKTIF], selections = [] } = {}) {
  api.get.mockImplementation((url) => {
    if (url === '/surveys') return Promise.resolve({ data: surveys });
    if (url.startsWith('/rt-selection/survey/')) return Promise.resolve({ data: { selections } });
    return Promise.resolve({ data: {} });
  });
}

function renderPage() {
  return render(<MemoryRouter><RtSelectionMonitor /></MemoryRouter>);
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  localStorage.setItem('user', JSON.stringify({ id: '1', name: 'Admin', role: 'admin' }));
});

describe('RtSelectionMonitor — daftar undian', () => {
  test('menampilkan hasil undian beserta RT terpilih dan TPD', async () => {
    mockApi({ selections: [baris()] });
    renderPage();

    expect(await screen.findByText('TEGAL PARANG')).toBeInTheDocument();
    expect(screen.getByText('SAEFUDIN')).toBeInTheDocument();
    expect(screen.getByText('RT 1')).toBeInTheDocument();
    expect(screen.getByText('RT 3')).toBeInTheDocument();
  });

  test('baris terverifikasi ditandai jelas', async () => {
    mockApi({ selections: [baris()] });
    renderPage();

    expect(await screen.findByText(/Terverifikasi/)).toBeInTheDocument();
    expect(screen.queryByText(/Tidak cocok/)).not.toBeInTheDocument();
  });

  test('menampilkan tautan foto Form B bila ada, dan penanda bila tidak ada', async () => {
    mockApi({ selections: [baris(), baris({ id: 'sel-2', village: 'PELA MAMPANG', form_b_photo_path: null })] });
    renderPage();

    expect(await screen.findByText('Lihat foto')).toBeInTheDocument();
    expect(screen.getByText('tanpa foto')).toBeInTheDocument();
  });

  test('klik "Lihat foto" membuka media dengan TOKEN SEGAR (bukan URL rakitan saat mount)', async () => {
    // Regresi: token media berumur 15 menit; URL yang dirakit saat halaman
    // dibuka kedaluwarsa diam-diam → klik menghasilkan JSON "Sesi telah
    // berakhir" alih-alih foto.
    const { openMediaInNewTab } = await import('../../services/mediaToken');
    const { fireEvent } = await import('@testing-library/react');
    mockApi({ selections: [baris()] });
    renderPage();

    fireEvent.click(await screen.findByText('Lihat foto'));

    expect(openMediaInNewTab).toHaveBeenCalledWith('uploads/photos/formb.jpg');
  });

  test('menampilkan pesan kosong bila belum ada undian', async () => {
    mockApi({ selections: [] });
    renderPage();

    expect(await screen.findByText(/Belum ada undian RT/)).toBeInTheDocument();
  });
});

describe('RtSelectionMonitor — undian gagal verifikasi', () => {
  test('menandai baris yang tidak cocok dan memunculkan peringatan menonjol', async () => {
    mockApi({ selections: [baris(), baris({ id: 'sel-2', village: 'KUNINGAN BARAT', verified: false })] });
    renderPage();

    expect(await screen.findByText(/Tidak cocok/)).toBeInTheDocument();

    const peringatan = screen.getByRole('alert');
    expect(peringatan).toHaveTextContent(/1 undian tidak lolos verifikasi/i);
    expect(peringatan).toHaveTextContent(/diubah langsung di database/i);
  });

  test('tanpa baris gagal, peringatan tidak muncul', async () => {
    mockApi({ selections: [baris()] });
    renderPage();

    await screen.findByText('TEGAL PARANG');
    expect(screen.queryByText(/tidak lolos verifikasi/i)).not.toBeInTheDocument();
  });
});

describe('RtSelectionMonitor — ringkasan', () => {
  test('menghitung total, terverifikasi, gagal, dan tanpa foto', async () => {
    mockApi({
      selections: [
        baris(),
        baris({ id: 'b', village: 'A', verified: false }),
        baris({ id: 'c', village: 'B', form_b_photo_path: null }),
      ],
    });
    renderPage();

    await screen.findByText('TEGAL PARANG');
    // Dicari DI DALAM wilayah ringkasan: label kartu ("Terverifikasi") sengaja
    // sama bunyinya dengan badge per baris, jadi pencarian global akan ambigu.
    const ringkasan = within(screen.getByRole('group', { name: /ringkasan undian rt/i }));
    const tile = (label) => ringkasan.getByText(label).parentElement;
    expect(tile('Kelurahan diundi')).toHaveTextContent('3');
    expect(tile('Terverifikasi')).toHaveTextContent('2');
    expect(tile('Gagal verifikasi')).toHaveTextContent('1');
    expect(tile('Tanpa foto Form B')).toHaveTextContent('1');
  });
});

describe('RtSelectionMonitor — survei tanpa pemilihan RT', () => {
  test('memberi petunjuk cara menyalakan fitur', async () => {
    mockApi({ surveys: [SURVEI_NONAKTIF], selections: [] });
    renderPage();

    await waitFor(() => {
      expect(screen.getByText(/belum mengaktifkan pemilihan RT/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/Field Tools/)).toBeInTheDocument();
  });

  test('survei yang mengaktifkan fitur dipilih otomatis', async () => {
    mockApi({ surveys: [SURVEI_NONAKTIF, SURVEI_AKTIF], selections: [baris()] });
    renderPage();

    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith('/rt-selection/survey/srv-1', expect.anything());
    });
    expect(screen.queryByText(/belum mengaktifkan pemilihan RT/i)).not.toBeInTheDocument();
  });
});
