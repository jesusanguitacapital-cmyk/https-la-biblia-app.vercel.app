import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, ChangeEvent } from 'react'
import type { AppData, FundingAccount, FundingAccountStatus, FundingAccountWithdrawal, Operation, Strategy, TradeSide, ResultType } from './types'
import './App.css'
import { computeProfit, summaryForStrategy } from './analytics'
import { extractOperationFromImage } from './aiVision'
import type { OperationExtractionDraft, OperationExtractionResult } from './aiVision'
import { useAuth } from './contexts/AuthContext'
import { loadUserAppData, saveUserAppData } from './services/appDataStore'

const DEFAULT_STRATEGY: Strategy = {
  id: 'default-strategy',
  name: 'La Biblia',
  description: 'Trading Journal personal para tus estrategias.',
  market: 'Multi',
  asset: '',
  timeframe: '1M',
  state: 'active',
  color: '#7de3a0',
  environment: 'real',
  createdAt: new Date().toISOString(),
}

const DEFAULT_DATA: AppData = {
  strategies: [DEFAULT_STRATEGY],
  accounts: [],
  operations: [],
  settings: {
    dataFolder: null,
    appName: 'La Biblia',
    primaryColor: '#111827',
    theme: 'dark',
    defaultCurrency: 'EUR',
  },
}

const getInitialOperationState = (strategyId = DEFAULT_STRATEGY.id) => ({
  strategyId,
  date: new Date().toISOString().slice(0, 16),
  exitDate: new Date().toISOString().slice(0, 16),
  asset: '',
  side: 'long' as TradeSide,
  entry: '0',
  exit: '0',
  size: '1',
  result: 'win' as ResultType,
  notes: '',
  screenshotPath: '',
  rrRatio: '1:2',
  stopLoss: '',
  takeProfit: '',
  setupType: '',
  emotionalState: 'Neutral' as const,
  followedPlan: true,
  plValue: '',
  plPercent: '',
  commission: '',
  swap: '',
  riskMoney: '',
  riskPercent: '',
  benefitMoney: '',
  benefitPercent: '',
  balanceBefore: '',
  balanceAfter: '',
  equity: '',
  drawdownProduced: '',
  points: '',
  lots: '1',
  valuePerPoint: '',
  contracts: '',
  instrument: '',
  broker: '',
  account: '',
  entryType: 'Market',
  breakEven: false,
  labels: '',
  comments: '',
  benefitCurrency: 'EUR',
})

const initialOperationState = getInitialOperationState()

const getInitialAccountState = () => ({
  name: '',
  firmName: '',
  status: 'evaluation' as FundingAccountStatus,
  websiteUrl: '',
  purchaseDate: new Date().toISOString().slice(0, 10),
  statusChangedDate: '',
  fundedDate: '',
  suspendedDate: '',
  initialCapital: '10000',
  dailyLossLimit: '0',
  maxLossLimit: '0',
  examCost: '120',
  currency: 'EUR' as 'EUR' | 'USD',
  username: '',
  password: '',
})

const getInitialWithdrawalState = () => ({
  date: new Date().toISOString().slice(0, 10),
  amount: '',
  currency: 'EUR' as 'EUR' | 'USD',
  notes: '',
})

const normalizeFundingAccount = (account: any): FundingAccount => {
  const statusMap: Record<string, FundingAccountStatus> = {
  active: 'evaluation',
  paid: 'funded',
  breached: 'suspended',
  evaluation: 'evaluation',
  funded: 'funded',
  suspended: 'suspended',
  passed: 'passed',
  closed: 'closed',
  }
  const status = statusMap[String(account.status ?? '').toLowerCase()] ?? 'evaluation'
  const withdrawals = Array.isArray(account.withdrawals)
	  ? account.withdrawals.map((withdrawal: any) => ({
	    id: withdrawal.id ?? createId(),
	    date: withdrawal.date ?? new Date().toISOString(),
	    amount: Number(withdrawal.amount ?? 0),
	    currency: withdrawal.currency ?? account.currency ?? 'EUR',
	    notes: withdrawal.notes ?? '',
	  }))
  : []

  return {
  id: account.id ?? createId(),
  name: account.name ?? 'Cuenta sin nombre',
  firmName: account.firmName ?? account.propFirm ?? 'Prop Firm',
  status,
  color: account.color,
  initialCapital: Number(account.initialCapital ?? account.initialBalance ?? 0),
  dailyLossLimit: Number(account.dailyLossLimit ?? 0),
  maxLossLimit: Number(account.maxLossLimit ?? 0),
	  purchaseDate: account.purchaseDate ?? account.createdAt ?? new Date().toISOString(),
	  statusChangedAt: account.statusChangedAt ?? account.statusUpdatedAt ?? undefined,
	  fundedAt: account.fundedAt ?? undefined,
	  suspendedAt: account.suspendedAt ?? undefined,
	  examCost: Number(account.examCost ?? 0),
	  currency: account.currency ?? 'EUR',
  websiteUrl: account.websiteUrl ?? '',
  username: account.username ?? account.user ?? '',
  password: account.password ?? account.pass ?? '',
  createdAt: account.createdAt ?? new Date().toISOString(),
  updatedAt: account.updatedAt ?? account.modifiedAt ?? account.createdAt ?? new Date().toISOString(),
  withdrawals,
  }
}

const STORAGE_KEY = 'trading-coach-data'
const isElectron = typeof window !== 'undefined' && Boolean(window.tradingApp)

const createId = () => crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

const PERIOD_OPTIONS = [
  { value: '1D', label: '1 día' },
  { value: '1S', label: '1 semana' },
  { value: '1M', label: '1 mes' },
  { value: '2M', label: '2 meses' },
  { value: '3M', label: '3 meses' },
  { value: '4M', label: '4 meses' },
  { value: '1A', label: '1 año' },
  { value: 'TODO', label: 'Todo' },
] as const

type PeriodKey = typeof PERIOD_OPTIONS[number]['value']

const adjustHexColor = (value: string, amount: number) => {
  const hex = value.replace('#', '')
  const normalized = hex.length === 3 ? hex.split('').map((char) => `${char}${char}`).join('') : hex
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) return value
  const channels = normalized.match(/.{2}/g)
  if (!channels) return value

  const adjusted = channels
    .map((channel) => {
      const numeric = parseInt(channel, 16)
      const next = Math.max(0, Math.min(255, numeric + amount))
      return next.toString(16).padStart(2, '0')
    })
    .join('')

  return `#${adjusted}`
}

const hexToRgba = (value: string, alpha: number) => {
  const hex = value.replace('#', '')
  const normalized = hex.length === 3 ? hex.split('').map((char) => `${char}${char}`).join('') : hex
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) return `rgba(125, 227, 160, ${alpha})`
  const numeric = parseInt(normalized, 16)
  const red = (numeric >> 16) & 255
  const green = (numeric >> 8) & 255
  const blue = numeric & 255
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`
}

const parseResult = (entry: number, exit: number, side: TradeSide): ResultType => {
  if (entry === exit) return 'breakeven'
  const isWin = side === 'long' ? exit > entry : exit < entry
  return isWin ? 'win' : 'loss'
}

const computeRealizedRrRatio = (
  side: TradeSide,
  entry: number,
  exit: number,
  stopLoss?: number | null,
) => {
  if (!Number.isFinite(entry) || !Number.isFinite(exit) || !Number.isFinite(stopLoss ?? NaN)) return undefined
  const risk = Math.abs(entry - Number(stopLoss))
  if (!Number.isFinite(risk) || risk <= 0) return undefined
  const movement = side === 'long' ? exit - entry : entry - exit
  const multiple = Math.abs(movement) / risk
  if (!Number.isFinite(multiple)) return undefined
  const formatted = multiple.toFixed(2).replace(/\.?0+$/, '')
  return `1:${formatted}`
}

const computePercentFromInitialCapital = (plValue: number, capitalBase?: number | null) => {
  if (!Number.isFinite(plValue) || !Number.isFinite(capitalBase ?? NaN) || !capitalBase) return undefined
  return (plValue / Number(capitalBase)) * 100
}

const resolveOperationCapitalBase = (prev: any, strategies: Strategy[]) => {
  if (prev.balanceBefore !== '' && Number.isFinite(Number(prev.balanceBefore)) && Number(prev.balanceBefore) > 0) {
    return Number(prev.balanceBefore)
  }
  return strategies.find((item) => item.id === prev.strategyId)?.initialBalance ?? 0
}

const formatNumber = (value: number) => {
  if (!Number.isFinite(value)) return '0.00'
  return value.toFixed(2)
}

const getWeekdayName = (dateString: string) =>
  new Date(dateString).toLocaleDateString('es-ES', { weekday: 'long' })

const formatCurrency = (value: number) => {
  const sign = value > 0 ? '+' : ''
  return `${sign}${formatNumber(value)}`
}

const formatMoney = (value: number, currency: 'EUR' | 'USD' = 'EUR') => {
  const sign = value > 0 ? '+' : ''
  return `${sign}${formatNumber(value)} ${currency}`
}

const formatDate = (value: string) => {
  if (!value) return 'Sin fecha'
  return new Date(value).toLocaleDateString('es-ES')
}

const getDateKey = (value?: string | null) => (value ? value.slice(0, 10) : '')

const buildStrategyAiAnalysis = (operations: Operation[]) => {
  const sortedOps = [...operations].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
  if (sortedOps.length < 5) {
    return {
      cards: [
        { label: 'Operaciones analizadas', value: String(sortedOps.length) },
        { label: 'Mínimo necesario', value: '5' },
        { label: 'P/L total', value: formatCurrency(0) },
      ],
      insights: [`Necesitas al menos 5 operaciones registradas para activar el Análisis IA. Ahora mismo hay ${sortedOps.length}.`],
      isReady: false,
    }
  }

  const aggregateBy = (resolver: (operation: Operation) => string) => (
    sortedOps.reduce<Record<string, { profit: number; trades: number; wins: number }>>((acc, operation) => {
      const key = resolver(operation) || 'Sin dato'
      acc[key] ||= { profit: 0, trades: 0, wins: 0 }
      acc[key].profit += computeProfit(operation)
      acc[key].trades += 1
      if (computeProfit(operation) > 0) acc[key].wins += 1
      return acc
    }, {})
  )

  const pickGroup = (groups: Record<string, { profit: number; trades: number; wins: number }>, mode: 'best' | 'worst') => {
    const entries = Object.entries(groups)
    if (entries.length === 0) return null
    return entries.reduce((selected, current) => (
      mode === 'best'
        ? current[1].profit > selected[1].profit ? current : selected
        : current[1].profit < selected[1].profit ? current : selected
    ))
  }

  const profits = sortedOps.map((operation) => computeProfit(operation))
  const totalProfit = profits.reduce((sum, value) => sum + value, 0)
  const wins = profits.filter((value) => value > 0).length
  const losses = profits.filter((value) => value < 0).length
  const winRate = Math.round((wins / sortedOps.length) * 100)
  const avgTrade = totalProfit / sortedOps.length
  const grossProfit = profits.filter((value) => value > 0).reduce((sum, value) => sum + value, 0)
  const grossLoss = Math.abs(profits.filter((value) => value < 0).reduce((sum, value) => sum + value, 0))
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : null
  const bestOperation = sortedOps.reduce((best, operation) => (computeProfit(operation) > computeProfit(best) ? operation : best))
  const worstOperation = sortedOps.reduce((worst, operation) => (computeProfit(operation) < computeProfit(worst) ? operation : worst))

  const weekdayGroups = aggregateBy((operation) => getWeekdayName(operation.date))
  const hourGroups = aggregateBy((operation) => `${String(new Date(operation.date).getHours()).padStart(2, '0')}:00`)
  const assetGroups = aggregateBy((operation) => operation.asset || operation.instrument || 'Sin activo')
  const sideGroups = aggregateBy((operation) => operation.side === 'long' ? 'Compras' : 'Ventas')
  const setupGroups = aggregateBy((operation) => operation.setupType || 'Sin setup')

  const bestDay = pickGroup(weekdayGroups, 'best')
  const worstDay = pickGroup(weekdayGroups, 'worst')
  const bestHour = pickGroup(hourGroups, 'best')
  const bestAsset = pickGroup(assetGroups, 'best')
  const worstAsset = pickGroup(assetGroups, 'worst')
  const bestSide = pickGroup(sideGroups, 'best')
  const bestSetup = pickGroup(setupGroups, 'best')

  const holdingHours = sortedOps
    .map((operation) => {
      if (!operation.exitDate) return null
      const diff = new Date(operation.exitDate).getTime() - new Date(operation.date).getTime()
      return Number.isFinite(diff) && diff > 0 ? diff / (1000 * 60 * 60) : null
    })
    .filter((value): value is number => value != null)
  const avgHoldingHours = holdingHours.length ? holdingHours.reduce((sum, value) => sum + value, 0) / holdingHours.length : null

  let currentWinStreak = 0
  let currentLossStreak = 0
  let maxWinStreak = 0
  let maxLossStreak = 0
  sortedOps.forEach((operation) => {
    const profit = computeProfit(operation)
    if (profit > 0) {
      currentWinStreak += 1
      currentLossStreak = 0
    } else if (profit < 0) {
      currentLossStreak += 1
      currentWinStreak = 0
    } else {
      currentWinStreak = 0
      currentLossStreak = 0
    }
    maxWinStreak = Math.max(maxWinStreak, currentWinStreak)
    maxLossStreak = Math.max(maxLossStreak, currentLossStreak)
  })

  const followedPlanOps = sortedOps.filter((operation) => operation.followedPlan)
  const followedPlanRate = Math.round((followedPlanOps.length / sortedOps.length) * 100)
  const planProfit = followedPlanOps.reduce((sum, operation) => sum + computeProfit(operation), 0)

  const cards = [
    { label: 'Operaciones analizadas', value: String(sortedOps.length) },
    { label: 'P/L total', value: formatCurrency(totalProfit), tone: totalProfit >= 0 ? 'positive' : 'negative' },
    { label: 'Win rate', value: `${winRate}%`, tone: winRate >= 50 ? 'positive' : 'negative' },
    { label: 'Ganadas / perdidas', value: `${wins} / ${losses}` },
    { label: 'Profit factor', value: profitFactor == null ? 'Sin pérdidas' : formatNumber(profitFactor), tone: profitFactor == null || profitFactor >= 1.2 ? 'positive' : 'negative' },
    { label: 'Mejor día', value: bestDay ? `${bestDay[0]} · ${formatCurrency(bestDay[1].profit)}` : 'Sin dato' },
    { label: 'Mejor hora', value: bestHour ? `${bestHour[0]} · ${formatCurrency(bestHour[1].profit)}` : 'Sin dato' },
    { label: 'Mejor activo', value: bestAsset ? `${bestAsset[0]} · ${formatCurrency(bestAsset[1].profit)}` : 'Sin dato' },
    { label: 'Duración media', value: avgHoldingHours == null ? 'Sin dato' : `${formatNumber(avgHoldingHours)} h` },
  ]

  const insights = [
    `Tu operación más rentable fue el ${formatDate(bestOperation.date)} con ${formatCurrency(computeProfit(bestOperation))}; la peor fue el ${formatDate(worstOperation.date)} con ${formatCurrency(computeProfit(worstOperation))}.`,
    bestDay ? `El día con más rentabilidad es ${bestDay[0]}: ${formatCurrency(bestDay[1].profit)} en ${bestDay[1].trades} operaciones.` : 'Aún no hay suficiente muestra por día.',
    worstDay && worstDay[1].profit < 0 ? `El día que más conviene vigilar es ${worstDay[0]}, acumula ${formatCurrency(worstDay[1].profit)}.` : 'No hay un día claramente peligroso por ahora.',
    bestHour ? `La franja horaria más rentable es ${bestHour[0]}, con ${formatCurrency(bestHour[1].profit)}.` : 'Aún no hay una franja horaria dominante.',
    bestAsset ? `El activo que mejor se está comportando es ${bestAsset[0]}; ${worstAsset && worstAsset[1].profit < 0 ? `vigila ${worstAsset[0]}, que va en ${formatCurrency(worstAsset[1].profit)}.` : 'no hay un activo claramente débil.'}` : 'Todavía no hay patrón claro por activo.',
    bestSide ? `${bestSide[0]} es el lado con mejor resultado: ${formatCurrency(bestSide[1].profit)}.` : 'Aún no hay diferencia clara entre compras y ventas.',
    bestSetup && bestSetup[0] !== 'Sin setup' ? `El setup más fuerte hasta ahora es ${bestSetup[0]}, con ${formatCurrency(bestSetup[1].profit)}.` : 'Añade el tipo de setup en cada operación para que el análisis detecte qué patrón funciona mejor.',
    `Tu mejor racha ganadora es de ${maxWinStreak} operaciones y tu peor racha perdedora es de ${maxLossStreak}.`,
    `Has seguido el plan en el ${followedPlanRate}% de las operaciones; esas operaciones suman ${formatCurrency(planProfit)}.`,
    avgTrade >= 0
      ? `Lectura IA: la esperanza media por operación es positiva (${formatCurrency(avgTrade)}). La prioridad es repetir las condiciones de tus mejores días y evitar subir riesgo tras una buena racha.`
      : `Lectura IA: la esperanza media por operación es negativa (${formatCurrency(avgTrade)}). Baja exposición y revisa entradas antes de aumentar frecuencia.`,
  ]

  return { cards, insights, isReady: true }
}

const buildAccountAiAnalysis = (accounts: FundingAccount[]) => {
  const withdrawals = accounts.flatMap((account) => account.withdrawals.map((withdrawal) => ({ ...withdrawal, account })))
  const usefulRecords = accounts.length + withdrawals.length
  if (usefulRecords < 5) {
    return {
      cards: [
        { label: 'Registros analizados', value: String(usefulRecords) },
        { label: 'Mínimo necesario', value: '5' },
        { label: 'Cuentas', value: String(accounts.length) },
      ],
      insights: [`Necesitas al menos 5 registros entre cuentas y retiros para activar el Análisis IA de cuentas. Ahora mismo hay ${usefulRecords}.`],
      isReady: false,
    }
  }

  const metrics = accounts.map((account) => ({ account, metrics: computeFundingMetrics(account) }))
  const totalWithdrawn = metrics.reduce((sum, item) => sum + item.metrics.totalWithdrawn, 0)
  const totalExamCost = accounts.reduce((sum, account) => sum + account.examCost, 0)
  const totalNetProfit = metrics.reduce((sum, item) => sum + item.metrics.netProfit, 0)
  const fundedAccounts = accounts.filter((account) => account.status === 'funded').length
  const burnedAccounts = accounts.filter((account) => account.status === 'suspended').length
  const bestAccount = metrics.reduce((best, item) => item.metrics.netProfit > best.metrics.netProfit ? item : best)
  const worstAccount = metrics.reduce((worst, item) => item.metrics.netProfit < worst.metrics.netProfit ? item : worst)

  const weekdayWithdrawals = withdrawals.reduce<Record<string, { amount: number; count: number }>>((acc, withdrawal) => {
    const key = getWeekdayName(withdrawal.date)
    acc[key] ||= { amount: 0, count: 0 }
    acc[key].amount += withdrawal.amount
    acc[key].count += 1
    return acc
  }, {})
  const bestWithdrawalDay = Object.entries(weekdayWithdrawals).reduce(
    (best, current) => current[1].amount > best[1].amount ? current : best,
    ['Sin datos', { amount: 0, count: 0 }],
  )

  const daysToFund = accounts
    .filter((account) => account.fundedAt)
    .map((account) => getDaysBetween(account.purchaseDate, account.fundedAt!))
  const daysFundedActive = accounts
    .filter((account) => account.fundedAt && account.suspendedAt)
    .map((account) => getDaysBetween(account.fundedAt!, account.suspendedAt!))
  const avgDaysToFund = daysToFund.length ? daysToFund.reduce((sum, value) => sum + value, 0) / daysToFund.length : null
  const avgFundedActiveDays = daysFundedActive.length ? daysFundedActive.reduce((sum, value) => sum + value, 0) / daysFundedActive.length : null
  const recoveryRate = totalExamCost > 0 ? (totalWithdrawn / totalExamCost) * 100 : 0
  const burnRate = accounts.length ? (burnedAccounts / accounts.length) * 100 : 0
  const fundedRate = accounts.length ? (fundedAccounts / accounts.length) * 100 : 0

  const cards = [
    { label: 'Registros analizados', value: String(usefulRecords) },
    { label: 'Cuentas', value: String(accounts.length) },
    { label: 'Retiros', value: String(withdrawals.length) },
    { label: 'Retirado total', value: formatCurrency(totalWithdrawn), tone: totalWithdrawn > 0 ? 'positive' : undefined },
    { label: 'Beneficio neto', value: formatCurrency(totalNetProfit), tone: totalNetProfit >= 0 ? 'positive' : 'negative' },
    { label: 'Recuperación', value: `${formatNumber(recoveryRate)}%`, tone: recoveryRate >= 100 ? 'positive' : 'negative' },
    { label: 'Fondeadas', value: `${formatNumber(fundedRate)}%`, tone: fundedRate > 0 ? 'positive' : undefined },
    { label: 'Quemadas', value: `${formatNumber(burnRate)}%`, tone: burnRate > 0 ? 'negative' : 'positive' },
  ]

  const insights = [
    `La cuenta con mejor resultado es ${bestAccount.account.name}: ${formatCurrency(bestAccount.metrics.netProfit)} netos.`,
    `La cuenta que más hay que vigilar es ${worstAccount.account.name}: ${formatCurrency(worstAccount.metrics.netProfit)} netos.`,
    `Has retirado ${formatCurrency(totalWithdrawn)} frente a ${formatCurrency(totalExamCost)} invertidos en exámenes; recuperación del ${formatNumber(recoveryRate)}%.`,
    `El día con más dinero retirado es ${bestWithdrawalDay[0]}: ${formatCurrency(bestWithdrawalDay[1].amount)} en ${bestWithdrawalDay[1].count} retiros.`,
    avgDaysToFund == null ? 'Aún faltan fechas de fondeo para calcular el tiempo medio hasta fondear.' : `Tiempo medio hasta fondear: ${formatNumber(avgDaysToFund)} días.`,
    avgFundedActiveDays == null ? 'Aún faltan fechas de fondeada y quemada para medir días activa fondeada.' : `Tiempo medio activa fondeada antes de cerrarse/quemarse: ${formatNumber(avgFundedActiveDays)} días.`,
    burnRate > 35
      ? `Lectura IA: la tasa de cuentas quemadas es alta (${formatNumber(burnRate)}%). Conviene revisar reglas de riesgo y reducir exposición tras pérdidas.`
      : `Lectura IA: la tasa de cuentas quemadas está controlada (${formatNumber(burnRate)}%). Mantén registro de fechas para mejorar la lectura temporal.`,
    totalNetProfit >= 0
      ? 'Lectura IA: el módulo de cuentas está en positivo. Prioriza proteger payouts y repetir el proceso de las cuentas más rentables.'
      : 'Lectura IA: el módulo de cuentas está en negativo. Antes de comprar nuevos exámenes, revisa qué firmas/estados concentran la pérdida.',
  ]

  return { cards, insights, isReady: true }
}

type ExcelCell = string | number | boolean | null | undefined

const escapeXml = (value: ExcelCell) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&apos;')

const worksheetXml = (name: string, rows: Array<Record<string, ExcelCell>>) => {
  const headers = [...new Set(rows.flatMap((row) => Object.keys(row)))]
  const safeName = escapeXml(name.slice(0, 31))
  const headerRow = `<Row>${headers.map((header) => `<Cell><Data ss:Type="String">${escapeXml(header)}</Data></Cell>`).join('')}</Row>`
  const bodyRows = rows.map((row) => `<Row>${headers.map((header) => {
    const value = row[header]
    const type = typeof value === 'number' && Number.isFinite(value) ? 'Number' : 'String'
    return `<Cell><Data ss:Type="${type}">${escapeXml(value)}</Data></Cell>`
  }).join('')}</Row>`).join('')
  return `<Worksheet ss:Name="${safeName}"><Table>${headerRow}${bodyRows}</Table></Worksheet>`
}

const downloadExcelFile = (filename: string, worksheets: Array<{ name: string; rows: Array<Record<string, ExcelCell>> }>) => {
  const workbook = `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
