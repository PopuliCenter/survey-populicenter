/**
 * Unit Tests — halaman Pembersihan Data: konfirmasi ketik saat menghapus survei.
 *
 * Hapus survei tak bisa dibatalkan, dan baris berikutnya naik ke posisi yang sama
 * setelah satu survei terhapus. Yang dikunci di sini: tanpa kata HAPUS tak ada
 * permintaan ke server, dan kata itu tak terbawa ke survei berikutnya.
 */

import React from 'react';
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import Cleanup from '../Cleanup.jsx';

vi.mock('../../services/api', () => ({
  default: { get: vi.fn(), post: vi.fn() },
}));

vi.mock('../../components/Layout', () => ({
  default: ({ children }) => <div>{children}</div>,
}));

import api from '../../services/api';

const SURVEYS = [
  { id: 's1', title: 'Survei Sampel Satu', status: 'inactive', response_count: 23 },
  { id: 's2', title: 'Survei Sampel Dua', status: 'inactive', response_count: 0 },
  { id: 's3', title: 'Survei Berjalan', status: 'active', response_count: 9 },
];

async function renderPage() {
  render(<Cleanup />);
  // Bukan findByText: judul survei juga muncul di dropdown filter respons.
  await screen.findAllByRole('button', { name: 'Hapus Survei' });
}

/** Pilih survei, hitung jumlah, lalu buka konfirmasi hapus massal respons. */
async function openBulkConfirm() {
  fireEvent.change(screen.getByLabelText('Survei'), { target: { value: 's1' } });
  fireEvent.click(screen.getByRole('button', { name: 'Preview Jumlah' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Hapus 412 Respons' }));
}

const openConfirm = (index = 0) => fireEvent.click(screen.getAllByRole('button', { name: 'Hapus Survei' })[index]);
const typeWord = (value) => fireEvent.change(screen.getByPlaceholderText('HAPUS'), { target: { value } });
const deleteCalls = () => api.post.mock.calls.filter(([url]) => url.startsWith('/cleanup/survey/'));
const bulkCalls = () => api.post.mock.calls.filter(([url]) => url === '/cleanup/responses');

beforeEach(() => {
  vi.clearAllMocks();
  api.get.mockImplementation((url) => Promise.resolve({ data: url === '/surveys' ? SURVEYS : {} }));
  api.post.mockImplementation((url) => Promise.resolve({
    data: url === '/cleanup/responses/preview' ? { count: 412 } : { message: 'Terhapus' },
  }));
});

describe('Cleanup — konfirmasi hapus massal respons', () => {
  test('menyebut jumlah dan tombol hapus nonaktif sampai kata yang benar diketik', async () => {
    await renderPage();
    await openBulkConfirm();
    expect(screen.getByText('412 respons')).toBeInTheDocument();
    const submit = screen.getByRole('button', { name: 'Hapus Permanen' });
    expect(submit).toBeDisabled();
    typeWord('HAPU');
    expect(submit).toBeDisabled();
    typeWord('HAPUS');
    expect(submit).toBeEnabled();
  });

  test('tidak mengirim apa pun saat Enter ditekan dengan kata yang salah', async () => {
    await renderPage();
    await openBulkConfirm();
    typeWord('ya');
    fireEvent.submit(screen.getByPlaceholderText('HAPUS').closest('form'));
    expect(bulkCalls()).toHaveLength(0);
  });

  test('mengirim filter yang dipilih setelah kata yang benar diketik', async () => {
    await renderPage();
    await openBulkConfirm();
    typeWord('hapus');
    fireEvent.click(screen.getByRole('button', { name: 'Hapus Permanen' }));
    await waitFor(() => expect(bulkCalls()).toHaveLength(1));
    expect(bulkCalls()[0][1]).toEqual({ survey_id: 's1' });
  });

  test('mengubah filter menutup konfirmasi dan membuang ketikan', async () => {
    await renderPage();
    await openBulkConfirm();
    typeWord('HAPUS');
    fireEvent.change(screen.getByLabelText('Survei'), { target: { value: 's2' } });
    expect(screen.queryByPlaceholderText('HAPUS')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Preview Jumlah' }));
    expect(await screen.findByPlaceholderText('HAPUS')).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Hapus Permanen' })).toBeDisabled();
  });
});

describe('Cleanup — konfirmasi hapus survei', () => {

  test('hanya survei nonaktif yang punya tombol hapus', async () => {
    await renderPage();
    expect(screen.getAllByRole('button', { name: 'Hapus Survei' })).toHaveLength(2);
  });

  test('tombol hapus nonaktif sampai kata yang benar diketik', async () => {
    await renderPage();
    openConfirm();
    const submit = screen.getByRole('button', { name: 'Hapus Permanen' });
    expect(submit).toBeDisabled();
    typeWord('HAPU');
    expect(submit).toBeDisabled();
    typeWord('HAPUS');
    expect(submit).toBeEnabled();
  });

  test('tidak mengirim apa pun saat Enter ditekan dengan kata yang salah', async () => {
    await renderPage();
    openConfirm();
    typeWord('hapus survei');
    fireEvent.submit(screen.getByPlaceholderText('HAPUS').closest('form'));
    expect(deleteCalls()).toHaveLength(0);
  });

  test.each(['HAPUS', 'hapus', '  Hapus '])('menghapus survei yang dipilih setelah mengetik "%s"', async (word) => {
    await renderPage();
    openConfirm();
    typeWord(word);
    fireEvent.click(screen.getByRole('button', { name: 'Hapus Permanen' }));
    await waitFor(() => expect(deleteCalls()).toHaveLength(1));
    expect(deleteCalls()[0][0]).toBe('/cleanup/survey/s1');
  });

  test('menyebut jumlah respons yang ikut terhapus', async () => {
    await renderPage();
    openConfirm();
    expect(screen.getByText('23 respons')).toBeInTheDocument();
  });

  test('Batal menutup konfirmasi tanpa mengirim apa pun', async () => {
    await renderPage();
    openConfirm();
    typeWord('HAPUS');
    fireEvent.click(screen.getByRole('button', { name: 'Batal' }));
    expect(screen.queryByPlaceholderText('HAPUS')).toBeNull();
    expect(deleteCalls()).toHaveLength(0);
  });

  test('kata yang sudah diketik tidak terbawa ke survei lain', async () => {
    await renderPage();
    openConfirm(0);
    typeWord('HAPUS');
    fireEvent.click(screen.getByRole('button', { name: 'Batal' }));
    openConfirm(1);
    expect(screen.getByPlaceholderText('HAPUS')).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Hapus Permanen' })).toBeDisabled();
  });
});
