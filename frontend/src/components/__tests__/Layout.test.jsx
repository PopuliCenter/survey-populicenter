/**
 * Unit Tests for Layout component — dynamic navigation per role
 *
 * Tests:
 *   - Admin sees all nav items including Manajemen Pengguna and Audit Log
 *   - Supervisor sees Dashboard, Surveys, Surveyors, Responses, Reports, Map (no Audit Log, no Manajemen Pengguna)
 *   - Viewer sees only Reports, Map, Responses
 *   - Sidebar label changes per role
 *   - Unknown/missing role shows empty nav and default label
 *
 * Requirements: 8.1, 8.2, 8.6
 */

import React from 'react';
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Layout, { getNavItemsForRole } from '../Layout.jsx';

// Mock the api module to avoid real HTTP calls
vi.mock('../../services/api', () => ({
  default: {
    post: vi.fn(),
  },
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

function setUser(role) {
  localStorage.setItem('user', JSON.stringify({ id: '1', name: 'Test User', email: 'test@test.com', role }));
}

function renderLayout() {
  return render(
    <MemoryRouter>
      <Layout>
        <div>Content</div>
      </Layout>
    </MemoryRouter>
  );
}

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

afterEach(() => {
  localStorage.clear();
});

// ─── Unit tests for getNavItemsForRole ────────────────────────────────────────

describe('getNavItemsForRole', () => {
  test('returns admin nav items for admin role', () => {
    const items = getNavItemsForRole('admin');
    const paths = items.map((i) => i.path);
    expect(paths).toContain('/dashboard');
    expect(paths).toContain('/users');
    expect(paths).toContain('/surveyors');
    expect(paths).toContain('/surveys');
    expect(paths).toContain('/responses');
    expect(paths).toContain('/reports');
    expect(paths).toContain('/map');
    expect(paths).toContain('/audit-log');
    expect(paths).toContain('/system');
    expect(paths).toContain('/cleanup');
    expect(items).toHaveLength(10);
  });

  test('returns supervisor nav items for supervisor role', () => {
    const items = getNavItemsForRole('supervisor');
    const paths = items.map((i) => i.path);
    expect(paths).toContain('/dashboard');
    expect(paths).toContain('/surveys');
    expect(paths).toContain('/surveyors');
    expect(paths).toContain('/responses');
    expect(paths).toContain('/reports');
    expect(paths).toContain('/map');
    // Must NOT contain admin-only items
    expect(paths).not.toContain('/users');
    expect(paths).not.toContain('/audit-log');
    expect(items).toHaveLength(6);
  });

  test('returns viewer nav items for viewer role', () => {
    const items = getNavItemsForRole('viewer');
    const paths = items.map((i) => i.path);
    expect(paths).toContain('/dashboard');
    expect(paths).toContain('/responses');
    expect(paths).toContain('/map');
    // Bug #4: viewer tanpa Survei & Laporan; juga tanpa item admin
    expect(paths).not.toContain('/reports');
    expect(paths).not.toContain('/surveys');
    expect(paths).not.toContain('/surveyors');
    expect(paths).not.toContain('/users');
    expect(paths).not.toContain('/audit-log');
    expect(items).toHaveLength(3);
  });

  test('returns empty array for surveyor role', () => {
    const items = getNavItemsForRole('surveyor');
    expect(items).toHaveLength(0);
  });

  test('returns empty array for unknown role', () => {
    const items = getNavItemsForRole('unknown');
    expect(items).toHaveLength(0);
  });

  test('returns empty array when role is undefined', () => {
    const items = getNavItemsForRole(undefined);
    expect(items).toHaveLength(0);
  });
});

// ─── Layout rendering tests ───────────────────────────────────────────────────

describe('Layout — admin role', () => {
  test('menampilkan semua item navigasi untuk admin', () => {
    setUser('admin');
    renderLayout();

    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Manajemen Pengguna')).toBeInTheDocument();
    expect(screen.getByText('Manajemen TPD')).toBeInTheDocument();
    expect(screen.getByText('Survei')).toBeInTheDocument();
    expect(screen.getByText('Data Responden')).toBeInTheDocument();
    expect(screen.getByText('Laporan')).toBeInTheDocument();
    expect(screen.getByText('Peta')).toBeInTheDocument();
    expect(screen.getByText('Log Audit')).toBeInTheDocument();
  });

  test('menampilkan label sidebar "Admin Dashboard" untuk admin', () => {
    setUser('admin');
    renderLayout();
    expect(screen.getByText('Admin Dashboard')).toBeInTheDocument();
  });
});

describe('Layout — supervisor role', () => {
  test('menampilkan item navigasi yang sesuai untuk supervisor', () => {
    setUser('supervisor');
    renderLayout();

    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Survei')).toBeInTheDocument();
    expect(screen.getByText('Manajemen TPD')).toBeInTheDocument();
    expect(screen.getByText('Data Responden')).toBeInTheDocument();
    expect(screen.getByText('Laporan')).toBeInTheDocument();
    expect(screen.getByText('Peta')).toBeInTheDocument();
  });

  test('menyembunyikan Manajemen Pengguna dan Audit Log untuk supervisor', () => {
    setUser('supervisor');
    renderLayout();

    expect(screen.queryByText('Manajemen Pengguna')).not.toBeInTheDocument();
    expect(screen.queryByText('Log Audit')).not.toBeInTheDocument();
  });

  test('menampilkan label sidebar "Supervisor Dashboard" untuk supervisor', () => {
    setUser('supervisor');
    renderLayout();
    expect(screen.getByText('Supervisor Dashboard')).toBeInTheDocument();
  });
});

describe('Layout — viewer role', () => {
  test('menampilkan Dashboard, Peta, dan Data Responden untuk viewer', () => {
    setUser('viewer');
    renderLayout();

    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Peta')).toBeInTheDocument();
    expect(screen.getByText('Data Responden')).toBeInTheDocument();
  });

  test('menyembunyikan item navigasi lain untuk viewer', () => {
    setUser('viewer');
    renderLayout();

    expect(screen.queryByText('Survei')).not.toBeInTheDocument();
    expect(screen.queryByText('Laporan')).not.toBeInTheDocument();
    expect(screen.queryByText('Manajemen TPD')).not.toBeInTheDocument();
    expect(screen.queryByText('Manajemen Pengguna')).not.toBeInTheDocument();
    expect(screen.queryByText('Log Audit')).not.toBeInTheDocument();
  });

  test('menampilkan label sidebar "Viewer Dashboard" untuk viewer', () => {
    setUser('viewer');
    renderLayout();
    expect(screen.getByText('Viewer Dashboard')).toBeInTheDocument();
  });
});

describe('Layout — no user / unknown role', () => {
  test('menampilkan label sidebar default "Dashboard" ketika tidak ada user', () => {
    // No user in localStorage
    renderLayout();
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
  });

  test('tidak menampilkan item navigasi ketika role tidak dikenal', () => {
    setUser('unknown');
    renderLayout();
    // No nav links should be rendered (empty nav)
    const nav = screen.getByRole('navigation', { name: /sidebar navigation/i });
    const links = nav.querySelectorAll('a');
    expect(links).toHaveLength(0);
  });
});
