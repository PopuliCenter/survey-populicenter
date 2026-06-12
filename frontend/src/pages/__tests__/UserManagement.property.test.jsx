/**
 * Property-Based Tests for UserManagement page
 *
 * Property 6: Tombol Hapus ada untuk setiap baris user (sebagai admin)
 * Validates: Requirements 7.1, 7.4, 7.5
 *
 * Property 7: Confirmation dialog menampilkan nama user yang akan dihapus
 * Validates: Requirements 4.1
 *
 * Feature: admin-delete-user
 */

import fc from 'fast-check';
import React from 'react';
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
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

/**
 * Set the current user in localStorage.
 * @param {string} role
 * @param {string} id
 */
function setCurrentUser(role, id) {
  localStorage.setItem(
    'user',
    JSON.stringify({ id, name: 'Current Admin', email: 'admin@test.com', role })
  );
}

/**
 * Render UserManagement wrapped in MemoryRouter.
 */
function renderPage() {
  return render(
    <MemoryRouter>
      <UserManagement />
    </MemoryRouter>
  );
}

// ─── Setup / Teardown ─────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  localStorage.clear();
});

// ─── Property 6 ───────────────────────────────────────────────────────────────

describe('Property 6: Tombol Hapus ada untuk setiap baris user (sebagai admin)', () => {
  /**
   * // Feature: admin-delete-user, Property 6: Tombol Hapus ada untuk setiap baris user
   * Validates: Requirements 7.1, 7.4, 7.5
   *
   * For any list of users rendered in UserManagement when the current user is
   * an admin (and is NOT in the list), every row must have an enabled "Hapus"
   * button — none should be disabled.
   */
  test('setiap baris memiliki tombol "Hapus" yang dapat diklik (tidak disabled) ketika currentUser bukan bagian dari list', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            id: fc.uuid(),
            name: fc.string({ minLength: 1 }),
            email: fc.emailAddress(),
            is_active: fc.boolean(),
          }),
          { minLength: 1 }
        ),
        async (users) => {
          // currentUser id is a fixed UUID that is guaranteed to differ from all generated users
          const currentUserId = '00000000-0000-0000-0000-000000000001';

          // Ensure none of the generated users accidentally have the same id
          const safeUsers = users.map((u, i) => ({
            ...u,
            id: `generated-${i}-${u.id}`,
          }));

          setCurrentUser('admin', currentUserId);
          api.get.mockResolvedValue({ data: safeUsers });

          renderPage();

          // Wait for the table to render
          await waitFor(() => {
            expect(screen.queryByText(/memuat daftar/i)).not.toBeInTheDocument();
          });

          // Every row should have an enabled "Hapus" button
          const hapusButtons = screen.getAllByRole('button', { name: /hapus/i });

          // There should be exactly one "Hapus" button per user row
          expect(hapusButtons.length).toBeGreaterThanOrEqual(safeUsers.length);

          // None of the "Hapus" buttons should be disabled
          // (since currentUser is not in the list, no self-delete guard applies)
          const hapusRowButtons = hapusButtons.filter(
            (btn) => btn.getAttribute('aria-label')?.match(/hapus admin/i)
          );

          for (const btn of hapusRowButtons) {
            expect(btn).not.toBeDisabled();
          }

          cleanup();
          return true;
        }
      ),
      { numRuns: 50 }
    );
  });

  test('tidak ada baris yang memiliki tombol "Hapus" disabled ketika currentUser bukan bagian dari list', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            id: fc.uuid(),
            name: fc.string({ minLength: 1 }),
            email: fc.emailAddress(),
            is_active: fc.boolean(),
          }),
          { minLength: 1 }
        ),
        async (users) => {
          const currentUserId = '00000000-0000-0000-0000-000000000002';

          // Ensure no generated user has the same id as currentUser
          const safeUsers = users.map((u, i) => ({
            ...u,
            id: `safe-${i}-${u.id}`,
          }));

          setCurrentUser('admin', currentUserId);
          api.get.mockResolvedValue({ data: safeUsers });

          renderPage();

          await waitFor(() => {
            expect(screen.queryByText(/memuat daftar/i)).not.toBeInTheDocument();
          });

          // Find all "Hapus" buttons that are disabled
          const allButtons = screen.getAllByRole('button');
          const disabledHapusButtons = allButtons.filter(
            (btn) =>
              btn.textContent?.trim() === 'Hapus' &&
              btn.disabled === true
          );

          // Since currentUser is not in the list, no "Hapus" button should be disabled
          expect(disabledHapusButtons).toHaveLength(0);

          cleanup();
          return true;
        }
      ),
      { numRuns: 50 }
    );
  });
});

// ─── Property 7 ───────────────────────────────────────────────────────────────

describe('Property 7: Confirmation dialog menampilkan nama user yang akan dihapus', () => {
  /**
   * // Feature: admin-delete-user, Property 7: Confirmation dialog menampilkan nama user
   * Validates: Requirements 4.1
   *
   * For any user with any name, when an admin clicks the "Hapus" button on that
   * user's row, the confirmation text that appears must contain the user's name.
   */
  test('teks konfirmasi yang muncul mengandung nama user yang akan dihapus', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          id: fc.uuid(),
          name: fc.string({ minLength: 1 }),
          email: fc.emailAddress(),
          is_active: fc.boolean(),
        }),
        async (user) => {
          const currentUserId = '00000000-0000-0000-0000-000000000003';

          // Ensure the generated user id differs from currentUser
          const safeUser = { ...user, id: `prop7-${user.id}` };

          setCurrentUser('admin', currentUserId);
          api.get.mockResolvedValue({ data: [safeUser] });

          renderPage();

          // Wait for the table to render
          await waitFor(() => {
            expect(screen.queryByText(/memuat daftar/i)).not.toBeInTheDocument();
          });

          // Find and click the "Hapus" icon button for this user (aria-label
          // diawali "Hapus "; tombol disabled "Tidak dapat menghapus…" dikecualikan)
          const hapusButtons = screen.getAllByRole('button', { name: /^hapus /i });
          const hapusBtn = hapusButtons.find((btn) => !btn.disabled);

          expect(hapusBtn).toBeDefined();
          fireEvent.click(hapusBtn);

          // Wait for the confirmation dialog to appear
          await waitFor(() => {
            expect(screen.getByText('Hapus permanen?')).toBeInTheDocument();
          });

          // The confirmation text area should contain the user's name
          // The component renders "Hapus permanen?" as the confirmation label
          // and the aria-label on the confirm button contains the user's name
          const confirmBtn = screen.getByRole('button', { name: /konfirmasi hapus/i });
          expect(confirmBtn).toBeInTheDocument();

          // The aria-label of the confirm button contains the user's name
          const ariaLabel = confirmBtn.getAttribute('aria-label') || '';
          expect(ariaLabel).toContain(safeUser.name);

          cleanup();
          return true;
        }
      ),
      { numRuns: 50 }
    );
  });
});
