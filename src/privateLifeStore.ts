import type { BankCertificate, BankLoan } from './money'
import { privateLifeFile } from './privateLife.data'

export type PrivateNote = {
  id: string
  title: string
  body: string
  createdAt: string
  updatedAt: string
}

export type PrivateLifeFile = {
  passwordHash: string
  notes: PrivateNote[]
  certificates: BankCertificate[]
  loans: BankLoan[]
}

export type PrivateLifeOk = {
  ok: true
  hasPassword: boolean
  notes?: PrivateNote[]
  certificates?: BankCertificate[]
  loans?: BankLoan[]
}

type PrivateLifeBody = {
  action: 'set-password' | 'unlock' | 'save' | 'change-password'
  password: string
  notes?: PrivateNote[]
  certificates?: BankCertificate[]
  loans?: BankLoan[]
  nextPassword?: string
}

const localKey = 'id-sheet-private-life'

export type PrivateBook = {
  passwordHash: string
  notes: PrivateNote[]
  certificates: BankCertificate[]
  loans: BankLoan[]
}

function fileBook(): PrivateBook {
  return {
    passwordHash: privateLifeFile.passwordHash,
    notes: privateLifeFile.notes,
    certificates: privateLifeFile.certificates,
    loans: privateLifeFile.loans,
  }
}

export function loadPrivateBook(): PrivateBook {
  const fallback = fileBook()
  try {
    const raw = localStorage.getItem(localKey)
    if (!raw) return fallback
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return fallback
    const record = parsed as Partial<PrivateBook>
    if (typeof record.passwordHash !== 'string' || !record.passwordHash) return fallback
    if (!Array.isArray(record.notes) || !Array.isArray(record.certificates) || !Array.isArray(record.loans)) {
      return fallback
    }
    return {
      passwordHash: record.passwordHash,
      notes: record.notes,
      certificates: record.certificates,
      loans: record.loans,
    }
  } catch {
    return fallback
  }
}

export function savePrivateBook(book: PrivateBook) {
  try {
    localStorage.setItem(localKey, JSON.stringify(book))
  } catch {
    throw new Error('This browser blocked saving. Allow site data, then try again.')
  }
}

export function bookOk(book: PrivateBook): PrivateLifeOk {
  return {
    ok: true,
    hasPassword: Boolean(book.passwordHash),
    notes: book.notes,
    certificates: book.certificates,
    loans: book.loans,
  }
}

export async function hashPassword(password: string) {
  const bytes = new TextEncoder().encode(`private-life\0${password}`)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

export async function tryWritePrivateLife(body: PrivateLifeBody): Promise<PrivateLifeOk | null> {
  let response: Response
  try {
    response = await fetch('/api/private-life', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch {
    return null
  }

  const data: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    if (response.status === 404 || response.status === 405 || data === null) return null
    const message =
      data && typeof data === 'object' && 'error' in data && typeof data.error === 'string'
        ? data.error
        : null
    if (message) throw new Error(message)
    return null
  }
  if (!data || typeof data !== 'object' || !('hasPassword' in data)) return null
  return data as PrivateLifeOk
}

if (import.meta.hot) {
  import.meta.hot.accept('./privateLife.data', () => {
    // Saving rewrites the source file. Keep the open screen in place.
  })
}

