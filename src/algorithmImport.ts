import type { AlgorithmEnvironment, AlgorithmTrade, TradeSide } from './types'

export type AlgorithmImportField =
  | 'externalId' | 'robotVersion' | 'entryDate' | 'exitDate' | 'symbol' | 'side' | 'status'
  | 'entryPrice' | 'exitPrice' | 'stopLoss' | 'takeProfit' | 'size' | 'lots'
  | 'commission' | 'swap' | 'slippage' | 'points' | 'contracts' | 'breakEven' | 'profit' | 'profitPercent' | 'balance' | 'equity'
  | 'drawdown' | 'durationMinutes' | 'setup' | 'entryReason' | 'exitReason' | 'tags' | 'notes'

export interface AlgorithmImportColumn {
  key: AlgorithmImportField
  label: string
  required?: boolean
}

export interface ParsedAlgorithmFile {
  fileName: string
  sheetName: string
  headers: string[]
  rows: Record<string, unknown>[]
  mapping: Record<string, string>
  warnings: string[]
}

export interface BuiltTradeRow {
  row: number
  trade?: AlgorithmTrade
  errors: string[]
  duplicate: boolean
}

export const ALGORITHM_IMPORT_COLUMNS: AlgorithmImportColumn[] = [
  { key: 'externalId', label: 'ID externo' },
  { key: 'robotVersion', label: 'Versión del robot' },
  { key: 'entryDate', label: 'Fecha/hora de entrada', required: true },
  { key: 'exitDate', label: 'Fecha/hora de salida' },
  { key: 'symbol', label: 'Símbolo / activo', required: true },
  { key: 'side', label: 'Dirección', required: true },
  { key: 'status', label: 'Estado' },
  { key: 'entryPrice', label: 'Precio de entrada' },
  { key: 'exitPrice', label: 'Precio de salida' },
  { key: 'stopLoss', label: 'Stop loss' },
  { key: 'takeProfit', label: 'Take profit' },
  { key: 'size', label: 'Tamaño' },
  { key: 'lots', label: 'Lotes' },
  { key: 'commission', label: 'Comisión' },
  { key: 'swap', label: 'Swap' },
  { key: 'slippage', label: 'Slippage' },
  { key: 'points', label: 'Resultado en puntos' },
  { key: 'contracts', label: 'Contratos' },
  { key: 'breakEven', label: 'Break even' },
  { key: 'profit', label: 'Beneficio / pérdida', required: true },
  { key: 'profitPercent', label: 'Resultado %' },
  { key: 'balance', label: 'Balance' },
  { key: 'equity', label: 'Equity' },
  { key: 'drawdown', label: 'Drawdown' },
  { key: 'durationMinutes', label: 'Duración (minutos)' },
  { key: 'setup', label: 'Setup' },
  { key: 'entryReason', label: 'Motivo de entrada' },
  { key: 'exitReason', label: 'Motivo de salida' },
  { key: 'tags', label: 'Etiquetas' },
  { key: 'notes', label: 'Notas' },
]

const aliases: Record<AlgorithmImportField, string[]> = {
  externalId: ['id', 'ticket', 'trade id', 'tradeid', 'order', 'order id', 'deal', 'position id'],
  robotVersion: ['version', 'robot version', 'algorithm version', 'version robot', 'versión', 'version algoritmo'],
  entryDate: ['entry date', 'entry time', 'open date', 'open time', 'time', 'date', 'fecha', 'fecha entrada', 'hora entrada', 'datetime', 'opened at'],
  exitDate: ['exit date', 'exit time', 'close date', 'close time', 'fecha salida', 'hora salida', 'closed at'],
  symbol: ['symbol', 'asset', 'instrument', 'ticker', 'market', 'activo', 'simbolo', 'símbolo', 'par'],
  side: ['side', 'type', 'direction', 'trade type', 'action', 'direccion', 'dirección', 'tipo', 'buy sell'],
  status: ['status', 'state', 'estado'],
  entryPrice: ['entry', 'entry price', 'open price', 'price open', 'precio entrada'],
  exitPrice: ['exit', 'exit price', 'close price', 'price close', 'precio salida'],
  stopLoss: ['sl', 'stop loss', 'stoploss', 'stop'],
  takeProfit: ['tp', 'take profit', 'takeprofit', 'target'],
  size: ['size', 'quantity', 'qty', 'volume', 'tamaño', 'cantidad'],
  lots: ['lots', 'lot', 'lotes', 'lotaje'],
  commission: ['commission', 'commissions', 'fee', 'fees', 'comision', 'comisión'],
  swap: ['swap', 'overnight', 'financing'],
  slippage: ['slippage', 'deslizamiento'],
  points: ['points', 'pips', 'ticks', 'puntos'],
  contracts: ['contracts', 'contract', 'contratos'],
  breakEven: ['break even', 'breakeven', 'be'],
  profit: ['profit', 'p/l', 'pl', 'pnl', 'net profit', 'result', 'resultado', 'beneficio', 'ganancia'],
  profitPercent: ['profit %', 'p/l %', 'pl %', 'pnl %', 'return', 'return %', 'resultado %', 'beneficio %'],
  balance: ['balance', 'account balance', 'saldo'],
  equity: ['equity', 'capital'],
  drawdown: ['drawdown', 'dd', 'drawdown %'],
  durationMinutes: ['duration', 'duration minutes', 'minutes', 'duracion', 'duración'],
  setup: ['setup', 'strategy', 'signal', 'pattern', 'estrategia'],
  entryReason: ['entry reason', 'reason entry', 'motivo entrada', 'signal'],
  exitReason: ['exit reason', 'reason exit', 'motivo salida'],
  tags: ['tags', 'labels', 'etiquetas'],
  notes: ['notes', 'comment', 'comments', 'description', 'notas', 'comentarios'],
}

