import { useId, type ReactNode } from 'react'
import {
  certificateResult,
  formatEgp,
  loanResult,
  moneySummary,
  type BankCertificate,
  type BankLoan,
  type CertificatePayout,
  type Compounding,
  type LoanKind,
} from './money'

const payoutOptions: { value: CertificatePayout; label: string }[] = [
  { value: 'monthly', label: 'Every month' },
  { value: 'quarterly', label: 'Every 3 months' },
  { value: 'yearly', label: 'Every year' },
  { value: 'maturity', label: 'At the end (compound)' },
]

const compoundOptions: { value: Compounding; label: string }[] = [
  { value: 'monthly', label: 'Every month' },
  { value: 'quarterly', label: 'Every 3 months' },
  { value: 'semiannual', label: 'Every 6 months' },
  { value: 'yearly', label: 'Every year' },
]

function blankCertificate(): BankCertificate {
  return {
    id: crypto.randomUUID(),
    name: '',
    bank: '',
    principal: 0,
    annualRate: 0,
    years: 3,
    payout: 'monthly',
    compounding: 'semiannual',
    startDate: '',
  }
}

function blankLoan(): BankLoan {
  return {
    id: crypto.randomUUID(),
    name: '',
    bank: '',
    principal: 0,
    annualRate: 0,
    months: 36,
    kind: 'declining',
    startDate: '',
    adminFee: 0,
  }
}

function itemTitle(name: string, bank: string, fallback: string) {
  const label = name.trim() || bank.trim()
  return label || fallback
}

