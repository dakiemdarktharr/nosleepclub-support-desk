/** Operator-only, atomic rename of the synthetic v1 roster into v2. Never run at app startup. */
import { readFile } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { MongoClient } from 'mongodb';
import { z } from 'zod';
import { validateRoster } from './identity-demo-roster.mjs';

export function validateRename(previous, current) {
  const from = validateRoster(previous), to = validateRoster(current);
  if (from.version !== 1 || to.version !== 2 || from.batchId !== to.batchId) throw new Error('V1_TO_V2_REQUIRED');
  const byProfile = new Map(to.accounts.map(row => [row.profileId, row]));
  const oldIds = new Set(from.accounts.map(row => row.id));
  return from.accounts.map(old => {
    const next = byProfile.get(old.profileId);
    if (!next || oldIds.has(next.id) || old.jobPosition !== next.jobPosition || old.expectedAccess !== next.expectedAccess)
      throw new Error('UNRELATED_ACCOUNT_OR_ID_COLLISION');
    const withoutTarget = scope => ({ environment: scope.environment, resource: scope.resource, operation: scope.operation });
    if (!isDeepStrictEqual(old.scopes.map(withoutTarget), next.scopes.map(withoutTarget))) throw new Error('SCOPE_CHANGE_FORBIDDEN');
    return { old, next };
  });
}
function matchesAccount(account, row, batchId) {
  return account?.id === row.id && account.fullName === row.fullName && account.status === 'ACTIVE'
    && account.profileId === row.profileId && account.profileVersion === (row.profileVersion ?? 1)
    && account.applicationId === `${batchId}:${row.id}` && isDeepStrictEqual(account.roles, []);
}
function matchesProfile(profile, row, batchId, active) {
  return profile?.id === row.profileId && profile.version === (row.profileVersion ?? 1)
    && profile.name === `${row.jobPosition} — demo` && profile.createdBy === batchId
    && profile.active === active && isDeepStrictEqual(profile.scopes, row.scopes);
}
/** Input: explicit v1/v2 synthetic manifests. Output: receipt; all 40 updates and audits commit together.
 * Preserves Mongo account _id/createdAt and historical audit. Versions profiles; carries active sessions.
 * Refuses linked business data or shared profiles rather than guessing how to rewrite historical input.
 */
