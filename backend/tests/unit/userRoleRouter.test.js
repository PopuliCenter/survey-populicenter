/**
 * Unit Tests — routes/_userRoleRouter.js (akun Partner Lokal & Asisten SPV).
 *
 * Audit 2026-11-23: kelola akun dua role ini KHUSUS admin (selaras UI). Dulu
 * supervisor — dan asisten SPV lewat pewarisan role — bisa membuat akun setara
 * dirinya atau mengambil alih asisten lain dengan mengganti password-nya.
 */

const express = require('express');
const request = require('supertest');

let mockUser = { id: 'admin-1', role: 'admin' };
jest.mock('../../src/middleware/auth', () => {
  const actual = jest.requireActual('../../src/middleware/auth');
  return {
    ...actual,
    authMiddleware: (req, res, next) => { req.user = mockUser; next(); },
  };
});

jest.mock('../../src/models', () => ({
  User: { findOne: jest.fn(), create: jest.fn() },
  AuditLog: { create: jest.fn() },
}));

const { User, AuditLog } = require('../../src/models');
const { buildUserRoleRouter } = require('../../src/routes/_userRoleRouter');

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/asisten-supervisor', buildUserRoleRouter({ role: 'asisten_supervisor', label: 'Asisten Supervisor' }));
  return app;
}

const TARGET = '33333333-3333-4333-8333-333333333333';

beforeEach(() => {
  jest.clearAllMocks();
  User.findOne.mockResolvedValue(null);
  User.create.mockImplementation(async (v) => ({ id: 'new-1', ...v }));
  AuditLog.create.mockResolvedValue({});
});

test('admin boleh membuat akun asisten', async () => {
  mockUser = { id: 'admin-1', role: 'admin' };
  const res = await request(makeApp()).post('/asisten-supervisor')
    .send({ name: 'A', email: 'a@x.id', password: 'Rahasia123' });
  expect(res.status).toBe(201);
});

test.each(['supervisor', 'asisten_supervisor'])('%s TIDAK boleh membuat akun asisten', async (role) => {
  mockUser = { id: `${role}-1`, role };
  const res = await request(makeApp()).post('/asisten-supervisor')
    .send({ name: 'A', email: 'a@x.id', password: 'Rahasia123' });
  expect(res.status).toBe(403);
  expect(User.create).not.toHaveBeenCalled();
});

test('asisten TIDAK boleh mengganti password asisten lain', async () => {
  mockUser = { id: 'asisten-1', role: 'asisten_supervisor' };
  const target = { id: TARGET, save: jest.fn() };
  User.findOne.mockResolvedValue(target);
  const res = await request(makeApp()).put(`/asisten-supervisor/${TARGET}`).send({ password: 'Ambil4lih' });
  expect(res.status).toBe(403);
  expect(target.save).not.toHaveBeenCalled();
});

test.each(['activate', 'deactivate'])('supervisor TIDAK boleh %s akun asisten', async (act) => {
  mockUser = { id: 'spv-1', role: 'supervisor' };
  const res = await request(makeApp()).patch(`/asisten-supervisor/${TARGET}/${act}`);
  expect(res.status).toBe(403);
});