const normalized = (value: unknown) => String(value ?? '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9%]+/g, ' ')
  .trim()

export const detectAlgorithmMapping = (headers: string[]) => {
  const mapping: Record<string, string> = {}
  const used = new Set<string>()
  ALGORITHM_IMPORT_COLUMNS.forEach((column) => {
    const candidates = aliases[column.key].map(normalized)
    const match = headers.find((header) => {
      if (used.has(header)) return false
      const clean = normalized(header)
      return candidates.includes(clean) || candidates.some((alias) => alias.length >= 4 && clean.length >= 4 && clean.includes(alias))
    })
    if (match) {
      mapping[column.key] = match
      used.add(match)
    }
  })
  return mapping
}

export const parseAlgorithmFile = async (file: File): Promise<ParsedAlgorithmFile> => {
  const extension = file.name.split('.').pop()?.toLowerCase()
  if (!extension || !['xlsx', 'xls', 'csv'].includes(extension)) throw new Error('Formato no compatible. Usa XLSX, XLS o CSV.')
  if (file.size > 12 * 1024 * 1024) throw new Error('El archivo supera el límite de 12 MB.')
  const XLSX = await import('xlsx')
  const workbook = extension === 'csv'
    ? XLSX.read(await file.text(), { type: 'string', raw: true })
    : XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true })
  const sheetName = workbook.SheetNames[0]
  if (!sheetName) throw new Error('El archivo no contiene hojas legibles.')
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[sheetName], { defval: '', raw: true })
  if (!rows.length) throw new Error('La primera hoja no contiene operaciones.')
  if (rows.length > 10000) throw new Error('La importación admite hasta 10.000 filas por archivo.')
  const headers = [...new Set(rows.flatMap((row) => Object.keys(row)))].filter(Boolean)
  return {
    fileName: file.name,
    sheetName,
    headers,
    rows,
    mapping: detectAlgorithmMapping(headers),
    warnings: workbook.SheetNames.length > 1 ? ['Se importará la primera hoja: ' + sheetName] : [],
  }
}

export const parseAlgorithmNumber = (value: unknown): number | undefined => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined
  const raw = String(value ?? '').trim()
  if (!raw) return undefined
  const cleaned = raw.replace(/[^0-9,.-]/g, '')
  const decimalComma = cleaned.includes(',') && (!cleaned.includes('.') || cleaned.lastIndexOf(',') > cleaned.lastIndexOf('.'))
  const normalizedNumber = decimalComma
    ? cleaned.replace(/\./g, '').replace(',', '.')
    : cleaned.replace(/,/g, '')
  const number = Number(normalizedNumber)
  return Number.isFinite(number) ? number : undefined
}

export const parseAlgorithmDate = (value: unknown): string | undefined => {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value.toISOString()
  if (typeof value === 'number' && value > 1) {
    const date = new Date(Date.UTC(1899, 11, 30) + value * 86400000)
    return Number.isFinite(date.getTime()) ? date.toISOString() : undefined
  }
  const raw = String(value ?? '').trim()
  if (!raw) return undefined
  const spanish = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})(?:[ ,T]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/)
  if (spanish) {
    const year = Number(spanish[3]) < 100 ? 2000 + Number(spanish[3]) : Number(spanish[3])
    const month = Number(spanish[2])
    const day = Number(spanish[1])
    const hour = Number(spanish[4] ?? 0)
    const minute = Number(spanish[5] ?? 0)
    const second = Number(spanish[6] ?? 0)
    const date = new Date(year, month - 1, day, hour, minute, second)
    const isExact = date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
      && date.getHours() === hour && date.getMinutes() === minute && date.getSeconds() === second
    return isExact ? date.toISOString() : undefined
  }
  const isoDate = raw.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (isoDate) {
    const year = Number(isoDate[1])
    const month = Number(isoDate[2])
    const day = Number(isoDate[3])
    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate()
    if (month < 1 || month > 12 || day < 1 || day > daysInMonth) return undefined
  }
  const timestamp = Date.parse(raw)
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : undefined
}