export async function renameDemoRoster(client, database, previous, current, actor) {
  const pairs = validateRename(previous, current);
  z.string().trim().min(3).max(120).parse(actor);
  const from = validateRoster(previous), to = validateRoster(current), db = client.db(database);
  for (const name of ['identity_employees', 'identity_profiles', 'identity_audit']) {
    const metadata = await db.listCollections({ name }).next();
    if (!metadata?.options?.validator) throw new Error('INITIALIZE_IDENTITY_APP_FIRST');
  }
  for (const [name, key] of [['identity_employees', { id: 1 }], ['identity_profiles', { id: 1, version: 1 }]]) {
    const indexes = await db.collection(name).indexes();
    if (!indexes.some(index => index.unique && isDeepStrictEqual(index.key, key))) throw new Error('UNIQUE_INDEX_REQUIRED');
  }
  const fromSha256 = createHash('sha256').update(JSON.stringify(from)).digest('hex');
  const toSha256 = createHash('sha256').update(JSON.stringify(to)).digest('hex');
  const session = client.startSession();
  try {
    return await session.withTransaction(async () => {
      const receipt = { database, fromSha256, toSha256, renamed: [], unchanged: [], sessionsUpdated: 0 };
      const ids = from.accounts.map(row => row.id), profileIds = from.accounts.map(row => row.profileId);
      // These accounts were imported directly, not granted through applications. Any later link needs its own reviewed migration.
      for (const [name, query] of [
        ['identity_applications', { $or: [{ employeeId: { $in: ids } }, { 'job.profileId': { $in: profileIds } }, { 'grantedProfile.id': { $in: profileIds } }] }],
        ['identity_demo_grants', { $or: [{ employeeId: { $in: ids } }, { decidedBy: { $in: ids } }] }],
        ['identity_demo_pool', { ownerIds: { $in: ids } }],
        ['v3_support_requests', { 'data.input.fields.employeeId': { $in: ids } }],
      ]) if (await db.collection(name).countDocuments(query, { session, limit: 1 })) throw new Error('LINKED_DATA_REQUIRES_REVIEW');
      for (const { old, next } of pairs) {
        const oldAccount = await db.collection('identity_employees').findOne({ id: old.id }, { session });
        const newAccount = await db.collection('identity_employees').findOne({ id: next.id }, { session });
        const oldProfile = await db.collection('identity_profiles').findOne({ id: old.profileId, version: 1 }, { session });
        const newProfile = await db.collection('identity_profiles').findOne({ id: next.profileId, version: 2 }, { session });
        if (!oldAccount && matchesAccount(newAccount, next, to.batchId)
          && matchesProfile(oldProfile, old, from.batchId, false) && matchesProfile(newProfile, next, to.batchId, true)) {
          const audit = await db.collection('identity_audit').findOne({ subject: next.id, action: 'OPERATOR_DEMO_ID_RENAMED', reason: { $regex: toSha256 } }, { session });
          if (!audit) throw new Error('MISSING_RENAME_AUDIT');
          receipt.unchanged.push(next.id); continue;
        }
        if (!matchesAccount(oldAccount, old, from.batchId) || newAccount || newProfile
          || !matchesProfile(oldProfile, old, from.batchId, true)) throw new Error('EXISTING_RECORD_CONFLICT');
        if (await db.collection('identity_employees').countDocuments({ id: { $ne: old.id }, profileId: old.profileId }, { session, limit: 1 }))
          throw new Error('SHARED_PROFILE_REQUIRES_REVIEW');
        const now = new Date().toISOString();
        await db.collection('identity_profiles').insertOne({ id: next.profileId, version: 2, name: `${next.jobPosition} — demo`, scopes: next.scopes, active: true, createdAt: now, createdBy: to.batchId }, { session });
        const profileChange = await db.collection('identity_profiles').updateOne({ _id: oldProfile._id, version: 1, active: true }, { $set: { active: false } }, { session });
        const accountChange = await db.collection('identity_employees').updateOne({ _id: oldAccount._id, id: old.id, profileVersion: 1 }, { $set: {
          id: next.id, fullName: next.fullName, profileVersion: 2, applicationId: `${to.batchId}:${next.id}`,
        } }, { session });
        if (profileChange.modifiedCount !== 1 || accountChange.modifiedCount !== 1) throw new Error('CONCURRENT_RECORD_CHANGE');
        const sessions = await db.collection('identity_sessions').updateMany({ employeeId: old.id }, { $set: { employeeId: next.id } }, { session });
        receipt.sessionsUpdated += sessions.modifiedCount;
        await db.collection('identity_audit').insertOne({ id: randomUUID(), at: now, actor, action: 'OPERATOR_DEMO_ID_RENAMED', subject: next.id, version: 2,
          reason: JSON.stringify({ previousId: old.id, previousName: old.fullName, id: next.id, fullName: next.fullName,
            fromSha256, toSha256, reason: 'User-authorized synthetic roster rename; same account/job/policy, versioned exact target; historical audit retained.' }),
        }, { session });
        receipt.renamed.push({ previousId: old.id, id: next.id });
      }
      return receipt;
    }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } });
  } finally { await session.endSession(); }
}
async function main() {
  const args = process.argv.slice(2);
  const option = name => { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : undefined; };
  const fromFile = option('--from'), file = option('--file');
  if (!fromFile || !file) throw new Error('BOTH_MANIFESTS_REQUIRED');
  const previous = JSON.parse(await readFile(fromFile, 'utf8')), current = JSON.parse(await readFile(file, 'utf8'));
  const pairs = validateRename(previous, current);
  if (!args.includes('--apply')) { console.log(JSON.stringify({ valid: true, mode: 'validation-only', count: pairs.length })); return; }
  const database = option('--database'), actor = option('--actor');
  const uri = process.env.IDENTITY_MONGODB_URI || process.env.MONGODB_URI;
  if (!args.includes('--demo-id-only') || !uri || !database || database !== process.env.IDENTITY_MONGODB_DB || !actor)
    throw new Error('EXPLICIT_DATABASE_ACTOR_AND_DEMO_ACK_REQUIRED');
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 8000 });
  try { await client.connect(); console.log(JSON.stringify(await renameDemoRoster(client, database, previous, current, actor))); }
  finally { await client.close(); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(() => { console.error('Rename failed. Check manifests, explicit database/demo acknowledgement, collisions or linked data. Transaction rolled back; credentials are not printed.'); process.exitCode = 1; });
}
