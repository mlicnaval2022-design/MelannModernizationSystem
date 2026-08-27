const test = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync } = require('node:fs');
const { join } = require('node:path');
const { tmpdir } = require('node:os');

process.env.DB_PATH = join(mkdtempSync(join(tmpdir(), 'melann-dashboard-trend-')), 'test.sqlite');
process.env.JWT_SECRET = 'dashboard-trend-test-secret';

const { createApp } = require('../../src/app');
const { closeDb, initializeDatabase } = require('../../src/db/database');

let server;
let baseUrl;
let token;

const getTrend = (mode, endDate = '2026-08-15') => fetch(
  `${baseUrl}/api/reports/dashboard/collection-trend?mode=${mode}&end_date=${endDate}`,
  { headers: { authorization: `Bearer ${token}` } },
);

const localDateKey = (date = new Date()) => {
  const local = new Date(date);
  local.setMinutes(local.getMinutes() - local.getTimezoneOffset());
  return local.toISOString().slice(0, 10);
};

const previousOperationDate = dateKey => {
  const date = new Date(`${dateKey}T00:00:00`);
  do {
    date.setDate(date.getDate() - 1);
  } while (date.getDay() === 0);
  return localDateKey(date);
};

test.before(async () => {
  await initializeDatabase();
  server = createApp().listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;

  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'admin123' }),
  });
  token = (await response.json()).token;
});

test.after(async () => {
  await new Promise((resolve, reject) => server.close(err => err ? reject(err) : resolve()));
  await closeDb();
});

test('daily collection trend returns seven operating days with zero-filled totals', async () => {
  const response = await getTrend('daily');
  assert.equal(response.status, 200);
  const trend = await response.json();
  assert.equal(trend.mode, 'daily');
  assert.equal(trend.rows.length, 7);
  assert.equal(trend.date_to, '2026-08-15');
  assert.ok(trend.rows.every(row => new Date(`${row.date}T00:00:00`).getDay() !== 0));
  assert.ok(trend.rows.every(row => Number.isFinite(row.total)));
});

test('daily trend excludes an unfinished current day with no posted collection', async () => {
  const today = localDateKey();
  const trend = await (await getTrend('daily', today)).json();

  assert.equal(trend.requested_end_date, today);
  assert.equal(trend.current_day_excluded, true);
  assert.equal(trend.date_to, previousOperationDate(today));
  assert.equal(trend.rows.at(-1).date, previousOperationDate(today));
});

test('weekly and 45-day modes return complete rolling periods', async () => {
  const weekly = await (await getTrend('weekly')).json();
  assert.equal(weekly.rows.length, 8);
  assert.equal(weekly.rows[0].start_date, '2026-06-21');
  assert.equal(weekly.rows.at(-1).end_date, '2026-08-15');

  const cycle = await (await getTrend('45-days')).json();
  assert.equal(cycle.rows.length, 6);
  assert.equal(cycle.rows.at(-1).start_date, '2026-07-02');
  assert.equal(cycle.rows.at(-1).end_date, '2026-08-15');
});

test('collection trend rejects unsupported modes and invalid dates', async () => {
  assert.equal((await getTrend('monthly')).status, 400);
  assert.equal((await getTrend('daily', 'not-a-date')).status, 400);
});
