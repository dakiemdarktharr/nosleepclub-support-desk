/** Explicit operator command: validates or atomically imports the synthetic demo roster. */
import { readFile } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { MongoClient } from 'mongodb';
import { z } from 'zod';

const scope = z.object({
  environment: z.enum(['sandbox', 'staging', 'production']),
  resource: z.enum(['project', 'repository', 'logs', 'database', 'cloud', 'configuration', 'secrets', 'keys', 'administration']),
  operation: z.enum(['read', 'create', 'update', 'delete', 'execute', 'approve', 'configure', 'export', 'rotate', 'revoke']),
  target: z.string().regex(/^demo\/[a-z0-9][a-z0-9_-]{0,31}$/),
}).strict();
const account = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9_-]{0,31}$/),
  fullName: z.string().trim().min(2).max(120),
  jobPosition: z.string().trim().min(2).max(90),
  profileId: z.string().uuid(), scopes: z.array(scope).length(1),
  expectedAccess: z.enum(['IN_SCOPE', 'BEYOND_AUTHORITY', 'SECURITY_RISK']),
}).strict();
const schema = z.object({ version: z.literal(1), batchId: z.literal('demo-identities-2026-10-v1'), synthetic: z.literal(true), accounts: z.array(account).length(40) }).strict();
function employeeId(name) {
  const parts = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[đĐ]/g, 'd').toLowerCase().split(/\s+/);
  if (parts.some(part => !/^[a-z]+$/.test(part))) throw new Error('INVALID_NAME');
  return parts.at(-1) + parts.slice(0, -1).map(part => part[0]).join('');
}
export function validateRoster(value) {
  const roster = schema.parse(value);
  for (const field of ['id', 'fullName', 'jobPosition', 'profileId'])
    if (new Set(roster.accounts.map(row => row[field])).size !== 40) throw new Error('DUPLICATE_' + field);
  for (const row of roster.accounts) {
    if (employeeId(row.fullName) !== row.id || row.scopes[0].target !== `demo/${row.id}`) throw new Error('ID_OR_TARGET_MISMATCH');
    const s = row.scopes[0];
    const expected = ['secrets', 'keys', 'administration'].includes(s.resource) ? 'SECURITY_RISK'
      : s.environment === 'production' || ['delete', 'execute', 'approve', 'configure', 'export', 'rotate', 'revoke'].includes(s.operation) ? 'BEYOND_AUTHORITY' : 'IN_SCOPE';
    if (row.expectedAccess !== expected) throw new Error('POLICY_EXPECTATION_MISMATCH');
  }
  return roster;
}
export async function importDemoRoster(client, database, value, actor) {
  const roster = validateRoster(value);
  z.string().trim().min(3).max(120).parse(actor);
  const db = client.db(database);
  for (const name of ['identity_employees', 'identity_profiles', 'identity_audit']) {
    const collection = await db.listCollections({ name }).next();
    if (!collection?.options?.validator) throw new Error('INITIALIZE_IDENTITY_APP_FIRST');
  }
  for (const [name, key] of [['identity_employees', 'id'], ['identity_profiles', 'id']]) {
    const indexes = await db.collection(name).indexes();
    if (!indexes.some(index => index.unique && index.key[key] === 1)) throw new Error('UNIQUE_INDEX_REQUIRED');
  }
  const digest = createHash('sha256').update(JSON.stringify(roster)).digest('hex');
  const session = client.startSession();
  try {
    return await session.withTransaction(async () => {
      const receipt = { batchId: roster.batchId, manifestSha256: digest, database, created: [], unchanged: [] };
      for (const row of roster.accounts) {
        const applicationId = `${roster.batchId}:${row.id}`;
        const profileName = `${row.jobPosition} — demo`;
        const existing = await db.collection('identity_employees').findOne({ id: row.id }, { session });
        const profile = await db.collection('identity_profiles').findOne({ id: row.profileId }, { session });
        if (existing || profile) {
          if (!existing || !profile || existing.fullName !== row.fullName || existing.status !== 'ACTIVE'
            || existing.applicationId !== applicationId || existing.profileId !== row.profileId || existing.profileVersion !== 1
            || existing.roles.length !== 0 || profile.version !== 1 || !profile.active || profile.name !== profileName
            || profile.createdBy !== roster.batchId || JSON.stringify(profile.scopes) !== JSON.stringify(row.scopes))
            throw new Error('EXISTING_RECORD_CONFLICT');
          receipt.unchanged.push(row.id); continue;
        }
        const now = new Date().toISOString();
        await db.collection('identity_profiles').insertOne({ id: row.profileId, version: 1, name: profileName, scopes: row.scopes, active: true, createdAt: now, createdBy: roster.batchId }, { session });
        await db.collection('identity_employees').insertOne({ id: row.id, fullName: row.fullName, status: 'ACTIVE', profileId: row.profileId, profileVersion: 1, roles: [], createdAt: now, applicationId }, { session });
        await db.collection('identity_audit').insertOne({ id: randomUUID(), at: now, actor, action: 'OPERATOR_DEMO_ROSTER_CREATED', subject: row.id,
          reason: `User-authorized synthetic account; batch ${roster.batchId}; manifest ${digest}. Job scopes remain subject to runtime policy; no identity-admin role.`, version: 1 }, { session });
        receipt.created.push(row.id);
      }
      return receipt;
    }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } });
  } finally { await session.endSession(); }
}
async function main() {
  const args = process.argv.slice(2);
  const option = name => { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : undefined; };
  const file = option('--file');
  if (!file) throw new Error('FILE_REQUIRED');
  const roster = validateRoster(JSON.parse(await readFile(file, 'utf8')));
  if (!args.includes('--apply')) { console.log(JSON.stringify({ valid: true, mode: 'validation-only', count: roster.accounts.length })); return; }
  const database = option('--database'), actor = option('--actor');
  const uri = process.env.IDENTITY_MONGODB_URI || process.env.MONGODB_URI;
  if (!args.includes('--demo-id-only') || !uri || !database || database !== process.env.IDENTITY_MONGODB_DB || !actor)
    throw new Error('EXPLICIT_DATABASE_ACTOR_AND_DEMO_ACK_REQUIRED');
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 8000 });
  try { await client.connect(); console.log(JSON.stringify(await importDemoRoster(client, database, roster, actor))); }
  finally { await client.close(); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(() => { console.error('Import failed. Check the manifest, explicit database/demo acknowledgement, existing record conflicts and Mongo transaction support. No credentials are printed; the transaction never overwrites existing accounts.'); process.exitCode = 1; });
}
