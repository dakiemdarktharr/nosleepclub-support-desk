// Operator-only, explicitly opt-in. Never run automatically on startup/deploy.
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { MongoClient } from 'mongodb';
import { z } from 'zod';
const args = process.argv.slice(2);
const option = (name) => args.includes(name) ? args[args.indexOf(name) + 1] : undefined;
const database = option('--database'), file = option('--file');
const uri = process.env.IDENTITY_MONGODB_URI || process.env.MONGODB_URI;
if (!args.includes('--apply') || !args.includes('--demo-id-only') || !file || !database || database !== process.env.IDENTITY_MONGODB_DB || !uri) {
  console.error('Cần --apply --demo-id-only --file <private.json> --database <IDENTITY_MONGODB_DB>. Không ghi dữ liệu.'); process.exit(1);
}
let client;
try {
  const input = z.object({ ownerId: z.string().regex(/^[a-z0-9][a-z0-9_-]{0,31}$/), actor: z.string().min(3).max(120),
    reason: z.string().min(8).max(500), validUntil: z.string().datetime() }).strict().parse(JSON.parse(await readFile(file, 'utf8')));
  if (Date.parse(input.validUntil) <= Date.now()) throw new Error('EXPIRED');
  client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000 }); await client.connect(); const db = client.db(database);
  for (const name of ['identity_demo_pool', 'identity_demo_grants', 'identity_audit']) {
    const info = await db.listCollections({ name }).next();
    if (!info?.options?.validator) throw new Error('INITIALIZE_APP_FIRST');
  }
  if (!(await db.collection('identity_demo_pool').indexes()).some((index) => index.unique && index.key.id === 1)) throw new Error('INDEX_REQUIRED');
  const session = client.startSession();
  try { await session.withTransaction(async () => {
    const owner = await db.collection('identity_employees').findOne({ id: input.ownerId, status: 'ACTIVE', roles: 'identity-admin' }, { session });
    if (!owner || await db.collection('identity_demo_pool').findOne({ id: 'DEMO-SANDBOX' }, { session })) throw new Error('OWNER_OR_EXISTING_POOL');
    const now = new Date().toISOString();
    await db.collection('identity_demo_pool').insertOne({ id: 'DEMO-SANDBOX', assurance: 'demo', version: 0, ownerIds: [owner.id],
      limits: { cpu: 16, ramGb: 64, diskGb: 500, gpuT4: 4 }, used: { cpu: 0, ramGb: 0, diskGb: 0, gpuT4: 0 },
      reserved: { cpu: 0, ramGb: 0, diskGb: 0, gpuT4: 0 }, maxHours: 24, budget: 'unconfigured', observedAt: now, validUntil: input.validUntil }, { session });
    await db.collection('identity_audit').insertOne({ id: randomUUID(), at: now, actor: input.actor, action: 'DEMO_POOL_BOOTSTRAP', subject: 'DEMO-SANDBOX',
      reason: input.reason + ' Dữ liệu giả lập mới, usage/reserved bằng 0; không cấp tài nguyên thật. Owner: ' + owner.id }, { session });
  }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } }); }
  finally { await session.endSession(); }
  console.log('Đã khởi tạo sổ DEMO-SANDBOX và audit. Không sửa tài khoản, không tạo entitlement, không cấp hạ tầng.');
} catch { console.error('Chưa hoàn tất. Kiểm tra input, owner ACTIVE/IT, schema/index, replica set và project đã tồn tại. Không in URI hoặc dữ liệu riêng.'); process.exitCode = 1; }
finally { await client?.close(); }
