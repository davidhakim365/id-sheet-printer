import type { BankCertificate, BankLoan } from './money'

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

export async function readPrivateLifeStatus(): Promise<PrivateLifeOk> {
  const response = await fetch('/api/private-life')
  return readOk(response)
}

export async function writePrivateLife(body: PrivateLifeBody): Promise<PrivateLifeOk> {
  const response = await fetch('/api/private-life', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return readOk(response)
}

async function readOk(response: Response): Promise<PrivateLifeOk> {
  const data: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    const message =
      data && typeof data === 'object' && 'error' in data && typeof data.error === 'string'
        ? data.error
        : 'The private life file could not be updated.'
    throw new Error(message)
  }
  if (!data || typeof data !== 'object' || !('hasPassword' in data)) {
    throw new Error('Unexpected reply from the local save endpoint.')
  }
  return data as PrivateLifeOk
}
