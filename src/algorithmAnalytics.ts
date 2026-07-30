import type { AlgorithmRobot, AlgorithmTrade } from './types'

export interface AlgorithmMetrics {
  totalTrades: number
  closedTrades: number
  openTrades: number
  wins: number
  losses: number
  breakeven: number
  netProfit: number
  grossProfit: number
  grossLoss: number
  returnPercent: number
  winRate: number
  profitFactor: number | null
  averageTrade: number
  averageWin: number
  averageLoss: number
  expectancy: number
  maxDrawdown: number
  maxDrawdownPercent: number
  recoveryFactor: number | null
  sharpe: number | null
  sortino: number | null
  currentDrawdown: number
  currentDrawdownPercent: number
  commissionTotal: number
  slippageTotal: number
  longProfit: number
  shortProfit: number
  riskRewardRatio: number | null
  bestTrade: number
  worstTrade: number
  averageDurationMinutes: number
  maxWinStreak: number
  maxLossStreak: number
}

export interface CurvePoint {
  date: string
  label: string
  value: number
  profit: number
  tradeId: string
  context?: string
}

const finite = (value: number | undefined | null) => Number.isFinite(value) ? Number(value) : 0

export const sortAlgorithmTrades = (trades: AlgorithmTrade[]) => trades
  .slice()
  .sort((a, b) => new Date(a.exitDate ?? a.entryDate).getTime() - new Date(b.exitDate ?? b.entryDate).getTime())

export const filterAlgorithmTrades = (
  trades: AlgorithmTrade[],
  startDate?: string,
  endDate?: string,
) => trades.filter((trade) => {
  const timestamp = new Date(trade.exitDate ?? trade.entryDate).getTime()
  if (!Number.isFinite(timestamp)) return false
  if (startDate && timestamp < new Date(startDate + 'T00:00:00').getTime()) return false
  if (endDate && timestamp > new Date(endDate + 'T23:59:59').getTime()) return false
  return true
})

export const buildEquityCurve = (trades: AlgorithmTrade[], initialCapital = 0): CurvePoint[] => {
  let equity = initialCapital
  return sortAlgorithmTrades(trades.filter((trade) => trade.status === 'closed')).map((trade) => {
    equity += finite(trade.profit)
    const date = trade.exitDate ?? trade.entryDate
    return {
      date,
      label: new Date(date).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }),
      value: equity,
      profit: finite(trade.profit),
      tradeId: trade.id,
    }
  })
}

export const buildDrawdownCurve = (trades: AlgorithmTrade[], initialCapital = 0): CurvePoint[] => {
  let peak = initialCapital
  return buildEquityCurve(trades, initialCapital).map((point) => {
    peak = Math.max(peak, point.value)
    const drawdown = Math.max(0, peak - point.value)
    return { ...point, value: drawdown }
  })
}

