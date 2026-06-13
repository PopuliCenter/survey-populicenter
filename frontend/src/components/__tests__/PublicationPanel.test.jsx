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

// Mock api.get yang sadar-URL: /publication vs /questions.
function mockGet({ publication = null, questions = [] }) {
  api.get.mockImplementation((url) => {
    if (url.includes('/questions')) return Promise.resolve({ data: questions });
    return Promise.resolve({ data: publication });
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('PublicationPanel', () => {
  test('menampilkan "Belum dipublikasikan" saat status null', async () => {
    mockGet({ publication: null, questions: [] });
    renderPanel();

    await waitFor(() => {
      expect(screen.getByText(/belum dipublikasikan/i)).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /publikasikan hasil/i })).toBeInTheDocument();
  });

  test('tanpa survei terpilih menampilkan ajakan memilih survei', async () => {
    mockGet({ publication: null, questions: [] });
    renderPanel({ surveyId: '' });

    expect(screen.getByText(/pilih survei terlebih dahulu/i)).toBeInTheDocument();
    expect(api.get).not.toHaveBeenCalled();
  });

  test('menampilkan checkbox pertanyaan yang bisa diagregasi', async () => {
    mockGet({
      publication: null,
      questions: [
        { id: 'q1', text: 'Pilihan A', type: 'single_choice' },
        { id: 'q2', text: 'Teks bebas', type: 'long_text' },
        { id: 'q3', text: 'Skala', type: 'rating_scale' },
      ],
    });
    renderPanel();

    await waitFor(() => {
      expect(screen.getByText('Pilihan A')).toBeInTheDocument();
    });
    // Teks bebas TIDAK boleh muncul (bukan tipe agregat).
    expect(screen.queryByText('Teks bebas')).not.toBeInTheDocument();
    expect(screen.getByText('Skala')).toBeInTheDocument();
  });

  test('klik "Publikasikan hasil" mengirim question_ids terpilih lalu menampilkan embed', async () => {
    let publication = null;
    api.get.mockImplementation((url) => {
      if (url.includes('/questions')) {
        return Promise.resolve({ data: [{ id: 'q1', text: 'Pilihan A', type: 'single_choice' }] });
      }
      return Promise.resolve({ data: publication });
    });
    api.post.mockImplementation(() => {
      publication = { slug: 'survei-kepuasan', summary: '', is_published: true, response_count: 10, published_at: '2026-06-13T00:00:00Z' };
      return Promise.resolve({ data: publication });
    });

    renderPanel();

    await waitFor(() => {
      expect(screen.getByText('Pilihan A')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /publikasikan hasil/i }));

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/surveys/sv1/publish', { summary: '', question_ids: ['q1'] });
    });

    await waitFor(() => {
      expect(screen.getByText(/tayang publik/i)).toBeInTheDocument();
    });
    expect(screen.getByDisplayValue(/<iframe .*\/embed\/results\/survei-kepuasan/)).toBeInTheDocument();
  });

  test('saat tayang, tombol berubah jadi "Perbarui snapshot" + ada "Cabut dari publik"', async () => {
    mockGet({
      publication: { slug: 'survei-kepuasan', summary: '', is_published: true, response_count: 5, published_at: '2026-06-13T00:00:00Z' },
      questions: [],
    });
    renderPanel();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /perbarui snapshot/i })).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /cabut dari publik/i })).toBeInTheDocument();
  });
});
