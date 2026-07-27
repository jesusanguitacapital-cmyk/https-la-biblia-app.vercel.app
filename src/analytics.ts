import type { AppData, Operation } from './types'

export function computeProfit(operation: Operation) {
  const direction = operation.side === 'long' ? 1 : -1
  const rawProfit = typeof operation.plValue === 'number' && Number.isFinite(operation.plValue)
    ? operation.plValue
    : (operation.exit - operation.entry) * direction * operation.size
  const commission = typeof operation.commission === 'number' && Number.isFinite(operation.commission) ? operation.commission : 0
  const swap = typeof operation.swap === 'number' && Number.isFinite(operation.swap) ? operation.swap : 0
  return rawProfit + commission + swap
}

export function summaryForStrategy(data: AppData, strategyId: string) {
  const ops = data.operations.filter((op) => op.strategyId === strategyId)
  const total = ops.length
  const profit = ops.reduce((s, op) => s + computeProfit(op), 0)
  const wins = ops.filter((o) => o.result === 'win').length
  const avgWin = ops.filter((o) => o.result === 'win').reduce((s, o) => s + computeProfit(o), 0) / Math.max(1, wins)
  const losses = ops.filter((o) => o.result === 'loss')
  const avgLoss = losses.reduce((s, o) => s + computeProfit(o), 0) / Math.max(1, losses.length)

  const grossProfit = ops.filter((o) => o.result === 'win').reduce((s, o) => s + computeProfit(o), 0)
  const grossLoss = Math.abs(losses.reduce((s, o) => s + computeProfit(o), 0))
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : null

  // max drawdown (simple approach over cumulative equity)
  const sorted = [...ops].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
  let peak = 0
  let cum = 0
  let maxDD = 0
  sorted.forEach((op) => {
    cum += computeProfit(op)
    if (cum > peak) peak = cum
    const dd = peak - cum
    if (dd > maxDD) maxDD = dd
  })

  return {
    total,
    profit,
    wins,
    winRate: total ? Math.round((wins / total) * 100) : 0,
    avgWin: Number.isFinite(avgWin) ? avgWin : 0,
    avgLoss: Number.isFinite(avgLoss) ? avgLoss : 0,
    profitFactor,
    maxDrawdown: maxDD,
  }
}

export function globalSummary(data: AppData) {
  const total = data.operations.length
  const profit = data.operations.reduce((s, op) => s + computeProfit(op), 0)
  const wins = data.operations.filter((o) => o.result === 'win').length
  const winRate = total ? Math.round((wins / total) * 100) : 0
  return { total, profit, wins, winRate }
}
