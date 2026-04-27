/**
 * Unit Tests for SubmitSuccess page
 *
 * Tests:
 *   - displays questionnaire number from location.state
 *   - increments sessionStorage.session_response_count on mount
 *   - "Isi Responden Berikutnya" button navigates to /surveyor/survey/:id
 *   - "Kembali ke Daftar Survei" button navigates to /surveyor
 *
 * Requirements: 9.2, 9.3, 13.3
 */

import React from 'react';
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import SubmitSuccess from '../SubmitSuccess.jsx';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Render SubmitSuccess with a given location state and route params.
 */
function renderSubmitSuccess({ questionnaireNumber = null, surveyId = 'survey-123' } = {}) {
  return render(
    <MemoryRouter
      initialEntries={[
        {
          pathname: `/surveyor/survey/${surveyId}/success`,
          state: questionnaireNumber
            ? { questionnaire_number: questionnaireNumber, survey_id: surveyId }
            : null,
        },
      ]}
    >
      <Routes>
        <Route path="/surveyor/survey/:id/success" element={<SubmitSuccess />} />
        <Route path="/surveyor/survey/:id" element={<div data-testid="survey-form">Survey Form</div>} />
        <Route path="/surveyor" element={<div data-testid="survey-list">Survey List</div>} />
      </Routes>
    </MemoryRouter>
  );
}

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  sessionStorage.clear();
});

afterEach(() => {
  sessionStorage.clear();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('SubmitSuccess', () => {
  // ─── Requirement 13.3: display questionnaire number ─────────────────────────

  test('menampilkan nomor kuesioner dari location.state', () => {
    renderSubmitSuccess({ questionnaireNumber: 'SRV001-20240115-0001', surveyId: 'survey-abc' });

    expect(screen.getByText('SRV001-20240115-0001')).toBeInTheDocument();
  });

  test('menampilkan pesan fallback ketika nomor kuesioner tidak tersedia', () => {
    renderSubmitSuccess({ questionnaireNumber: null, surveyId: 'survey-abc' });

    expect(screen.getByText('Nomor kuesioner tidak tersedia')).toBeInTheDocument();
  });

  // ─── Requirement 9.4: increment session counter on mount ────────────────────

  test('menambah session_response_count di sessionStorage saat mount', () => {
    sessionStorage.setItem('session_response_count', '3');

    renderSubmitSuccess({ questionnaireNumber: 'Q-001', surveyId: 'survey-1' });

    expect(sessionStorage.getItem('session_response_count')).toBe('4');
  });

  test('menginisialisasi session_response_count ke 1 jika belum ada di sessionStorage', () => {
    // sessionStorage is empty
    renderSubmitSuccess({ questionnaireNumber: 'Q-001', surveyId: 'survey-1' });

    expect(sessionStorage.getItem('session_response_count')).toBe('1');
  });

  // ─── Requirement 9.2, 9.3: navigation buttons ───────────────────────────────

  test('tombol "Isi Responden Berikutnya" navigasi ke /surveyor/survey/:id', () => {
    renderSubmitSuccess({ questionnaireNumber: 'Q-001', surveyId: 'survey-xyz' });

    const nextButton = screen.getByRole('button', { name: /isi responden berikutnya/i });
    fireEvent.click(nextButton);

    expect(screen.getByTestId('survey-form')).toBeInTheDocument();
  });

  test('tombol "Kembali ke Daftar Survei" navigasi ke /surveyor', () => {
    renderSubmitSuccess({ questionnaireNumber: 'Q-001', surveyId: 'survey-xyz' });

    const backButton = screen.getByRole('button', { name: /kembali ke daftar survei/i });
    fireEvent.click(backButton);

    expect(screen.getByTestId('survey-list')).toBeInTheDocument();
  });

  test('menampilkan pesan sukses', () => {
    renderSubmitSuccess({ questionnaireNumber: 'Q-001', surveyId: 'survey-1' });

    expect(screen.getByText('Data berhasil disimpan!')).toBeInTheDocument();
  });
});
