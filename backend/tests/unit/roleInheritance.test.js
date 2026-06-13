/**
 * Unit tests untuk pewarisan role di requireRole:
 *   - partner_lokal mewarisi viewer
 *   - asisten_supervisor mewarisi supervisor (kecuali bila di-deny)
 */

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-key';

jest.mock('../../src/config/redis', () => ({ get: jest.fn(), call: jest.fn() }));

const { requireRole, isValidRole } = require('../../src/middleware/auth');

function run(mw, role) {
  const req = { user: role ? { role } : null };
  const result = { status: 200, nexted: false };
  const res = {
    status(s) { result.status = s; return this; },
    json(b) { result.body = b; return this; },
  };
  mw(req, res, () => { result.nexted = true; });
  return result;
}

describe('requireRole — pewarisan & deny', () => {
  test('partner_lokal diizinkan di rute viewer', () => {
    const r = run(requireRole(['admin', 'supervisor', 'viewer']), 'partner_lokal');
    expect(r.nexted).toBe(true);
  });

  test('partner_lokal DITOLAK di rute tanpa viewer (admin/supervisor saja)', () => {
    const r = run(requireRole(['admin', 'supervisor']), 'partner_lokal');
    expect(r.nexted).toBe(false);
    expect(r.status).toBe(403);
  });

  test('asisten_supervisor diizinkan di rute supervisor', () => {
    const r = run(requireRole(['admin', 'supervisor']), 'asisten_supervisor');
    expect(r.nexted).toBe(true);
  });

  test('asisten_supervisor DITOLAK saat di-deny (rute manajemen survei)', () => {
    const r = run(requireRole(['admin', 'supervisor'], { deny: ['asisten_supervisor'] }), 'asisten_supervisor');
    expect(r.nexted).toBe(false);
    expect(r.status).toBe(403);
  });

  test('asisten_supervisor DITOLAK di rute viewer-only (tidak mewarisi viewer)', () => {
    const r = run(requireRole(['viewer']), 'asisten_supervisor');
    expect(r.nexted).toBe(false);
  });

  test('role normal tetap berfungsi (supervisor di rute supervisor)', () => {
    expect(run(requireRole(['admin', 'supervisor']), 'supervisor').nexted).toBe(true);
    expect(run(requireRole(['admin']), 'supervisor').nexted).toBe(false);
  });

  test('tanpa user → 401', () => {
    const r = run(requireRole(['admin']), null);
    expect(r.status).toBe(401);
  });

  test('isValidRole mengakui role baru', () => {
    expect(isValidRole('partner_lokal')).toBe(true);
    expect(isValidRole('asisten_supervisor')).toBe(true);
    expect(isValidRole('bukan_role')).toBe(false);
  });
});