${worksheets.map((sheet) => worksheetXml(sheet.name, sheet.rows.length ? sheet.rows : [{ Mensaje: 'Sin datos' }])).join('')}
</Workbook>`
  const blob = new Blob([workbook], { type: 'application/vnd.ms-excel;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

const exportAppExcel = (data: AppData) => {
  const strategyNames = Object.fromEntries(data.strategies.map((strategy) => [strategy.id, strategy.name]))
  const strategyAnalysis = buildStrategyAiAnalysis(data.operations)
  const accountAnalysis = buildAccountAiAnalysis(data.accounts)
  const accountRows = data.accounts.map((account) => {
    const metrics = computeFundingMetrics(account)
    return {
      Nombre: account.name,
      Empresa: account.firmName,
      Estado: formatFundingStatus(account.status),
      CapitalInicial: account.initialCapital,
      CosteExamen: account.examCost,
      Moneda: account.currency ?? 'EUR',
      FechaCompra: formatDate(account.purchaseDate),
      FechaCambioEstado: account.statusChangedAt ? formatDate(account.statusChangedAt) : '',
      FechaFondeada: account.fundedAt ? formatDate(account.fundedAt) : '',
      FechaQuemada: account.suspendedAt ? formatDate(account.suspendedAt) : '',
      TotalRetirado: metrics.totalWithdrawn,
      BeneficioNeto: metrics.netProfit,
      PorcentajeRecuperado: metrics.recoveredPercent,
      Retiros: metrics.withdrawalCount,
      Usuario: account.username ?? '',
      Web: account.websiteUrl ?? '',
    }
  })

  downloadExcelFile(`la-biblia-export-${new Date().toISOString().slice(0, 10)}.xls`, [
    {
      name: 'Resumen',
      rows: [{
        Estrategias: data.strategies.length,
        Operaciones: data.operations.length,
        Cuentas: data.accounts.length,
        Retiros: data.accounts.reduce((sum, account) => sum + account.withdrawals.length, 0),
        PLTrading: data.operations.reduce((sum, operation) => sum + computeProfit(operation), 0),
        RetiradoCuentas: data.accounts.reduce((sum, account) => sum + account.withdrawals.reduce((inner, withdrawal) => inner + withdrawal.amount, 0), 0),
        Generado: new Date().toLocaleString('es-ES'),
      }],
    },
    {
      name: 'Estrategias',
      rows: data.strategies.map((strategy) => ({
        Nombre: strategy.name,
        Descripcion: strategy.description,
        Mercado: strategy.market ?? '',
        Activo: strategy.asset ?? '',
        Temporalidad: strategy.timeframe ?? '',
        Estado: strategy.state ?? '',
        BalanceInicial: strategy.initialBalance ?? '',
        Broker: strategy.broker ?? '',
        CuentaBroker: strategy.brokerAccount ?? '',
        Creada: formatDate(strategy.createdAt),
      })),
    },
    {
      name: 'Operaciones',
      rows: data.operations.map((operation) => ({
        Estrategia: strategyNames[operation.strategyId] ?? operation.strategyId,
        FechaEntrada: new Date(operation.date).toLocaleString('es-ES'),
        FechaSalida: operation.exitDate ? new Date(operation.exitDate).toLocaleString('es-ES') : '',
        Activo: operation.asset,
        Lado: operation.side === 'long' ? 'Compra' : 'Venta',
        Entrada: operation.entry,
        Salida: operation.exit,
        Tamano: operation.size,
        Resultado: operation.result,
        PL: computeProfit(operation),
        PLManual: operation.plValue ?? '',
        PLPorcentaje: operation.plPercent ?? '',
        RR: operation.rrRatio ?? '',
        StopLoss: operation.stopLoss ?? '',
        TakeProfit: operation.takeProfit ?? '',
        Setup: operation.setupType ?? '',
        EstadoEmocional: operation.emotionalState ?? '',
        SiguioPlan: operation.followedPlan ? 'Sí' : 'No',
        Comision: operation.commission ?? '',
        Swap: operation.swap ?? '',
        RiesgoDinero: operation.riskMoney ?? '',
        RiesgoPorcentaje: operation.riskPercent ?? '',
        Moneda: operation.benefitCurrency ?? 'EUR',
        Notas: operation.notes ?? '',
      })),
    },
    { name: 'Cuentas', rows: accountRows },
    {
      name: 'Retiros',
      rows: data.accounts.flatMap((account) => account.withdrawals.map((withdrawal) => ({
        Cuenta: account.name,
        Empresa: account.firmName,
        Fecha: formatDate(withdrawal.date),
        Importe: withdrawal.amount,
        Moneda: withdrawal.currency ?? account.currency ?? 'EUR',
        Observaciones: withdrawal.notes ?? '',
      }))),
    },
    {
      name: 'Analisis Trading',
      rows: [
        ...strategyAnalysis.cards.map((item) => ({ Tipo: 'Dato', Nombre: item.label, Valor: item.value })),
        ...strategyAnalysis.insights.map((insight, index) => ({ Tipo: 'Insight', Nombre: `Insight ${index + 1}`, Valor: insight })),
      ],
    },
    {
      name: 'Analisis Cuentas',
      rows: [
        ...accountAnalysis.cards.map((item) => ({ Tipo: 'Dato', Nombre: item.label, Valor: item.value })),
        ...accountAnalysis.insights.map((insight, index) => ({ Tipo: 'Insight', Nombre: `Insight ${index + 1}`, Valor: insight })),
      ],
    },
  ])
}

const toIsoDateAtNoon = (value: string) => new Date(`${value}T12:00:00`).toISOString()

const computeFundingMetrics = (account: FundingAccount) => {
  const totalWithdrawn = account.withdrawals.reduce((sum, withdrawal) => sum + withdrawal.amount, 0)
  const netProfit = totalWithdrawn - account.examCost
  const roi = account.examCost > 0 ? (netProfit / account.examCost) * 100 : 0
  const recoveredPercent = account.examCost > 0 ? (totalWithdrawn / account.examCost) * 100 : 0
  const daysToStatus = account.statusChangedAt
    ? Math.max(0, Math.round((new Date(account.statusChangedAt).getTime() - new Date(account.purchaseDate).getTime()) / (1000 * 60 * 60 * 24)))
    : null
  const fundedActiveDays = account.fundedAt && account.suspendedAt
    ? getDaysBetween(account.fundedAt, account.suspendedAt)
    : null

  return {
    totalWithdrawn,
    netProfit,
    roi,
    recoveredPercent,
    daysToStatus,
    fundedActiveDays,
    withdrawalCount: account.withdrawals.length,
  }
}

const FUNDING_STATUS_LABELS: Record<FundingAccountStatus, string> = {
  evaluation: 'En evaluación',
  funded: 'Fondeada',
  suspended: 'Quemada',
  passed: 'Superada',
  closed: 'Cerrada',
}

const formatFundingStatus = (status: FundingAccountStatus) => FUNDING_STATUS_LABELS[status] ?? status

const getFundingStatusColor = (status: FundingAccountStatus) => {
  switch (status) {
    case 'evaluation':
      return '#7fb3ff'
    case 'funded':
      return '#7de3a0'
    case 'suspended':
      return '#ff6b7f'
    case 'passed':
      return '#bda8ff'
    case 'closed':
      return '#9ca5bf'
    default:
      return '#7fb3ff'
  }
}

const getDaysBetween = (from: string, to: string) => Math.max(0, Math.round((new Date(to).getTime() - new Date(from).getTime()) / (1000 * 60 * 60 * 24)))

const buildChartSvgData = (chartData: Array<{ label: string; value: number }>) => {
  if (chartData.length === 0) return null
  const width = 760
  const height = 320
  const padding = { top: 24, right: 24, bottom: 42, left: 62 }
  const max = Math.max(...chartData.map((item) => item.value), 0) || 1
  const min = Math.min(...chartData.map((item) => item.value), 0)
  const range = max - min || 1
  const plotWidth = width - padding.left - padding.right
  const plotHeight = height - padding.top - padding.bottom
  const points = chartData.map((item, index) => {
    const x = padding.left + (index / (chartData.length - 1 || 1)) * plotWidth
    const y = padding.top + plotHeight - ((item.value - min) / range) * plotHeight
    return { x, y, label: item.label, value: item.value }
  })
  const linePath = points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ')
  const areaPath = `${linePath} L ${points.at(-1)?.x ?? padding.left} ${height - padding.bottom} L ${padding.left} ${height - padding.bottom} Z`
  const yTicks = Array.from({ length: 5 }, (_, index) => {
    const value = max - (range / 4) * index
    const y = padding.top + (plotHeight / 4) * index
    return { value, y }
  })
  const xTickIndexes = [...new Set([0, Math.floor((points.length - 1) / 2), points.length - 1])].filter((index) => index >= 0)
  const xTicks = xTickIndexes.map((index) => points[index]).filter(Boolean)
  return { width, height, padding, points, linePath, areaPath, yTicks, xTicks }
}

const buildDualChartSvgData = (chartData: Array<{ label: string; withdrawn: number; net: number }>) => {
  if (chartData.length === 0) return null
  const width = 760
  const height = 320
  const padding = { top: 24, right: 24, bottom: 42, left: 62 }
  const allValues = chartData.flatMap((item) => [item.withdrawn, item.net, 0])
  const max = Math.max(...allValues, 1)
  const min = Math.min(...allValues, 0)
  const range = max - min || 1
  const plotWidth = width - padding.left - padding.right
  const plotHeight = height - padding.top - padding.bottom

  const mapSeries = (field: 'withdrawn' | 'net') => chartData.map((item, index) => {
    const x = padding.left + (index / (chartData.length - 1 || 1)) * plotWidth
    const y = padding.top + plotHeight - ((item[field] - min) / range) * plotHeight
    return { x, y, label: item.label, value: item[field] }
  })

  const withdrawnPoints = mapSeries('withdrawn')
  const netPoints = mapSeries('net')
  const linePath = (points: Array<{ x: number; y: number }>) => points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ')
  const yTicks = Array.from({ length: 5 }, (_, index) => {
    const value = max - (range / 4) * index
    const y = padding.top + (plotHeight / 4) * index
    return { value, y }
  })
  const xTickIndexes = [...new Set([0, Math.floor((withdrawnPoints.length - 1) / 2), withdrawnPoints.length - 1])].filter((index) => index >= 0)
  const xTicks = xTickIndexes.map((index) => withdrawnPoints[index]).filter(Boolean)

  return {
    width,
    height,
    padding,
    yTicks,
    xTicks,
    withdrawnPoints,
    netPoints,
    withdrawnPath: linePath(withdrawnPoints),
    netPath: linePath(netPoints),
  }
}


function App() {
  const { user, signOut, storageMode } = useAuth()
  const [data, setData] = useState<AppData>(DEFAULT_DATA)
  const dataRef = useRef<AppData>(DEFAULT_DATA)
  const [operationForm, setOperationForm] = useState<any>(initialOperationState)
  const [selectedStrategyId, setSelectedStrategyId] = useState<string | null>(null)
  const [strategyName, setStrategyName] = useState('')
  const [strategyDescription, setStrategyDescription] = useState('')
  const [message, setMessage] = useState('Cargando datos...')
  const [isLoading, setIsLoading] = useState(true)
  const [isAiAnalyzing, setIsAiAnalyzing] = useState(false)
  const [aiStatus, setAiStatus] = useState('')
  const [previewImage, setPreviewImage] = useState<string | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isStrategyModalOpen, setIsStrategyModalOpen] = useState(false)
  const [isAccountModalOpen, setIsAccountModalOpen] = useState(false)
  const [editingOperationId, setEditingOperationId] = useState<string | null>(null)
  const [editingStrategyId, setEditingStrategyId] = useState<string | null>(null)
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null)
  const [openStrategyMenuId, setOpenStrategyMenuId] = useState<string | null>(null)
  const [openOperationMenuId, setOpenOperationMenuId] = useState<string | null>(null)
  const [openAccountMenuId, setOpenAccountMenuId] = useState<string | null>(null)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [selectedModule, setSelectedModule] = useState<'strategies' | 'accounts'>('strategies')
  const [selectedTab, setSelectedTab] = useState<'grafico' | 'ia'>('grafico')
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const backupInputRef = useRef<HTMLInputElement | null>(null)
  const [selectedPeriod, setSelectedPeriod] = useState<PeriodKey>('1M')
  const [newStrategyMarket, setNewStrategyMarket] = useState('')
  const [newStrategyAsset, setNewStrategyAsset] = useState('')
  const [newStrategyTimeframe, setNewStrategyTimeframe] = useState('1m')
  const [newStrategyState, setNewStrategyState] = useState<'active'|'inactive'>('active')
  const [newStrategyColor, setNewStrategyColor] = useState('#7de3a0')
  const [newStrategyImage, setNewStrategyImage] = useState<string | null>(null)
  const [newStrategyInitialBalance, setNewStrategyInitialBalance] = useState<number>(0)
  const [newStrategyBroker, setNewStrategyBroker] = useState('')
  const [newStrategyBrokerAccount, setNewStrategyBrokerAccount] = useState('')
  const [newStrategyBrokerPassword, setNewStrategyBrokerPassword] = useState('')
  const newStrategyImageRef = useRef<HTMLInputElement | null>(null)
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null)
  const [accountForm, setAccountForm] = useState(getInitialAccountState)
  const [withdrawalForm, setWithdrawalForm] = useState(getInitialWithdrawalState)
  const [isWithdrawalModalOpen, setIsWithdrawalModalOpen] = useState(false)
  const [withdrawalAccountId, setWithdrawalAccountId] = useState<string | null>(null)
  const [editingWithdrawalId, setEditingWithdrawalId] = useState<string | null>(null)
  const [openWithdrawalMenuId, setOpenWithdrawalMenuId] = useState<string | null>(null)
  const [accountPeriod, setAccountPeriod] = useState<PeriodKey>('1M')
  const [accountCalendarFocus, setAccountCalendarFocus] = useState<string | null>(null)
  const [showAccountEvents, setShowAccountEvents] = useState(false)
  const [calendarMonthDate, setCalendarMonthDate] = useState(() => {
    const today = new Date()
    return new Date(today.getFullYear(), today.getMonth(), 1)
  })
  const [showAccountAccessInfo, setShowAccountAccessInfo] = useState(false)
  const [appNameDraft, setAppNameDraft] = useState(DEFAULT_DATA.settings.appName ?? 'La Biblia')
  const [themeDraft, setThemeDraft] = useState<'dark' | 'light'>(DEFAULT_DATA.settings.theme ?? 'dark')
  const [defaultCurrencyDraft, setDefaultCurrencyDraft] = useState<'EUR' | 'USD'>(DEFAULT_DATA.settings.defaultCurrency ?? 'EUR')
  const [pendingExtraction, setPendingExtraction] = useState<OperationExtractionResult | null>(null)
  const [pendingScreenshotPath, setPendingScreenshotPath] = useState('')
  const extractionRunRef = useRef(0)

  useEffect(() => {
    if (isStrategyModalOpen) {
      const onKey = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          setIsStrategyModalOpen(false)
          setEditingStrategyId(null)
        }
      }
      document.body.style.overflow = 'hidden'
      window.addEventListener('keydown', onKey)
      return () => {
        document.body.style.overflow = ''
        window.removeEventListener('keydown', onKey)
      }
    }
    return
  }, [isStrategyModalOpen])

  useEffect(() => {
    setShowAccountAccessInfo(false)
  }, [selectedAccountId])

  useEffect(() => {
    if (isModalOpen) {
      const onKey = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          setIsModalOpen(false)
          setEditingOperationId(null)
        }
      }
      document.body.style.overflow = 'hidden'
      window.addEventListener('keydown', onKey)
      return () => {
        document.body.style.overflow = ''
        window.removeEventListener('keydown', onKey)
      }
    }
    return
  }, [isModalOpen])

  useEffect(() => {
    if (isAccountModalOpen) {
      const onKey = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          closeAccountModal()
        }
      }
      document.body.style.overflow = 'hidden'
      window.addEventListener('keydown', onKey)
      return () => {
        document.body.style.overflow = ''
        window.removeEventListener('keydown', onKey)
      }
    }
    return
  }, [isAccountModalOpen])

  useEffect(() => {
    if (isWithdrawalModalOpen) {
      const onKey = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          closeWithdrawalModal()
        }
      }
      document.body.style.overflow = 'hidden'
      window.addEventListener('keydown', onKey)
      return () => {
        document.body.style.overflow = ''
        window.removeEventListener('keydown', onKey)
      }
    }
    return
  }, [isWithdrawalModalOpen])

  useEffect(() => {
    dataRef.current = data
  }, [data])

  useEffect(() => {
    if (!openStrategyMenuId) return
    const closeMenu = () => setOpenStrategyMenuId(null)
    window.addEventListener('click', closeMenu)
    return () => window.removeEventListener('click', closeMenu)
  }, [openStrategyMenuId])

  useEffect(() => {
    if (!openOperationMenuId) return
    const closeMenu = () => setOpenOperationMenuId(null)
    window.addEventListener('click', closeMenu)
    return () => window.removeEventListener('click', closeMenu)
  }, [openOperationMenuId])

  useEffect(() => {
    if (!openAccountMenuId) return
    const closeMenu = () => setOpenAccountMenuId(null)
    window.addEventListener('click', closeMenu)
    return () => window.removeEventListener('click', closeMenu)
  }, [openAccountMenuId])

  useEffect(() => {
    if (!isSettingsOpen) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsSettingsOpen(false)
    }
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = ''
      window.removeEventListener('keydown', onKey)
    }
  }, [isSettingsOpen])

  useEffect(() => {
    if (!isSettingsOpen) return
    setAppNameDraft(data.settings.appName ?? DEFAULT_DATA.settings.appName ?? 'La Biblia')
    setThemeDraft(data.settings.theme ?? DEFAULT_DATA.settings.theme ?? 'dark')
    setDefaultCurrencyDraft(data.settings.defaultCurrency ?? DEFAULT_DATA.settings.defaultCurrency ?? 'EUR')
  }, [data.settings.appName, data.settings.theme, data.settings.defaultCurrency, isSettingsOpen])

  useEffect(() => {
    document.title = data.settings.appName ?? 'La Biblia'
  }, [data.settings.appName])

  useEffect(() => {
    document.body.dataset.appTheme = data.settings.theme ?? 'dark'
    return () => {
      delete document.body.dataset.appTheme
    }
  }, [data.settings.theme])

  useEffect(() => {
    const initialize = async () => {
      try {
        let nextData = DEFAULT_DATA
        if (isElectron) {
          const loaded = await window.tradingApp.loadData()
          nextData = loaded.data ?? DEFAULT_DATA
          nextData.settings.dataFolder ||= loaded.folder
        } else {
          const remote = await loadUserAppData(user.id)
          const local = window.localStorage.getItem(STORAGE_KEY)
          if (remote) {
            nextData = remote
            setMessage('Datos cargados desde tu cuenta online.')
          } else if (local) {
            const parsedLocal = JSON.parse(local) as AppData
            const shouldImport = window.confirm('He encontrado datos antiguos en este navegador. ¿Quieres importarlos a tu cuenta online?')
            nextData = shouldImport ? parsedLocal : DEFAULT_DATA
            if (shouldImport) {
              await saveUserAppData(user.id, parsedLocal)
              setMessage('Datos antiguos importados a tu cuenta online.')
            } else {
              setMessage('Cuenta online iniciada sin importar datos antiguos.')
            }
          } else {
            nextData = DEFAULT_DATA
            await saveUserAppData(user.id, nextData)
            setMessage('Cuenta online creada sin datos todavía.')
          }
        }

        if (nextData.strategies.length === 0) {
          nextData.strategies = [DEFAULT_STRATEGY]
        }

        nextData.accounts = Array.isArray(nextData.accounts) ? nextData.accounts.map(normalizeFundingAccount) : []

        nextData.strategies = nextData.strategies.map((strategy) => ({
          ...strategy,
          environment: 'real',
          brokerPassword: undefined,
        }))
        nextData.settings = {
          ...DEFAULT_DATA.settings,
          ...(nextData.settings ?? {}),
        }

        dataRef.current = nextData
        setData(nextData)
        setAppNameDraft(nextData.settings.appName ?? DEFAULT_DATA.settings.appName ?? 'La Biblia')
        setThemeDraft(nextData.settings.theme ?? DEFAULT_DATA.settings.theme ?? 'dark')
        setDefaultCurrencyDraft(nextData.settings.defaultCurrency ?? DEFAULT_DATA.settings.defaultCurrency ?? 'EUR')
        setOperationForm((prev: any) => ({ ...prev, strategyId: nextData.strategies[0]?.id ?? DEFAULT_STRATEGY.id }))
      } catch {
        setMessage('No se pudieron cargar los datos de la aplicación.')
      } finally {
        setIsLoading(false)
      }
    }

    initialize()
  }, [user.id])


  // filter strategies and operations by environment
  const visibleStrategies = data.strategies
  const visibleStrategyIds = new Set(visibleStrategies.map((s) => s.id))
  const visibleOperations = data.operations.filter((op) => visibleStrategyIds.has(op.strategyId))
  const selectedStrategy = useMemo(() => (selectedStrategyId ? data.strategies.find((strategy) => strategy.id === selectedStrategyId) ?? null : null), [data.strategies, selectedStrategyId])
  const scopedOperations = useMemo(
    () => (selectedStrategyId ? data.operations.filter((operation) => operation.strategyId === selectedStrategyId) : visibleOperations),
    [data.operations, selectedStrategyId, visibleOperations],
  )

  // period filtering helper
  const getPeriodStart = (period: PeriodKey) => {
    const now = new Date()
    switch (period) {
      case '1D': return new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000)
      case '1S': return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
      case '1M': return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
      case '2M': return new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000)
      case '3M': return new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)
      case '4M': return new Date(now.getTime() - 120 * 24 * 60 * 60 * 1000)
      case '1A': return new Date(now.getFullYear() - 1, now.getMonth(), now.getDate())
      case 'TODO': return null
      default: return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    }
  }

  const periodStart = getPeriodStart(selectedPeriod)
  const operationsInPeriod = periodStart ? scopedOperations.filter((op) => new Date(op.date) >= periodStart) : scopedOperations
  const scopedInitialBalance = selectedStrategyId
    ? (selectedStrategy?.initialBalance ?? 0)
    : visibleStrategies.reduce((sum, strategy) => sum + (strategy.initialBalance ?? 0), 0)

  const overview = useMemo(() => {
    const total = operationsInPeriod.length
    const wins = operationsInPeriod.filter((operation) => operation.result === 'win').length
    const losses = operationsInPeriod.filter((operation) => operation.result === 'loss').length
    const profit = operationsInPeriod.reduce((sum, operation) => sum + computeProfit(operation), 0)
    const grossProfit = operationsInPeriod.reduce((sum, operation) => {
      const value = computeProfit(operation)
      return value > 0 ? sum + value : sum
    }, 0)
    const grossLoss = Math.abs(operationsInPeriod.reduce((sum, operation) => {
      const value = computeProfit(operation)
      return value < 0 ? sum + value : sum
    }, 0))
    const avgTrade = total ? profit / total : 0
    const bestStrategy = visibleStrategies.reduce(
      (best, strategy) => {
        const profitByStrategy = visibleOperations
          .filter((operation) => operation.strategyId === strategy.id)
          .reduce((sum, operation) => sum + computeProfit(operation), 0)
        return profitByStrategy > best.profit ? { strategy, profit: profitByStrategy } : best
      },
      { strategy: visibleStrategies[0], profit: -Infinity as number },
    )

    const weekdayProfits = operationsInPeriod.reduce<Record<string, number>>((acc, operation) => {
      const day = getWeekdayName(operation.date)
      acc[day] ||= 0
      acc[day] += computeProfit(operation)
      return acc
    }, {})

    const bestDay = Object.entries(weekdayProfits).reduce(
      (best, [day, value]) => (value > best.value ? { day, value } : best),
      { day: 'No definido', value: -Infinity },
    )

    return {
      total,
      winRate: total ? Math.round((wins / total) * 100) : 0,
      losses,
      profit,
      avgTrade,
      profitFactor: grossLoss > 0 ? grossProfit / grossLoss : null,
      bestStrategyName: bestStrategy.strategy?.name ?? 'Sin datos',
      bestDay: bestDay.day,
      bestDayValue: bestDay.value === -Infinity ? 0 : bestDay.value,
      activeStrategies: visibleStrategies.filter((strategy) => strategy.state !== 'inactive').length,
      rendement: scopedInitialBalance > 0 ? `${formatNumber((profit / scopedInitialBalance) * 100)}%` : '0.00%',
    }
  }, [operationsInPeriod, scopedInitialBalance, visibleStrategies, visibleOperations])

  const globalStrategyAiAnalysis = useMemo(() => buildStrategyAiAnalysis(visibleOperations), [visibleOperations])

  const chartData = useMemo(() => {
    // Build cumulative equity series based on visible operations and period
    const ops = [...operationsInPeriod].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    const totalBefore = scopedInitialBalance + (periodStart ? scopedOperations.filter((op) => new Date(op.date) < periodStart).reduce((s, o) => s + computeProfit(o), 0) : 0)

    if (ops.length === 0) {
      // show empty series with a small range
      const today = new Date()
      return Array.from({ length: 6 }, (_, index) => ({
        label: new Date(today.getTime() - (5 - index) * 24 * 60 * 60 * 1000).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }),
        value: totalBefore,
      }))
    }

    const cumulative: Array<{ label: string; value: number }> = []
    let sum = totalBefore
    // add starting point at period start
    if (periodStart) {
      cumulative.push({ label: new Date(periodStart).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }), value: sum })
    }

    ops.forEach((op) => {
      sum += computeProfit(op)
      cumulative.push({ label: new Date(op.date).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }), value: sum })
    })

    return cumulative
  }, [operationsInPeriod, periodStart, scopedInitialBalance, scopedOperations])

  const chartSvg = useMemo(() => buildChartSvgData(chartData), [chartData])

  const resetOperationForm = (strategyId: string | null = null) => {
    const nextStrategyId = strategyId ?? dataRef.current.strategies[0]?.id ?? DEFAULT_STRATEGY.id
    const strategy = dataRef.current.strategies.find((item) => item.id === nextStrategyId)
    setOperationForm({
      ...getInitialOperationState(nextStrategyId),
      benefitCurrency: dataRef.current.settings.defaultCurrency ?? 'EUR',
      asset: strategy?.asset ?? '',
      instrument: strategy?.asset ?? strategy?.market ?? '',
    })
    setPreviewImage(null)
    setEditingOperationId(null)
    setAiStatus('')
    setPendingExtraction(null)
    setPendingScreenshotPath('')
    extractionRunRef.current += 1
  }

  const resetStrategyForm = (strategy?: Strategy | null) => {
    setStrategyName(strategy?.name ?? '')
    setStrategyDescription(strategy?.description ?? '')
    setNewStrategyMarket(strategy?.market ?? '')
    setNewStrategyAsset(strategy?.asset ?? '')
    setNewStrategyTimeframe(strategy?.timeframe ?? '1m')
    setNewStrategyState(strategy?.state ?? 'active')
    setNewStrategyColor(strategy?.color ?? '#7de3a0')
    setNewStrategyImage(strategy?.imagePath ?? null)
    setNewStrategyInitialBalance(strategy?.initialBalance ?? 0)
    setNewStrategyBroker(strategy?.broker ?? '')
    setNewStrategyBrokerAccount(strategy?.brokerAccount ?? '')
    setNewStrategyBrokerPassword('')
  }

  const closeFloatingMenus = () => {
    setOpenStrategyMenuId(null)
    setOpenOperationMenuId(null)
    setOpenAccountMenuId(null)
    setOpenWithdrawalMenuId(null)
  }

  const closeStrategyModal = () => {
    setIsStrategyModalOpen(false)
    setEditingStrategyId(null)
    resetStrategyForm(null)
  }

  const openCreateStrategyModal = () => {
    closeFloatingMenus()
    setEditingStrategyId(null)
    resetStrategyForm(null)
    setIsStrategyModalOpen(true)
  }

  const openEditStrategyModal = (strategy: Strategy) => {
    closeFloatingMenus()
    setEditingStrategyId(strategy.id)
    resetStrategyForm(strategy)
    setIsStrategyModalOpen(true)
  }

  const openCreateOperationModal = (strategyId: string | null = null) => {
    closeFloatingMenus()
    resetOperationForm(strategyId)
    setIsModalOpen(true)
  }

  const openEditOperationModal = (operation: Operation) => {
    closeFloatingMenus()
    const preview = operation.screenshotPath?.startsWith('file://') ? operation.screenshotPath : null
    setOperationForm({
      ...getInitialOperationState(operation.strategyId),
      strategyId: operation.strategyId,
      date: operation.date,
      exitDate: operation.exitDate || operation.date,
      asset: operation.asset,
      side: operation.side,
      entry: String(operation.entry),
      exit: String(operation.exit),
      size: String(operation.size),
      result: operation.result,
      notes: operation.notes || '',
      screenshotPath: operation.screenshotPath || '',
      rrRatio: operation.rrRatio ?? '1:2',
      stopLoss: operation.stopLoss ? String(operation.stopLoss) : '',
      takeProfit: operation.takeProfit ? String(operation.takeProfit) : '',
      setupType: operation.setupType || '',
      emotionalState: operation.emotionalState || 'Neutral',
      followedPlan: Boolean(operation.followedPlan),
      plValue: operation.plValue ? String(operation.plValue) : '',
      plPercent: operation.plPercent ? String(operation.plPercent) : '',
      commission: operation.commission ? String(operation.commission) : '',
      swap: operation.swap ? String(operation.swap) : '',
      riskMoney: operation.riskMoney ? String(operation.riskMoney) : '',
      riskPercent: operation.riskPercent ? String(operation.riskPercent) : '',
      benefitMoney: operation.benefitMoney ? String(operation.benefitMoney) : '',
      benefitPercent: operation.benefitPercent ? String(operation.benefitPercent) : '',
      balanceBefore: operation.balanceBefore ? String(operation.balanceBefore) : '',
      balanceAfter: operation.balanceAfter ? String(operation.balanceAfter) : '',
      equity: operation.equity ? String(operation.equity) : '',
      drawdownProduced: operation.drawdownProduced ? String(operation.drawdownProduced) : '',
      points: operation.points ? String(operation.points) : '',
      lots: operation.lots ? String(operation.lots) : '1',
      valuePerPoint: operation.valuePerPoint ? String(operation.valuePerPoint) : '',
      contracts: operation.contracts ? String(operation.contracts) : '',
      instrument: operation.instrument || '',
      broker: operation.broker || '',
      account: operation.account || '',
      entryType: operation.entryType || 'Market',
      breakEven: Boolean(operation.breakEven),
	      labels: operation.labels?.join(', ') || '',
	      benefitCurrency: operation.benefitCurrency || dataRef.current.settings.defaultCurrency || 'EUR',
	      comments: operation.notes || '',
	    })
    setPreviewImage(preview)
    setEditingOperationId(operation.id)
    setAiStatus('')
    setIsModalOpen(true)
  }

  const applyExtractionDraft = (draft: OperationExtractionDraft, prev: any) => {
    const capitalBase = resolveOperationCapitalBase(prev, dataRef.current.strategies)
    const resolvedPlValue = draft.plValue !== undefined ? draft.plValue : undefined
    const resolvedPlPercent = draft.plPercent !== undefined
      ? draft.plPercent
      : resolvedPlValue !== undefined
        ? computePercentFromInitialCapital(resolvedPlValue, capitalBase)
        : undefined
    return {
    ...prev,
    date: draft.date || prev.date,
    exitDate: draft.exitDate || prev.exitDate,
    asset: prev.asset ? prev.asset : draft.asset || prev.asset,
    side: draft.side ?? prev.side,
    entry: prev.entry && prev.entry !== '0' ? prev.entry : draft.entry !== undefined ? String(draft.entry) : prev.entry,
    exit: prev.exit && prev.exit !== '0' ? prev.exit : draft.exit !== undefined ? String(draft.exit) : prev.exit,
    size: prev.size && prev.size !== '1' ? prev.size : draft.lotSize !== undefined ? String(draft.lotSize) : prev.size,
    stopLoss: prev.stopLoss ? prev.stopLoss : draft.stopLoss !== undefined ? String(draft.stopLoss) : prev.stopLoss,
    takeProfit: prev.takeProfit ? prev.takeProfit : draft.takeProfit !== undefined ? String(draft.takeProfit) : prev.takeProfit,
    rrRatio: prev.rrRatio && prev.rrRatio !== '1:2' ? prev.rrRatio : draft.rrRatio || prev.rrRatio,
    plValue: prev.plValue ? prev.plValue : resolvedPlValue !== undefined ? String(resolvedPlValue) : prev.plValue,
    plPercent: prev.plPercent ? prev.plPercent : resolvedPlPercent !== undefined ? String(resolvedPlPercent) : prev.plPercent,
    result: prev.result && prev.result !== 'win' ? prev.result : (draft.result ?? prev.result),
    setupType: prev.setupType ? prev.setupType : draft.setupType || prev.setupType,
    notes: prev.notes ? prev.notes : draft.notes || prev.notes,
    broker: prev.broker ? prev.broker : draft.broker || prev.broker,
    account: prev.account ? prev.account : draft.account || prev.account,
    instrument: prev.instrument ? prev.instrument : draft.asset || prev.instrument,
    entryType: prev.entryType ? prev.entryType : draft.entryType || prev.entryType,
    emotionalState: prev.emotionalState && prev.emotionalState !== 'Neutral' ? prev.emotionalState : draft.emotionalState || prev.emotionalState,
    followedPlan: prev.followedPlan !== undefined ? prev.followedPlan : draft.followedPlan ?? prev.followedPlan,
    comments: prev.comments ? prev.comments : draft.notes || prev.comments,
    }
  }

  const applyPendingExtraction = () => {
    if (!pendingExtraction) return
    setOperationForm((prev: any) => applyExtractionDraft(pendingExtraction.draft, { ...prev, screenshotPath: pendingScreenshotPath || prev.screenshotPath }))
    setAiStatus('Datos aplicados al formulario.')
    setMessage('Extracción confirmada. El formulario se ha rellenado automáticamente.')
  }

  const saveData = async (nextData: AppData) => {
    dataRef.current = nextData
    setData(nextData)
    if (isElectron) {
      try {
        const result = await window.tradingApp.saveData({ folder: nextData.settings.dataFolder, data: nextData })
        nextData.settings.dataFolder = result.folder
        dataRef.current = nextData
        setData(nextData)
        setMessage('Datos guardados localmente.')
      } catch {
        setMessage('Error guardando los datos en la carpeta local.')
      }
    } else {
      try {
        await saveUserAppData(user.id, nextData)
        setMessage('Datos guardados en tu cuenta online.')
      } catch {
        setMessage('Error guardando en la cuenta online. Revisa la conexión.')
      }
    }
  }

  const handleExcelExport = () => {
    exportAppExcel(dataRef.current)
    setMessage('Archivo Excel exportado correctamente.')
  }

  const saveStrategy = async () => {
    if (!strategyName.trim()) {
      setMessage('Introduce un nombre de estrategia')
      return
    }

    const existing = editingStrategyId ? dataRef.current.strategies.find((strategy) => strategy.id === editingStrategyId) : null
    const strategyPayload: Strategy = {
      id: editingStrategyId ?? createId(),
      name: strategyName.trim(),
      description: strategyDescription.trim(),
      market: newStrategyMarket,
      asset: newStrategyAsset,
      timeframe: newStrategyTimeframe,
      state: newStrategyState,
      color: newStrategyColor,
      environment: 'real',
      imagePath: newStrategyImage ?? undefined,
      initialBalance: newStrategyInitialBalance,
      broker: newStrategyBroker,
      brokerAccount: newStrategyBrokerAccount,
      brokerPassword: undefined,
      createdAt: existing?.createdAt ?? new Date().toISOString(),
    }

    const nextData: AppData = {
      ...dataRef.current,
      strategies: editingStrategyId
        ? dataRef.current.strategies.map((strategy) => strategy.id === editingStrategyId ? strategyPayload : strategy)
        : [...dataRef.current.strategies, strategyPayload],
    }

    await saveData(nextData)
    closeStrategyModal()
    setMessage(editingStrategyId ? 'Estrategia actualizada correctamente.' : 'Estrategia creada correctamente.')
  }

  const duplicateStrategy = async (strategy: Strategy) => {
    const duplicatedStrategy: Strategy = {
      ...strategy,
      id: createId(),
      name: `${strategy.name} Copia`,
      createdAt: new Date().toISOString(),
    }

    await saveData({
      ...dataRef.current,
      strategies: [...dataRef.current.strategies, duplicatedStrategy],
    })
    setMessage('Estrategia duplicada correctamente.')
  }

  const deleteStrategy = async (strategy: Strategy) => {
    const nextStrategies = dataRef.current.strategies.filter((item) => item.id !== strategy.id)
    const nextOperations = dataRef.current.operations.filter((operation) => operation.strategyId !== strategy.id)

    if (selectedStrategyId === strategy.id) {
      setSelectedStrategyId(null)
    }

    resetOperationForm(nextStrategies[0]?.id ?? null)

    await saveData({
      ...dataRef.current,
      strategies: nextStrategies,
      operations: nextOperations,
    })
    setMessage('Estrategia eliminada junto con su historial.')
  }

  const handleStrategyMenuAction = async (action: string, strategy: Strategy) => {
    setOpenStrategyMenuId(null)

    if (action === 'Editar estrategia') {
      openEditStrategyModal(strategy)
      return
    }

    if (action === 'Duplicar estrategia') {
      await duplicateStrategy(strategy)
      return
    }

    if (action === 'Eliminar') {
      await deleteStrategy(strategy)
    }
  }

  const saveSettings = async () => {
    await saveData({
      ...dataRef.current,
      settings: {
        ...DEFAULT_DATA.settings,
        ...dataRef.current.settings,
        appName: appNameDraft.trim() || DEFAULT_DATA.settings.appName,
        primaryColor: dataRef.current.settings.primaryColor ?? DEFAULT_DATA.settings.primaryColor,
        theme: themeDraft,
        defaultCurrency: defaultCurrencyDraft,
      },
    })
    setIsSettingsOpen(false)
    setMessage('Preferencias guardadas.')
  }

  const exportBackup = () => {
    const blob = new Blob([JSON.stringify(dataRef.current, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `la-biblia-backup-${new Date().toISOString().slice(0, 10)}.json`
    link.click()
    URL.revokeObjectURL(url)
    setMessage('Copia de seguridad exportada.')
  }

  const handleBackupImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    try {
      const raw = JSON.parse(await file.text()) as Partial<AppData>
      if (!Array.isArray(raw.strategies) || !Array.isArray(raw.operations)) {
        setMessage('La copia de seguridad no tiene un formato válido.')
        return
      }

      const importedData: AppData = {
        strategies: (raw.strategies as Strategy[]).map((strategy) => ({
          ...strategy,
          environment: 'real',
          brokerPassword: undefined,
        })),
        accounts: Array.isArray(raw.accounts) ? raw.accounts.map(normalizeFundingAccount) : [],
        operations: raw.operations as Operation[],
        settings: {
          ...DEFAULT_DATA.settings,
          ...(raw.settings ?? {}),
          dataFolder: dataRef.current.settings.dataFolder,
        },
      }

      await saveData(importedData)
      setSelectedStrategyId(null)
      setAppNameDraft(importedData.settings.appName ?? DEFAULT_DATA.settings.appName ?? 'La Biblia')
      setThemeDraft(importedData.settings.theme ?? DEFAULT_DATA.settings.theme ?? 'dark')
      setDefaultCurrencyDraft(importedData.settings.defaultCurrency ?? DEFAULT_DATA.settings.defaultCurrency ?? 'EUR')
      setMessage('Copia de seguridad importada correctamente.')
    } catch {
      setMessage('No se pudo importar la copia de seguridad.')
    } finally {
      event.target.value = ''
    }
  }

  const resetAccountForm = (account?: FundingAccount | null) => {
    setAccountForm(account ? {
      name: account.name,
      firmName: account.firmName,
      status: account.status,
      websiteUrl: account.websiteUrl ?? '',
      purchaseDate: account.purchaseDate.slice(0, 10),
      statusChangedDate: account.statusChangedAt ? account.statusChangedAt.slice(0, 10) : '',
      fundedDate: account.fundedAt ? account.fundedAt.slice(0, 10) : '',
      suspendedDate: account.suspendedAt ? account.suspendedAt.slice(0, 10) : '',
      initialCapital: String(account.initialCapital),
      dailyLossLimit: String(account.dailyLossLimit),
      maxLossLimit: String(account.maxLossLimit),
      examCost: String(account.examCost),
      currency: account.currency ?? 'EUR',
      username: account.username ?? '',
      password: account.password ?? '',
    } : { ...getInitialAccountState(), currency: dataRef.current.settings.defaultCurrency ?? 'EUR' })
  }

  const closeAccountModal = () => {
    setIsAccountModalOpen(false)
    setEditingAccountId(null)
    resetAccountForm(null)
  }

  const openCreateAccountModal = () => {
    closeFloatingMenus()
    setEditingAccountId(null)
    resetAccountForm(null)
    setIsAccountModalOpen(true)
  }

  const openEditAccountModal = (account: FundingAccount) => {
    closeFloatingMenus()
    setEditingAccountId(account.id)
    resetAccountForm(account)
    setIsAccountModalOpen(true)
  }

  const handleAccountFormChange = (field: string, value: string) => {
    setAccountForm((prev) => {
      if (field !== 'status') return { ...prev, [field]: value }
      const today = new Date().toISOString().slice(0, 10)
      const next = { ...prev, status: value as FundingAccountStatus }
      if (value !== 'evaluation' && !next.statusChangedDate) next.statusChangedDate = today
      if (value === 'funded' && !next.fundedDate) next.fundedDate = next.statusChangedDate || today
      if (value === 'suspended' && !next.suspendedDate) next.suspendedDate = next.statusChangedDate || today
      return next
    })
  }

  const openRegisterWithdrawalModal = (account: FundingAccount) => {
    closeFloatingMenus()
    setWithdrawalAccountId(account.id)
    setEditingWithdrawalId(null)
    setWithdrawalForm({ ...getInitialWithdrawalState(), currency: account.currency ?? 'EUR' })
    setIsWithdrawalModalOpen(true)
  }

  const openEditWithdrawalModal = (account: FundingAccount, withdrawal: FundingAccountWithdrawal) => {
    closeFloatingMenus()
    setWithdrawalAccountId(account.id)
    setEditingWithdrawalId(withdrawal.id)
    setWithdrawalForm({
      date: withdrawal.date.slice(0, 10),
      amount: String(withdrawal.amount),
      currency: withdrawal.currency ?? account.currency ?? 'EUR',
      notes: withdrawal.notes ?? '',
    })
    setIsWithdrawalModalOpen(true)
  }

  const closeWithdrawalModal = () => {
    setIsWithdrawalModalOpen(false)
    setWithdrawalAccountId(null)
    setEditingWithdrawalId(null)
    setWithdrawalForm({ ...getInitialWithdrawalState(), currency: dataRef.current.settings.defaultCurrency ?? 'EUR' })
  }

  const handleWithdrawalFormChange = (field: string, value: string) => {
    setWithdrawalForm((prev) => ({ ...prev, [field]: value }))
  }

  const saveAccount = async () => {
    if (!accountForm.name.trim() || !accountForm.firmName.trim()) {
      setMessage('Introduce el nombre de la cuenta y la empresa de fondeo.')
      return
    }

    const initialCapital = Number(accountForm.initialCapital)
    const dailyLossLimit = 0
    const maxLossLimit = 0
    const examCost = Number(accountForm.examCost)

    if (!accountForm.purchaseDate) {
      setMessage('Introduce la fecha de compra de la cuenta.')
      return
    }

    if ([initialCapital, examCost].some((value) => !Number.isFinite(value) || value < 0)) {
      setMessage('Revisa los valores numéricos de la cuenta.')
      return
    }

    const existing = editingAccountId ? dataRef.current.accounts.find((account) => account.id === editingAccountId) : null
    const fallbackStatusDate = accountForm.statusChangedDate || existing?.statusChangedAt?.slice(0, 10) || accountForm.purchaseDate
    const fallbackFundedDate = accountForm.fundedDate || existing?.fundedAt?.slice(0, 10) || ''
    const fallbackSuspendedDate = accountForm.suspendedDate || existing?.suspendedAt?.slice(0, 10) || fallbackStatusDate

    if (accountForm.status !== 'evaluation' && !fallbackStatusDate) {
      setMessage('Introduce la fecha del cambio de estado de la cuenta.')
      return
    }

    const nextStatusChangedAt = accountForm.status === 'evaluation'
      ? undefined
      : toIsoDateAtNoon(fallbackStatusDate)
    const nextFundedAt = accountForm.status === 'funded'
      ? toIsoDateAtNoon(fallbackFundedDate || fallbackStatusDate)
      : accountForm.status === 'suspended'
        ? (fallbackFundedDate ? toIsoDateAtNoon(fallbackFundedDate) : undefined)
        : existing?.fundedAt
    const nextSuspendedAt = accountForm.status === 'suspended'
      ? toIsoDateAtNoon(fallbackSuspendedDate)
      : existing?.suspendedAt
    const statusColor = getFundingStatusColor(accountForm.status)

    const accountPayload: FundingAccount = {
      id: editingAccountId ?? createId(),
      name: accountForm.name.trim(),
      firmName: accountForm.firmName.trim(),
      status: accountForm.status,
      color: statusColor,
      initialCapital,
      dailyLossLimit,
      maxLossLimit,
      purchaseDate: toIsoDateAtNoon(accountForm.purchaseDate),
      statusChangedAt: nextStatusChangedAt,
      fundedAt: nextFundedAt,
      suspendedAt: nextSuspendedAt,
      examCost,
      currency: accountForm.currency,
      websiteUrl: accountForm.websiteUrl.trim(),
      username: accountForm.username.trim(),
      password: accountForm.password,
      createdAt: existing?.createdAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      withdrawals: existing?.withdrawals ?? [],
    }

    const nextData: AppData = {
      ...dataRef.current,
      accounts: editingAccountId
        ? dataRef.current.accounts.map((account) => account.id === editingAccountId ? accountPayload : account)
        : [...dataRef.current.accounts, accountPayload],
    }

    await saveData(nextData)
    setSelectedAccountId(accountPayload.id)
    closeAccountModal()
    setMessage(editingAccountId ? 'Cuenta actualizada correctamente.' : 'Cuenta creada correctamente.')
  }

  const saveWithdrawal = async () => {
    if (!withdrawalAccountId) {
      setMessage('No se ha seleccionado ninguna cuenta para registrar el retiro.')
      return
    }

    const account = dataRef.current.accounts.find((item) => item.id === withdrawalAccountId)
    if (!account) {
      setMessage('No se encontró la cuenta seleccionada.')
      return
    }

    const amount = Number(withdrawalForm.amount)
    if (!withdrawalForm.date || !Number.isFinite(amount) || amount < 0) {
      setMessage('Revisa los datos del retiro.')
      return
    }

    const withdrawal: FundingAccountWithdrawal = {
      id: editingWithdrawalId ?? createId(),
      date: toIsoDateAtNoon(withdrawalForm.date),
      amount,
      currency: withdrawalForm.currency,
      notes: withdrawalForm.notes.trim(),
    }

    const nextAccounts = dataRef.current.accounts.map((item) => item.id === account.id
      ? {
        ...item,
        updatedAt: new Date().toISOString(),
        withdrawals: (editingWithdrawalId
          ? item.withdrawals.map((current) => current.id === editingWithdrawalId ? withdrawal : current)
          : [withdrawal, ...item.withdrawals]
        ).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
      }
      : item)

    await saveData({
      ...dataRef.current,
      accounts: nextAccounts,
    })
    closeWithdrawalModal()
    setSelectedAccountId(account.id)
    setMessage(editingWithdrawalId ? 'Retiro actualizado correctamente.' : 'Retiro registrado correctamente.')
  }

  const deleteWithdrawal = async (account: FundingAccount, withdrawal: FundingAccountWithdrawal) => {
    setOpenWithdrawalMenuId(null)
    const confirmed = window.confirm(`¿Eliminar el retiro de ${formatMoney(withdrawal.amount, withdrawal.currency ?? account.currency ?? 'EUR')} del ${formatDate(withdrawal.date)}?`)
    if (!confirmed) return

    await saveData({
      ...dataRef.current,
      accounts: dataRef.current.accounts.map((item) => item.id === account.id
        ? {
          ...item,
          updatedAt: new Date().toISOString(),
          withdrawals: item.withdrawals.filter((current) => current.id !== withdrawal.id),
        }
        : item),
    })
    setSelectedAccountId(account.id)
    setMessage('Retiro eliminado correctamente.')
  }

  const duplicateAccount = async (account: FundingAccount) => {
    const duplicated: FundingAccount = {
      ...account,
      id: createId(),
      name: `${account.name} Copia`,
      createdAt: new Date().toISOString(),
      withdrawals: account.withdrawals.map((withdrawal) => ({ ...withdrawal, id: createId() })),
    }
    await saveData({
      ...dataRef.current,
      accounts: [...dataRef.current.accounts, duplicated],
    })
    setMessage('Cuenta duplicada correctamente.')
  }

  const deleteAccount = async (account: FundingAccount) => {
    await saveData({
      ...dataRef.current,
      accounts: dataRef.current.accounts.filter((item) => item.id !== account.id),
    })
    if (selectedAccountId === account.id) {
      setSelectedAccountId(null)
    }
    setMessage('Cuenta eliminada correctamente.')
  }

  const handleAccountMenuAction = async (action: string, account: FundingAccount) => {
    setOpenAccountMenuId(null)

    if (action === 'Editar cuenta') {
      openEditAccountModal(account)
      return
    }

    if (action === 'Registrar retiro') {
      openRegisterWithdrawalModal(account)
      return
    }

    if (action === 'Cambiar estado') {
      openEditAccountModal(account)
      return
    }

    if (action === 'Abrir web') {
      if (!account.websiteUrl) {
        setMessage('Esta cuenta no tiene web configurada.')
        return
      }
      window.open(account.websiteUrl, '_blank', 'noopener,noreferrer')
      setMessage('Abriendo la web de la empresa.')
      return
    }

    if (action === 'Duplicar') {
      await duplicateAccount(account)
      return
    }

    if (action === 'Eliminar') {
      await deleteAccount(account)
    }
  }

  const addOperation = async () => {
    const selectedStrategyForOperation = dataRef.current.strategies.find((strategy) => strategy.id === operationForm.strategyId)
    const resolvedAsset = (
      operationForm.asset ||
      operationForm.instrument ||
      selectedStrategyForOperation?.asset ||
      selectedStrategyForOperation?.market ||
      selectedStrategyForOperation?.name ||
      ''
    ).trim()
    if (!resolvedAsset) {
      setMessage('Introduce el activo de la operación.')
      return
    }
    const entry = Number(operationForm.entry)
    const exit = Number(operationForm.exit)
    const size = Number(operationForm.size)
    if (!operationForm.date || !operationForm.exitDate) {
      setMessage('Introduce la fecha y la hora de entrada y salida.')
      return
    }
    if (!Number.isFinite(entry) || !Number.isFinite(exit) || !Number.isFinite(size) || entry <= 0 || exit <= 0 || size <= 0) {
      setMessage('Revisa los valores numéricos.')
      return
    }
    const manualPlValue = Number((operationForm as any).plValue)
    const plValue = Number.isFinite(manualPlValue) && (operationForm as any).plValue !== ''
      ? manualPlValue
      : (exit - entry) * (operationForm.side === 'long' ? 1 : -1) * size
    const capitalBase = resolveOperationCapitalBase(operationForm, dataRef.current.strategies)
    const manualPlPercent = Number((operationForm as any).plPercent)
    const plPercent = Number.isFinite(manualPlPercent) && (operationForm as any).plPercent !== ''
      ? manualPlPercent
      : computePercentFromInitialCapital(plValue, capitalBase) ?? 0
    const computedRrRatio = computeRealizedRrRatio(
      operationForm.side,
      entry,
      exit,
      (operationForm as any).stopLoss ? Number((operationForm as any).stopLoss) : null,
    )
    const resolvedResult = operationForm.breakEven
      ? 'breakeven'
      : (operationForm.result === 'win' || operationForm.result === 'loss' || operationForm.result === 'breakeven'
        ? operationForm.result
        : parseResult(entry, exit, operationForm.side))
    const notesText = (operationForm.notes || operationForm.comments || '').trim()
    const operation: Operation = {
      id: editingOperationId ?? createId(),
      strategyId: operationForm.strategyId,
      date: operationForm.date,
      exitDate: operationForm.exitDate || operationForm.date,
      asset: resolvedAsset,
      side: operationForm.side,
      entry,
      exit,
      size,
      result: resolvedResult,
      notes: notesText,
      screenshotPath: operationForm.screenshotPath || undefined,
      rrRatio: (operationForm as any).rrRatio || computedRrRatio,
      stopLoss: (operationForm as any).stopLoss ? Number((operationForm as any).stopLoss) : null,
      takeProfit: (operationForm as any).takeProfit ? Number((operationForm as any).takeProfit) : null,
      setupType: (operationForm as any).setupType,
      emotionalState: (operationForm as any).emotionalState,
      followedPlan: Boolean((operationForm as any).followedPlan),
      plValue,
      plPercent,
      commission: (operationForm as any).commission ? Number((operationForm as any).commission) : undefined,
      swap: (operationForm as any).swap ? Number((operationForm as any).swap) : undefined,
      riskMoney: (operationForm as any).riskMoney ? Number((operationForm as any).riskMoney) : undefined,
      riskPercent: (operationForm as any).riskPercent ? Number((operationForm as any).riskPercent) : undefined,
      benefitMoney: (operationForm as any).benefitMoney ? Number((operationForm as any).benefitMoney) : undefined,
      benefitPercent: (operationForm as any).benefitPercent ? Number((operationForm as any).benefitPercent) : undefined,
      balanceBefore: (operationForm as any).balanceBefore ? Number((operationForm as any).balanceBefore) : undefined,
      balanceAfter: (operationForm as any).balanceAfter ? Number((operationForm as any).balanceAfter) : undefined,
      equity: (operationForm as any).equity ? Number((operationForm as any).equity) : undefined,
      drawdownProduced: (operationForm as any).drawdownProduced ? Number((operationForm as any).drawdownProduced) : undefined,
      points: (operationForm as any).points ? Number((operationForm as any).points) : undefined,
      lots: (operationForm as any).lots ? Number((operationForm as any).lots) : undefined,
      valuePerPoint: (operationForm as any).valuePerPoint ? Number((operationForm as any).valuePerPoint) : undefined,
      contracts: (operationForm as any).contracts ? Number((operationForm as any).contracts) : undefined,
      instrument: (operationForm as any).instrument || resolvedAsset,
      broker: (operationForm as any).broker || undefined,
      account: (operationForm as any).account || undefined,
      entryType: (operationForm as any).entryType || 'Market',
      breakEven: Boolean((operationForm as any).breakEven),
      labels: (operationForm as any).labels ? (operationForm as any).labels.split(',').map((item: string) => item.trim()).filter(Boolean) : [],
      benefitCurrency: (operationForm as any).benefitCurrency || 'EUR',
    }
    const nextData = {
      ...dataRef.current,
      operations: editingOperationId
        ? dataRef.current.operations.map((item) => item.id === editingOperationId ? operation : item)
        : [...dataRef.current.operations, operation],
    }

    await saveData(nextData)
    resetOperationForm(operationForm.strategyId)
    setIsModalOpen(false)
    setMessage(editingOperationId ? 'Operación actualizada.' : 'Operación guardada.')
  }

  const deleteOperation = async (operation: Operation) => {
    setOpenOperationMenuId(null)
    const confirmed = window.confirm('¿Seguro que quieres eliminar esta operación? Esta acción no se puede deshacer.')
    if (!confirmed) return

    await saveData({
      ...dataRef.current,
      operations: dataRef.current.operations.filter((item) => item.id !== operation.id),
    })
    setMessage('Operación eliminada correctamente.')
  }

  const handleFormChange = (field: string, value: string) => {
    setOperationForm((prev: any) => ({ ...prev, [field]: value }))
  }

  const analyzeSelectedImage = async (input: File | string, preview: string, screenshotPath: string) => {
    const runId = ++extractionRunRef.current
    setIsAiAnalyzing(true)
    setAiStatus('Analizando operación...')
    setPendingExtraction(null)
    setPendingScreenshotPath(screenshotPath)
    try {
      const extraction = await extractOperationFromImage(input)
      if (runId !== extractionRunRef.current) return
      setPreviewImage(preview)
      setPendingExtraction(extraction)
      const detected = extraction.fields.filter((field) => field.status === 'detected').length
      const review = extraction.fields.filter((field) => field.status === 'review').length
      const missing = extraction.fields.filter((field) => field.status === 'missing').length
      const pendingLabel = review > 0
        ? `${detected} detectados · ${review} revisión manual · ${missing} no detectados`
        : `${detected} detectados · ${missing} no detectados`
      setAiStatus(`Análisis completado: ${pendingLabel}`)
      setMessage('Análisis IA completado. Revisa el resumen y confirma para rellenar el formulario.')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo analizar la captura con IA.'
      setAiStatus('Error en la extracción')
      setMessage(message)
    } finally {
      setIsAiAnalyzing(false)
    }
  }

  const openScreenshotPicker = async () => {
    if (isElectron) {
      const path = await window.tradingApp.selectImage()
      if (!path) {
        setMessage('No se seleccionó ninguna imagen.')
        return
      }
      if (!window.confirm('La captura se enviará al modelo de visión configurado para extraer la operación. ¿Deseas continuar?')) {
        return
      }
      try {
        const saved = await window.tradingApp.copyImage({ imagePath: path, folder: data.settings.dataFolder })
        await analyzeSelectedImage(saved.path, `file://${saved.path}`, saved.path)
      } catch (error) {
        const message = error instanceof Error ? error.message : 'No se pudo analizar la captura con IA.'
        setAiStatus('Error en la extracción')
        setMessage(message)
      }
      return
    }

    fileInputRef.current?.click()
  }

  const handleFileInputChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    const url = URL.createObjectURL(file)
    await analyzeSelectedImage(file, url, file.name)
    event.target.value = ''
  }

  const operationProfit = useMemo(() => {
    const entry = Number(operationForm.entry)
    const exit = Number(operationForm.exit)
    const size = Number(operationForm.size)
    if (Number.isNaN(entry) || Number.isNaN(exit) || Number.isNaN(size)) return 0
    return (exit - entry) * (operationForm.side === 'long' ? 1 : -1) * size
  }, [operationForm.entry, operationForm.exit, operationForm.side, operationForm.size])

  const displayedPlValue = useMemo(() => {
    const manualValue = Number((operationForm as any).plValue)
    return Number.isNaN(manualValue) || (operationForm as any).plValue === '' ? operationProfit : manualValue
  }, [operationForm, operationProfit])

  const displayedPlPercent = useMemo(() => {
    const manualValue = Number((operationForm as any).plPercent)
    if (Number.isFinite(manualValue) && (operationForm as any).plPercent !== '') {
      return manualValue
    }
    const capitalBase = resolveOperationCapitalBase(operationForm, dataRef.current.strategies)
    return computePercentFromInitialCapital(displayedPlValue, capitalBase) ?? 0
  }, [displayedPlValue, operationForm])

  const displayedRrRatio = useMemo(() => {
    const entry = Number(operationForm.entry)
    const exit = Number(operationForm.exit)
    const stopLoss = Number((operationForm as any).stopLoss)
    if (
      Number.isNaN(entry)
      || Number.isNaN(exit)
      || Number.isNaN(stopLoss)
      || !operationForm.side
    ) {
      return '1:2'
    }
    return computeRealizedRrRatio(operationForm.side, entry, exit, stopLoss) ?? '1:2'
  }, [operationForm.entry, operationForm.exit, operationForm.side, (operationForm as any).stopLoss])

  // helper to update extended fields safely
  const handleExtendedChange = (field: string, value: string | boolean) => {
    setOperationForm((prev: any) => ({ ...prev, [field]: value }))
  }

  // Strategy page tab
  const [strategyTab, setStrategyTab] = useState<'operaciones'|'ia'>('operaciones')
  const [calendarFocus, setCalendarFocus] = useState<string | null>(null)
  const strategyOps = useMemo(() => (selectedStrategyId ? data.operations.filter(o => o.strategyId === selectedStrategyId).sort((a,b)=>new Date(b.date).getTime()-new Date(a.date).getTime()) : []), [data.operations, selectedStrategyId])
  const filteredStrategyOps = useMemo(() => (
    calendarFocus
      ? strategyOps.filter((operation) => getDateKey(operation.date) === calendarFocus)
      : strategyOps
  ), [calendarFocus, strategyOps])
  const strategyStats = useMemo(() => (selectedStrategyId ? summaryForStrategy({ ...data, operations: strategyOps }, selectedStrategyId) : null), [data, strategyOps, selectedStrategyId])
  const strategyAiAnalysis = useMemo(() => buildStrategyAiAnalysis(strategyOps), [strategyOps])

  const selectedAccount = useMemo(
    () => (selectedAccountId ? data.accounts.find((account) => account.id === selectedAccountId) ?? null : null),
    [data.accounts, selectedAccountId],
  )

  const accountMetricsById = useMemo(
    () => Object.fromEntries(data.accounts.map((account) => [account.id, computeFundingMetrics(account)])),
    [data.accounts],
  )

  const accountOverview = useMemo(() => {
    const totalAccounts = data.accounts.length
    const activeAccounts = data.accounts.filter((account) => account.status === 'evaluation' || account.status === 'funded').length
    const fundedAccounts = data.accounts.filter((account) => account.status === 'funded').length
    const burnedAccounts = data.accounts.filter((account) => account.status === 'suspended').length
    const examInvestment = data.accounts.reduce((sum, account) => sum + account.examCost, 0)
    const totalManagedCapital = data.accounts
      .filter((account) => account.status === 'funded')
      .reduce((sum, account) => sum + account.initialCapital, 0)
    const totalWithdrawn = data.accounts.reduce((sum, account) => sum + accountMetricsById[account.id].totalWithdrawn, 0)
    const totalNetProfit = data.accounts.reduce((sum, account) => sum + accountMetricsById[account.id].netProfit, 0)

    return {
      totalAccounts,
      activeAccounts,
      fundedAccounts,
      burnedAccounts,
      examInvestment,
      totalManagedCapital,
      totalWithdrawn,
      totalNetProfit,
    }
  }, [accountMetricsById, data.accounts])

  const accountStatusEvents = useMemo(() => data.accounts.flatMap((account) => {
    const events: Array<{ id: string; account: FundingAccount; date: string; label: string; tone: 'positive' | 'negative' | 'neutral'; amount?: number }> = []
    if (account.purchaseDate) {
      events.push({
        id: `${account.id}-purchase`,
        account,
        date: getDateKey(account.purchaseDate),
        label: 'Examen',
        tone: 'neutral',
        amount: -account.examCost,
      })
    }
    if (account.fundedAt) {
      events.push({
        id: `${account.id}-funded`,
        account,
        date: getDateKey(account.fundedAt),
        label: 'Fondeada',
        tone: 'positive',
        amount: undefined,
      })
    }
    if (account.status === 'passed' && account.statusChangedAt) {
      events.push({
        id: `${account.id}-passed`,
        account,
        date: getDateKey(account.statusChangedAt),
        label: 'Aprobada',
        tone: 'positive',
        amount: undefined,
      })
    }
    if (account.suspendedAt || (account.status === 'suspended' && account.statusChangedAt)) {
      events.push({
        id: `${account.id}-suspended`,
        account,
        date: getDateKey(account.suspendedAt ?? account.statusChangedAt),
        label: 'Quemada',
        tone: 'negative',
        amount: undefined,
      })
    }
    account.withdrawals.forEach((withdrawal) => {
      events.push({
        id: `${account.id}-withdrawal-${withdrawal.id}`,
        account,
        date: getDateKey(withdrawal.date),
        label: 'Retiro',
        tone: 'positive',
        amount: withdrawal.amount,
      })
    })
    return events.filter((event) => event.date)
  }), [data.accounts])

  const filteredAccountStatusEvents = useMemo(
    () => {
      const source = accountCalendarFocus ? accountStatusEvents.filter((event) => event.date === accountCalendarFocus) : accountStatusEvents
      return [...source].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    },
    [accountCalendarFocus, accountStatusEvents],
  )

  const accountPeriodStart = getPeriodStart(accountPeriod)

  const accountChartData = useMemo(() => {
    const allEvents = [
      ...data.accounts.map((account) => ({
        date: account.purchaseDate,
        withdrawnDelta: 0,
        netDelta: -account.examCost,
      })),
      ...data.accounts.flatMap((account) => account.withdrawals.map((withdrawal) => ({
        date: withdrawal.date,
        withdrawnDelta: withdrawal.amount,
        netDelta: withdrawal.amount,
      }))),
    ].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    const events = accountPeriodStart ? allEvents.filter((item) => new Date(item.date) >= accountPeriodStart) : allEvents

    if (events.length === 0) {
      const today = new Date()
      return Array.from({ length: 6 }, (_, index) => ({
        label: new Date(today.getTime() - (5 - index) * 24 * 60 * 60 * 1000).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }),
        withdrawn: 0,
        net: 0,
      }))
    }

    const startDate = accountPeriodStart ?? new Date(events[0].date)
    let withdrawnRunning = 0
    let netRunning = 0
    const series = [{
      label: startDate.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }),
      withdrawn: 0,
      net: 0,
    }]

    events.forEach((event) => {
      withdrawnRunning += event.withdrawnDelta
      netRunning += event.netDelta
      series.push({
        label: new Date(event.date).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }),
        withdrawn: withdrawnRunning,
        net: netRunning,
      })
    })

    return series
  }, [accountPeriodStart, data.accounts])

  const accountChartSvg = useMemo(() => buildDualChartSvgData(accountChartData), [accountChartData])

  const selectedAccountMetrics = useMemo(
    () => (selectedAccount ? computeFundingMetrics(selectedAccount) : null),
    [selectedAccount],
  )

  const selectedAccountWithdrawals = useMemo(
    () => (selectedAccount ? [...selectedAccount.withdrawals].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()) : []),
    [selectedAccount],
  )

  const selectedAccountChartData = useMemo(() => {
    if (!selectedAccount) return []
    const allEvents = [
      {
        date: selectedAccount.purchaseDate,
        withdrawnDelta: 0,
        netDelta: -selectedAccount.examCost,
      },
      ...selectedAccount.withdrawals.map((withdrawal) => ({
        date: withdrawal.date,
        withdrawnDelta: withdrawal.amount,
        netDelta: withdrawal.amount,
      })),
    ].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    const events = accountPeriodStart ? allEvents.filter((item) => new Date(item.date) >= accountPeriodStart) : allEvents
    if (events.length === 0) {
      const today = new Date()
      return Array.from({ length: 6 }, (_, index) => ({
        label: new Date(today.getTime() - (5 - index) * 24 * 60 * 60 * 1000).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }),
        withdrawn: 0,
        net: 0,
      }))
    }

    const startDate = accountPeriodStart ?? new Date(events[0].date)
    let withdrawnRunning = 0
    let netRunning = 0
    const source = [{
      label: startDate.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }),
      withdrawn: 0,
      net: 0,
    }]

    events.forEach((event) => {
      withdrawnRunning += event.withdrawnDelta
      netRunning += event.netDelta
      source.push({
        label: new Date(event.date).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }),
        withdrawn: withdrawnRunning,
        net: netRunning,
      })
    })
    return source
  }, [accountPeriodStart, selectedAccount])

  const selectedAccountChartSvg = useMemo(() => buildDualChartSvgData(selectedAccountChartData), [selectedAccountChartData])

  useEffect(() => {
    if (selectedStrategyId && !selectedStrategy) {
      setSelectedStrategyId(null)
    }
  }, [selectedStrategy, selectedStrategyId])

  useEffect(() => {
    if (selectedAccountId && !selectedAccount) {
      setSelectedAccountId(null)
    }
  }, [selectedAccount, selectedAccountId])

  const isLightTheme = data.settings.theme === 'light'
  const accentColor = isLightTheme ? '#111827' : '#d7dce6'
  const accentColorDeep = adjustHexColor(accentColor, isLightTheme ? 34 : -56)
  const visibleCalendarDate = calendarMonthDate
  const visibleCalendarYear = visibleCalendarDate.getFullYear()
  const visibleCalendarMonth = visibleCalendarDate.getMonth()
  const visibleCalendarDays = new Date(visibleCalendarYear, visibleCalendarMonth + 1, 0).getDate()
  const visibleCalendarMonthLabel = visibleCalendarDate.toLocaleString('es-ES', { month: 'long', year: 'numeric' })
  const calendarWeekdays = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
  const visibleCalendarLeadingBlanks = (new Date(visibleCalendarYear, visibleCalendarMonth, 1).getDay() + 6) % 7
  const changeCalendarMonth = (offset: number) => {
    setCalendarMonthDate((current) => new Date(current.getFullYear(), current.getMonth() + offset, 1))
  }
  const resetCalendarMonth = () => {
    const today = new Date()
    setCalendarMonthDate(new Date(today.getFullYear(), today.getMonth(), 1))
  }

  return (
    <div
      className={`app-shell ${isLightTheme ? 'light-theme' : 'dark-theme'}`}
      style={{
        '--accent-color': accentColor,
        '--accent-color-deep': accentColorDeep,
      } as CSSProperties}
    >
      <style>{`
        .app-shell.dark-theme .strategy-calendar-card,
        .app-shell.dark-theme .strategy-calendar-panel,
        .app-shell.dark-theme .account-status-calendar {
          background: #030303 !important;
          background-image: none !important;
          border-color: rgba(255, 255, 255, 0.28) !important;
        }

        .app-shell.dark-theme button.strategy-calendar-day,
        .app-shell.dark-theme .strategy-calendar-grid > button.strategy-calendar-day,
        .app-shell.dark-theme .strategy-calendar-card button.strategy-calendar-day,
        .app-shell.dark-theme .account-status-calendar button.strategy-calendar-day {
          background: #070707 !important;
          background-color: #070707 !important;
          background-image: none !important;
          border: 1px solid rgba(255, 255, 255, 0.36) !important;
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04) !important;
        }

        .app-shell.dark-theme button.strategy-calendar-day:hover {
          background: #121212 !important;
          background-image: none !important;
          border-color: rgba(255, 255, 255, 0.56) !important;
        }

        .app-shell.dark-theme button.strategy-calendar-day.selected {
          background: #181818 !important;
          background-image: none !important;
          border-color: rgba(255, 255, 255, 0.72) !important;
        }

        .app-shell.dark-theme button.strategy-calendar-day.positive {
          background: #071009 !important;
          background-image: none !important;
          border-color: rgba(99, 230, 155, 0.48) !important;
        }

        .app-shell.dark-theme button.strategy-calendar-day.negative {
          background: #120607 !important;
          background-image: none !important;
          border-color: rgba(255, 102, 120, 0.48) !important;
        }

        .app-shell.dark-theme button.strategy-calendar-day.neutral,
        .app-shell.dark-theme .account-status-calendar button.strategy-calendar-day.neutral {
          background: #070707 !important;
          background-image: none !important;
          border-color: rgba(255, 255, 255, 0.38) !important;
        }

        .app-shell.dark-theme .strategy-calendar-blank {
          background: #050505 !important;
          background-image: none !important;
          border-color: rgba(255, 255, 255, 0.20) !important;
        }
      `}</style>
      <header className="topbar">
        <div className="brand-area">
          <div className="brand-logo" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 16.5 9 11l3.5 3.5L20 7" />
              <path d="M14 7h6v6" />
            </svg>
          </div>
          <div>
            <p className="brand-title">{data.settings.appName ?? 'La Biblia'}</p>
            <p className="brand-subtitle">Trading Journal</p>
          </div>
        </div>
        <div className="top-actions">
          <div className="environment-switcher module-switcher">
            <button type="button" className={selectedModule === 'strategies' ? 'pill active' : 'pill'} onClick={() => setSelectedModule('strategies')}>CONTROL DE ESTRATEGIAS</button>
            <button type="button" className={selectedModule === 'accounts' ? 'pill active' : 'pill'} onClick={() => setSelectedModule('accounts')}>CONTROL DE CUENTAS</button>
          </div>
          <div className="sidebar-quick-actions" aria-label="Acciones rápidas">
            <button type="button" className="sidebar-action-button" onClick={handleExcelExport}>
              <span aria-hidden="true">⇩</span>
              <strong>Exportar Excel</strong>
            </button>
            <button type="button" className="sidebar-action-button" onClick={() => saveData(dataRef.current)}>
              <span aria-hidden="true">✓</span>
              <strong>Guardar ahora</strong>
            </button>
            <button
              type="button"
              className="sidebar-action-button"
              onClick={() => saveData({
                ...dataRef.current,
                settings: {
                  ...dataRef.current.settings,
                  theme: dataRef.current.settings.theme === 'light' ? 'dark' : 'light',
                },
              })}
            >
              <span aria-hidden="true">{data.settings.theme === 'light' ? '☾' : '☼'}</span>
              <strong>{data.settings.theme === 'light' ? 'Modo noche' : 'Modo día'}</strong>
            </button>
            <button
              type="button"
              className="sidebar-action-button"
              onClick={() => {
                closeFloatingMenus()
                setIsSettingsOpen(true)
              }}
            >
              <span aria-hidden="true">⚙</span>
              <strong>Ajustes</strong>
            </button>
          </div>
        </div>
      </header>

      {selectedModule === 'strategies' && !selectedStrategyId ? (
        <section className="section-header dashboard-header">
          <div className="dashboard-heading">
            <h1>Mis Estrategias</h1>
            <p>Entorno: <span className="dashboard-environment real">● REAL</span></p>
          </div>
          <div className="dashboard-header-action">
            <button type="button" className="button-primary dashboard-create-button" onClick={openCreateStrategyModal}>
              + Nueva Estrategia
            </button>
          </div>
        </section>
      ) : null}

      {selectedModule === 'strategies' ? (
        selectedStrategyId ? (
        <section className="strategy-page">
          {selectedStrategy ? (
            <>
              <div className="strategy-page-header">
                <div className="strategy-page-title-row">
                  <button className="strategy-back-button" onClick={() => setSelectedStrategyId(null)}>
                    <span className="strategy-back-icon" aria-hidden="true">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
                        <path d="m15 18-6-6 6-6" />
                      </svg>
                    </span>
                    <span>Volver</span>
                  </button>
                  <div className="strategy-page-title-block">
                    <strong className="strategy-page-title">{selectedStrategy.name}</strong>
                    <div className="strategy-page-meta">
                      <span>{selectedStrategy.market} · {selectedStrategy.timeframe}</span>
                      <span
                        className="strategy-page-badge"
                        style={{
                          background: hexToRgba(selectedStrategy.color ?? '#7de3a0', 0.16),
                          color: selectedStrategy.color ?? '#7de3a0',
                          borderColor: hexToRgba(selectedStrategy.color ?? '#7de3a0', 0.34),
                        }}
                      >
                        {selectedStrategy.state === 'active' ? 'Activa' : 'Inactiva'}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="strategy-page-actions">
                  <button className="button-primary" onClick={() => openCreateOperationModal(selectedStrategyId)}>+ Añadir Operación</button>
                </div>
              </div>

              <div className="overview-grid">
                <article className="stat-card">
                  <span>Balance actual</span>
                  <strong>{formatNumber((selectedStrategy.initialBalance ?? 0) + (strategyStats?.profit ?? 0))}</strong>
                </article>
                <article className="stat-card positive">
                  <span>P/L Total</span>
                  <strong>{formatCurrency(strategyStats?.profit ?? 0)}</strong>
                </article>
                <article className="stat-card purple">
                  <span>Win Rate</span>
                  <strong>{strategyStats?.winRate ?? 0}%</strong>
                  <small>{strategyStats?.total ?? 0} operaciones</small>
                </article>
                <article className="stat-card gold">
                  <span>Max Drawdown</span>
                  <strong>{strategyStats?.maxDrawdown ?? 0}</strong>
                </article>
              </div>

              <section className="chart-card">
                <div className="chart-header">
                  <div>
                    <h2>Evolución del rendimiento</h2>
                    <p>{selectedStrategy.name} · {selectedStrategy.timeframe}</p>
                  </div>
                  <div className="chart-tabs">
                    <button type="button" className={strategyTab === 'operaciones' ? 'tab active' : 'tab'} onClick={() => setStrategyTab('operaciones')}>Gráfico</button>
                    <button type="button" className={strategyTab === 'ia' ? 'tab ai-tab active' : 'tab ai-tab'} onClick={() => setStrategyTab('ia')}>Análisis IA</button>
                    <button type="button" className="tab export-tab" onClick={handleExcelExport}>Exportar Excel</button>
                  </div>
                </div>
                {strategyTab === 'operaciones' ? (
                  <>
                    <label className="period-select-shell">
                      <span>Temporalidad</span>
                      <select value={selectedPeriod} onChange={(event) => setSelectedPeriod(event.target.value as PeriodKey)}>
                        {PERIOD_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                    </label>

                    <div className="chart-visual">
                      {chartSvg ? (
                        <svg viewBox={`0 0 ${chartSvg.width} ${chartSvg.height}`} className="chart-svg">
                          <defs>
                            <linearGradient id="chart-gradient" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor={accentColor} stopOpacity="0.85" />
                              <stop offset="100%" stopColor="#0a1f2d" stopOpacity="0.1" />
                            </linearGradient>
                            <filter id="chart-glow">
                              <feGaussianBlur stdDeviation="4" result="coloredBlur" />
                              <feMerge>
                                <feMergeNode in="coloredBlur" />
                                <feMergeNode in="SourceGraphic" />
                              </feMerge>
                            </filter>
                          </defs>
                          {chartSvg.yTicks.map((tick) => (
                            <g key={tick.y}>
                              <line x1={chartSvg.padding.left} y1={tick.y} x2={chartSvg.width - chartSvg.padding.right} y2={tick.y} stroke="rgba(148, 163, 184, 0.14)" strokeDasharray="6 8" />
                              <text x={chartSvg.padding.left - 12} y={tick.y + 4} textAnchor="end" fill="rgba(148, 163, 184, 0.72)" fontSize="12">
                                {formatNumber(tick.value)}
                              </text>
                            </g>
                          ))}
                          {chartSvg.xTicks.map((tick) => (
                            <text key={`${tick.label}-${tick.x}`} x={tick.x} y={chartSvg.height - 12} textAnchor="middle" fill="rgba(148, 163, 184, 0.72)" fontSize="12">
                              {tick.label}
                            </text>
                          ))}
                          <path d={chartSvg.areaPath} fill="url(#chart-gradient)" />
                          <path d={chartSvg.linePath} fill="none" stroke={accentColor} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" filter="url(#chart-glow)" />
                          {chartSvg.points.map((point) => (
                            <circle key={`${point.label}-${point.x}`} cx={point.x} cy={point.y} r="3.5" fill="#07111f" stroke={accentColor} strokeWidth="2" />
                          ))}
                        </svg>
                      ) : (
                        <div className="chart-empty">No hay datos para este periodo.</div>
                      )}
                    </div>
                  </>
                ) : null}

                {strategyTab === 'ia' && (
                  <div className="strategy-panel-body strategy-ai-panel">
                    <div className="strategy-ai-header">
                      <div>
                        <h3>Análisis IA de la estrategia</h3>
                        <p>Lectura automática basada en tus operaciones guardadas: rentabilidad, horarios, días, activos, rachas y disciplina.</p>
                      </div>
                    </div>
                    <div className="strategy-ai-card-grid">
                      {strategyAiAnalysis.cards.map((item) => (
                        <article key={item.label} className="result-card">
                          <span>{item.label}</span>
                          <strong className={item.tone}>{item.value}</strong>
                        </article>
                      ))}
                    </div>
                    <div className="strategy-ia-grid">
                      {strategyAiAnalysis.insights.map((insight, index) => (
                        <div key={index} className="insight-chip">{insight}</div>
                      ))}
                    </div>
                  </div>
                )}
              </section>

              {strategyTab === 'operaciones' ? (
                <section className="strategy-calendar-card strategy-calendar-panel">
                  <div className="strategy-calendar-header">
                    <strong>{visibleCalendarMonthLabel}</strong>
                    <div className="calendar-nav-actions">
                      <button type="button" className="calendar-nav-button" onClick={() => changeCalendarMonth(-1)} aria-label="Mes anterior">‹</button>
                      <button type="button" className="calendar-nav-button calendar-today-button" onClick={resetCalendarMonth}>Hoy</button>
                      <button type="button" className="calendar-nav-button" onClick={() => changeCalendarMonth(1)} aria-label="Mes siguiente">›</button>
                    </div>
                  </div>
                  <div className="panel-header strategy-tools-row strategy-calendar-tools-row">
                    <div className="strategy-date-search">
                      <div className="strategy-date-search-label">Buscar por fecha</div>
                      <input type="date" value={calendarFocus ?? ''} onChange={(e) => setCalendarFocus(e.target.value || null)} />
                    </div>
                  </div>
                  <div className="strategy-operations-layout">
                    <div className="strategy-calendar-grid">
                      {calendarWeekdays.map((dayName) => (
                        <div key={`strategy-weekday-${dayName}`} className="strategy-calendar-weekday">{dayName}</div>
                      ))}
                      {Array.from({ length: visibleCalendarLeadingBlanks }).map((_, index) => (
                        <div key={`strategy-blank-${index}`} className="strategy-calendar-blank" aria-hidden="true" />
                      ))}
                      {Array.from({ length: visibleCalendarDays }).map((_, i) => {
                        const day = i + 1
                        const dayStr = `${visibleCalendarYear}-${String(visibleCalendarMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
                        const dayOps = strategyOps.filter((op) => getDateKey(op.date) === dayStr)
                        const dayProfit = dayOps.reduce((sum, op) => sum + computeProfit(op), 0)
                        const cls = dayOps.length ? (dayProfit > 0 ? 'positive' : dayProfit < 0 ? 'negative' : '') : ''
                        return (
                          <button
                            key={day}
                            type="button"
                            className={`strategy-calendar-day ${cls} ${calendarFocus === dayStr ? 'selected' : ''}`}
                            onClick={() => setCalendarFocus(dayStr)}
                            aria-label={`Ver operaciones del ${formatDate(dayStr)}`}
                          >
                            <div className="strategy-calendar-day-number">{day}</div>
                            {dayOps.length > 0 && (<div className={`strategy-calendar-day-summary ${cls}`}>{formatCurrency(dayProfit)} · {dayOps.length} ops</div>)}
                          </button>
                        )
                      })}
                    </div>

                    <div className="strategy-history-section">
                      <div className="strategy-history-title-row">
                        <h3>{calendarFocus ? `Operaciones del ${formatDate(calendarFocus)}` : 'Historial de Operaciones'}</h3>
                        {calendarFocus ? (
                          <button type="button" className="button-secondary account-calendar-clear" onClick={() => setCalendarFocus(null)}>
                            Todas las operaciones
                          </button>
                        ) : null}
                      </div>
                      <div className="strategy-history-list">
                        {filteredStrategyOps.length === 0 ? <div className="strategy-empty-state">{calendarFocus ? 'No hay operaciones en la fecha seleccionada' : 'No hay operaciones'}</div> : filteredStrategyOps.map((op) => (
                          <div key={op.id} className="strategy-history-card">
                            <div className="strategy-history-meta">
                              <strong>{op.side === 'long' ? 'Compra' : 'Venta'}</strong>
                              <div>{new Date(op.date).toLocaleString('es-ES')}</div>
                              <div className="strategy-history-ratio">R/R: {op.rrRatio ?? '—'}</div>
                            </div>
                            <div className="strategy-history-side">
                              <div className={`strategy-history-profit ${op.result === 'win' ? 'positive' : op.result === 'loss' ? 'negative' : 'neutral'}`}>{formatCurrency(computeProfit(op))}</div>
                              <div className="strategy-menu-shell operation-menu-shell" onClick={(event) => event.stopPropagation()}>
                                <button
                                  type="button"
                                  className="strategy-menu-button operation-menu-button"
                                  aria-label={`Opciones de operación del ${new Date(op.date).toLocaleDateString('es-ES')}`}
                                  onClick={() => setOpenOperationMenuId((current) => current === op.id ? null : op.id)}
                                >
                                  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                                    <circle cx="12" cy="5" r="1.8" />
                                    <circle cx="12" cy="12" r="1.8" />
                                    <circle cx="12" cy="19" r="1.8" />
                                  </svg>
                                </button>
                                {openOperationMenuId === op.id ? (
                                  <div className="strategy-menu operation-menu" onClick={(event) => event.stopPropagation()}>
                                    <button type="button" className="strategy-menu-item" onClick={() => openEditOperationModal(op)}>
                                      Ver / Editar
                                    </button>
                                    <button type="button" className="strategy-menu-item danger" onClick={() => void deleteOperation(op)}>
                                      Eliminar
                                    </button>
                                  </div>
                                ) : null}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </section>
              ) : null}

            </>
          ) : (
            <div className="chart-card">No se encontró la estrategia seleccionada.</div>
          )}
        </section>
      ) : (
        <div className="dashboard-shell">
          <section className="chart-card dashboard-hero-panel">
            <div className="chart-header dashboard-chart-header">
              <div>
                <h2>Visión Global de Trading</h2>
                <p>Evolución y estadísticas de todas tus estrategias</p>
              </div>
              <div className="chart-tabs dashboard-chart-tabs">
                <button type="button" className={selectedTab === 'grafico' ? 'tab active' : 'tab'} onClick={() => setSelectedTab('grafico')}>Gráfico</button>
                <button type="button" className={selectedTab === 'ia' ? 'tab ai-tab active' : 'tab ai-tab'} onClick={() => setSelectedTab('ia')}>Análisis IA</button>
                <button type="button" className="tab export-tab" onClick={handleExcelExport}>Exportar Excel</button>
              </div>
            </div>
            {selectedTab === 'grafico' ? (
              <label className="period-select-shell dashboard-period-select">
                <span>Temporalidad</span>
                <select value={selectedPeriod} onChange={(event) => setSelectedPeriod(event.target.value as PeriodKey)}>
                  {PERIOD_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
            ) : null}

            <section className="overview-grid dashboard-overview-grid">
              <article className="stat-card dashboard-stat-card">
                <span className="dashboard-stat-icon blue" aria-hidden="true">↳</span>
                <div>
                  <span>Estrategias Activas</span>
                  <strong>{overview.activeStrategies}</strong>
                </div>
              </article>
              <article className="stat-card positive dashboard-stat-card">
                <span className="dashboard-stat-icon green" aria-hidden="true">↗</span>
                <div>
                  <span>P/L Total</span>
                  <strong>{formatCurrency(overview.profit)}</strong>
                </div>
              </article>
              <article className="stat-card purple dashboard-stat-card">
                <span className="dashboard-stat-icon purple" aria-hidden="true">◎</span>
                <div>
                  <span>Win Rate</span>
                  <strong>{overview.winRate}%</strong>
                  <small>{operationsInPeriod.length} operaciones</small>
                </div>
              </article>
              <article className="stat-card gold dashboard-stat-card">
                <span className="dashboard-stat-icon gold" aria-hidden="true">✦</span>
                <div>
                  <span>Rendimiento</span>
                  <strong>{overview.rendement}</strong>
                  <small>periodo seleccionado</small>
                </div>
              </article>
              <article className="stat-card dashboard-stat-card">
                <span className="dashboard-stat-icon blue" aria-hidden="true">$</span>
                <div>
                  <span>Balance inicial</span>
                  <strong>{formatCurrency(scopedInitialBalance)}</strong>
                </div>
              </article>
              <article className="stat-card dashboard-stat-card">
                <span className="dashboard-stat-icon blue" aria-hidden="true">#</span>
                <div>
                  <span>Operaciones</span>
                  <strong>{overview.total}</strong>
                  <small>{overview.losses} pérdidas</small>
                </div>
              </article>
              <article className={overview.avgTrade >= 0 ? 'stat-card positive dashboard-stat-card' : 'stat-card dashboard-stat-card'}>
                <span className="dashboard-stat-icon green" aria-hidden="true">≈</span>
                <div>
                  <span>Esperanza media</span>
                  <strong>{formatCurrency(overview.avgTrade)}</strong>
                  <small>por operación</small>
                </div>
              </article>
              <article className="stat-card purple dashboard-stat-card">
                <span className="dashboard-stat-icon purple" aria-hidden="true">PF</span>
                <div>
                  <span>Profit factor</span>
                  <strong>{overview.profitFactor == null ? 'Sin pérdidas' : formatNumber(overview.profitFactor)}</strong>
                  <small>{overview.bestDay}: {formatCurrency(overview.bestDayValue)}</small>
                </div>
              </article>
            </section>

            {selectedTab === 'grafico' ? (
            <div className="chart-visual dashboard-chart-visual">
              {chartSvg ? (
                <svg viewBox={`0 0 ${chartSvg.width} ${chartSvg.height}`} className="chart-svg">
                  <defs>
                    <linearGradient id="chart-gradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={accentColor} stopOpacity="0.42" />
                      <stop offset="100%" stopColor="#0a1f2d" stopOpacity="0.05" />
                    </linearGradient>
                    <filter id="chart-glow">
                      <feGaussianBlur stdDeviation="4" result="coloredBlur" />
                      <feMerge>
                        <feMergeNode in="coloredBlur" />
                        <feMergeNode in="SourceGraphic" />
                      </feMerge>
                    </filter>
                  </defs>
                  {chartSvg.yTicks.map((tick) => (
                    <g key={tick.y}>
                      <line x1={chartSvg.padding.left} y1={tick.y} x2={chartSvg.width - chartSvg.padding.right} y2={tick.y} stroke="rgba(148, 163, 184, 0.16)" strokeDasharray="4 7" />
                      <text x={chartSvg.padding.left - 12} y={tick.y + 4} textAnchor="end" fill="rgba(148, 163, 184, 0.62)" fontSize="12">
                        {Math.round(tick.value)}
                      </text>
                    </g>
                  ))}
                  {chartSvg.xTicks.map((tick) => (
                    <text key={`${tick.label}-${tick.x}`} x={tick.x} y={chartSvg.height - 12} textAnchor="middle" fill="rgba(148, 163, 184, 0.62)" fontSize="12">
                      {tick.label}
                    </text>
                  ))}
                  <path d={chartSvg.areaPath} fill="url(#chart-gradient)" />
                  <path d={chartSvg.linePath} fill="none" stroke={accentColor} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" filter="url(#chart-glow)" />
                </svg>
              ) : (
                <div className="chart-empty">Registra operaciones para ver la evolución.</div>
              )}
            </div>
            ) : null}

            {selectedTab === 'ia' ? (
              <div className="strategy-panel-body strategy-ai-panel">
                <div className="strategy-ai-header">
                  <div>
                    <h3>Análisis IA global</h3>
                    <p>Lectura automática de todas las operaciones registradas en control de estrategias.</p>
                  </div>
                </div>
                <div className="strategy-ai-card-grid">
                  {globalStrategyAiAnalysis.cards.map((item) => (
                    <article key={item.label} className="result-card">
                      <span>{item.label}</span>
                      <strong className={item.tone}>{item.value}</strong>
                    </article>
                  ))}
                </div>
                <div className="strategy-ia-grid">
                  {globalStrategyAiAnalysis.insights.map((insight, index) => (
                    <div key={index} className="insight-chip">{insight}</div>
                  ))}
                </div>
              </div>
            ) : null}
          </section>

          <section className="dashboard-strategies-section">
            <div className="dashboard-strategies-grid">
              {visibleStrategies.map((strategy) => {
                const ops = data.operations.filter((op) => op.strategyId === strategy.id)
                const profit = ops.reduce((sum, op) => sum + computeProfit(op), 0)
                const wins = ops.filter((op) => op.result === 'win').length
                const winRate = ops.length ? Math.round((wins / ops.length) * 100) : 0
                return (
                  <div
                    key={strategy.id}
                    className="strategy-card dashboard-strategy-card"
                    style={{ '--strategy-color': strategy.color ?? '#7de3a0' } as CSSProperties}
                    onClick={() => { setSelectedStrategyId(strategy.id); setOpenStrategyMenuId(null) }}
                  >
                    <div className="strategy-card-header">
                      <div className="dashboard-strategy-title-block">
                        <div className="dashboard-strategy-name-row">
                          <span
                            className="dashboard-strategy-icon"
                            aria-hidden="true"
                            style={{
                              background: hexToRgba(strategy.color ?? '#7de3a0', 0.14),
                              color: strategy.color ?? '#7de3a0',
                              borderColor: hexToRgba(strategy.color ?? '#7de3a0', 0.34),
                            }}
                          >
                            ▣
                          </span>
                          <strong>{strategy.name}</strong>
                        </div>
                        <small>{strategy.market} · {strategy.timeframe}</small>
                      </div>
                      <div className="strategy-card-controls">
                        <span className="strategy-badge" style={{ background: strategy.state === 'active' ? 'rgba(41,173,0,0.12)' : 'rgba(255,255,255,0.04)', color: strategy.state === 'active' ? '#8bf5ac' : '#9ca5bf' }}>{strategy.state === 'active' ? 'Activa' : 'Inactiva'}</span>
                        <div className="strategy-menu-shell">
                          <button
                            type="button"
                            className="strategy-menu-button"
                            aria-label={`Opciones de ${strategy.name}`}
                            onClick={(event) => {
                              event.stopPropagation()
                              setOpenStrategyMenuId((current) => current === strategy.id ? null : strategy.id)
                            }}
                          >
                            <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                              <circle cx="12" cy="5" r="1.8" />
                              <circle cx="12" cy="12" r="1.8" />
                              <circle cx="12" cy="19" r="1.8" />
                            </svg>
                          </button>
                          {openStrategyMenuId === strategy.id ? (
                            <div className="strategy-menu" onClick={(event) => event.stopPropagation()}>
                              {['Editar estrategia', 'Eliminar'].map((item) => (
                                <button key={item} type="button" className="strategy-menu-item" onClick={() => void handleStrategyMenuAction(item, strategy)}>
                                  {item}
                                </button>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </div>
                    <div className="strategy-stats dashboard-strategy-stats">
                      <div>
                        <span>P/L Total</span>
                        <strong className={profit >= 0 ? 'positive' : 'negative'}>{formatCurrency(profit)}</strong>
                      </div>
                      <div>
                        <span>Operaciones</span>
                        <strong>{ops.length}</strong>
                      </div>
                      <div>
                        <span>Win Rate</span>
                        <strong>{winRate}%</strong>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
        </div>
        )
      ) : (
        selectedAccountId ? (
          <section className="strategy-page">
            {selectedAccount && selectedAccountMetrics ? (
              <>
                {(() => {
                  const statusColor = getFundingStatusColor(selectedAccount.status)
                  return (
                <div className="strategy-page-header">
                  <div className="strategy-page-title-row">
                    <button className="strategy-back-button" onClick={() => setSelectedAccountId(null)}>
                      <span className="strategy-back-icon" aria-hidden="true">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
                          <path d="m15 18-6-6 6-6" />
                        </svg>
                      </span>
                      <span>Volver</span>
                    </button>
                    <div className="strategy-page-title-block">
                      <strong className="strategy-page-title">{selectedAccount.name}</strong>
                      <div className="strategy-page-meta">
                        <span>{selectedAccount.firmName} · {formatDate(selectedAccount.purchaseDate)}</span>
                        <span
                          className="strategy-page-badge"
                          style={{
                            background: hexToRgba(statusColor, 0.16),
                            color: statusColor,
                            borderColor: hexToRgba(statusColor, 0.34),
                          }}
                        >
                          {formatFundingStatus(selectedAccount.status)}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="strategy-page-actions account-quick-actions">
                    {selectedAccount.websiteUrl ? (
                      <button className="button-secondary" onClick={() => window.open(selectedAccount.websiteUrl, '_blank', 'noopener,noreferrer')}>
                        Abrir web
                      </button>
                    ) : null}
                    <button className="button-primary" onClick={() => openEditAccountModal(selectedAccount)}>Editar cuenta</button>
                  </div>
                </div>
                  )
                })()}

                <div className="overview-grid account-detail-overview">
                  <article className="stat-card">
                    <span>Coste del examen</span>
                    <strong className="negative">{formatMoney(-selectedAccount.examCost, selectedAccount.currency ?? 'EUR')}</strong>
                  </article>
                  <article className="stat-card positive">
                    <span>Total retirado</span>
                    <strong>{formatMoney(selectedAccountMetrics.totalWithdrawn, selectedAccount.currency ?? 'EUR')}</strong>
                  </article>
                  <article className={`stat-card ${selectedAccountMetrics.netProfit >= 0 ? 'positive' : 'gold'}`}>
                    <span>Beneficio neto</span>
                    <strong>{formatMoney(selectedAccountMetrics.netProfit, selectedAccount.currency ?? 'EUR')}</strong>
                  </article>
                  <article className="stat-card purple">
                    <span>Capital inicial</span>
                    <strong>{formatMoney(selectedAccount.initialCapital, selectedAccount.currency ?? 'EUR')}</strong>
                  </article>
                  <article className="stat-card">
                    <span>Número de retiros</span>
                    <strong>{selectedAccountMetrics.withdrawalCount}</strong>
                  </article>
                  <article className="stat-card">
                    <span>Días hasta estado actual</span>
                    <strong>{selectedAccountMetrics.daysToStatus == null ? '—' : `${selectedAccountMetrics.daysToStatus} días`}</strong>
                  </article>
                  <article className="stat-card">
                    <span>Días activa fondeada</span>
                    <strong>{selectedAccountMetrics.fundedActiveDays == null ? '—' : `${selectedAccountMetrics.fundedActiveDays} días`}</strong>
                  </article>
                </div>

                <section className="chart-card account-roi-panel">
                  <div className="chart-header account-chart-header-polished">
                    <div>
                      <h2>Evolución de retiros y beneficio neto</h2>
                      <p>La línea blanca muestra los retiros acumulados. La línea gris muestra los retiros menos los exámenes.</p>
                    </div>
                    <div className="chart-tabs">
                      <button type="button" className="tab active">Gráfico</button>
                      <button type="button" className="tab export-tab" onClick={handleExcelExport}>Exportar Excel</button>
                    </div>
                  </div>
                  <div className="account-chart-legend">
                    <span><i className="legend-dot withdrawn" /> Retiros acumulados</span>
                    <span><i className="legend-dot net" /> Retiros menos exámenes</span>
                  </div>
                  <label className="period-select-shell">
                    <span>Temporalidad</span>
                    <select value={accountPeriod} onChange={(event) => setAccountPeriod(event.target.value as PeriodKey)}>
                      {PERIOD_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </label>
                  <div className="chart-visual">
                    {selectedAccountChartSvg ? (
                      <svg viewBox={`0 0 ${selectedAccountChartSvg.width} ${selectedAccountChartSvg.height}`} className="chart-svg">
                        {selectedAccountChartSvg.yTicks.map((tick) => (
                          <g key={tick.y}>
                            <line x1={selectedAccountChartSvg.padding.left} y1={tick.y} x2={selectedAccountChartSvg.width - selectedAccountChartSvg.padding.right} y2={tick.y} stroke="rgba(148, 163, 184, 0.14)" strokeDasharray="6 8" />
                            <text x={selectedAccountChartSvg.padding.left - 12} y={tick.y + 4} textAnchor="end" fill="rgba(148, 163, 184, 0.72)" fontSize="12">
                              {formatNumber(tick.value)}
                            </text>
                          </g>
                        ))}
                        {selectedAccountChartSvg.xTicks.map((tick) => (
                          <text key={`${tick.label}-${tick.x}`} x={tick.x} y={selectedAccountChartSvg.height - 12} textAnchor="middle" fill="rgba(148, 163, 184, 0.72)" fontSize="12">
                            {tick.label}
                          </text>
                        ))}
                        <path d={selectedAccountChartSvg.withdrawnPath} fill="none" stroke="#7fb3ff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                          <title>Línea blanca: Retiros acumulados</title>
                        </path>
                        <path d={selectedAccountChartSvg.netPath} fill="none" stroke={accentColor} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                          <title>Línea gris: Retiros menos exámenes</title>
                        </path>
                        {selectedAccountChartSvg.withdrawnPoints.map((point) => (
                          <circle key={`withdrawn-${point.x}-${point.label}`} cx={point.x} cy={point.y} r="3.5" fill="#07111f" stroke="#7fb3ff" strokeWidth="2">
                            <title>{`${point.label} · Retiros acumulados: ${formatNumber(point.value)}`}</title>
                          </circle>
                        ))}
                        {selectedAccountChartSvg.netPoints.map((point) => (
                          <circle key={`net-${point.x}-${point.label}`} cx={point.x} cy={point.y} r="3.5" fill="#07111f" stroke={accentColor} strokeWidth="2">
                            <title>{`${point.label} · Retiros menos exámenes: ${formatNumber(point.value)}`}</title>
                          </circle>
                        ))}
                      </svg>
                    ) : (
                      <div className="chart-empty">Todavía no hay retiros registrados.</div>
                    )}
                  </div>
                  <div className="account-chart-series-note">La línea blanca muestra los retiros acumulados. La línea gris muestra los retiros menos los exámenes.</div>
                </section>

                <div className="account-simple-grid">
                  <article className="chart-card account-detail-card account-full-section account-access-section">
                    <div className="chart-header account-detail-header">
                      <div className="account-detail-title-row">
                        <span className="account-detail-icon account-detail-icon-access" aria-hidden="true">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="4" y="10" width="16" height="10" rx="2" />
                            <path d="M8 10V7a4 4 0 0 1 8 0v3" />
                            <path d="M12 14v2" />
                          </svg>
                        </span>
                        <div>
                          <span className="account-detail-kicker">Información privada</span>
                        <h2>Datos de acceso</h2>
                        <p>Toda la información necesaria para entrar rápidamente en tu cuenta.</p>
                        </div>
                      </div>
                      <button
                        type="button"
                        className={showAccountAccessInfo ? 'button-secondary account-access-toggle active' : 'button-secondary account-access-toggle'}
                        aria-expanded={showAccountAccessInfo}
                        onClick={() => setShowAccountAccessInfo((current) => !current)}
                      >
                        {showAccountAccessInfo ? 'Ocultar acceso' : 'Acceso privado'}
                      </button>
                    </div>
                    <div className="account-facts-grid">
                      <div><span>Empresa</span><strong>{selectedAccount.firmName}</strong></div>
                      <div><span>Estado</span><strong>{formatFundingStatus(selectedAccount.status)}</strong></div>
                      <div><span>Fecha de compra</span><strong>{formatDate(selectedAccount.purchaseDate)}</strong></div>
                      <div><span>Fecha del último cambio</span><strong>{selectedAccount.statusChangedAt ? formatDate(selectedAccount.statusChangedAt) : 'Sin cambio'}</strong></div>
                      <div><span>Capital inicial</span><strong>{formatMoney(selectedAccount.initialCapital, selectedAccount.currency ?? 'EUR')}</strong></div>
                      <div><span>Coste del examen</span><strong className="negative">{formatMoney(-selectedAccount.examCost, selectedAccount.currency ?? 'EUR')}</strong></div>
                      <div><span>Fecha fondeada</span><strong>{selectedAccount.fundedAt ? formatDate(selectedAccount.fundedAt) : 'Sin fecha'}</strong></div>
                      <div><span>Fecha quemada/suspendida</span><strong>{selectedAccount.suspendedAt ? formatDate(selectedAccount.suspendedAt) : 'Sin fecha'}</strong></div>
                      <div><span>Días hasta estado</span><strong>{selectedAccountMetrics.daysToStatus == null ? '—' : `${selectedAccountMetrics.daysToStatus} días`}</strong></div>
                      <div><span>Días activa fondeada</span><strong>{selectedAccountMetrics.fundedActiveDays == null ? '—' : `${selectedAccountMetrics.fundedActiveDays} días`}</strong></div>
                    </div>
                    {showAccountAccessInfo ? (
                      <div className="account-private-panel">
                        <div>
                          <span>Usuario</span>
                          <strong>{selectedAccount.username || 'No guardado'}</strong>
                        </div>
                        <div>
                          <span>Contraseña</span>
                          <strong>{selectedAccount.password || 'No guardada'}</strong>
                        </div>
                        <div>
                          <span>Plataforma</span>
                          <strong>{selectedAccount.websiteUrl || 'No configurada'}</strong>
                        </div>
                      </div>
                    ) : null}
                  </article>

                  <article className="chart-card account-detail-card account-full-section account-withdrawals-section">
                    <div className="chart-header account-detail-header">
                      <div className="account-detail-title-row">
                        <span className="account-detail-icon account-detail-icon-withdrawals" aria-hidden="true">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M4 7h16" />
                            <path d="M6 7v10a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7" />
                            <path d="M9 12h6" />
                            <path d="m12 15 3-3-3-3" />
                          </svg>
                        </span>
                        <div>
                          <span className="account-detail-kicker">Dinero recuperado</span>
                        <h2>Retiros</h2>
                        <p>Registro de pagos recibidos de esta cuenta.</p>
                        </div>
                      </div>
                      <button className="button-secondary account-section-action" onClick={() => openRegisterWithdrawalModal(selectedAccount)}>Registrar retiro</button>
                    </div>
                    <div className="account-withdrawal-stats">
                      <div><span>Total retiros</span><strong>{selectedAccountMetrics.withdrawalCount}</strong></div>
                      <div><span>Total retirado</span><strong>{formatMoney(selectedAccountMetrics.totalWithdrawn, selectedAccount.currency ?? 'EUR')}</strong></div>
                      <div><span>Coste del examen</span><strong className="negative">{formatMoney(-selectedAccount.examCost, selectedAccount.currency ?? 'EUR')}</strong></div>
                      <div><span>Beneficio neto</span><strong className={selectedAccountMetrics.netProfit >= 0 ? 'positive' : 'negative'}>{formatMoney(selectedAccountMetrics.netProfit, selectedAccount.currency ?? 'EUR')}</strong></div>
                    </div>
                    <div className="strategy-history-list account-withdrawal-list">
                      {selectedAccountWithdrawals.length === 0 ? (
                        <div className="strategy-empty-state">Todavía no has registrado retiros en esta cuenta.</div>
                      ) : selectedAccountWithdrawals.map((withdrawal) => (
                        <div key={withdrawal.id} className="strategy-history-card">
                          <div className="strategy-history-meta">
                            <strong>{formatDate(withdrawal.date)}</strong>
                            <div className="strategy-history-ratio">{withdrawal.notes || 'Sin observaciones'}</div>
                          </div>
                          <div className="strategy-history-side account-withdrawal-side">
                            <div className="strategy-history-profit positive">{formatMoney(withdrawal.amount, withdrawal.currency ?? selectedAccount.currency ?? 'EUR')}</div>
                            <div className="strategy-menu-shell" onClick={(event) => event.stopPropagation()}>
                              <button
                                type="button"
                                className="strategy-menu-button withdrawal-menu-button"
                                aria-label={`Opciones del retiro del ${formatDate(withdrawal.date)}`}
                                onClick={() => setOpenWithdrawalMenuId((current) => current === withdrawal.id ? null : withdrawal.id)}
                              >
                                <span>...</span>
                              </button>
                              {openWithdrawalMenuId === withdrawal.id ? (
                                <div className="strategy-menu withdrawal-menu" onClick={(event) => event.stopPropagation()}>
	                                  <button type="button" className="strategy-menu-item" onClick={() => openEditWithdrawalModal(selectedAccount, withdrawal)}>
	                                    Modificar retiro
	                                  </button>
	                                  <button type="button" className="strategy-menu-item danger" onClick={() => void deleteWithdrawal(selectedAccount, withdrawal)}>
	                                    Eliminar retiro
	                                  </button>
	                                </div>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </article>
                </div>
              </>
            ) : (
              <div className="chart-card">No se encontró la cuenta seleccionada.</div>
            )}
          </section>
        ) : (
          <>
            <section className="section-header dashboard-header">
              <div className="dashboard-heading">
                <h1>Control de Cuentas</h1>
                <p>Controla la inversión en cuentas de fondeo y el dinero recuperado mediante retiros.</p>
              </div>
              <div className="dashboard-header-action">
                <button type="button" className="button-primary dashboard-create-button" onClick={openCreateAccountModal}>
                  + Nueva Cuenta
                </button>
              </div>
            </section>

            <div className="dashboard-shell">
              <section className="chart-card dashboard-hero-panel account-dashboard-hero-panel">
                <div className="chart-header dashboard-chart-header">
                  <div>
                    <h2>Resumen global de cuentas</h2>
                    <p>Inversión, retiros y beneficio neto total del módulo.</p>
                  </div>
                  <div className="chart-tabs dashboard-chart-tabs">
                    <button type="button" className="tab active">Gráfico</button>
                    <button type="button" className="tab export-tab" onClick={handleExcelExport}>Exportar Excel</button>
                  </div>
                </div>
                <section className="overview-grid dashboard-overview-grid account-dashboard-grid">
                  <article className="stat-card dashboard-stat-card">
                    <span className="dashboard-stat-icon blue" aria-hidden="true">#</span>
                    <div>
                      <span>Total de cuentas</span>
                      <strong>{accountOverview.totalAccounts}</strong>
                    </div>
                  </article>
                  <article className="stat-card dashboard-stat-card">
                    <span className="dashboard-stat-icon blue" aria-hidden="true">↳</span>
                    <div>
                      <span>Cuentas activas</span>
                      <strong>{accountOverview.activeAccounts}</strong>
                    </div>
                  </article>
                  <article className="stat-card positive dashboard-stat-card">
                    <span className="dashboard-stat-icon green" aria-hidden="true">✓</span>
                    <div>
                      <span>Cuentas fondeadas</span>
                      <strong>{accountOverview.fundedAccounts}</strong>
                    </div>
                  </article>
                  <article className="stat-card dashboard-stat-card">
                    <span className="dashboard-stat-icon" aria-hidden="true" style={{ color: '#ff6b7f', background: 'rgba(255, 107, 127, 0.12)' }}>✕</span>
                    <div>
                      <span>Total quemadas</span>
                      <strong>{accountOverview.burnedAccounts}</strong>
                    </div>
                  </article>
                  <article className="stat-card purple dashboard-stat-card">
                    <span className="dashboard-stat-icon purple" aria-hidden="true">€</span>
                    <div>
                      <span>Invertido en exámenes</span>
                      <strong>{formatNumber(accountOverview.examInvestment)}</strong>
                    </div>
                  </article>
                  <article className="stat-card positive dashboard-stat-card">
                    <span className="dashboard-stat-icon green" aria-hidden="true">↗</span>
                    <div>
                      <span>Total retirado</span>
                      <strong>{formatNumber(accountOverview.totalWithdrawn)}</strong>
                    </div>
                  </article>
                  <article className={`stat-card dashboard-stat-card ${accountOverview.totalNetProfit >= 0 ? 'positive' : 'gold'}`}>
                    <span className="dashboard-stat-icon gold" aria-hidden="true">✦</span>
                    <div>
                      <span>Beneficio neto total</span>
                      <strong>{formatCurrency(accountOverview.totalNetProfit)}</strong>
                    </div>
                  </article>
                  <article className="stat-card dashboard-stat-card">
                    <span className="dashboard-stat-icon blue" aria-hidden="true">◎</span>
                    <div>
                      <span>Capital total</span>
                      <strong>{formatNumber(accountOverview.totalManagedCapital)}</strong>
                    </div>
                  </article>
                </section>
                <div className="account-chart-legend">
                  <span><i className="legend-dot withdrawn" /> Retiros acumulados</span>
                  <span><i className="legend-dot net" /> Retiros menos exámenes</span>
                </div>
                <label className="period-select-shell dashboard-period-select">
                  <span>Temporalidad</span>
                  <select value={accountPeriod} onChange={(event) => setAccountPeriod(event.target.value as PeriodKey)}>
                    {PERIOD_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </label>
                <div className="chart-visual dashboard-chart-visual">
                  {accountChartSvg ? (
                    <svg viewBox={`0 0 ${accountChartSvg.width} ${accountChartSvg.height}`} className="chart-svg">
                      {accountChartSvg.yTicks.map((tick) => (
                        <g key={tick.y}>
                          <line x1={accountChartSvg.padding.left} y1={tick.y} x2={accountChartSvg.width - accountChartSvg.padding.right} y2={tick.y} stroke="rgba(148, 163, 184, 0.16)" strokeDasharray="4 7" />
                          <text x={accountChartSvg.padding.left - 12} y={tick.y + 4} textAnchor="end" fill="rgba(148, 163, 184, 0.62)" fontSize="12">
                            {Math.round(tick.value)}
                          </text>
                        </g>
                      ))}
                      {accountChartSvg.xTicks.map((tick) => (
                        <text key={`${tick.label}-${tick.x}`} x={tick.x} y={accountChartSvg.height - 12} textAnchor="middle" fill="rgba(148, 163, 184, 0.62)" fontSize="12">
                          {tick.label}
                        </text>
                      ))}
                      <path d={accountChartSvg.withdrawnPath} fill="none" stroke="#7fb3ff" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
                        <title>Línea blanca: Retiros acumulados</title>
                      </path>
                      <path d={accountChartSvg.netPath} fill="none" stroke={accentColor} strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
                        <title>Línea gris: Retiros menos exámenes</title>
                      </path>
                      {accountChartSvg.withdrawnPoints.map((point) => (
                        <circle key={`global-withdrawn-${point.x}-${point.label}`} cx={point.x} cy={point.y} r="3.5" fill="#07111f" stroke="#7fb3ff" strokeWidth="2">
                          <title>{`${point.label} · Retiros acumulados: ${formatNumber(point.value)}`}</title>
                        </circle>
                      ))}
                      {accountChartSvg.netPoints.map((point) => (
                        <circle key={`global-net-${point.x}-${point.label}`} cx={point.x} cy={point.y} r="3.5" fill="#07111f" stroke={accentColor} strokeWidth="2">
                          <title>{`${point.label} · Retiros menos exámenes: ${formatNumber(point.value)}`}</title>
                        </circle>
                      ))}
                    </svg>
                  ) : (
                    <div className="chart-empty">Crea cuentas para empezar a seguir su evolución.</div>
                  )}
                </div>
                <div className="account-chart-series-note">Blanca = retiros acumulados · Gris = retiros menos exámenes comprados</div>
              </section>

              <section className="strategy-calendar-card account-status-calendar">
                  <div className="strategy-calendar-header">
                    <strong>Calendario de estados · {visibleCalendarMonthLabel}</strong>
                    <div className="calendar-nav-actions">
                      <button type="button" className="calendar-nav-button" onClick={() => changeCalendarMonth(-1)} aria-label="Mes anterior">‹</button>
                      <button type="button" className="calendar-nav-button calendar-today-button" onClick={resetCalendarMonth}>Hoy</button>
                      <button type="button" className="calendar-nav-button" onClick={() => changeCalendarMonth(1)} aria-label="Mes siguiente">›</button>
                    </div>
                  </div>
                  <div className="strategy-calendar-grid">
                    {calendarWeekdays.map((dayName) => (
                      <div key={`account-weekday-${dayName}`} className="strategy-calendar-weekday">{dayName}</div>
                    ))}
                    {Array.from({ length: visibleCalendarLeadingBlanks }).map((_, index) => (
                      <div key={`account-blank-${index}`} className="strategy-calendar-blank" aria-hidden="true" />
                    ))}
                    {Array.from({ length: visibleCalendarDays }).map((_, i) => {
                      const day = i + 1
                      const dayStr = `${visibleCalendarYear}-${String(visibleCalendarMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
                      const dayEvents = accountStatusEvents.filter((event) => event.date === dayStr)
                      const cls = dayEvents.length
                        ? dayEvents.some((event) => event.tone === 'negative')
                          ? 'negative'
                          : dayEvents.some((event) => event.tone === 'positive') ? 'positive' : 'neutral'
                        : ''
                      return (
                        <button
                          key={day}
                          type="button"
                          className={`strategy-calendar-day ${cls} ${accountCalendarFocus === dayStr ? 'selected' : ''}`}
                          onClick={() => setAccountCalendarFocus(dayStr)}
                          aria-label={`Ver eventos de cuentas del ${formatDate(dayStr)}`}
                        >
                          <div className="strategy-calendar-day-number">{day}</div>
                          {dayEvents.length > 0 ? (
                            <div className="account-calendar-day-events">
                              {dayEvents.slice(0, 3).map((event) => {
                                const eventClass = event.label.toLowerCase().replace(/\s+/g, '-')
                                return (
                                  <span key={event.id} className={`account-calendar-event-pill ${event.tone} event-${eventClass}`}>
                                    <b>{event.label}</b>
                                    {typeof event.amount === 'number' ? <small>{formatMoney(event.amount, event.account.currency ?? 'EUR')}</small> : null}
                                  </span>
                                )
                              })}
                              {dayEvents.length > 3 ? <span className="account-calendar-event-more">+{dayEvents.length - 3}</span> : null}
                            </div>
                          ) : null}
                        </button>
                      )
                    })}
                  </div>
                  <div className="strategy-history-section account-calendar-results">
                    <div className="strategy-history-title-row">
                      <h3>{accountCalendarFocus ? `Eventos del ${formatDate(accountCalendarFocus)}` : 'Eventos de cuentas'}</h3>
                      <div className="account-events-actions">
                        {accountCalendarFocus ? (
                          <button type="button" className="button-secondary account-calendar-clear" onClick={() => setAccountCalendarFocus(null)}>
                            Todos los eventos
                          </button>
                        ) : null}
                        <button
                          type="button"
                          className="button-secondary account-calendar-clear"
                          onClick={() => setShowAccountEvents((current) => !current)}
                        >
                          {showAccountEvents ? 'Ocultar eventos' : `Ver eventos (${filteredAccountStatusEvents.length})`}
                        </button>
                      </div>
                    </div>
                    {showAccountEvents ? (
                    <div className="strategy-history-list account-events-dropdown">
                      {filteredAccountStatusEvents.length === 0 ? (
                        <div className="strategy-empty-state">
                          {accountCalendarFocus ? 'No hay cuentas fondeadas, aprobadas o quemadas en esta fecha.' : 'Aún no hay eventos de estado en cuentas.'}
                        </div>
                      ) : filteredAccountStatusEvents.map((event) => {
                        const statusColor = event.tone === 'negative'
                          ? '#ff6678'
                          : event.tone === 'positive' ? '#5df2a4' : '#79aaff'
                        const eventClass = event.label.toLowerCase().replace(/\s+/g, '-')
                        return (
                          <button
                            key={event.id}
                            type="button"
                            className="strategy-history-card account-calendar-event-card"
                            onClick={() => {
                              setSelectedAccountId(event.account.id)
                            }}
                          >
                            <div className="strategy-history-meta">
                              <strong>{event.account.name}</strong>
                              <div>{event.account.firmName} · {formatDate(event.date)}</div>
                              <div className={`strategy-history-ratio event-${eventClass}`}>{event.label}</div>
                            </div>
                            <div className="strategy-history-side">
                              <div className={`strategy-history-profit ${event.tone} event-${eventClass}`} style={{ color: statusColor }}>
                                {typeof event.amount === 'number' ? formatMoney(event.amount, event.account.currency ?? 'EUR') : event.label}
                              </div>
                            </div>
                          </button>
                        )
                      })}
                    </div>
                    ) : null}
                  </div>
                </section>

              <section className="dashboard-strategies-section">
                <div className="dashboard-strategies-grid">
                  {data.accounts.length === 0 ? (
                    <div className="strategy-empty-state">Aún no has creado ninguna cuenta de fondeo.</div>
                  ) : data.accounts
                    .slice()
                    .sort((a, b) => new Date(b.updatedAt ?? b.createdAt).getTime() - new Date(a.updatedAt ?? a.createdAt).getTime())
                    .map((account) => {
                      const accountMetrics = accountMetricsById[account.id]
                      const statusColor = getFundingStatusColor(account.status)
                      return (
                        <div
                          key={account.id}
                          className="strategy-card dashboard-strategy-card account-card"
                          style={{ '--strategy-color': statusColor } as CSSProperties}
                          onClick={() => {
                            setSelectedAccountId(account.id)
                          }}
                        >
                          <div className="strategy-card-header">
                            <div className="dashboard-strategy-title-block">
                              <div className="dashboard-strategy-name-row">
                                <span
                                  className="dashboard-strategy-icon"
                                  aria-hidden="true"
                                  style={{
                                    background: hexToRgba(statusColor, 0.14),
                                    color: statusColor,
                                    borderColor: hexToRgba(statusColor, 0.34),
                                  }}
                                >
                                  ◌
                                </span>
                                <strong>{account.name}</strong>
                              </div>
                              <small>{account.firmName} · {formatFundingStatus(account.status)}</small>
                            </div>
                            <div className="strategy-card-controls">
                              <span className="strategy-badge" style={{ background: hexToRgba(statusColor, 0.16), color: statusColor }}>{formatFundingStatus(account.status)}</span>
                              {account.websiteUrl ? (
                                <button
                                  type="button"
                                  className="account-web-button"
                                  onClick={(event) => {
                                    event.stopPropagation()
                                    window.open(account.websiteUrl, '_blank', 'noopener,noreferrer')
                                    setMessage('Abriendo la web de la empresa.')
                                  }}
                                >
                                  Web
                                </button>
                              ) : null}
                              <div className="strategy-menu-shell" onClick={(event) => event.stopPropagation()}>
                                <button
                                  type="button"
                                  className="strategy-menu-button"
                                  aria-label={`Opciones de ${account.name}`}
                                  onClick={() => setOpenAccountMenuId((current) => current === account.id ? null : account.id)}
                                >
                                  <span>⋯</span>
                                </button>
                                {openAccountMenuId === account.id ? (
                                  <div className="strategy-menu" onClick={(event) => event.stopPropagation()}>
                                    {['Editar cuenta', 'Cambiar estado', 'Registrar retiro', 'Duplicar', 'Eliminar'].map((item) => (
                                      <button key={item} type="button" className="strategy-menu-item" onClick={() => void handleAccountMenuAction(item, account)}>
                                        {item}
                                      </button>
                                    ))}
                                  </div>
                                ) : null}
                              </div>
                            </div>
                          </div>
                          <div className="account-card-grid">
                            <div><span>Capital</span><strong>{formatMoney(account.initialCapital, account.currency ?? 'EUR')}</strong></div>
                            <div><span>Coste</span><strong className="negative">{formatMoney(-account.examCost, account.currency ?? 'EUR')}</strong></div>
                            <div><span>Retirado</span><strong>{formatMoney(accountMetrics.totalWithdrawn, account.currency ?? 'EUR')}</strong></div>
                            <div><span>Beneficio neto</span><strong className={accountMetrics.netProfit >= 0 ? 'positive' : 'negative'}>{formatMoney(accountMetrics.netProfit, account.currency ?? 'EUR')}</strong></div>
                            <div><span>Días hasta estado</span><strong>{accountMetrics.daysToStatus == null ? '—' : `${accountMetrics.daysToStatus}d`}</strong></div>
                            <div><span>Retiros</span><strong>{accountMetrics.withdrawalCount}</strong></div>
                          </div>
                        </div>
                      )
                    })}
                </div>
              </section>
            </div>
          </>
        )
      )}

      <footer className="message-bar">
        <p>{isLoading ? 'Cargando...' : message}</p>
      </footer>

      {isSettingsOpen ? (
        <div className="settings-overlay" role="dialog" aria-modal="true" onClick={() => setIsSettingsOpen(false)}>
          <aside className="settings-panel" onClick={(event) => event.stopPropagation()}>
            <div className="settings-panel-header">
              <div>
                <h2>Ajustes</h2>
                <p>Preferencias generales, apariencia y copias de seguridad.</p>
              </div>
              <button type="button" className="close-button" onClick={() => setIsSettingsOpen(false)}>×</button>
            </div>

            <div className="settings-section">
              <span className="settings-section-label">Aplicación</span>
              <label className="settings-field">
                <span>Nombre de la aplicación</span>
                <input value={appNameDraft} onChange={(event) => setAppNameDraft(event.target.value)} placeholder="La Biblia" />
              </label>
              <label className="settings-field">
                <span>Apariencia</span>
                <select value={themeDraft} onChange={(event) => setThemeDraft(event.target.value as 'dark' | 'light')}>
                  <option value="dark">Modo noche · grafito</option>
                  <option value="light">Modo día · papel</option>
                </select>
              </label>
              <label className="settings-field">
                <span>Moneda por defecto</span>
                <select value={defaultCurrencyDraft} onChange={(event) => setDefaultCurrencyDraft(event.target.value as 'EUR' | 'USD')}>
                  <option value="EUR">EUR · euros</option>
                  <option value="USD">USD · dólares</option>
                </select>
              </label>
            </div>

            <div className="settings-section">
              <span className="settings-section-label">Datos</span>
              <div className="settings-action-list">
                <button type="button" className="button-secondary settings-action-button" onClick={handleExcelExport}>Exportar Excel completo</button>
                <button type="button" className="button-secondary settings-action-button" onClick={exportBackup}>Exportar copia JSON</button>
                <button type="button" className="button-secondary settings-action-button" onClick={() => backupInputRef.current?.click()}>Importar copia JSON</button>
                {isElectron ? (
                  <button type="button" className="button-secondary settings-action-button" onClick={async () => {
                    const folder = await window.tradingApp.selectFolder()
                    if (!folder) return
                    await saveData({
                      ...dataRef.current,
                      settings: {
                        ...dataRef.current.settings,
                        dataFolder: folder,
                      },
                    })
                    setMessage('Carpeta de datos actualizada.')
                  }}>Cambiar carpeta de datos</button>
                ) : null}
              </div>
              <div className="settings-folder-note">Guardado actual: {isElectron ? (data.settings.dataFolder ?? 'Carpeta local pendiente de elegir') : storageMode === 'online' ? `Cuenta online · ${user.email}` : `Cuenta local de este navegador · ${user.email}`}</div>
            </div>

            <div className="settings-section">
              <span className="settings-section-label">Cuenta y seguridad</span>
              <div className="settings-folder-note">Sesión activa con {user.email}. {storageMode === 'online' ? 'Tus datos están conectados a una cuenta online.' : 'Modo local: este usuario existe solo en este navegador hasta conectar una base de datos online.'}</div>
              <div className="settings-action-list">
                <button type="button" className="button-secondary settings-action-button" onClick={() => setMessage('Para cambiar contraseña usa “He olvidado mi contraseña” en la pantalla de acceso.')}>Cambiar contraseña</button>
                <button type="button" className="button-secondary settings-action-button" onClick={() => setMessage(storageMode === 'online' ? 'El cambio de correo se hará con confirmación segura.' : 'Para cambiar correo entre dispositivos hay que conectar una base de datos online.')}>Cambiar correo</button>
                <button type="button" className="button-secondary settings-action-button danger-action-button" onClick={() => void signOut()}>Cerrar sesión</button>
              </div>
            </div>

            <div className="settings-section settings-status-section">
              <span className="settings-section-label">Resumen</span>
              <div className="settings-status-grid">
                <div><span>Estrategias</span><strong>{data.strategies.length}</strong></div>
                <div><span>Operaciones</span><strong>{data.operations.length}</strong></div>
                <div><span>Cuentas</span><strong>{data.accounts.length}</strong></div>
                <div><span>Retiros</span><strong>{data.accounts.reduce((sum, account) => sum + account.withdrawals.length, 0)}</strong></div>
              </div>
            </div>

            <div className="settings-panel-footer">
              <button type="button" className="button-secondary" onClick={() => setIsSettingsOpen(false)}>Cancelar</button>
              <button type="button" className="button-primary" onClick={() => void saveSettings()}>Guardar preferencias</button>
            </div>
          </aside>
        </div>
      ) : null}

      {isModalOpen ? (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal-panel operation-modal-panel" data-ai-status={aiStatus} data-has-preview={previewImage ? 'true' : 'false'}>
            <div className="modal-header operation-modal-header">
              <div>
                <h2>Registrar Operación</h2>
              </div>
              <button type="button" className="close-button operation-close-button" onClick={() => { setIsModalOpen(false); setEditingOperationId(null); resetOperationForm(operationForm.strategyId) }}>
                ×
              </button>
            </div>

            <div className="modal-content operation-modal-content">
              <section className="modal-section operation-ai-block">
                <div className="operation-section-head">
                  <div className="operation-headline">
                    <span className="operation-head-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 3a9 9 0 1 0 9 9" />
                      <path d="M12 7v5l3 3" />
                    </svg>
                    </span>
                    <strong>Extracción Automática desde Imagen</strong>
                  </div>
                  <p>Sube una captura de MetaTrader y la IA rellenará los campos automáticamente</p>
                </div>
                <div className="operation-upload-grid">
                  <button type="button" className="operation-upload-card" onClick={openScreenshotPicker} disabled={isAiAnalyzing}>
                    <span className="operation-upload-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 16V4" />
                      <path d="m7 9 5-5 5 5" />
                      <path d="M20 16v3a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-3" />
                    </svg>
                    </span>
                    <span>Subir captura</span>
                  </button>
                  <button type="button" className="operation-upload-card" onClick={openScreenshotPicker} disabled={isAiAnalyzing}>
                    <span className="operation-upload-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M4 7h3l2-3h6l2 3h3v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" />
                      <circle cx="12" cy="13" r="3" />
                    </svg>
                    </span>
                    <span>Tomar foto</span>
                  </button>
                </div>
                {isAiAnalyzing ? (
                  <div className="operation-ai-status operation-ai-status-loading">Analizando operación...</div>
                ) : null}
                {aiStatus ? (
                  <div className="operation-ai-status">{aiStatus}</div>
                ) : null}
                {pendingExtraction ? (
                  <div className="operation-ai-summary">
                    <div className="operation-ai-summary-head">
                      <strong>Resumen de extracción</strong>
                      <span>{pendingExtraction.provider === 'heuristic' ? 'Análisis preliminar' : 'IA verificada'}</span>
                    </div>
                    <div className="operation-ai-summary-grid">
                      {pendingExtraction.fields.map((field) => (
                        <div key={field.key} className={`operation-ai-field operation-ai-field-${field.status}`}>
                          <span>{field.status === 'detected' ? '✓' : '!'}</span>
                          <div>
                            <strong>{field.label}</strong>
                            <p>{field.status === 'missing' ? 'No detectado / Revisión manual' : field.value}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                    {pendingExtraction.warnings.length > 0 ? (
                      <div className="operation-ai-warning">
                        {pendingExtraction.warnings.join(' · ')}
                      </div>
                    ) : null}
                    {pendingExtraction.rawText ? (
                      <details className="operation-ai-debug">
                        <summary>Ver texto detectado (debug)</summary>
                        <pre>{pendingExtraction.rawText}</pre>
                      </details>
                    ) : null}
                    <div className="operation-ai-actions">
                      <button type="button" className="button-secondary" onClick={() => { setPendingExtraction(null); setAiStatus('Resumen descartado.'); }}>
                        Descartar análisis
                      </button>
                      <button type="button" className="button-primary" onClick={applyPendingExtraction}>
                        Confirmar y rellenar formulario
                      </button>
                    </div>
                  </div>
                ) : null}
              </section>

              <div className="operation-toggle-row">
                <button type="button" className={operationForm.side === 'long' ? 'operation-toggle operation-toggle-active' : 'operation-toggle'} onClick={() => handleFormChange('side', 'long')}>
                  <span className="operation-toggle-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m4 14 5-5 4 4 7-7" />
                    <path d="M14 6h6v6" />
                    </svg>
                  </span>
                  <span>Compra (Long)</span>
                </button>
                <button type="button" className={operationForm.side === 'short' ? 'operation-toggle operation-toggle-short-active' : 'operation-toggle'} onClick={() => handleFormChange('side', 'short')}>
                  <span className="operation-toggle-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m4 10 5 5 4-4 7 7" />
                    <path d="M14 18h6v-6" />
                    </svg>
                  </span>
                  <span>Venta (Short)</span>
                </button>
              </div>

              <div className="operation-field-grid operation-field-grid-2">
                <label className="operation-field">
                  <span>Hora de entrada *</span>
                  <input type="datetime-local" value={operationForm.date} onChange={(event) => handleFormChange('date', event.target.value)} />
                </label>
                <label className="operation-field">
                  <span>Hora de salida</span>
                  <input type="datetime-local" value={(operationForm as any).exitDate || ''} onChange={(event) => handleExtendedChange('exitDate', event.target.value)} />
                </label>
              </div>

              <div className="operation-field-grid operation-field-grid-3">
                <label className="operation-field">
                  <span>Precio entrada</span>
                  <input type="number" step="0.0001" value={operationForm.entry} onChange={(event) => handleFormChange('entry', event.target.value)} />
                </label>
                <label className="operation-field">
                  <span>Precio salida</span>
                  <input type="number" step="0.0001" value={operationForm.exit} onChange={(event) => handleFormChange('exit', event.target.value)} />
                </label>
                <label className="operation-field">
                  <span>Tamaño posición</span>
                  <input type="number" step="0.01" value={operationForm.size} onChange={(event) => handleFormChange('size', event.target.value)} />
                </label>
              </div>

              <section className="operation-result-section">
                <strong>Resultado de la operación</strong>
                <div className="operation-field-grid operation-field-grid-3">
                  <button type="button" className={operationForm.result === 'win' ? 'operation-result-button operation-result-button-active operation-result-button-win' : 'operation-result-button'} onClick={() => { handleFormChange('result', 'win'); handleExtendedChange('breakEven', false) }}>
                    Ganancia
                  </button>
                  <button type="button" className={operationForm.result === 'loss' ? 'operation-result-button operation-result-button-active operation-result-button-loss' : 'operation-result-button'} onClick={() => { handleFormChange('result', 'loss'); handleExtendedChange('breakEven', false) }}>
                    Pérdida
                  </button>
                  <button type="button" className={operationForm.result === 'breakeven' ? 'operation-result-button operation-result-button-active operation-result-button-breakeven' : 'operation-result-button'} onClick={() => { handleFormChange('result', 'breakeven'); handleExtendedChange('breakEven', true) }}>
                    Break Even
                  </button>
                </div>
              </section>

              <div className="operation-field-grid operation-field-grid-2">
                <label className="operation-field">
                  <span>Ganancia / Pérdida *</span>
                  <input type="number" value={(operationForm as any).plValue || ''} onChange={(e) => handleExtendedChange('plValue', e.target.value)} placeholder={formatNumber(displayedPlValue)} />
                </label>
                <label className="operation-field">
                  <span>Ganancia / Pérdida (%)</span>
                  <input type="number" value={(operationForm as any).plPercent || ''} onChange={(e) => handleExtendedChange('plPercent', e.target.value)} placeholder={formatNumber(displayedPlPercent)} />
                </label>
              </div>

              <label className="operation-field">
                <span>Moneda del resultado</span>
                <select value={(operationForm as any).benefitCurrency || 'EUR'} onChange={(e) => handleExtendedChange('benefitCurrency', e.target.value)}>
                  <option value="EUR">Euros (EUR)</option>
                  <option value="USD">Dólares (USD)</option>
                </select>
              </label>

              <div className="operation-field-grid operation-field-grid-3">
                <label className="operation-field">
                  <span>Ratio R/R</span>
                  <input value={(operationForm as any).rrRatio || ''} onChange={(e) => handleExtendedChange('rrRatio', e.target.value)} placeholder={displayedRrRatio} />
                </label>
                <label className="operation-field">
                  <span>Stop Loss</span>
                  <input type="number" step="0.0001" value={(operationForm as any).stopLoss || ''} onChange={(e) => handleExtendedChange('stopLoss', e.target.value)} />
                </label>
                <label className="operation-field">
                  <span>Take Profit</span>
                  <input type="number" step="0.0001" value={(operationForm as any).takeProfit || ''} onChange={(e) => handleExtendedChange('takeProfit', e.target.value)} />
                </label>
              </div>

              <div className="operation-field-grid operation-field-grid-2">
                <label className="operation-field">
                  <span>Tipo de setup</span>
                  <input value={(operationForm as any).setupType || ''} onChange={(e) => handleExtendedChange('setupType', e.target.value)} placeholder="Ruptura de resistencia, pullback..." />
                </label>
                <label className="operation-field">
                  <span>Estado emocional</span>
                  <select value={(operationForm as any).emotionalState || 'Neutral'} onChange={(e) => handleExtendedChange('emotionalState', e.target.value)}>
                    <option>Neutral</option>
                    <option>Calm</option>
                    <option>Nervous</option>
                    <option>Overconfident</option>
                    <option>Distracted</option>
                  </select>
                </label>
              </div>

              <div className="operation-plan-row">
                <strong>¿Seguiste el plan de trading?</strong>
                <label className="operation-switch" aria-label="Seguiste el plan de trading">
                  <input type="checkbox" checked={Boolean((operationForm as any).followedPlan)} onChange={(e) => handleExtendedChange('followedPlan', e.target.checked)} />
                  <span className="operation-switch-track" />
                </label>
              </div>

              <section className="operation-photo-block">
                <div className="operation-section-head">
                  <div className="operation-headline">
                    <span className="operation-head-icon operation-photo-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="3" width="18" height="18" rx="2" />
                      <circle cx="8.5" cy="8.5" r="1.5" />
                      <path d="m21 15-5-5L5 21" />
                    </svg>
                    </span>
                    <strong>Fototeca (captura para tu análisis)</strong>
                  </div>
                  <p>Guarda una captura del gráfico para revisarla tú manualmente más tarde</p>
                </div>
                <div className="operation-upload-grid operation-upload-grid-photo">
                  <button type="button" className="operation-photo-card" onClick={openScreenshotPicker} disabled={isAiAnalyzing}>
                    <span className="operation-upload-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="3" width="18" height="18" rx="2" />
                      <circle cx="8.5" cy="8.5" r="1.5" />
                      <path d="m21 15-5-5L5 21" />
                    </svg>
                    </span>
                    <span>Subir imagen</span>
                  </button>
                  <button type="button" className="operation-photo-card" onClick={openScreenshotPicker} disabled={isAiAnalyzing}>
                    <span className="operation-upload-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M4 7h3l2-3h6l2 3h3v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" />
                      <circle cx="12" cy="13" r="3" />
                    </svg>
                    </span>
                    <span>Tomar foto</span>
                  </button>
                </div>
              </section>

              <label className="operation-field operation-notes-field">
                <span>Notas personales</span>
                <textarea value={(operationForm as any).comments || operationForm.notes} onChange={(event) => { handleFormChange('comments', event.target.value); handleFormChange('notes', event.target.value) }} placeholder="Anota cualquier observación sobre esta operación..." />
              </label>

              <div className="modal-footer operation-modal-footer">
                <button type="button" className="operation-cancel-button" onClick={() => { setIsModalOpen(false); setEditingOperationId(null); resetOperationForm(operationForm.strategyId) }}>
                  Cancelar
                </button>
                <button type="button" className="operation-save-button" onClick={addOperation}>
                  Guardar Operación
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {isAccountModalOpen ? (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal-panel" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h2>{editingAccountId ? 'Editar Cuenta' : 'Nueva Cuenta'}</h2>
                <p>Registra y controla una cuenta de fondeo manteniendo el mismo flujo premium del resto de la aplicación.</p>
              </div>
              <button type="button" className="close-button" onClick={closeAccountModal}>×</button>
            </div>

            <div className="modal-content">
              <div className="row-two">
                <label>
                  Nombre de la cuenta *
                  <input value={accountForm.name} onChange={(event) => handleAccountFormChange('name', event.target.value)} placeholder="Ej: FTMO 100K" />
                </label>
                <label>
                  Empresa de fondeo *
                  <input value={accountForm.firmName} onChange={(event) => handleAccountFormChange('firmName', event.target.value)} placeholder="Apex, TopStep, MyFundedFutures..." />
                </label>
              </div>

              <div className="row-two">
                <label>
                  Fecha de compra
                  <input type="date" value={accountForm.purchaseDate} onChange={(event) => handleAccountFormChange('purchaseDate', event.target.value)} />
                </label>
                <label
                  className="account-status-field"
                  style={{ '--account-status-color': getFundingStatusColor(accountForm.status) } as CSSProperties}
                >
                  Estado
                  <select value={accountForm.status} onChange={(event) => handleAccountFormChange('status', event.target.value)}>
                    <option value="evaluation">En evaluación</option>
                    <option value="funded">Fondeada</option>
                    <option value="suspended">Quemada</option>
                  </select>
                  <span className="account-status-preview">{formatFundingStatus(accountForm.status)}</span>
                </label>
              </div>

              {accountForm.status !== 'evaluation' ? (
                <div className="row-two">
                  <label>
                    Fecha del cambio de estado
                    <input type="date" value={accountForm.statusChangedDate} onChange={(event) => handleAccountFormChange('statusChangedDate', event.target.value)} />
                  </label>
                  {accountForm.status === 'funded' || accountForm.status === 'suspended' ? (
                    <label>
                        Fecha fondeada opcional
                      <input type="date" value={accountForm.fundedDate} onChange={(event) => handleAccountFormChange('fundedDate', event.target.value)} />
                    </label>
                  ) : (
                    <div className="account-form-help">Esta fecha se usa para calcular los días hasta el estado actual.</div>
                  )}
                </div>
              ) : null}

              {accountForm.status === 'suspended' ? (
                <div className="row-two">
                  <label>
                    Fecha en la que se quemó o suspendió
                    <input type="date" value={accountForm.suspendedDate} onChange={(event) => handleAccountFormChange('suspendedDate', event.target.value)} />
                  </label>
                  <div className="account-form-help">La fecha fondeada es opcional. Si nunca llegó a fondearse, déjala vacía.</div>
                </div>
              ) : null}

              <div className="row-two">
                <label>
                  Enlace directo a la web
                  <input value={accountForm.websiteUrl} onChange={(event) => handleAccountFormChange('websiteUrl', event.target.value)} placeholder="https://..." />
                </label>
                <label>
                  Capital inicial
                  <input type="number" value={accountForm.initialCapital} onChange={(event) => handleAccountFormChange('initialCapital', event.target.value)} />
                </label>
              </div>

              <div className="row-two">
                <label>
                  Coste del examen
                  <input type="number" value={accountForm.examCost} onChange={(event) => handleAccountFormChange('examCost', event.target.value)} />
                </label>
                <label>
                  Moneda
                  <select value={accountForm.currency} onChange={(event) => handleAccountFormChange('currency', event.target.value)}>
                    <option value="EUR">Euros (EUR)</option>
                    <option value="USD">Dólares (USD)</option>
                  </select>
                </label>
              </div>

              <div className="row-two">
                <label>
                  Usuario
                  <input value={accountForm.username} onChange={(event) => handleAccountFormChange('username', event.target.value)} placeholder="usuario@propfirm" />
                </label>
                <label>
                  Contraseña
                  <input type="password" value={accountForm.password} onChange={(event) => handleAccountFormChange('password', event.target.value)} placeholder="Contraseña de acceso" />
                </label>
              </div>
              <div className="account-form-help">Los límites de pérdida ya no se piden al crear cuentas. Si necesitas editarlos más adelante, podemos meterlos en un apartado avanzado.</div>

              <div className="modal-footer">
                <button type="button" className="button-secondary" onClick={closeAccountModal}>Cancelar</button>
                <button type="button" className="button-primary" onClick={() => void saveAccount()}>{editingAccountId ? 'Guardar cambios' : 'Crear cuenta'}</button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {isWithdrawalModalOpen ? (
        <div className="modal-overlay" role="dialog" aria-modal="true" onClick={closeWithdrawalModal}>
          <div className="modal-panel" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h2>{editingWithdrawalId ? 'Modificar Retiro' : 'Registrar Retiro'}</h2>
                <p>{editingWithdrawalId ? 'Corrige el pago seleccionado y la rentabilidad se actualizará automáticamente.' : 'Añade un pago recibido para actualizar automáticamente la rentabilidad de la cuenta.'}</p>
              </div>
              <button type="button" className="close-button" onClick={closeWithdrawalModal}>×</button>
            </div>

            <div className="modal-content">
              <div className="row-two">
                <label>
                  Fecha
                  <input type="date" value={withdrawalForm.date} onChange={(event) => handleWithdrawalFormChange('date', event.target.value)} />
                </label>
                <label>
                  Importe retirado
                  <input type="number" value={withdrawalForm.amount} onChange={(event) => handleWithdrawalFormChange('amount', event.target.value)} />
                </label>
              </div>
              <div className="row-two">
                <label>
                  Moneda
                  <select value={withdrawalForm.currency} onChange={(event) => handleWithdrawalFormChange('currency', event.target.value)}>
                    <option value="EUR">Euros (EUR)</option>
                    <option value="USD">Dólares (USD)</option>
                  </select>
                </label>
              </div>
              <div className="row-two">
                <label className="full-width">
                  Observaciones
                  <textarea value={withdrawalForm.notes} onChange={(event) => handleWithdrawalFormChange('notes', event.target.value)} placeholder="Primer payout, pago parcial, observaciones..." />
                </label>
              </div>
              <div className="modal-footer">
                <button type="button" className="button-secondary" onClick={closeWithdrawalModal}>Cancelar</button>
                <button type="button" className="button-primary" onClick={() => void saveWithdrawal()}>{editingWithdrawalId ? 'Guardar cambios' : 'Guardar retiro'}</button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {isStrategyModalOpen ? (
        <div className="modal-overlay" role="dialog" aria-modal="true" onClick={closeStrategyModal}>
          <div className="modal-panel" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h2>{editingStrategyId ? 'Editar Estrategia' : 'Nueva Estrategia'}</h2>
                <p>{editingStrategyId ? 'Actualiza los datos base de la estrategia y toda la aplicación se sincronizará automáticamente.' : 'Completa los datos base para crear una nueva estrategia independiente.'}</p>
              </div>
              <button type="button" className="close-button" onClick={closeStrategyModal}>×</button>
            </div>

            <div className="modal-content">
              <label>
                Nombre de la estrategia *
                <input value={strategyName} onChange={(e) => setStrategyName(e.target.value)} placeholder="Ej: Scalping EUR/USD" />
              </label>

              <label>
                Descripción
                <textarea value={strategyDescription} onChange={(e) => setStrategyDescription(e.target.value)} placeholder="Describe brevemente tu estrategia..." />
              </label>

              <div>
                <div style={{ marginBottom: 8, color: '#9ca5bf' }}>Imagen de referencia</div>
                <div className="image-dropbox" onClick={async () => {
                  if (!isElectron) {
                    newStrategyImageRef.current?.click()
                    return
                  }
                  const imagePath = await window.tradingApp.selectImage()
                  if (!imagePath) return
                  try {
                    const saved = await window.tradingApp.copyImage({ imagePath, folder: data.settings.dataFolder })
                    setNewStrategyImage(`file://${saved.path}`)
                  } catch {
                    setMessage('No se pudo guardar la imagen en la carpeta local.')
                  }
                }}>
                  {newStrategyImage ? (
                    <img src={newStrategyImage} alt="preview" className="image-preview" />
                  ) : (
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: 20 }}>📷</div>
                      <div style={{ marginTop: 8 }}>Haz click para subir una imagen</div>
                    </div>
                  )}
                </div>
                <input ref={newStrategyImageRef} style={{ display: 'none' }} type="file" accept="image/*" onChange={async (e) => {
                  const file = e.target.files?.[0]
                  if (!file) return
                  setNewStrategyImage(URL.createObjectURL(file))
                }} />
              </div>

              <div className="row-two">
                <label>
                  Mercado
                  <input value={newStrategyMarket} onChange={(e) => setNewStrategyMarket(e.target.value)} placeholder="Forex, Índices, Crypto..." />
                </label>
                <label>
                  Activo
                  <input value={newStrategyAsset} onChange={(e) => setNewStrategyAsset(e.target.value)} placeholder="EUR/USD, SP500..." />
                </label>
              </div>

              <div className="row-two">
                <label>
                  Temporalidad
                  <select value={newStrategyTimeframe} onChange={(e) => setNewStrategyTimeframe(e.target.value)}>
                    <option>1m</option>
                    <option>5m</option>
                    <option>15m</option>
                    <option>1h</option>
                    <option>4h</option>
                    <option>D</option>
                    <option>W</option>
                  </select>
                </label>
                <label>
                  Estado
                  <select value={newStrategyState} onChange={(e) => setNewStrategyState(e.target.value as 'active' | 'inactive')}>
                    <option value="active">Activa</option>
                    <option value="inactive">Inactiva</option>
                  </select>
                </label>
              </div>

              <label>
                Balance inicial
                <input type="number" value={newStrategyInitialBalance} onChange={(e) => setNewStrategyInitialBalance(Number(e.target.value))} />
              </label>

              <div className="modal-section">
                <strong>Datos del broker (opcional)</strong>
                <div className="row-two">
                  <label>
                    Broker
                    <input value={newStrategyBroker} onChange={(e) => setNewStrategyBroker(e.target.value)} placeholder="Ej: IC Markets, Pepperstone..." />
                  </label>
                  <label>
                    Número de cuenta
                    <input value={newStrategyBrokerAccount} onChange={(e) => setNewStrategyBrokerAccount(e.target.value)} placeholder="12345678" />
                  </label>
                </div>
                <label>
                  Contraseña
                  <input type="password" value={newStrategyBrokerPassword} onChange={(e) => setNewStrategyBrokerPassword(e.target.value)} placeholder="Solo temporal, no se guarda" />
                </label>
              </div>

              <div style={{ marginTop: 6 }}>
                <div style={{ marginBottom: 8, color: '#9ca5bf' }}>Color identificativo</div>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <input type="color" value={newStrategyColor} onChange={(e) => setNewStrategyColor(e.target.value)} />
                  <div style={{ width: 30, height: 30, borderRadius: 999, background: newStrategyColor, border: `1px solid ${hexToRgba(newStrategyColor, 0.35)}`, boxShadow: `0 0 0 4px ${hexToRgba(newStrategyColor, 0.14)}` }} />
                  <div style={{ display: 'flex', gap: 8 }}>
                    {['#7de3a0', '#7fb3ff', '#bda8ff', '#ffd37a', '#ff8aa1'].map((c) => (
                    <button type="button" key={c} onClick={() => setNewStrategyColor(c)} style={{ width: 28, height: 28, borderRadius: 999, border: newStrategyColor === c ? '2px solid #fff' : '1px solid rgba(255,255,255,0.06)', background: c }} />
                  ))}
                  </div>
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="button-secondary" onClick={closeStrategyModal}>Cancelar</button>
                <button type="button" className="button-primary" onClick={() => void saveStrategy()}>{editingStrategyId ? 'Guardar cambios' : 'Crear estrategia'}</button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        style={{ display: 'none' }}
        onChange={handleFileInputChange}
      />
      <input ref={backupInputRef} type="file" accept="application/json" style={{ display: 'none' }} onChange={handleBackupImport} />
    </div>
  )
}

export default App