function formatDay(iso: string | null) {
  if (!iso) return ''
  const [year, month, day] = iso.split('-').map(Number)
  if (!year || !month || !day) return iso
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function percent(rate: number) {
  return `${(rate * 100).toFixed(2)}%`
}

export default function MoneyBook({
  certificates,
  loans,
  onCertificates,
  onLoans,
}: {
  certificates: BankCertificate[]
  loans: BankLoan[]
  onCertificates: (next: BankCertificate[]) => void
  onLoans: (next: BankLoan[]) => void
}) {
  const summary = moneySummary(certificates, loans)
  const summaryId = useId()

  return (
    <div className="money-book">
      <div className="money-summary" aria-labelledby={summaryId}>
        <div>
          <span data-sign={summary.net < 0 ? 'neg' : 'pos'}>{formatEgp(summary.net)}</span>
          <small id={summaryId}>left each month</small>
        </div>
        <div>
          <span>{formatEgp(summary.monthlyIn)}</span>
          <small>certificate cash</small>
        </div>
        <div>
          <span>{formatEgp(summary.monthlyOut)}</span>
          <small>loan payments</small>
        </div>
      </div>
      {(certificates.length > 0 || loans.length > 0) && (
        <p className="hint">
          {summary.net >= 0
            ? 'Certificate payouts cover the loan payments, before any certificate that pays only at the end.'
            : 'Loan payments are higher than the certificate cash you receive each month.'}{' '}
          Saved in certificates {formatEgp(summary.certificatePrincipal)}. Still owed on loans{' '}
          {formatEgp(summary.loanBalance)}.
        </p>
      )}

      <div className="money-section-head">
        <h2>Certificates</h2>
        <button
          type="button"
          className="btn primary"
          onClick={() => onCertificates([blankCertificate(), ...certificates])}
        >
          Add certificate
        </button>
      </div>
      <p className="hint">
        Use the yearly rate printed by the bank. A monthly certificate pays amount × rate ÷ 12, and
        that cash does not compound. A certificate that pays at the end compounds the rate, then
        returns the amount plus interest.
      </p>
      {certificates.length === 0 && <p className="empty">No certificates yet.</p>}
      <div className="money-list">
        {certificates.map((certificate, index) => (
          <CertificateCard
            key={certificate.id}
            certificate={certificate}
            onChange={(next) =>
              onCertificates(certificates.map((item) => (item.id === certificate.id ? next : item)))
            }
            onRemove={() => onCertificates(certificates.filter((item) => item.id !== certificate.id))}
            index={index}
          />
        ))}
      </div>

      <div className="money-section-head">
        <h2>Loans</h2>
        <button type="button" className="btn primary" onClick={() => onLoans([blankLoan(), ...loans])}>
          Add loan
        </button>
      </div>
      <p className="hint">
        Declining is the usual bank loan: interest each month is only on what you still owe. Flat is
        the usual installment offer: interest stays on the original amount for the whole term, so the
        same percentage costs more.
      </p>
      {loans.length === 0 && <p className="empty">No loans yet.</p>}
      <div className="money-list">
        {loans.map((loan) => (
          <LoanCard
            key={loan.id}
            loan={loan}
            onChange={(next) => onLoans(loans.map((item) => (item.id === loan.id ? next : item)))}
            onRemove={() => onLoans(loans.filter((item) => item.id !== loan.id))}
          />
        ))}
      </div>
    </div>
  )
}

function CertificateCard({
  certificate,
  onChange,
  onRemove,
  index,
}: {
  certificate: BankCertificate
  onChange: (next: BankCertificate) => void
  onRemove: () => void
  index: number
}) {
  const base = `${certificate.id}-${index}`
  const result = certificateResult(certificate)
  const ready = certificate.principal > 0 && certificate.years > 0
  const payoutLabel =
    certificate.payout === 'monthly'
      ? 'Each month'
      : certificate.payout === 'quarterly'
        ? 'Every 3 months'
        : certificate.payout === 'yearly'
          ? 'Each year'
          : 'Interest at the end'

  return (
    <article className="money-card">
      <div className="money-card-head">
        <strong>{itemTitle(certificate.name, certificate.bank, 'Certificate')}</strong>
        <button type="button" className="btn danger" onClick={onRemove}>
          Remove
        </button>
      </div>
      <div className="money-fields">
        <Field id={`${base}-name`} label="Name">
          <input
            id={`${base}-name`}
            value={certificate.name}
            onChange={(event) => onChange({ ...certificate, name: event.target.value })}
          />
        </Field>
        <Field id={`${base}-bank`} label="Bank">
          <input
            id={`${base}-bank`}
            value={certificate.bank}
            onChange={(event) => onChange({ ...certificate, bank: event.target.value })}
          />
        </Field>
        <Field id={`${base}-amount`} label="Amount (EGP)">
          <input
            id={`${base}-amount`}
            type="number"
            min="0"
            step="1"
            value={certificate.principal}
            onChange={(event) => onChange({ ...certificate, principal: numberValue(event.target.value) })}
          />
        </Field>
        <Field id={`${base}-rate`} label="Yearly rate %">
          <input
            id={`${base}-rate`}
            type="number"
            min="0"
            max="100"
            step="0.01"
            value={certificate.annualRate}
            onChange={(event) => onChange({ ...certificate, annualRate: numberValue(event.target.value) })}
          />
        </Field>
        <Field id={`${base}-years`} label="Years">
          <input
            id={`${base}-years`}
            type="number"
            min="0"
            max="40"
            step="0.5"
            value={certificate.years}
            onChange={(event) => onChange({ ...certificate, years: numberValue(event.target.value) })}
          />
        </Field>
        <Field id={`${base}-payout`} label="Bank pays">
          <select
            id={`${base}-payout`}
            value={certificate.payout}
            onChange={(event) =>
              onChange({ ...certificate, payout: event.target.value as CertificatePayout })
            }
          >
            {payoutOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </Field>
        {certificate.payout === 'maturity' && (
          <Field id={`${base}-compound`} label="Compounds">
            <select
              id={`${base}-compound`}
              value={certificate.compounding}
              onChange={(event) =>
                onChange({ ...certificate, compounding: event.target.value as Compounding })
              }
            >
              {compoundOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field id={`${base}-start`} label="Start date">
          <input
            id={`${base}-start`}
            type="date"
            value={certificate.startDate}
            onChange={(event) => onChange({ ...certificate, startDate: event.target.value })}
          />
        </Field>
      </div>
      {ready && (
        <dl className="money-results">
          <div>
            <dt>{payoutLabel}</dt>
            <dd>{formatEgp(result.payoutAmount)}</dd>
          </div>
          <div>
            <dt>Total interest</dt>
            <dd>{formatEgp(result.totalInterest)}</dd>
          </div>
          <div>
            <dt>{certificate.payout === 'maturity' ? 'You receive at the end' : 'Amount returned'}</dt>
            <dd>{formatEgp(result.receiveAtEnd)}</dd>
          </div>
          {result.interestSoFar !== null && (
            <div>
              <dt>{result.matured ? 'Finished' : 'Interest so far'}</dt>
              <dd>{result.matured ? formatDay(result.endDate) : formatEgp(result.interestSoFar)}</dd>
            </div>
          )}
          {result.interestLeft !== null && !result.matured && (
            <div>
              <dt>Interest still to come</dt>
              <dd>{formatEgp(result.interestLeft)}</dd>
            </div>
          )}
          {result.endDate && (
            <div>
              <dt>Ends</dt>
              <dd>{formatDay(result.endDate)}</dd>
            </div>
          )}
        </dl>
      )}
    </article>
  )
}

function LoanCard({
  loan,
  onChange,
  onRemove,
}: {
  loan: BankLoan
  onChange: (next: BankLoan) => void
  onRemove: () => void
}) {
  const base = loan.id
  const result = loanResult(loan)
  const ready = loan.principal > 0 && loan.months > 0
  const years = loan.months / 12

  return (
    <article className="money-card">
      <div className="money-card-head">
        <strong>{itemTitle(loan.name, loan.bank, 'Loan')}</strong>
        <button type="button" className="btn danger" onClick={onRemove}>
          Remove
        </button>
      </div>
      <div className="money-fields">
        <Field id={`${base}-name`} label="Name">
          <input
            id={`${base}-name`}
            value={loan.name}
            onChange={(event) => onChange({ ...loan, name: event.target.value })}
          />
        </Field>
        <Field id={`${base}-bank`} label="Bank">
          <input
            id={`${base}-bank`}
            value={loan.bank}
            onChange={(event) => onChange({ ...loan, bank: event.target.value })}
          />
        </Field>
        <Field id={`${base}-amount`} label="Amount (EGP)">
          <input
            id={`${base}-amount`}
            type="number"
            min="0"
            step="1"
            value={loan.principal}
            onChange={(event) => onChange({ ...loan, principal: numberValue(event.target.value) })}
          />
        </Field>
        <Field id={`${base}-rate`} label="Yearly rate %">
          <input
            id={`${base}-rate`}
            type="number"
            min="0"
            max="100"
            step="0.01"
            value={loan.annualRate}
            onChange={(event) => onChange({ ...loan, annualRate: numberValue(event.target.value) })}
          />
        </Field>
        <Field id={`${base}-months`} label="Months">
          <input
            id={`${base}-months`}
            type="number"
            min="0"
            max="600"
            step="1"
            value={loan.months}
            onChange={(event) => onChange({ ...loan, months: numberValue(event.target.value) })}
          />
        </Field>
        <Field id={`${base}-kind`} label="Interest type">
          <select
            id={`${base}-kind`}
            value={loan.kind}
            onChange={(event) => onChange({ ...loan, kind: event.target.value as LoanKind })}
          >
            <option value="declining">Declining</option>
            <option value="flat">Flat</option>
          </select>
        </Field>
        <Field id={`${base}-fee`} label="Admin fee (EGP)">
          <input
            id={`${base}-fee`}
            type="number"
            min="0"
            step="1"
            value={loan.adminFee}
            onChange={(event) => onChange({ ...loan, adminFee: numberValue(event.target.value) })}
          />
        </Field>
        <Field id={`${base}-start`} label="Start date">
          <input
            id={`${base}-start`}
            type="date"
            value={loan.startDate}
            onChange={(event) => onChange({ ...loan, startDate: event.target.value })}
          />
        </Field>
      </div>
      {ready && (
        <>
          <dl className="money-results">
            <div>
              <dt>Each month</dt>
              <dd>{formatEgp(result.installment)}</dd>
            </div>
            <div>
              <dt>Total interest</dt>
              <dd>{formatEgp(result.totalInterest)}</dd>
            </div>
            <div>
              <dt>Total you pay</dt>
              <dd>{formatEgp(result.totalPayable)}</dd>
            </div>
            {result.paidMonths !== null && (
              <div>
                <dt>{result.finished ? 'Finished' : 'Paid'}</dt>
                <dd>
                  {result.finished
                    ? formatDay(result.payoffDate)
                    : `${result.paidMonths} of ${loan.months} months`}
                </dd>
              </div>
            )}
            {result.paidMonths !== null && !result.finished && (
              <div>
                <dt>Still to pay</dt>
                <dd>{formatEgp(result.stillToPay)}</dd>
              </div>
            )}
            {result.payoffDate && !result.finished && (
              <div>
                <dt>Ends</dt>
                <dd>{formatDay(result.payoffDate)}</dd>
              </div>
            )}
          </dl>
          <p className="hint">
            {loan.kind === 'flat'
              ? `Flat ${loan.annualRate}% over ${years.toFixed(1)} years is the same payment as a declining rate of ${percent(result.decliningRate)}.`
              : `Declining ${loan.annualRate}% is the same payment as a flat rate of about ${percent(result.flatRate)}.`}
          </p>
        </>
      )}
    </article>
  )
}

function Field({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return (
    <label className="field" htmlFor={id}>
      <span>{label}</span>
      {children}
    </label>
  )
}

function numberValue(value: string) {
  const next = Number(value)
  if (!Number.isFinite(next) || next < 0) return 0
  return next
}
