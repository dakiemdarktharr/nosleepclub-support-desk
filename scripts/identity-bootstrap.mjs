/** Operator-only bootstrap. Reads a private JSON file; never called by a public route. */
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { MongoClient } from 'mongodb';
import { z } from 'zod';
const args = process.argv.slice(2);
const file = args[args.indexOf('--file') + 1];
const database = args[args.indexOf('--database') + 1];
const uri = process.env.IDENTITY_MONGODB_URI || process.env.MONGODB_URI;
if (!args.includes('--apply') || !args.includes('--file') || !args.includes('--database') || !file || !database || database !== process.env.IDENTITY_MONGODB_DB || !uri) {
  console.error('Cần --apply --file <private.json> --database <IDENTITY_MONGODB_DB> và MongoDB đã cấu hình. Không ghi dữ liệu.'); process.exit(1);
}
const schema = z.object({ fullName: z.string().trim().min(2).max(120), destination: z.string().trim().min(3).max(254), verifiedBy: z.string().trim().min(3).max(120), reason: z.string().trim().min(8).max(1000) }).strict();
let client;
try {
  const input = schema.parse(JSON.parse(await readFile(file, 'utf8')));
  const parts = input.fullName.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[đĐ]/g, 'd').toLowerCase().split(/\s+/);
  if (parts.some((part) => !/^[a-z]+$/.test(part))) throw new Error('INVALID_NAME');
  const id = parts.at(-1) + parts.slice(0, -1).map((part) => part[0]).join('');
  if (id.length > 32) throw new Error('INVALID_ID');
  client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000 }); await client.connect(); const db = client.db(database);
  // Run the application profiles endpoint once first to install validators/indexes.
  for (const name of ['identity_employees', 'identity_profiles', 'identity_audit']) {
    const info = await db.listCollections({ name }).next();
    if (!info?.options?.validator) throw new Error('INITIALIZE_APP_FIRST');
  }
  const indexes = await db.collection('identity_employees').indexes();
  if (!indexes.some((index) => index.unique && index.key.id === 1)) throw new Error('UNIQUE_INDEX_REQUIRED');
  const session = client.startSession();
  try { await session.withTransaction(async () => {
    // Refuse overwriting any existing account. Subsequent role/channel changes require an audited operator workflow.
    if (await db.collection('identity_employees').findOne({ id }, { session })) throw new Error('EXISTING_ID');
    const now = new Date().toISOString(), profileId = randomUUID();
    await db.collection('identity_profiles').insertOne({ id: profileId, version: 1, name: 'IT Identity Operator (operator bootstrap)', scopes: [{ environment: 'sandbox', resource: 'project', operation: 'read', target: 'identity-console' }], active: true, createdAt: now, createdBy: input.verifiedBy }, { session });
    await db.collection('identity_employees').insertOne({ id, fullName: input.fullName, status: 'ACTIVE', profileId, profileVersion: 1, roles: ['identity-admin'], createdAt: now, applicationId: 'operator-bootstrap', verifiedChannel: { destination: input.destination, verifiedBy: input.verifiedBy, verifiedAt: now } }, { session });
    await db.collection('identity_audit').insertOne({ id: randomUUID(), at: now, actor: input.verifiedBy, action: 'OPERATOR_BOOTSTRAP', subject: id, reason: input.reason }, { session });
  }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } }); }
  finally { await session.endSession(); }
  console.log('Đã tạo tài khoản IT và audit trong MongoDB. ID:', id);
} catch { console.error('Không hoàn tất bootstrap. Kiểm tra private JSON, trùng ID, validator/index, replica set và quyền MongoDB. Không in dữ liệu riêng hoặc credentials.'); process.exitCode = 1; }
finally { await client?.close(); }
