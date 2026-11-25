import { describe, expect, it } from 'vitest'
import { buildApp } from '../src/app.js'
import { COLLECTIONS } from '../src/collections.js'
import { loadConfig } from '../src/config.js'
import { PLANNED } from '../src/routes/planned.js'

process.env['NODE_ENV'] = 'test'
const config = loadConfig({})

describe('server', () => {
  it('answers /health without a database', async () => {
    const app = await buildApp(config)
    const r = await app.inject({ url: '/health' })
    expect(r.statusCode).toBe(200)
    expect(r.json()).toMatchObject({ ok: true, database: 'not configured' })
    await app.close()
  })

  it('lists every planned endpoint and answers 501 until it is built', async () => {
    const app = await buildApp(config)
    for (const p of PLANNED) {
      const r = await app.inject({ method: p.method, url: p.url })
      expect(r.statusCode, `${p.method} ${p.url}`).toBe(501)
    }
    await app.close()
  })

  it('answers an unknown address with 404', async () => {
    const app = await buildApp(config)
    expect((await app.inject({ url: '/nope' })).statusCode).toBe(404)
    await app.close()
  })
})

describe('configuration', () => {
  it('has safe defaults and treats an empty MONGODB_URI as "no database"', () => {
    expect(loadConfig({ MONGODB_URI: '  ' })).toMatchObject({ PORT: 4000, MONGODB_DB: 'mars_pos', MONGODB_URI: undefined })
  })
  it('refuses a database name with a space (Atlas rejects it too)', () => {
    expect(() => loadConfig({ MONGODB_DB: 'Mars Cosmos' })).toThrow('Database names cannot contain')
  })
  it('refuses a bad port', () => {
    expect(() => loadConfig({ PORT: '99999' })).toThrow('Bad configuration')
  })
})

describe('collections', () => {
  it('uses snake_case names and every one has a validator and an index', () => {
    for (const [name, def] of Object.entries(COLLECTIONS)) {
      expect(name, name).toMatch(/^[a-z]+(_[a-z]+)*$/)
      expect(def.validator).toHaveProperty('$jsonSchema')
      expect(def.indexes.length, name).toBeGreaterThan(0)
    }
  })
})
