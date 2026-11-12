export type CertificatePayout = 'monthly' | 'quarterly' | 'yearly' | 'maturity'

export type Compounding = 'monthly' | 'quarterly' | 'semiannual' | 'yearly'

export type LoanKind = 'declining' | 'flat'

export type BankCertificate = {
  id: string
  name: string
  bank: string
  principal: number
  annualRate: number
  years: number
  payout: CertificatePayout
  compounding: Compounding
  startDate: string
}

export type BankLoan = {
  id: string
  name: string
  bank: string
  principal: number
  annualRate: number
  months: number
  kind: LoanKind
  startDate: string
  adminFee: number
}

export type CertificateResult = {
  payoutAmount: number
  payoutsPerYear: number
  monthlyCash: number
  totalInterest: number
  receiveAtEnd: number
  periods: number
  periodsDone: number | null
  interestSoFar: number | null
  interestLeft: number | null
  endDate: string | null
  matured: boolean
}

export type LoanResult = {
  installment: number
  totalInterest: number
  totalPayable: number
  paidMonths: number | null
  monthsLeft: number | null
  balanceLeft: number
  stillToPay: number
  interestPaid: number | null
  payoffDate: string | null
  finished: boolean
  decliningRate: number
  flatRate: number
}

export type MoneySummary = {
  monthlyIn: number
  monthlyOut: number
  net: number
  certificatePrincipal: number
  loanBalance: number
}

const periodsPerYear: Record<Compounding, number> = {
  monthly: 12,
  quarterly: 4,
  semiannual: 2,
  yearly: 1,
}

export function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

