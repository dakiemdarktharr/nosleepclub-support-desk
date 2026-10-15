import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateRename } from './identity-demo-rename.mjs';
const previous = () => JSON.parse(readFileSync(new URL('../data/migrations/demo-identities-v1.json', import.meta.url), 'utf8'));
const current = () => JSON.parse(readFileSync(new URL('../data/demo-identities.json', import.meta.url), 'utf8'));
test('maps all 40 accounts by stable profile ID, never array position', () => {
  const next = current(); next.accounts.reverse();
  const pairs = validateRename(previous(), next);
  assert.equal(pairs.length, 40);
  for (const { old, next } of pairs) { assert.equal(old.profileId, next.profileId); assert.notEqual(old.id, next.id); }
});
for (const [name, mutate] of [
  ['job changes', r => { r.accounts[0].jobPosition = 'Changed position'; }],
  ['scope expansion', r => { r.accounts[0].scopes[0].resource = 'cloud'; }],
  ['new unrelated profile', r => { r.accounts[0].profileId = 'fc903dca-5faf-4c42-a928-4d404b4e42fa'; }],
  ['old ID reuse', r => { const old = previous().accounts[0]; r.accounts[0].id = old.id; r.accounts[0].fullName = old.fullName; r.accounts[0].scopes[0].target = old.scopes[0].target; }],
  ['version downgrade', r => { r.version = 1; r.accounts.forEach(a => { a.profileVersion = 1; }); }],
]) test(`rejects ${name}`, () => { const next = current(); mutate(next); assert.throws(() => validateRename(previous(), next)); });
