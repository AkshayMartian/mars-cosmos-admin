import type { CreateIndexesOptions, Document, IndexSpecification } from 'mongodb'

/**
 * The MongoDB collections for onboarding: validators (JSON Schema) and indexes.
 * Names are snake_case plurals; fields inside documents are camelCase. `tenantId` is on every shop record.
 * `npm run db:setup` creates what is missing and updates validators / indexes; it never deletes data.
 */
export interface CollectionDef {
  validator: Document
  indexes: Array<[IndexSpecification, CreateIndexesOptions]>
}

const str = (extra: Document = {}): Document => ({ bsonType: 'string', ...extra })
const date: Document = { bsonType: 'date' }
const mobile = str({ pattern: '^[6-9][0-9]{9}$' })
const key = str({ pattern: '^MARS-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$' })
const schema = (required: string[], properties: Document): Document => ({ $jsonSchema: { bsonType: 'object', required, properties: { _id: {}, ...properties } } })

export const COLLECTIONS: Record<string, CollectionDef> = {
  // one document per shop (the tenant)
  shops: {
    validator: schema(['tenantId', 'name', 'contactNumber', 'address', 'status', 'plan', 'mode', 'createdAt'], {
      tenantId: str({ minLength: 8 }),
      name: str({ minLength: 2, maxLength: 80 }),
      description: str({ maxLength: 500 }),
      contactNumber: mobile,
      gstin: str({ pattern: '^(0[1-9]|[1-2][0-9]|3[0-8])[A-Z]{5}[0-9]{4}[A-Z][A-Z0-9]Z[A-Z0-9]$' }),
      address: {
        bsonType: 'object', required: ['line', 'city', 'state', 'pincode'],
        properties: { line: str({ maxLength: 200 }), city: str({ minLength: 2, maxLength: 60 }), state: str(), stateCode: str({ pattern: '^[0-9]{2}$' }), pincode: str({ pattern: '^[1-9][0-9]{5}$' }) }
      },
      status: { enum: ['pending', 'active', 'suspended'] },
      plan: str(), mode: { enum: ['cloud', 'local'] }, counters: { bsonType: ['int', 'long'], minimum: 1 },
      createdAt: date, updatedAt: date
    }),
    indexes: [[{ tenantId: 1 }, { unique: true }], [{ gstin: 1 }, { unique: true, partialFilterExpression: { gstin: { $type: 'string' } } }], [{ status: 1 }, {}]]
  },

  // the shop owner: portal login + the app's owner. Passwords and PINs are only ever stored as hashes.
  owners: {
    validator: schema(['tenantId', 'fullName', 'mobile', 'email', 'passwordHash', 'createdAt'], {
      tenantId: str(), fullName: str({ minLength: 2, maxLength: 80 }),
      mobile, mobileVerifiedAt: date,
      email: str({ pattern: '^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$' }), emailVerifiedAt: date,
      passwordHash: str(),
      photoKey: str(),
      pinHash: str(), pinUpdatedAt: date,
      createdAt: date, updatedAt: date
    }),
    indexes: [[{ tenantId: 1 }, { unique: true }], [{ mobile: 1 }, { unique: true }], [{ email: 1 }, { unique: true }]]
  },

  // mobile / email verification codes: only a hash is kept, documents delete themselves after expiry
  otp_verifications: {
    validator: schema(['channel', 'target', 'codeHash', 'expiresAt', 'attempts', 'createdAt'], {
      channel: { enum: ['mobile', 'email'] }, target: str(), codeHash: str(),
      attempts: { bsonType: ['int', 'long'], minimum: 0 }, verifiedAt: date, expiresAt: date, createdAt: date
    }),
    indexes: [[{ expiresAt: 1 }, { expireAfterSeconds: 0 }], [{ channel: 1, target: 1, createdAt: -1 }, {}]]
  },

  // the key sent to the owner on WhatsApp, entered once in the app
  activation_keys: {
    validator: schema(['key', 'tenantId', 'mobile', 'status', 'issuedAt'], {
      key, tenantId: str(), mobile,
      status: { enum: ['issued', 'activated', 'revoked'] },
      whatsapp: { bsonType: 'object', properties: { status: { enum: ['queued', 'sent', 'delivered', 'failed'] }, messageId: str(), sentAt: date, error: str() } },
      issuedAt: date, activatedAt: date, machineId: str(), expiresAt: date,
      licenceDays: { bsonType: ['int', 'long'], minimum: 1 }, licenceIssued: str(), licenceExpires: str(), failedAttempts: { bsonType: ['int', 'long'], minimum: 0 }
    }),
    indexes: [[{ key: 1 }, { unique: true }], [{ tenantId: 1 }, {}]]
  },

  // PCs a licence is activated on
  devices: {
    validator: schema(['tenantId', 'key', 'machineId', 'activatedAt'], { tenantId: str(), key, machineId: str(), activatedAt: date, lastCheckAt: date, releasedAt: date }),
    indexes: [[{ tenantId: 1, machineId: 1 }, { unique: true }], [{ key: 1 }, {}]]
  },

  // forgot-PIN: the emailed token is stored as a hash; the new PIN hash waits here until the app applies it
  pin_resets: {
    validator: schema(['tenantId', 'tokenHash', 'status', 'expiresAt', 'createdAt'], {
      tenantId: str(), tokenHash: str(), machineId: str(),
      status: { enum: ['pending', 'ready', 'applied', 'expired'] },
      newPinHash: str(), usedAt: date, appliedAt: date, expiresAt: date, createdAt: date
    }),
    indexes: [[{ tokenHash: 1 }, { unique: true }], [{ tenantId: 1, status: 1 }, {}], [{ expiresAt: 1 }, { expireAfterSeconds: 86400 }]]
  },

  // MARS staff who sign in to this portal (password only as a hash)
  admin_users: {
    validator: schema(['email', 'name', 'role', 'passwordHash', 'active', 'createdAt'], {
      email: str({ pattern: '^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$' }), name: str({ minLength: 2, maxLength: 80 }),
      role: { enum: ['Admin', 'Support', 'Sales'] }, passwordHash: str(), active: { bsonType: 'bool' }, createdAt: date, updatedAt: date, lastLoginAt: date, lockedUntil: date, failedLogins: { bsonType: ['int', 'long'], minimum: 0 }
    }),
    indexes: [[{ email: 1 }, { unique: true }]]
  },

  // plans and their yearly prices (defaults are added when missing; staff edit them on the Plans page)
  plans: {
    validator: schema(['key', 'name', 'yearPrice', 'counters'], {
      key: str({ pattern: '^[a-z0-9_]{2,20}$' }), name: str({ minLength: 2, maxLength: 40 }),
      yearPrice: { bsonType: ['int', 'long', 'double'], minimum: 0 }, counters: { bsonType: ['int', 'long'], minimum: 1 },
      includes: { bsonType: 'array', items: str() }, createdAt: date, updatedAt: date
    }),
    indexes: [[{ key: 1 }, { unique: true }]]
  },

  audit_log: {
    validator: schema(['action', 'at'], { tenantId: str(), action: str(), at: date, by: str(), details: { bsonType: 'object' } }),
    indexes: [[{ tenantId: 1, at: -1 }, {}]]
  }
}