const parseSide = (value: unknown): TradeSide | undefined => {
  const clean = normalized(value)
  if (['buy', 'long', 'compra', 'comprar', 'b'].includes(clean)) return 'long'
  if (['sell', 'short', 'venta', 'vender', 's'].includes(clean)) return 'short'
  return undefined
}

export const algorithmTradeFingerprint = (trade: Pick<AlgorithmTrade, 'externalId' | 'entryDate' | 'symbol' | 'side' | 'profit'>) => {
  if (trade.externalId) return 'id:' + normalized(trade.externalId)
  return [trade.entryDate.slice(0, 19), normalized(trade.symbol), trade.side, Number(trade.profit).toFixed(6)].join('|')
}

export const buildAlgorithmTrades = (
  rows: Record<string, unknown>[],
  mapping: Record<string, string>,
  robotId: string,
  importId: string,
  environment: AlgorithmEnvironment,
  existingTrades: AlgorithmTrade[],
): BuiltTradeRow[] => {
  const existing = new Set(existingTrades.map(algorithmTradeFingerprint))
  const now = new Date().toISOString()
  return rows.map((row, index) => {
    const read = (key: AlgorithmImportField) => mapping[key] ? row[mapping[key]] : undefined
    const errors: string[] = []
    const entryDate = parseAlgorithmDate(read('entryDate'))
    const exitDate = parseAlgorithmDate(read('exitDate'))
    const symbol = String(read('symbol') ?? '').trim().toUpperCase()
    const side = parseSide(read('side'))
    const profit = parseAlgorithmNumber(read('profit'))
    if (!entryDate) errors.push('Entrada: usa una fecha válida')
    if (!symbol) errors.push('Símbolo: completa el activo')
    if (!side) errors.push('Dirección: utiliza long/short o compra/venta')
    if (profit === undefined) errors.push('Resultado: utiliza un número con coma o punto decimal')
    if (entryDate && exitDate && new Date(exitDate).getTime() < new Date(entryDate).getTime()) errors.push('Salida: no puede ser anterior a la entrada')
    if (errors.length || !entryDate || !side || profit === undefined) return { row: index + 2, errors, duplicate: false }
    const entryPrice = parseAlgorithmNumber(read('entryPrice'))
    const exitPrice = parseAlgorithmNumber(read('exitPrice'))
    const resolvedExitDate = exitDate ?? (String(read('status') ?? '').toLowerCase().includes('open') ? undefined : entryDate)
    const trade: AlgorithmTrade = {
      id: crypto.randomUUID(),
      robotId,
      importId,
      externalId: String(read('externalId') ?? '').trim() || undefined,
      robotVersion: String(read('robotVersion') ?? '').trim() || undefined,
      environment,
      entryDate,
      exitDate: resolvedExitDate,
      symbol,
      side,
      status: resolvedExitDate ? 'closed' : 'open',
      entryPrice,
      exitPrice,
      stopLoss: parseAlgorithmNumber(read('stopLoss')),
      takeProfit: parseAlgorithmNumber(read('takeProfit')),
      size: parseAlgorithmNumber(read('size')),
      lots: parseAlgorithmNumber(read('lots')),
      commission: parseAlgorithmNumber(read('commission')),
      swap: parseAlgorithmNumber(read('swap')),
      slippage: parseAlgorithmNumber(read('slippage')),
      points: parseAlgorithmNumber(read('points')),
      contracts: parseAlgorithmNumber(read('contracts')),
      breakEven: ['true', 'yes', 'si', 'sí', '1'].includes(normalized(read('breakEven'))),
      profit,
      profitPercent: parseAlgorithmNumber(read('profitPercent')),
      balance: parseAlgorithmNumber(read('balance')),
      equity: parseAlgorithmNumber(read('equity')),
      drawdown: parseAlgorithmNumber(read('drawdown')),
      durationMinutes: parseAlgorithmNumber(read('durationMinutes')),
      setup: String(read('setup') ?? '').trim() || undefined,
      entryReason: String(read('entryReason') ?? '').trim() || undefined,
      exitReason: String(read('exitReason') ?? '').trim() || undefined,
      tags: String(read('tags') ?? '').split(/[,;|]/).map((tag) => tag.trim()).filter(Boolean),
      notes: String(read('notes') ?? '').trim() || undefined,
      sourceRow: index + 2,
      createdAt: now,
      updatedAt: now,
    }
    const fingerprint = algorithmTradeFingerprint(trade)
    const duplicate = existing.has(fingerprint)
    if (!duplicate) existing.add(fingerprint)
    return { row: index + 2, trade, errors, duplicate }
  })
}
