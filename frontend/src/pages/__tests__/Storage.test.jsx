/**
 * Unit Tests — halaman Penyimpanan: konfirmasi ketik saat menghapus respons massal.
 *
 * Purge menghapus seluruh respons & media survei terpilih, termasuk survei aktif,
 * jadi tanpa kata HAPUS tak boleh ada permintaan ke server.
 */

import React from 'react';
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import Storage from '../Storage.jsx';

vi.mock('../../services/api', () => ({
  default: { get: vi.fn(), post: vi.fn() },
}));

vi.mock('../../components/Layout', () => ({
  default: ({ children }) => <div>{children}</div>,
}));

import api from '../../services/api';

const OVERVIEW = {
  uploads_bytes: 1024,
  storage_driver: 'minio',
  surveys: [
    { id: 's1', title: 'Survei Satu', status: 'active', responses: 1000, media_count: 10 },
    { id: 's2', title: 'Survei Dua', status: 'inactive', responses: 200, media_count: 4 },
    { id: 's3', title: 'Survei Tiga', status: 'inactive', responses: 7, media_count: 0 },
  ],
};

async function openConfirm() {
  render(<Storage />);
  fireEvent.click(screen.getByRole('button', { name: 'Muat' }));
  fireEvent.click(await screen.findByRole('checkbox', { name: 'Pilih Survei Satu' }));
  fireEvent.click(screen.getByRole('checkbox', { name: 'Pilih Survei Dua' }));
  fireEvent.click(screen.getByRole('button', { name: 'Hapus data terpilih' }));
}

const typeWord = (value) => fireEvent.change(screen.getByPlaceholderText('HAPUS'), { target: { value } });
const purgeCalls = () => api.post.mock.calls.filter(([url]) => url === '/storage/purge');

describe('Storage — konfirmasi hapus massal respons', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.get.mockResolvedValue({ data: OVERVIEW });
    api.post.mockResolvedValue({ data: { message: 'Terhapus' } });
  });

  test('menyebut total respons dari survei terpilih saja', async () => {
    await openConfirm();
    expect(screen.getByText(/1\.200 respons & media dari 2 survei/)).toBeInTheDocument();
  });

  test('tombol hapus nonaktif sampai kata yang benar diketik', async () => {
    await openConfirm();
    const submit = screen.getByRole('button', { name: 'Hapus Permanen' });
    expect(submit).toBeDisabled();
    typeWord('HAPU');
    expect(submit).toBeDisabled();
    typeWord('HAPUS');
    expect(submit).toBeEnabled();
  });

  test('tidak mengirim apa pun saat Enter ditekan dengan kata yang salah', async () => {
    await openConfirm();
    typeWord('ya');
    fireEvent.submit(screen.getByPlaceholderText('HAPUS').closest('form'));
    expect(purgeCalls()).toHaveLength(0);
  });

  test('mengirim survei terpilih setelah kata yang benar diketik', async () => {
    await openConfirm();
    typeWord('hapus');
    fireEvent.click(screen.getByRole('button', { name: 'Hapus Permanen' }));
    await waitFor(() => expect(purgeCalls()).toHaveLength(1));
    expect(purgeCalls()[0][1]).toEqual({ survey_ids: ['s1', 's2'] });
  });

  test('Batal menutup konfirmasi dan membuang ketikan', async () => {
    await openConfirm();
    typeWord('HAPUS');
    fireEvent.click(screen.getByRole('button', { name: 'Batal' }));
    expect(purgeCalls()).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'Hapus data terpilih' }));
    expect(screen.getByPlaceholderText('HAPUS')).toHaveValue('');
  });
});
