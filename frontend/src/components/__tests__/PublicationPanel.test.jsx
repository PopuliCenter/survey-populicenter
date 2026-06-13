/**
 * Unit tests untuk PublicationPanel — panel publikasi hasil survei (admin).
 */
import React from 'react';
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ToastProvider } from '../Toast';
import PublicationPanel from '../PublicationPanel';

vi.mock('../../services/api', () => ({
  default: { get: vi.fn(), post: vi.fn() },
}));

import api from '../../services/api';

function renderPanel(props = {}) {
  return render(
    <ToastProvider>
      <PublicationPanel surveyId="sv1" surveyTitle="Survei Kepuasan" {...props} />
    </ToastProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('PublicationPanel', () => {
  test('menampilkan "Belum dipublikasikan" saat status null', async () => {
    api.get.mockResolvedValue({ data: null });
    renderPanel();

    await waitFor(() => {
      expect(screen.getByText(/belum dipublikasikan/i)).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /publikasikan hasil/i })).toBeInTheDocument();
  });

  test('tanpa survei terpilih menampilkan ajakan memilih survei', async () => {
    api.get.mockResolvedValue({ data: null });
    renderPanel({ surveyId: '' });

    expect(screen.getByText(/pilih survei terlebih dahulu/i)).toBeInTheDocument();
    expect(api.get).not.toHaveBeenCalled();
  });

  test('klik "Publikasikan hasil" memanggil API publish lalu menampilkan cuplikan embed', async () => {
    // 1) status awal: belum dipublikasikan
    api.get.mockResolvedValueOnce({ data: null });
    // publish berhasil
    api.post.mockResolvedValue({ data: { slug: 'survei-kepuasan', is_published: true, response_count: 10, published_at: '2026-06-13T00:00:00Z' } });
    // 2) reload status setelah publish: sudah tayang
    api.get.mockResolvedValueOnce({ data: { slug: 'survei-kepuasan', summary: 'ringkas', is_published: true, response_count: 10, published_at: '2026-06-13T00:00:00Z' } });

    renderPanel();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /publikasikan hasil/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /publikasikan hasil/i }));

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/surveys/sv1/publish', { summary: '' });
    });

    // Setelah tayang: muncul status + cuplikan iframe embed
    await waitFor(() => {
      expect(screen.getByText(/tayang publik/i)).toBeInTheDocument();
    });
    expect(screen.getByDisplayValue(/<iframe .*\/embed\/results\/survei-kepuasan/)).toBeInTheDocument();
  });

  test('saat tayang, tombol berubah jadi "Perbarui snapshot" + ada "Cabut dari publik"', async () => {
    api.get.mockResolvedValue({ data: { slug: 'survei-kepuasan', summary: '', is_published: true, response_count: 5, published_at: '2026-06-13T00:00:00Z' } });
    renderPanel();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /perbarui snapshot/i })).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /cabut dari publik/i })).toBeInTheDocument();
  });
});
