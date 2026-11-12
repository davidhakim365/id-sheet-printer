import { createHash, timingSafeEqual } from 'node:crypto'
import { readFileSync, renameSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Plugin } from 'vite'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const rootDir = path.dirname(fileURLToPath(import.meta.url))
const dataFile = path.join(rootDir, 'src', 'privateLife.data.ts')
const startMark = '/* private-life-start */'
const endMark = '/* private-life-end */'
const maxBodyBytes = 2_000_000

type PrivateNote = {
  id: string
  title: string
  body: string
  createdAt: string
  updatedAt: string
}

type PrivateLifeFile = {
  passwordHash: string
  notes: PrivateNote[]
}

class PrivateLifeError extends Error {
  status: number

  constructor(message: string, status = 400) {
    super(message)
    this.status = status
  }
}

function passwordHash(password: string) {
  return createHash('sha256').update(`private-life\0${password}`, 'utf8').digest('hex')
}

function passwordMatches(password: string, expected: string) {
  const actual = Buffer.from(passwordHash(password))
  const stored = Buffer.from(expected)
  if (actual.length !== stored.length) return false
  return timingSafeEqual(actual, stored)
}

function assertPassword(password: string) {
  if (password.length < 4 || password.length > 200) {
    throw new PrivateLifeError('Use at least 4 characters.')
  }
}

function asText(value: unknown, max: number, label: string) {
  if (typeof value !== 'string' || value.length > max) {
    throw new PrivateLifeError(`Each note needs a valid ${label}.`)
  }
  return value
}

function sanitizeNotes(value: unknown): PrivateNote[] {
  if (!Array.isArray(value)) throw new PrivateLifeError('Notes must be a list.')
  if (value.length > 500) throw new PrivateLifeError('Too many notes.')
  return value.map((item) => {
    if (!item || typeof item !== 'object') throw new PrivateLifeError('A note is invalid.')
    const note = item as Record<string, unknown>
    const id = asText(note.id, 80, 'id')
    if (!/^[\w-]{1,80}$/.test(id)) throw new PrivateLifeError('A note id is invalid.')
    return {
      id,
      title: asText(note.title, 200, 'title'),
      body: asText(note.body, 100_000, 'body'),
      createdAt: asText(note.createdAt, 40, 'date'),
      updatedAt: asText(note.updatedAt, 40, 'date'),
    }
  })
}

function serialize(data: PrivateLifeFile) {
  return `import type { PrivateLifeFile } from './privateLifeStore'

/** Saved by the Private life tab. This file is the store — there is no database. */
export const privateLifeFile: PrivateLifeFile =
${startMark}
${JSON.stringify({ passwordHash: data.passwordHash, notes: data.notes }, null, 2)}
${endMark}
`
}

function readStore(): PrivateLifeFile {
  const text = readFileSync(dataFile, 'utf8')
  const start = text.indexOf(startMark)
  const end = text.indexOf(endMark)
  if (start < 0 || end < start) {
    throw new PrivateLifeError('Private life file is missing its data block.')
  }
  const parsed: unknown = JSON.parse(text.slice(start + startMark.length, end))
  if (!parsed || typeof parsed !== 'object') {
    throw new PrivateLifeError('Private life file could not be read.')
  }
  const record = parsed as { passwordHash?: unknown; notes?: unknown }
  return {
    passwordHash: typeof record.passwordHash === 'string' ? record.passwordHash : '',
    notes: sanitizeNotes(record.notes ?? []),
  }
}

function writeStore(data: PrivateLifeFile) {
  const tempFile = `${dataFile}.tmp`
  writeFileSync(tempFile, serialize(data), 'utf8')
  renameSync(tempFile, dataFile)
}

function handleAction(body: unknown) {
  if (!body || typeof body !== 'object') throw new PrivateLifeError('Invalid request.')
  const record = body as {
    action?: unknown
    password?: unknown
    notes?: unknown
    nextPassword?: unknown
  }
  const password = record.password
  if (typeof password !== 'string') throw new PrivateLifeError('Password is required.')

  const store = readStore()

  if (record.action === 'set-password') {
    if (store.passwordHash) throw new PrivateLifeError('A password is already set.')
    assertPassword(password)
    store.passwordHash = passwordHash(password)
    writeStore(store)
    return { ok: true as const, hasPassword: true, notes: store.notes }
  }

  if (!store.passwordHash) throw new PrivateLifeError('Set a password first.')
  if (!passwordMatches(password, store.passwordHash)) {
    throw new PrivateLifeError('Wrong password.', 401)
  }

  if (record.action === 'unlock') {
    return { ok: true as const, hasPassword: true, notes: store.notes }
  }

  if (record.action === 'save') {
    store.notes = sanitizeNotes(record.notes)
    writeStore(store)
    return { ok: true as const, hasPassword: true, notes: store.notes }
  }

  if (record.action === 'change-password') {
    if (typeof record.nextPassword !== 'string') {
      throw new PrivateLifeError('Enter a new password.')
    }
    assertPassword(record.nextPassword)
    store.passwordHash = passwordHash(record.nextPassword)
    writeStore(store)
    return { ok: true as const, hasPassword: true, notes: store.notes }
  }

  throw new PrivateLifeError('Unknown action.')
}

function privateLifePlugin(): Plugin {
  return {
    name: 'private-life-store',
    configureServer(server) {
      server.middlewares.use('/api/private-life', (req, res) => {
        if (req.method === 'GET') {
          try {
            const store = readStore()
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ ok: true, hasPassword: Boolean(store.passwordHash) }))
          } catch (error) {
            const message = error instanceof Error ? error.message : 'Could not read the private file.'
            res.statusCode = 500
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ error: message }))
          }
          return
        }

        if (req.method !== 'POST') {
          res.statusCode = 405
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: 'Method not allowed.' }))
          return
        }

        const chunks: Buffer[] = []
        let size = 0
        req.on('data', (chunk: Buffer) => {
          size += chunk.length
          if (size > maxBodyBytes) {
            res.statusCode = 413
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ error: 'That note is too large to save.' }))
            req.destroy()
            return
          }
          chunks.push(chunk)
        })
        req.on('end', () => {
          if (res.writableEnded) return
          try {
            const body: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'))
            const result = handleAction(body)
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify(result))
          } catch (error) {
            const status = error instanceof PrivateLifeError ? error.status : 400
            const message = error instanceof Error ? error.message : 'Could not save.'
            res.statusCode = status
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ error: message }))
          }
        })
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), privateLifePlugin()],
})