export const calculateAlgorithmMetrics = (trades: AlgorithmTrade[], initialCapital = 0): AlgorithmMetrics => {
  const ordered = sortAlgorithmTrades(trades)
  const closed = ordered.filter((trade) => trade.status === 'closed')
  const profits = closed.map((trade) => finite(trade.profit))
  const positive = profits.filter((value) => value > 0)
  const negative = profits.filter((value) => value < 0)
  const breakeven = profits.filter((value) => value === 0).length
  const grossProfit = positive.reduce((sum, value) => sum + value, 0)
  const grossLoss = Math.abs(negative.reduce((sum, value) => sum + value, 0))
  const netProfit = profits.reduce((sum, value) => sum + value, 0)
  const averageTrade = closed.length ? netProfit / closed.length : 0
  const averageWin = positive.length ? grossProfit / positive.length : 0
  const averageLoss = negative.length ? negative.reduce((sum, value) => sum + value, 0) / negative.length : 0
  const winRate = closed.length ? (positive.length / closed.length) * 100 : 0
  const expectancy = (winRate / 100) * averageWin + (1 - winRate / 100) * averageLoss

  let equity = initialCapital
  let peak = initialCapital
  let maxDrawdown = 0
  let maxDrawdownPercent = 0
  let currentDrawdown = 0
  let currentDrawdownPercent = 0
  let winStreak = 0
  let lossStreak = 0
  let maxWinStreak = 0
  let maxLossStreak = 0
  profits.forEach((profit) => {
    equity += profit
    peak = Math.max(peak, equity)
    const drawdown = peak - equity
    maxDrawdown = Math.max(maxDrawdown, drawdown)
    const drawdownPercent = peak ? (drawdown / Math.abs(peak)) * 100 : 0
    maxDrawdownPercent = Math.max(maxDrawdownPercent, drawdownPercent)
    currentDrawdown = drawdown
    currentDrawdownPercent = drawdownPercent
    winStreak = profit > 0 ? winStreak + 1 : 0
    lossStreak = profit < 0 ? lossStreak + 1 : 0
    maxWinStreak = Math.max(maxWinStreak, winStreak)
    maxLossStreak = Math.max(maxLossStreak, lossStreak)
  })

  const returns = closed.map((trade) => {
    if (Number.isFinite(trade.profitPercent)) return Number(trade.profitPercent) / 100
    return initialCapital ? finite(trade.profit) / initialCapital : 0
  })
  const meanReturn = returns.length ? returns.reduce((sum, value) => sum + value, 0) / returns.length : 0
  const variance = returns.length > 1
    ? returns.reduce((sum, value) => sum + Math.pow(value - meanReturn, 2), 0) / (returns.length - 1)
    : 0
  const deviation = Math.sqrt(variance)
  const sharpe = deviation > 0 ? (meanReturn / deviation) * Math.sqrt(252) : null
  const downsideReturns = returns.filter((value) => value < 0)
  const downsideDeviation = downsideReturns.length
    ? Math.sqrt(downsideReturns.reduce((sum, value) => sum + Math.pow(value, 2), 0) / downsideReturns.length)
    : 0
  const sortino = downsideDeviation > 0 ? (meanReturn / downsideDeviation) * Math.sqrt(252) : null
  const commissionTotal = closed.reduce((sum, trade) => sum + Math.abs(finite(trade.commission)), 0)
  const slippageTotal = closed.reduce((sum, trade) => sum + Math.abs(finite(trade.slippage)), 0)
  const longProfit = closed.filter((trade) => trade.side === 'long').reduce((sum, trade) => sum + finite(trade.profit), 0)
  const shortProfit = closed.filter((trade) => trade.side === 'short').reduce((sum, trade) => sum + finite(trade.profit), 0)
  const durations = closed.map((trade) => finite(trade.durationMinutes)).filter((value) => value > 0)

  return {
    totalTrades: trades.length,
    closedTrades: closed.length,
    openTrades: trades.length - closed.length,
    wins: positive.length,
    losses: negative.length,
    breakeven,
    netProfit,
    grossProfit,
    grossLoss,
    returnPercent: initialCapital ? (netProfit / initialCapital) * 100 : 0,
    winRate,
    profitFactor: grossLoss > 0 ? grossProfit / grossLoss : positive.length ? null : 0,
    averageTrade,
    averageWin,
    averageLoss,
    expectancy,
    maxDrawdown,
    maxDrawdownPercent,
    recoveryFactor: maxDrawdown > 0 ? netProfit / maxDrawdown : null,
    sharpe,
    sortino,
    currentDrawdown,
    currentDrawdownPercent,
    commissionTotal,
    slippageTotal,
    longProfit,
    shortProfit,
    riskRewardRatio: averageLoss < 0 ? averageWin / Math.abs(averageLoss) : positive.length ? null : 0,
    bestTrade: profits.length ? Math.max(...profits) : 0,
    worstTrade: profits.length ? Math.min(...profits) : 0,
    averageDurationMinutes: durations.length ? durations.reduce((sum, value) => sum + value, 0) / durations.length : 0,
    maxWinStreak,
    maxLossStreak,
  }
}

export const calculatePortfolioMetrics = (robots: AlgorithmRobot[]) => {
  const trades = robots.flatMap((robot) => robot.trades)
  const capital = robots.reduce((sum, robot) => sum + finite(robot.initialCapital), 0)
  return calculateAlgorithmMetrics(trades, capital)
}

export const groupProfitBy = (trades: AlgorithmTrade[], mode: 'weekday' | 'hour' | 'month' | 'symbol') => {
  const groups = new Map<string, { label: string; profit: number; trades: number; wins: number }>()
  trades.filter((trade) => trade.status === 'closed').forEach((trade) => {
    const date = new Date(trade.exitDate ?? trade.entryDate)
    let label = trade.symbol || 'Sin símbolo'
    if (mode === 'weekday') label = date.toLocaleDateString('es-ES', { weekday: 'long' })
    if (mode === 'hour') label = String(date.getHours()).padStart(2, '0') + ':00'
    if (mode === 'month') label = date.toLocaleDateString('es-ES', { month: 'short', year: '2-digit' })
    const current = groups.get(label) ?? { label, profit: 0, trades: 0, wins: 0 }
    current.profit += finite(trade.profit)
    current.trades += 1
    if (trade.profit > 0) current.wins += 1
    groups.set(label, current)
  })
  return [...groups.values()]
}

export const formatAlgorithmDuration = (minutes: number) => {
  if (!minutes) return '—'
  if (minutes < 60) return Math.round(minutes) + ' min'
  if (minutes < 1440) return (minutes / 60).toFixed(1) + ' h'
  return (minutes / 1440).toFixed(1) + ' d'
}
