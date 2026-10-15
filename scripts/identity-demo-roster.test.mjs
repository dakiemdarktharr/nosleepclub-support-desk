import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateRoster } from './identity-demo-roster.mjs';
const input = () => JSON.parse(readFileSync(new URL('../data/demo-identities.json', import.meta.url), 'utf8'));
test('validates exactly 40 explicitly synthetic demo accounts', () => assert.equal(validateRoster(input()).accounts.length, 40));
for (const [name, mutate] of [
  ['real-person label', r => { r.synthetic = false; }],
  ['partial roster', r => { r.accounts.pop(); }],
  ['duplicate ID', r => { r.accounts[1].id = r.accounts[0].id; }],
  ['duplicate profile', r => { r.accounts[1].profileId = r.accounts[0].profileId; }],
  ['wrong name formula', r => { r.accounts[0].id = 'incorrect'; }],
  ['other account target', r => { r.accounts[0].scopes[0].target = 'demo/other'; }],
  ['privileged role injection', r => { r.accounts[0].roles = ['identity-admin']; }],
  ['policy bypass expectation', r => { r.accounts[3].expectedAccess = 'IN_SCOPE'; }],
]) test(`rejects ${name}`, () => { const roster = input(); mutate(roster); assert.throws(() => validateRoster(roster)); });
