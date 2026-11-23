/**
 * SpreadsheetFeedPanel — data mentah per responden (PII tanpa login).
 * Audit 2026-11-23: hanya admin yang boleh MENYALAKAN; supervisor tetap bisa
 * mematikannya bila sudah menyala.
 */
import React from 'react';
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('../../services/api', () => ({
  default: { get: vi.fn(), put: vi.fn(), post: vi.fn() },
}));
import api from '../../services/api';
import SpreadsheetFeedPanel from '../SpreadsheetFeedPanel';

const status = (includeRaw) => ({
  enabled: true,
  include_raw: includeRaw,
  token: 't',
  paths: { rekap: '/public/feed/t/rekap.csv', monitoring: '/public/feed/t/monitoring.csv', mentah: '/public/feed/t/mentah.csv' },
});

const rawCheckbox = () => screen.findByRole('checkbox', { name: /izinkan tarik data mentah/i });

beforeEach(() => vi.clearAllMocks());

describe('SpreadsheetFeedPanel — data mentah', () => {
  test('bukan admin & belum menyala → tak bisa dicentang, ada keterangan', async () => {
    api.get.mockResolvedValue({ data: status(false) });
    render(<SpreadsheetFeedPanel surveyId="s1" canEnableRaw={false} />);
    expect(await rawCheckbox()).toBeDisabled();
    expect(screen.getByText(/hanya admin yang dapat menyalakan/i)).toBeInTheDocument();
  });

  test('bukan admin tapi sudah menyala → tetap bisa dimatikan', async () => {
    api.get.mockResolvedValue({ data: status(true) });
    render(<SpreadsheetFeedPanel surveyId="s1" canEnableRaw={false} />);
    expect(await rawCheckbox()).not.toBeDisabled();
  });

  test('admin → bisa menyalakan', async () => {
    api.get.mockResolvedValue({ data: status(false) });
    render(<SpreadsheetFeedPanel surveyId="s1" canEnableRaw />);
    expect(await rawCheckbox()).not.toBeDisabled();
  });
});
