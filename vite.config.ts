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

type BankCertificate = {
  id: string
  name: string
  bank: string
  principal: number
  annualRate: number
  years: number
  payout: 'monthly' | 'quarterly' | 'yearly' | 'maturity'
  compounding: 'monthly' | 'quarterly' | 'semiannual' | 'yearly'
  startDate: string
}

type BankLoan = {
  id: string
  name: string
  bank: string
  principal: number
  annualRate: number
  months: number
  kind: 'declining' | 'flat'
  startDate: string
  adminFee: number
}

type PrivateLifeFile = {
  passwordHash: string
  notes: PrivateNote[]
  certificates: BankCertificate[]
  loans: BankLoan[]
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

function asNumber(value: unknown, max: number, label: string) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > max) {
    throw new PrivateLifeError(`Each entry needs a valid ${label}.`)
  }
  return value
}

function asChoice<T extends string>(value: unknown, allowed: readonly T[], label: string): T {
  if (typeof value === 'string' && allowed.includes(value as T)) return value as T
  throw new PrivateLifeError(`Each entry needs a valid ${label}.`)
}

function asDate(value: unknown) {
  const text = asText(value, 10, 'date')
  if (text !== '' && !/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    throw new PrivateLifeError('Each entry needs a valid date.')
  }
  return text
}

function sanitizeCertificates(value: unknown): BankCertificate[] {
  if (!Array.isArray(value)) throw new PrivateLifeError('Certificates must be a list.')
  if (value.length > 100) throw new PrivateLifeError('Too many certificates.')
  return value.map((item) => {
    if (!item || typeof item !== 'object') throw new PrivateLifeError('A certificate is invalid.')
    const entry = item as Record<string, unknown>
    const id = asText(entry.id, 80, 'id')
    if (!/^[\w-]{1,80}$/.test(id)) throw new PrivateLifeError('A certificate id is invalid.')
    return {
      id,
      name: asText(entry.name, 80, 'name'),
      bank: asText(entry.bank, 80, 'bank'),
      principal: asNumber(entry.principal, 1_000_000_000_000, 'amount'),
      annualRate: asNumber(entry.annualRate, 100, 'rate'),
      years: asNumber(entry.years, 40, 'term'),
      payout: asChoice(entry.payout, ['monthly', 'quarterly', 'yearly', 'maturity'] as const, 'payout'),
      compounding: asChoice(
        entry.compounding,
        ['monthly', 'quarterly', 'semiannual', 'yearly'] as const,
        'compounding',
      ),
      startDate: asDate(entry.startDate),
    }
  })
}

function sanitizeLoans(value: unknown): BankLoan[] {
  if (!Array.isArray(value)) throw new PrivateLifeError('Loans must be a list.')
  if (value.length > 100) throw new PrivateLifeError('Too many loans.')
  return value.map((item) => {
    if (!item || typeof item !== 'object') throw new PrivateLifeError('A loan is invalid.')
    const entry = item as Record<string, unknown>
    const id = asText(entry.id, 80, 'id')
    if (!/^[\w-]{1,80}$/.test(id)) throw new PrivateLifeError('A loan id is invalid.')
    return {
      id,
      name: asText(entry.name, 80, 'name'),
      bank: asText(entry.bank, 80, 'bank'),
      principal: asNumber(entry.principal, 1_000_000_000_000, 'amount'),
      annualRate: asNumber(entry.annualRate, 100, 'rate'),
      months: asNumber(entry.months, 600, 'term'),
      kind: asChoice(entry.kind, ['declining', 'flat'] as const, 'interest type'),
      startDate: asDate(entry.startDate),
      adminFee: asNumber(entry.adminFee, 1_000_000_000_000, 'fee'),
    }
  })
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
${JSON.stringify({ passwordHash: data.passwordHash, notes: data.notes, certificates: data.certificates, loans: data.loans }, null, 2)}
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
  const record = parsed as {
    passwordHash?: unknown
    notes?: unknown
    certificates?: unknown
    loans?: unknown
  }
  return {
    passwordHash: typeof record.passwordHash === 'string' ? record.passwordHash : '',
    notes: sanitizeNotes(record.notes ?? []),
    certificates: sanitizeCertificates(record.certificates ?? []),
    loans: sanitizeLoans(record.loans ?? []),
  }
}

function publicStore(store: PrivateLifeFile) {
  return {
    ok: true as const,
    hasPassword: Boolean(store.passwordHash),
    notes: store.notes,
    certificates: store.certificates,
    loans: store.loans,
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
    certificates?: unknown
    loans?: unknown
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
    return publicStore(store)
  }

  if (!store.passwordHash) throw new PrivateLifeError('Set a password first.')
  if (!passwordMatches(password, store.passwordHash)) {
    throw new PrivateLifeError('Wrong password.', 401)
  }

  if (record.action === 'unlock') {
    return publicStore(store)
  }

  if (record.action === 'save') {
    if ('notes' in record) store.notes = sanitizeNotes(record.notes)
    if ('certificates' in record) store.certificates = sanitizeCertificates(record.certificates)
    if ('loans' in record) store.loans = sanitizeLoans(record.loans)
    writeStore(store)
    return publicStore(store)
  }

  if (record.action === 'change-password') {
    if (typeof record.nextPassword !== 'string') {
      throw new PrivateLifeError('Enter a new password.')
    }
    assertPassword(record.nextPassword)
    store.passwordHash = passwordHash(record.nextPassword)
    writeStore(store)
    return publicStore(store)
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