export function formatEgp(value: number) {
  return new Intl.NumberFormat('en-EG', {
    style: 'currency',
    currency: 'EGP',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

export function certificateResult(certificate: BankCertificate, today = new Date()): CertificateResult {
  const principal = finite(certificate.principal)
  const rate = finite(certificate.annualRate) / 100
  const years = finite(certificate.years)
  const maturity = certificate.payout === 'maturity'
  const perYear = maturity
    ? periodsPerYear[certificate.compounding]
    : periodsPerYear[certificate.payout === 'maturity' ? 'yearly' : certificate.payout]
  const periods = Math.max(0, Math.round(years * perYear))
  const progress = periodProgress(certificate.startDate, perYear, periods, today)

  if (maturity) {
    const periodRate = perYear > 0 ? rate / perYear : 0
    const grown = principal * Math.pow(1 + periodRate, periods)
    const totalInterest = roundMoney(grown - principal)
    const done = progress?.done ?? null
    const accrued =
      done === null ? null : roundMoney(principal * Math.pow(1 + periodRate, done) - principal)
    return {
      payoutAmount: totalInterest,
      payoutsPerYear: perYear,
      monthlyCash: 0,
      totalInterest,
      receiveAtEnd: roundMoney(principal + totalInterest),
      periods,
      periodsDone: done,
      interestSoFar: accrued,
      interestLeft: accrued === null ? null : roundMoney(totalInterest - accrued),
      endDate: progress?.endDate ?? null,
      matured: progress?.matured ?? false,
    }
  }

  const payoutAmount = perYear > 0 ? roundMoney((principal * rate) / perYear) : 0
  const totalInterest = roundMoney(payoutAmount * periods)
  const done = progress?.done ?? null
  const active = !(progress?.matured ?? false)
  return {
    payoutAmount,
    payoutsPerYear: perYear,
    monthlyCash: active && perYear > 0 ? roundMoney((payoutAmount * perYear) / 12) : 0,
    totalInterest,
    receiveAtEnd: roundMoney(principal),
    periods,
    periodsDone: done,
    interestSoFar: done === null ? null : roundMoney(payoutAmount * done),
    interestLeft: done === null ? null : roundMoney(payoutAmount * (periods - done)),
    endDate: progress?.endDate ?? null,
    matured: progress?.matured ?? false,
  }
}

export function loanResult(loan: BankLoan, today = new Date()): LoanResult {
  const principal = finite(loan.principal)
  const months = Math.max(0, Math.round(finite(loan.months)))
  const annual = finite(loan.annualRate) / 100
  const adminFee = roundMoney(finite(loan.adminFee))
  const installment =
    loan.kind === 'flat'
      ? flatInstallment(principal, annual, months)
      : decliningInstallment(principal, annual, months)
  const schedule = walkLoan(loan.kind, principal, annual, months, installment, today, loan.startDate)
  const totalInterest = roundMoney(schedule.interestPaid + schedule.interestLeft)
  const decliningRate =
    loan.kind === 'declining' ? annual : rateForInstallment(principal, installment, months)
  const flatRate = months > 0 && principal > 0 ? totalInterest / principal / (months / 12) : 0

  return {
    installment,
    totalInterest,
    totalPayable: roundMoney(principal + totalInterest + adminFee),
    paidMonths: schedule.paidMonths,
    monthsLeft: schedule.monthsLeft,
    balanceLeft: schedule.balanceLeft,
    stillToPay: roundMoney(schedule.balanceLeft + schedule.interestLeft),
    interestPaid: schedule.paidMonths === null ? null : schedule.interestPaid,
    payoffDate: schedule.payoffDate,
    finished: schedule.finished,
    decliningRate,
    flatRate,
  }
}

export function moneySummary(
  certificates: BankCertificate[],
  loans: BankLoan[],
  today = new Date(),
): MoneySummary {
  let monthlyIn = 0
  let monthlyOut = 0
  let certificatePrincipal = 0
  let loanBalance = 0

  for (const certificate of certificates) {
    const result = certificateResult(certificate, today)
    if (result.matured) continue
    if (finite(certificate.principal) > 0) certificatePrincipal += finite(certificate.principal)
    monthlyIn += result.monthlyCash
  }

  for (const loan of loans) {
    const result = loanResult(loan, today)
    if (result.finished) continue
    monthlyOut += result.installment
    loanBalance += result.balanceLeft
  }

  return {
    monthlyIn: roundMoney(monthlyIn),
    monthlyOut: roundMoney(monthlyOut),
    net: roundMoney(monthlyIn - monthlyOut),
    certificatePrincipal: roundMoney(certificatePrincipal),
    loanBalance: roundMoney(loanBalance),
  }
}

function decliningInstallment(principal: number, annual: number, months: number) {
  if (principal <= 0 || months <= 0) return 0
  if (annual <= 0) return roundMoney(principal / months)
  const monthly = annual / 12
  const growth = Math.pow(1 + monthly, months)
  return roundMoney((principal * monthly * growth) / (growth - 1))
}

function flatInstallment(principal: number, annual: number, months: number) {
  if (principal <= 0 || months <= 0) return 0
  const interest = principal * Math.max(0, annual) * (months / 12)
  return roundMoney((principal + interest) / months)
}

function rateForInstallment(principal: number, installment: number, months: number) {
  if (principal <= 0 || months <= 0) return 0
  const interestFree = principal / months
  if (installment <= interestFree + 0.009) return 0
  let low = 0
  let high = 5
  for (let i = 0; i < 80; i++) {
    const mid = (low + high) / 2
    const monthly = mid / 12
    const growth = Math.pow(1 + monthly, months)
    const payment = (principal * monthly * growth) / (growth - 1)
    if (payment > installment) high = mid
    else low = mid
  }
  return (low + high) / 2
}

function walkLoan(
  kind: LoanKind,
  principal: number,
  annual: number,
  months: number,
  installment: number,
  today: Date,
  startDate: string,
) {
  const elapsed = elapsedMonths(startDate, today)
  const paidMonths = elapsed === null || months <= 0 ? null : Math.min(months, elapsed)
  const finished = paidMonths !== null && months > 0 && paidMonths >= months
  let balance = principal
  let interestPaid = 0
  let interestLeft = 0

  for (let month = 0; month < months; month++) {
    const interest =
      kind === 'flat' || annual <= 0
        ? roundMoney(installment - principal / months)
        : roundMoney(balance * (annual / 12))
    let principalPart = roundMoney(installment - interest)
    if (month === months - 1 || principalPart > balance) principalPart = roundMoney(balance)
    if (principalPart < 0) principalPart = 0
    const countedInterest = roundMoney(installment - principalPart)
    if (paidMonths !== null && month < paidMonths) interestPaid += countedInterest
    else interestLeft += countedInterest
    balance = roundMoney(balance - principalPart)
  }

  if (paidMonths === null) {
    return {
      paidMonths,
      monthsLeft: null,
      balanceLeft: roundMoney(principal),
      interestPaid: 0,
      interestLeft: roundMoney(interestLeft),
      payoffDate: null,
      finished: false,
    }
  }

  return {
    paidMonths,
    monthsLeft: months - paidMonths,
    balanceLeft: finished ? 0 : balanceAfter(kind, principal, annual, installment, months, paidMonths),
    interestPaid: roundMoney(interestPaid),
    interestLeft: roundMoney(interestLeft),
    payoffDate: payoffFrom(startDate, months),
    finished,
  }
}

function balanceAfter(
  kind: LoanKind,
  principal: number,
  annual: number,
  installment: number,
  months: number,
  paidMonths: number,
) {
  let balance = principal
  for (let month = 0; month < paidMonths; month++) {
    const interest =
      kind === 'flat' || annual <= 0
        ? roundMoney(installment - principal / months)
        : roundMoney(balance * (annual / 12))
    let principalPart = roundMoney(installment - interest)
    if (month === months - 1 || principalPart > balance) principalPart = roundMoney(balance)
    if (principalPart < 0) principalPart = 0
    balance = roundMoney(balance - principalPart)
  }
  return balance
}

function periodProgress(startDate: string, perYear: number, periods: number, today: Date) {
  const start = parseIsoDate(startDate)
  if (!start || perYear <= 0 || periods <= 0) return null
  const monthsEach = 12 / perYear
  let done = 0
  for (let period = 1; period <= periods; period++) {
    const due = addMonths(start, period * monthsEach)
    if (dateKey(due) <= dateKey(today)) done++
    else break
  }
  return {
    done,
    matured: done >= periods,
    endDate: toIso(addMonths(start, periods * monthsEach)),
  }
}

function elapsedMonths(startDate: string, today: Date) {
  const start = parseIsoDate(startDate)
  if (!start) return null
  let months = (today.getFullYear() - start.getFullYear()) * 12 + (today.getMonth() - start.getMonth())
  if (today.getDate() < start.getDate()) months -= 1
  return Math.max(0, months)
}

function payoffFrom(startDate: string, months: number) {
  const start = parseIsoDate(startDate)
  if (!start || months <= 0) return null
  return toIso(addMonths(start, months))
}

function finite(value: number) {
  return Number.isFinite(value) ? Math.max(0, value) : 0
}

function parseIsoDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(year, month - 1, day)
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null
  return date
}

function addMonths(date: Date, months: number) {
  const whole = Math.round(months)
  const result = new Date(date.getFullYear(), date.getMonth() + whole, 1)
  const lastDay = new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate()
  result.setDate(Math.min(date.getDate(), lastDay))
  return result
}

function dateKey(date: Date) {
  return date.getFullYear() * 10000 + (date.getMonth() + 1) * 100 + date.getDate()
}

function toIso(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}
