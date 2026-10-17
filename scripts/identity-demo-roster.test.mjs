import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateRoster, importDemoRoster } from './identity-demo-roster.mjs';
const input = () => JSON.parse(readFileSync(new URL('../data/demo-identities.json', import.meta.url), 'utf8'));
test('validates exactly 40 explicitly synthetic demo accounts', () => assert.equal(validateRoster(input()).accounts.length, 40));
for (const [name, mutate] of [
  ['real-person label', r => { r.synthetic = false; }],
  ['two-word name', r => { r.accounts[0].fullName = 'Phạm Bình'; r.accounts[0].id = 'binhp'; r.accounts[0].scopes[0].target = 'demo/binhp'; }],
  ['profile version drift', r => { r.accounts[0].profileVersion = 1; }],
  ['partial roster', r => { r.accounts.pop(); }],
  ['duplicate ID', r => { r.accounts[1].id = r.accounts[0].id; }],
  ['duplicate profile', r => { r.accounts[1].profileId = r.accounts[0].profileId; }],
  ['wrong name formula', r => { r.accounts[0].id = 'incorrect'; }],
  ['other account target', r => { r.accounts[0].scopes[0].target = 'demo/other'; }],
  ['privileged role injection', r => { r.accounts[0].roles = ['identity-admin']; }],
  ['policy bypass expectation', r => { r.accounts[3].expectedAccess = 'IN_SCOPE'; }],
]) test(`rejects ${name}`, () => { const roster = input(); mutate(roster); assert.throws(() => validateRoster(roster)); });

test('current roster covers all nine sender-form departments and distinct scoped permissions without wildcard/admin roles', () => {
  const rows = validateRoster(input()).accounts;
  assert.equal(new Set(rows.map(r => r.department)).size, 9);
  assert.ok(rows.every(r => r.department));
  assert.ok(new Set(rows.map(r => JSON.stringify([r.scopes[0].environment, r.scopes[0].resource, r.scopes[0].operation]))).size >= 10);
  assert.deepEqual(rows.reduce((out, r) => ({ ...out, [r.expectedAccess]: (out[r.expectedAccess] || 0) + 1 }), {}), { IN_SCOPE: 29, BEYOND_AUTHORITY: 9, SECURITY_RISK: 2 });
});

function fakeStore(roster) {
  let tables = {
    identity_employees: roster.accounts.map(r => ({ id: r.id, fullName: r.fullName, status: 'ACTIVE', applicationId: roster.batchId + ':' + r.id, profileId: r.profileId, profileVersion: 2, roles: [] })),
    identity_profiles: roster.accounts.map(r => ({ id: r.profileId, version: 2, name: r.jobPosition + ' — demo', active: true, createdBy: roster.batchId, scopes: r.scopes })),
    identity_audit: [],
  };
  const match = (row, query) => Object.entries(query).every(([k,v]) => v && typeof v === 'object' && '$exists' in v ? (row[k] !== undefined) === v.$exists : row[k] === v);
  const db = {
    listCollections: () => ({ next: async () => ({ options: { validator: {} } }) }),
    collection: name => ({
      indexes: async () => [{ unique: true, key: { id: 1 } }],
      findOne: async q => tables[name].find(r => match(r, q)) || null,
      insertOne: async r => { tables[name].push(structuredClone(r)); },
      updateOne: async (q, update) => { const row = tables[name].find(r => match(r,q)); if (!row) return { modifiedCount: 0 }; Object.assign(row, update.$set); return { modifiedCount: 1 }; },
    }),
  };
  return { get tables() { return tables; }, db: () => db, startSession: () => ({
    withTransaction: async work => { const before = structuredClone(tables); try { return await work(); } catch (e) { tables = before; throw e; } },
    endSession: async () => {},
  }) };
}
test('department sync is explicit, transactional, idempotent and changes no scopes/roles/IDs', async () => {
  const roster = input(), client = fakeStore(roster);
  const profiles = structuredClone(client.tables.identity_profiles);
  await assert.rejects(importDemoRoster(client, 'isolated-fake', roster, 'operator-demo'), /DEPARTMENT_CONFLICT/);
  assert.equal(client.tables.identity_audit.length, 0);
  const receipt = await importDemoRoster(client, 'isolated-fake', roster, 'operator-demo', true);
  assert.equal(receipt.departmentsUpdated.length, 40);
  assert.equal(client.tables.identity_audit.length, 40);
  assert.deepEqual(client.tables.identity_profiles, profiles);
  assert.ok(client.tables.identity_employees.every(r => r.roles.length === 0));
  assert.equal((await importDemoRoster(client, 'isolated-fake', roster, 'operator-demo', true)).unchanged.length, 40);
  assert.equal(client.tables.identity_audit.length, 40);
});
test('department sync rolls back the entire batch when an existing department differs', async () => {
  const roster = input(), client = fakeStore(roster);
  client.tables.identity_employees[30].department = 'other';
  const before = structuredClone(client.tables);
  await assert.rejects(importDemoRoster(client, 'isolated-fake', roster, 'operator-demo', true), /DEPARTMENT_CONFLICT/);
  assert.deepEqual(client.tables, before);
});
