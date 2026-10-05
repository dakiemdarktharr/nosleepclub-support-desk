import { MongoClient, type ClientSession, type Db } from "mongodb";
import { SupportError } from "./support-repository";

const runtime = globalThis as typeof globalThis & { identityMongo?: { uri: string; name: string; client: MongoClient }; identityIndexes?: Promise<void> };
const validators = {
  identity_employees: { required: ["id", "fullName", "status", "profileId", "profileVersion", "roles", "applicationId", "createdAt"], properties: { id: { bsonType: "string", pattern: "^[a-z0-9][a-z0-9_-]{0,31}$" }, fullName: { bsonType: "string" }, status: { enum: ["ACTIVE", "DISABLED"] }, profileId: { bsonType: "string" }, profileVersion: { bsonType: "number", minimum: 1 }, roles: { bsonType: "array", items: { enum: ["identity-admin"] }, uniqueItems: true }, applicationId: { bsonType: "string" }, createdAt: { bsonType: "string" } } },
  identity_profiles: { required: ["id", "version", "name", "scopes", "active", "createdAt", "createdBy"], properties: { id: { bsonType: "string" }, version: { bsonType: "number", minimum: 1 }, name: { bsonType: "string" }, scopes: { bsonType: "array", minItems: 1, maxItems: 30, items: { bsonType: "object", required: ["environment", "resource", "operation", "target"], properties: { environment: { enum: ["sandbox", "staging", "production"] }, resource: { enum: ["project", "repository", "logs", "database", "cloud", "configuration", "secrets", "keys", "administration"] }, operation: { enum: ["read", "create", "update", "delete", "execute", "approve", "configure", "export", "rotate", "revoke"] }, target: { bsonType: "string", minLength: 2, maxLength: 120, pattern: "^[a-zA-Z0-9][a-zA-Z0-9_./:-]*$" } }, additionalProperties: false } }, active: { bsonType: "bool" }, createdAt: { bsonType: "string" }, createdBy: { bsonType: "string" } } },
  identity_applications: { required: ["id", "fullName", "job", "requestedScopes", "trackingHash", "fingerprint", "status", "version", "createdAt", "updatedAt"], properties: { id: { bsonType: "string" }, fullName: { bsonType: "string" }, job: { bsonType: "object" }, requestedScopes: { bsonType: "array", minItems: 1, maxItems: 30 }, trackingHash: { bsonType: "string", pattern: "^[a-f0-9]{64}$" }, fingerprint: { bsonType: "string" }, status: { enum: ["PENDING", "ID_CONFLICT", "APPROVED", "REJECTED"] }, version: { bsonType: "number", minimum: 0 }, createdAt: { bsonType: "string" }, updatedAt: { bsonType: "string" } } },
  identity_audit: { required: ["id", "at", "actor", "action", "subject", "reason"], properties: { id: { bsonType: "string" }, at: { bsonType: "string" }, actor: { bsonType: "string" }, action: { bsonType: "string" }, subject: { bsonType: "string" }, reason: { bsonType: "string" } } },
} as const;
async function initializeIdentity(db: Db) {
  for (const [name, schema] of Object.entries(validators)) {
    const validator = { $jsonSchema: { bsonType: "object", ...schema } };
    try { await db.createCollection(name, { validator, validationLevel: "strict", validationAction: "error" }); }
    catch (error) {
      if ((error as { code?: number }).code !== 48) throw error;
      await db.command({ collMod: name, validator, validationLevel: "strict", validationAction: "error" });
    }
  }
}
export async function identityStore(): Promise<{ db: Db; client: MongoClient }> {
  const uri = process.env.IDENTITY_MONGODB_URI || process.env.MONGODB_URI;
  const name = process.env.IDENTITY_MONGODB_DB;
  if (!uri || !name) throw new SupportError("IDENTITY_STORAGE_UNAVAILABLE", "Hệ thống ID chưa cấu hình MongoDB. Chưa thể lưu đơn hoặc đăng nhập; liên hệ IT.", 503);
  if (!runtime.identityMongo || runtime.identityMongo.uri !== uri || runtime.identityMongo.name !== name) {
    await runtime.identityMongo?.client.close();
    runtime.identityMongo = { uri, name, client: new MongoClient(uri, { maxPoolSize: 5, serverSelectionTimeoutMS: 5000, ignoreUndefined: true }) };
    runtime.identityIndexes = undefined;
  }
  const client = runtime.identityMongo.client;
  const db = client.db(name);
  try {
    await client.connect();
    await db.command({ ping: 1 });
    runtime.identityIndexes ??= initializeIdentity(db).then(() => Promise.all([
      db.collection("identity_employees").createIndex({ id: 1 }, { unique: true }),
      db.collection("identity_profiles").createIndex({ id: 1, version: 1 }, { unique: true }),
      db.collection("identity_applications").createIndex({ id: 1 }, { unique: true }),
      db.collection("identity_applications").createIndex({ status: 1, createdAt: -1 }),
      db.collection("identity_audit").createIndex({ subject: 1, at: -1 }),
      db.collection("identity_sessions").createIndex({ hash: 1 }, { unique: true }),
      db.collection("identity_sessions").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
      db.collection("identity_challenges").createIndex({ id: 1 }, { unique: true }),
      db.collection("identity_challenges").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
      db.collection("identity_limits").createIndex({ key: 1 }, { unique: true }),
      db.collection("identity_limits").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    ])).then(() => undefined).catch((error: unknown) => { runtime.identityIndexes = undefined; throw error; });
    await runtime.identityIndexes;
    return { db, client };
  } catch {
    throw new SupportError("IDENTITY_STORAGE_UNAVAILABLE", "MongoDB của hệ thống ID không khả dụng. Chưa xác nhận lưu; thử lại cùng đơn khi IT khôi phục kết nối.", 503);
  }
}
export async function identityTransaction<T>(work: (db: Db, session: ClientSession) => Promise<T>): Promise<T> {
  const { db, client } = await identityStore();
  const session = client.startSession();
  try {
    return await session.withTransaction(() => work(db, session), { readConcern: { level: "snapshot" }, writeConcern: { w: "majority" } });
  } finally { await session.endSession(); }
}
