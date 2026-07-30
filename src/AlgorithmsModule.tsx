import { useEffect, useMemo, useRef, useState } from 'react'
import type { ChangeEvent, CSSProperties, DragEvent, FormEvent, KeyboardEvent } from 'react'
import type {
  AlgorithmAttachment,
  AlgorithmCodeFile,
  AlgorithmDocumentation,
  AlgorithmEnvironment,
  AlgorithmRobot,
  AlgorithmStatus,
  AlgorithmTrade,
  TradeSide,
} from './types'
import {
  buildDrawdownCurve,
  buildEquityCurve,
  calculateAlgorithmMetrics,
  calculatePortfolioMetrics,
  filterAlgorithmTrades,
  formatAlgorithmDuration,
  groupProfitBy,
  sortAlgorithmTrades,
} from './algorithmAnalytics'
import type { CurvePoint } from './algorithmAnalytics'
import {
  ALGORITHM_IMPORT_COLUMNS,
  algorithmTradeFingerprint,
  buildAlgorithmTrades,
  parseAlgorithmFile,
} from './algorithmImport'
import type { ParsedAlgorithmFile } from './algorithmImport'
import './Algorithms.css'

type AlgorithmsTab = 'summary' | 'operations' | 'import' | 'code' | 'documentation' | 'analysis' | 'settings'
type DocumentationField = Exclude<keyof AlgorithmDocumentation, 'updatedAt'>

interface AlgorithmsModuleProps {
  algorithms: AlgorithmRobot[]
  defaultCurrency: 'EUR' | 'USD'
  onChange: (algorithms: AlgorithmRobot[], message: string) => Promise<void>
  onNotify: (message: string) => void
}

const uid = () => crypto.randomUUID?.() ?? Date.now().toString(36) + Math.random().toString(36).slice(2)
const nowIso = () => new Date().toISOString()

const EMPTY_DOCUMENTATION: AlgorithmDocumentation = {
  summary: '',
  marketContext: '',
  entryRules: '',
  exitRules: '',
  riskManagement: '',
  filters: '',
  parameters: '',
  indicators: '',
  examples: '',
  assumptions: '',
  knownRisks: '',
  recommendedConditions: '',
  personalNotes: '',
  changelog: '',
}

const STATUS_LABELS: Record<AlgorithmStatus, string> = {
  development: 'En desarrollo',
  backtesting: 'En backtesting',
  demo: 'En demo',
  live: 'Activo en real',
  paused: 'Pausado',
  discarded: 'Descartado',
  archived: 'Archivado',
  testing: 'En pruebas',
  active: 'Activo',
}

const ENVIRONMENT_LABELS: Record<AlgorithmEnvironment, string> = {
  backtest: 'Backtest',
  out_of_sample: 'Fuera de muestra',
  demo: 'Demo',
  real: 'Real',
}

const TAB_LABELS: Array<{ key: AlgorithmsTab; label: string }> = [
  { key: 'summary', label: 'Resumen' },
  { key: 'operations', label: 'Operaciones' },
  { key: 'import', label: 'Importar datos' },
  { key: 'code', label: 'Código Python' },
  { key: 'documentation', label: 'Estrategia' },
  { key: 'analysis', label: 'Análisis' },
  { key: 'settings', label: 'Configuración' },
]

const COLORS = ['#007AFF', '#34C759', '#AF52DE', '#FF9500', '#5AC8FA', '#FF2D55']

const formatMoney = (value: number, currency: 'EUR' | 'USD') => new Intl.NumberFormat('es-ES', {
  style: 'currency',
  currency,
  maximumFractionDigits: 2,
}).format(Number.isFinite(value) ? value : 0)

const formatNumber = (value: number, digits = 2) => new Intl.NumberFormat('es-ES', {
  maximumFractionDigits: digits,
  minimumFractionDigits: digits,
}).format(Number.isFinite(value) ? value : 0)

const formatDate = (value?: string) => value
  ? new Date(value).toLocaleString('es-ES', { dateStyle: 'medium', timeStyle: 'short' })
  : '—'

const periodStartFor = (period: string) => {
  if (period === 'all') return null
  const days: Record<string, number> = { '1d': 1, '1w': 7, '1m': 30, '3m': 90, '6m': 180, '1y': 365 }
  return new Date(Date.now() - (days[period] ?? 30) * 86400000)
}

const toLocalInput = (value?: string) => {
  if (!value) return ''
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return ''
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 16)
}

const robotFormFrom = (robot?: AlgorithmRobot | null, currency: 'EUR' | 'USD' = 'EUR') => ({
  name: robot?.name ?? '',
  description: robot?.description ?? '',
  version: robot?.version ?? '1.0.0',
  status: robot?.status ?? 'development' as AlgorithmStatus,
  environment: robot?.environment ?? 'backtest' as AlgorithmEnvironment,
  market: robot?.market ?? '',
  symbols: robot?.symbols.join(', ') ?? '',
  timeframe: robot?.timeframe ?? '1H',
  direction: robot?.direction ?? 'both' as 'long' | 'short' | 'both',
  initialCapital: String(robot?.initialCapital ?? 10000),
  currency: robot?.currency ?? currency,
  riskMode: robot?.riskMode ?? 'percent' as 'fixed' | 'percent' | 'unknown',
  riskValue: robot?.riskValue == null ? '1' : String(robot.riskValue),
  tags: robot?.tags.join(', ') ?? '',
  color: robot?.color ?? COLORS[0],
  strategyType: robot?.strategyType ?? '',
  platform: robot?.platform ?? '',
  broker: robot?.broker ?? '',
  programmingLanguage: robot?.programmingLanguage ?? 'Python',
  pythonVersion: robot?.pythonVersion ?? '3.12',
  libraries: robot?.libraries?.join(', ') ?? '',
  timezone: robot?.timezone ?? 'Europe/Madrid',
  tradingHours: robot?.tradingHours ?? '',
  maxDailyTrades: robot?.maxDailyTrades == null ? '' : String(robot.maxDailyTrades),
  stopLossModel: robot?.stopLossModel ?? '',
  takeProfitModel: robot?.takeProfitModel ?? '',
  trailingStop: robot?.trailingStop ?? false,
  breakEven: robot?.breakEven ?? false,
  dailyLossLimit: robot?.dailyLossLimit == null ? '' : String(robot.dailyLossLimit),
  maxDrawdownLimit: robot?.maxDrawdownLimit == null ? '' : String(robot.maxDrawdownLimit),
  positionSizing: robot?.positionSizing ?? '',
  estimatedCommission: robot?.estimatedCommission == null ? '' : String(robot.estimatedCommission),
  estimatedSlippage: robot?.estimatedSlippage == null ? '' : String(robot.estimatedSlippage),
  startDate: robot?.startDate?.slice(0, 10) ?? '',
  endDate: robot?.endDate?.slice(0, 10) ?? '',
})

const tradeFormFrom = (trade?: AlgorithmTrade | null, robot?: AlgorithmRobot | null) => ({
  robotVersion: trade?.robotVersion ?? robot?.version ?? '1.0.0',
  environment: trade?.environment ?? robot?.environment ?? 'backtest' as AlgorithmEnvironment,
  entryDate: toLocalInput(trade?.entryDate) || new Date().toISOString().slice(0, 16),
  exitDate: toLocalInput(trade?.exitDate),
  symbol: trade?.symbol ?? robot?.symbols[0] ?? '',
  side: trade?.side ?? 'long' as TradeSide,
  status: trade?.status ?? 'closed' as 'open' | 'closed',
  entryPrice: trade?.entryPrice == null ? '' : String(trade.entryPrice),
  exitPrice: trade?.exitPrice == null ? '' : String(trade.exitPrice),
  stopLoss: trade?.stopLoss == null ? '' : String(trade.stopLoss),
  takeProfit: trade?.takeProfit == null ? '' : String(trade.takeProfit),
  lots: trade?.lots == null ? '' : String(trade.lots),
  commission: trade?.commission == null ? '' : String(trade.commission),
  swap: trade?.swap == null ? '' : String(trade.swap),
  slippage: trade?.slippage == null ? '' : String(trade.slippage),
  points: trade?.points == null ? '' : String(trade.points),
  contracts: trade?.contracts == null ? '' : String(trade.contracts),
  breakEven: trade?.breakEven ?? false,
  profit: String(trade?.profit ?? 0),
  profitPercent: trade?.profitPercent == null ? '' : String(trade.profitPercent),
  setup: trade?.setup ?? '',
  entryReason: trade?.entryReason ?? '',
  exitReason: trade?.exitReason ?? '',
  tags: trade?.tags?.join(', ') ?? '',
  notes: trade?.notes ?? '',
})

const downloadBlob = (content: BlobPart, type: string, name: string) => {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = name
  anchor.click()
  URL.revokeObjectURL(url)
}

const MetricCard = ({ label, value, detail, tone = 'neutral', icon }: {
  label: string
  value: string
  detail?: string
  tone?: 'neutral' | 'positive' | 'negative' | 'blue' | 'purple'
  icon: string
}) => (
  <article className={'algo-metric-card ' + tone}>
    <span className="algo-metric-icon" aria-hidden="true">{icon}</span>
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
      {detail ? <small>{detail}</small> : null}
    </div>
  </article>
)

const DataChart = ({ series, emptyLabel = 'Importa operaciones para ver el gráfico.' }: {
  series: Array<{ label: string; color: string; points: CurvePoint[] }>
  emptyLabel?: string
}) => {
  const width = 1000
  const height = 300
  const padding = { top: 28, right: 30, bottom: 42, left: 72 }
  const values = series.flatMap((item) => item.points.map((point) => point.value))
  if (!values.length) return <div className="algo-chart-empty">{emptyLabel}</div>
  const minRaw = Math.min(...values, 0)
  const maxRaw = Math.max(...values, 0)
  const range = Math.max(maxRaw - minRaw, 1)
  const min = minRaw - range * 0.08
  const max = maxRaw + range * 0.08
  const plotWidth = width - padding.left - padding.right
  const plotHeight = height - padding.top - padding.bottom
  const maxPoints = Math.max(...series.map((item) => item.points.length), 1)
  const x = (index: number) => padding.left + (maxPoints === 1 ? plotWidth / 2 : (index / (maxPoints - 1)) * plotWidth)
  const y = (value: number) => padding.top + ((max - value) / (max - min)) * plotHeight
  const paths = series.map((item) => ({
    ...item,
    path: item.points.map((point, index) => (index === 0 ? 'M' : 'L') + ' ' + x(index) + ' ' + y(point.value)).join(' '),
  }))
  const ticks = Array.from({ length: 5 }, (_, index) => max - ((max - min) / 4) * index)
  const labels = series.reduce<CurvePoint[]>((current, item) => item.points.length > current.length ? item.points : current, [])
  const labelIndexes = [...new Set([0, Math.floor((labels.length - 1) / 2), labels.length - 1])].filter((index) => index >= 0)
  return (
    <div className="algo-chart-wrap">
      <div className="algo-chart-legend">
        {series.map((item) => <span key={item.label}><i style={{ background: item.color }} />{item.label}</span>)}
      </div>
      <svg className="algo-chart" viewBox={'0 0 ' + width + ' ' + height} role="img" aria-label={series.map((item) => item.label).join(' y ')}>
        {ticks.map((tick) => (
          <g key={tick}>
            <line x1={padding.left} y1={y(tick)} x2={width - padding.right} y2={y(tick)} className="algo-grid-line" />
            <text x={padding.left - 14} y={y(tick) + 4} textAnchor="end" className="algo-axis-label">{formatNumber(tick, 0)}</text>
          </g>
        ))}
        {labelIndexes.map((index) => <text key={index} x={x(index)} y={height - 13} textAnchor="middle" className="algo-axis-label">{labels[index]?.label}</text>)}
        {paths.map((item) => (
          <g key={item.label}>
            <path d={item.path} fill="none" stroke={item.color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="algo-chart-path" />
            {item.points.map((point, index) => (
              <circle key={point.tradeId + index} cx={x(index)} cy={y(point.value)} r="4" fill={item.color} stroke="#fff" strokeWidth="2" className="algo-chart-point">
                <title>{point.label + ' · Capital ' + formatNumber(point.value) + ' · P/L ' + formatNumber(point.profit) + (point.context ? ' · ' + point.context : '')}</title>
              </circle>
            ))}
          </g>
        ))}
      </svg>
    </div>
  )
}

export default function AlgorithmsModule({ algorithms, defaultCurrency, onChange, onNotify }: AlgorithmsModuleProps) {
  const [selectedRobotId, setSelectedRobotId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<AlgorithmsTab>('summary')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | AlgorithmStatus>('all')
  const [environmentFilter, setEnvironmentFilter] = useState<'all' | AlgorithmEnvironment>('all')
  const [globalPeriod, setGlobalPeriod] = useState('all')
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
  const [robotModalOpen, setRobotModalOpen] = useState(false)
  const [editingRobotId, setEditingRobotId] = useState<string | null>(null)
  const [robotForm, setRobotForm] = useState(() => robotFormFrom(null, defaultCurrency))
  const [tradeModalOpen, setTradeModalOpen] = useState(false)
  const [editingTradeId, setEditingTradeId] = useState<string | null>(null)
  const [tradeForm, setTradeForm] = useState(() => tradeFormFrom())
  const [tradeSearch, setTradeSearch] = useState('')
  const [tradeSide, setTradeSide] = useState<'all' | TradeSide>('all')
  const [tradeStatus, setTradeStatus] = useState<'all' | 'open' | 'closed'>('all')
  const [tradeResult, setTradeResult] = useState<'all' | 'win' | 'loss' | 'breakeven'>('all')
  const [tradeSort, setTradeSort] = useState<'newest' | 'oldest' | 'best' | 'worst'>('newest')
  const [tradeEnvironment, setTradeEnvironment] = useState<'all' | AlgorithmEnvironment>('all')
  const [tradeVersion, setTradeVersion] = useState('all')
  const [tradeTag, setTradeTag] = useState('all')
  const [tradeDate, setTradeDate] = useState('')
  const [selectedTrades, setSelectedTrades] = useState<Set<string>>(new Set())
  const [showExtendedTradeColumns, setShowExtendedTradeColumns] = useState(false)
  const [tradePage, setTradePage] = useState(1)
  const [rangeStart, setRangeStart] = useState('')
  const [rangeEnd, setRangeEnd] = useState('')
  const [summaryEnvironment, setSummaryEnvironment] = useState<'all' | AlgorithmEnvironment>('all')
  const [summaryVersion, setSummaryVersion] = useState('all')
  const [summaryTag, setSummaryTag] = useState('all')
  const [calendarMonth, setCalendarMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1))
  const [parsedFile, setParsedFile] = useState<ParsedAlgorithmFile | null>(null)
  const [importMapping, setImportMapping] = useState<Record<string, string>>({})
  const [importEnvironment, setImportEnvironment] = useState<AlgorithmEnvironment>('backtest')
  const [importVersion, setImportVersion] = useState('1.0.0')
  const [duplicateMode, setDuplicateMode] = useState<'skip' | 'replace' | 'include'>('skip')
  const [ignoredImportRows, setIgnoredImportRows] = useState<Set<number>>(new Set())
  const [isParsing, setIsParsing] = useState(false)
  const [codeFileId, setCodeFileId] = useState<string | null>(null)
  const [codeDraft, setCodeDraft] = useState('')
  const [codeSearch, setCodeSearch] = useState('')
  const [codeFullscreen, setCodeFullscreen] = useState(false)
  const [codeScrollTop, setCodeScrollTop] = useState(0)
  const [documentationDraft, setDocumentationDraft] = useState<AlgorithmDocumentation>(EMPTY_DOCUMENTATION)
  const [documentationDirty, setDocumentationDirty] = useState(false)
  const [activeDocumentationKey, setActiveDocumentationKey] = useState<DocumentationField>('summary')
  const importInputRef = useRef<HTMLInputElement | null>(null)
  const codeInputRef = useRef<HTMLInputElement | null>(null)
  const attachmentInputRef = useRef<HTMLInputElement | null>(null)
  const algorithmsRef = useRef(algorithms)

  useEffect(() => {
    algorithmsRef.current = algorithms
  }, [algorithms])

  const selectedRobot = useMemo(() => algorithms.find((robot) => robot.id === selectedRobotId) ?? null, [algorithms, selectedRobotId])

  useEffect(() => {
    if (selectedRobotId && !selectedRobot) setSelectedRobotId(null)
  }, [selectedRobot, selectedRobotId])

  useEffect(() => {
    setSelectedTrades(new Set())
    setTradePage(1)
    setParsedFile(null)
    setImportMapping({})
    const robot = algorithmsRef.current.find((item) => item.id === selectedRobotId)
    if (robot) {
      setImportEnvironment(robot.environment)
      setImportVersion(robot.version)
      setDocumentationDraft({ ...EMPTY_DOCUMENTATION, ...robot.documentation })
      setDocumentationDirty(false)
      const firstCode = robot.codeFiles[0]
      setCodeFileId(firstCode?.id ?? null)
      setCodeDraft(firstCode?.content ?? '')
    }
  }, [selectedRobotId])

  const replaceRobot = async (nextRobot: AlgorithmRobot, message: string) => {
    await onChange(algorithms.map((robot) => robot.id === nextRobot.id ? nextRobot : robot), message)
  }

  const filteredRobots = useMemo(() => algorithms.filter((robot) => {
    const haystack = [robot.name, robot.description, robot.market, robot.symbols.join(' '), robot.tags.join(' ')].join(' ').toLowerCase()
    return haystack.includes(search.toLowerCase())
      && (statusFilter === 'all' || robot.status === statusFilter)
      && (environmentFilter === 'all' || robot.environment === environmentFilter)
  }), [algorithms, environmentFilter, search, statusFilter])

  const globalResultRobots = useMemo(() => statusFilter === 'all'
    ? filteredRobots.filter((robot) => ['active', 'live'].includes(robot.status))
    : filteredRobots, [filteredRobots, statusFilter])
  const visibleGlobalTrades = useMemo(() => {
    const start = periodStartFor(globalPeriod)
    return globalResultRobots.flatMap((robot) => robot.trades.filter((trade) => {
      const inEnvironment = environmentFilter === 'all' || trade.environment === environmentFilter
      const timestamp = new Date(trade.exitDate ?? trade.entryDate).getTime()
      return inEnvironment && (!start || timestamp >= start.getTime())
    }))
  }, [environmentFilter, globalPeriod, globalResultRobots])
  const globalMetrics = useMemo(() => calculatePortfolioMetrics(globalResultRobots.map((robot) => ({ ...robot, trades: visibleGlobalTrades.filter((trade) => trade.robotId === robot.id) }))), [globalResultRobots, visibleGlobalTrades])
  const globalCurve = useMemo(() => {
    const robotByTrade = new Map(globalResultRobots.flatMap((robot) => robot.trades.map((trade) => [trade.id, robot.name] as const)))
    return buildEquityCurve(visibleGlobalTrades, globalResultRobots.reduce((sum, robot) => sum + robot.initialCapital, 0))
      .map((point) => ({ ...point, context: robotByTrade.get(point.tradeId) }))
  }, [globalResultRobots, visibleGlobalTrades])

  const scopedTrades = useMemo(() => {
    if (!selectedRobot) return []
    const environmentTrades = selectedRobot.trades.filter((trade) => {
      const inEnvironment = summaryEnvironment === 'all' || trade.environment === summaryEnvironment
      const inVersion = summaryVersion === 'all' || (trade.robotVersion ?? selectedRobot.version) === summaryVersion
      const inTag = summaryTag === 'all' || trade.tags?.includes(summaryTag)
      return inEnvironment && inVersion && inTag
    })
    return filterAlgorithmTrades(environmentTrades, rangeStart, rangeEnd)
  }, [rangeEnd, rangeStart, selectedRobot, summaryEnvironment, summaryTag, summaryVersion])
  const scopedMetrics = useMemo(() => calculateAlgorithmMetrics(scopedTrades, selectedRobot?.initialCapital ?? 0), [scopedTrades, selectedRobot?.initialCapital])
  const equityCurve = useMemo(() => buildEquityCurve(scopedTrades, selectedRobot?.initialCapital ?? 0), [scopedTrades, selectedRobot?.initialCapital])
  const drawdownCurve = useMemo(() => buildDrawdownCurve(scopedTrades, selectedRobot?.initialCapital ?? 0), [scopedTrades, selectedRobot?.initialCapital])

  const openRobotModal = (robot?: AlgorithmRobot | null) => {
    setEditingRobotId(robot?.id ?? null)
    setRobotForm(robotFormFrom(robot, defaultCurrency))
    setRobotModalOpen(true)
    setOpenMenuId(null)
  }

  const saveRobot = async (event: FormEvent) => {
    event.preventDefault()
    if (!robotForm.name.trim() || !robotForm.market.trim() || !robotForm.timeframe.trim()) { onNotify('Nombre, activo o mercado y temporalidad son obligatorios.'); return }
    if (robotForm.initialCapital.trim() === '' || !Number.isFinite(Number(robotForm.initialCapital)) || Number(robotForm.initialCapital) < 0) { onNotify('Introduce un capital inicial válido.'); return }
    const existing = editingRobotId ? algorithms.find((robot) => robot.id === editingRobotId) : null
    const now = nowIso()
    const next: AlgorithmRobot = {
      id: existing?.id ?? uid(),
      name: robotForm.name.trim(),
      description: robotForm.description.trim(),
      version: robotForm.version.trim() || '1.0.0',
      status: robotForm.status,
      environment: robotForm.environment,
      market: robotForm.market.trim(),
      symbols: robotForm.symbols.split(/[,;|]/).map((value) => value.trim().toUpperCase()).filter(Boolean),
      timeframe: robotForm.timeframe.trim() || '1H',
      direction: robotForm.direction,
      initialCapital: Number(robotForm.initialCapital) || 0,
      currency: robotForm.currency,
      riskMode: robotForm.riskMode,
      riskValue: robotForm.riskValue === '' ? undefined : Number(robotForm.riskValue),
      tags: robotForm.tags.split(/[,;|]/).map((value) => value.trim()).filter(Boolean),
      color: robotForm.color,
      strategyType: robotForm.strategyType.trim() || undefined,
      platform: robotForm.platform.trim() || undefined,
      broker: robotForm.broker.trim() || undefined,
      programmingLanguage: robotForm.programmingLanguage.trim() || undefined,
      pythonVersion: robotForm.pythonVersion.trim() || undefined,
      libraries: robotForm.libraries.split(/[,;|]/).map((value) => value.trim()).filter(Boolean),
      timezone: robotForm.timezone.trim() || undefined,
      tradingHours: robotForm.tradingHours.trim() || undefined,
      maxDailyTrades: robotForm.maxDailyTrades === '' ? undefined : Number(robotForm.maxDailyTrades),
      stopLossModel: robotForm.stopLossModel.trim() || undefined,
      takeProfitModel: robotForm.takeProfitModel.trim() || undefined,
      trailingStop: robotForm.trailingStop,
      breakEven: robotForm.breakEven,
      dailyLossLimit: robotForm.dailyLossLimit === '' ? undefined : Number(robotForm.dailyLossLimit),
      maxDrawdownLimit: robotForm.maxDrawdownLimit === '' ? undefined : Number(robotForm.maxDrawdownLimit),
      positionSizing: robotForm.positionSizing.trim() || undefined,
      estimatedCommission: robotForm.estimatedCommission === '' ? undefined : Number(robotForm.estimatedCommission),
      estimatedSlippage: robotForm.estimatedSlippage === '' ? undefined : Number(robotForm.estimatedSlippage),
      startDate: robotForm.startDate || undefined,
      endDate: robotForm.endDate || undefined,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      archivedAt: robotForm.status === 'archived' ? existing?.archivedAt ?? now : undefined,
      trades: existing?.trades ?? [],
      imports: existing?.imports ?? [],
      codeFiles: existing?.codeFiles ?? [],
      codeVersions: existing?.codeVersions ?? [],
      attachments: existing?.attachments ?? [],
      documentation: existing?.documentation ?? { ...EMPTY_DOCUMENTATION },
    }
    await onChange(existing ? algorithms.map((robot) => robot.id === next.id ? next : robot) : [next, ...algorithms], existing ? 'Robot actualizado.' : 'Robot creado y guardado en tu cuenta.')
    setRobotModalOpen(false)
    if (!existing) { setSelectedRobotId(next.id); setActiveTab('summary') }
  }

  const duplicateRobot = async (robot: AlgorithmRobot) => {
    const newId = uid()
    const now = nowIso()
    const copy: AlgorithmRobot = {
      ...structuredClone(robot),
      id: newId,
      name: robot.name + ' · copia',
      status: 'development',
      createdAt: now,
      updatedAt: now,
      archivedAt: undefined,
      trades: robot.trades.map((trade) => ({ ...trade, id: uid(), robotId: newId, importId: undefined, createdAt: now, updatedAt: now })),
      imports: [],
      codeFiles: robot.codeFiles.map((file) => ({ ...file, id: uid(), robotId: newId, createdAt: now, updatedAt: now })),
      codeVersions: [],
      attachments: robot.attachments.map((item) => ({ ...item, id: uid(), robotId: newId, createdAt: now })),
    }
    await onChange([copy, ...algorithms], 'Robot duplicado con sus datos y documentación.')
    setOpenMenuId(null)
  }

  const archiveRobot = async (robot: AlgorithmRobot) => {
    await replaceRobot({ ...robot, status: robot.status === 'archived' ? 'development' : 'archived', archivedAt: robot.status === 'archived' ? undefined : nowIso(), updatedAt: nowIso() }, robot.status === 'archived' ? 'Robot restaurado.' : 'Robot archivado.')
    setOpenMenuId(null)
  }

  const deleteRobot = async (robot: AlgorithmRobot) => {
    if (!window.confirm('Se eliminarán el robot, sus operaciones, archivos y versiones. Esta acción no se puede deshacer.')) return
    await onChange(algorithms.filter((item) => item.id !== robot.id), 'Robot eliminado definitivamente.')
    setSelectedRobotId(null)
  }

  const exportRobot = (robot: AlgorithmRobot) => {
    downloadBlob(JSON.stringify(robot, null, 2), 'application/json', robot.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase() + '-backup.json')
    onNotify('Copia completa del robot exportada.')
  }

  const exportTrades = async (robot: AlgorithmRobot, trades = robot.trades) => {
    const XLSX = await import('xlsx')
    const rows = trades.map((trade) => ({
      ID: trade.externalId ?? trade.id, Versión: trade.robotVersion ?? robot.version, Entorno: ENVIRONMENT_LABELS[trade.environment], Entrada: trade.entryDate, Salida: trade.exitDate ?? '',
      Símbolo: trade.symbol, Dirección: trade.side === 'long' ? 'Compra' : 'Venta', Estado: trade.status,
      PrecioEntrada: trade.entryPrice ?? '', PrecioSalida: trade.exitPrice ?? '', StopLoss: trade.stopLoss ?? '', TakeProfit: trade.takeProfit ?? '',
      Lotes: trade.lots ?? '', Contratos: trade.contracts ?? '', Comisión: trade.commission ?? '', Swap: trade.swap ?? '', Slippage: trade.slippage ?? '', Puntos: trade.points ?? '', Resultado: trade.profit, ResultadoPct: trade.profitPercent ?? '',
      Setup: trade.setup ?? '', MotivoEntrada: trade.entryReason ?? '', MotivoSalida: trade.exitReason ?? '', Etiquetas: trade.tags?.join(', ') ?? '', Notas: trade.notes ?? '',
    }))
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), 'Operaciones')
    XLSX.writeFile(workbook, robot.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase() + '-operaciones.xlsx')
    onNotify('Operaciones exportadas a Excel.')
  }

  const openTradeModal = (trade?: AlgorithmTrade | null) => {
    if (!selectedRobot) return
    setEditingTradeId(trade?.id ?? null)
    setTradeForm(tradeFormFrom(trade, selectedRobot))
    setTradeModalOpen(true)
  }

  const saveTrade = async (event: FormEvent) => {
    event.preventDefault()
    if (!selectedRobot) return
    if (!tradeForm.entryDate || !tradeForm.symbol.trim()) { onNotify('La fecha y el símbolo son obligatorios.'); return }
    if (tradeForm.profit.trim() === '' || !Number.isFinite(Number(tradeForm.profit))) { onNotify('Introduce un resultado numérico válido.'); return }
    if (tradeForm.exitDate && new Date(tradeForm.exitDate).getTime() < new Date(tradeForm.entryDate).getTime()) { onNotify('La salida no puede ser anterior a la entrada.'); return }
    const existing = editingTradeId ? selectedRobot.trades.find((trade) => trade.id === editingTradeId) : null
    const optionalNumber = (value: string) => value.trim() === '' ? undefined : Number(value)
    const now = nowIso()
    const next: AlgorithmTrade = {
      id: existing?.id ?? uid(),
      robotId: selectedRobot.id,
      importId: existing?.importId,
      externalId: existing?.externalId,
      robotVersion: tradeForm.robotVersion.trim() || selectedRobot.version,
      environment: tradeForm.environment,
      entryDate: new Date(tradeForm.entryDate).toISOString(),
      exitDate: tradeForm.status === 'closed' && tradeForm.exitDate ? new Date(tradeForm.exitDate).toISOString() : undefined,
      symbol: tradeForm.symbol.trim().toUpperCase(),
      side: tradeForm.side,
      status: tradeForm.status,
      entryPrice: optionalNumber(tradeForm.entryPrice),
      exitPrice: optionalNumber(tradeForm.exitPrice),
      stopLoss: optionalNumber(tradeForm.stopLoss),
      takeProfit: optionalNumber(tradeForm.takeProfit),
      lots: optionalNumber(tradeForm.lots),
      commission: optionalNumber(tradeForm.commission),
      swap: optionalNumber(tradeForm.swap),
      slippage: optionalNumber(tradeForm.slippage),
      points: optionalNumber(tradeForm.points),
      contracts: optionalNumber(tradeForm.contracts),
      breakEven: tradeForm.breakEven,
      profit: Number(tradeForm.profit) || 0,
      profitPercent: optionalNumber(tradeForm.profitPercent),
      setup: tradeForm.setup.trim() || undefined,
      entryReason: tradeForm.entryReason.trim() || undefined,
      exitReason: tradeForm.exitReason.trim() || undefined,
      tags: tradeForm.tags.split(/[,;|]/).map((value) => value.trim()).filter(Boolean),
      notes: tradeForm.notes.trim() || undefined,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    }
    await replaceRobot({ ...selectedRobot, trades: existing ? selectedRobot.trades.map((trade) => trade.id === next.id ? next : trade) : [next, ...selectedRobot.trades], updatedAt: now }, existing ? 'Operación actualizada.' : 'Operación añadida.')
    setTradeModalOpen(false)
  }

  const removeTrades = async (ids: string[]) => {
    if (!selectedRobot || !ids.length || !window.confirm('¿Eliminar las operaciones seleccionadas?')) return
    await replaceRobot({ ...selectedRobot, trades: selectedRobot.trades.filter((trade) => !ids.includes(trade.id)), updatedAt: nowIso() }, ids.length === 1 ? 'Operación eliminada.' : ids.length + ' operaciones eliminadas.')
    setSelectedTrades(new Set())
  }

  const filteredTrades = useMemo(() => {
    if (!selectedRobot) return []
    const result = sortAlgorithmTrades(selectedRobot.trades).reverse().filter((trade) => {
      const text = [trade.symbol, trade.setup, trade.notes, trade.externalId, trade.tags?.join(' ')].join(' ').toLowerCase()
      const dateKey = trade.entryDate.slice(0, 10)
      return text.includes(tradeSearch.toLowerCase())
        && (tradeSide === 'all' || trade.side === tradeSide)
        && (tradeStatus === 'all' || trade.status === tradeStatus)
        && (tradeResult === 'all' || (tradeResult === 'win' ? trade.profit > 0 : tradeResult === 'loss' ? trade.profit < 0 : trade.profit === 0))
        && (tradeEnvironment === 'all' || trade.environment === tradeEnvironment)
        && (tradeVersion === 'all' || (trade.robotVersion ?? selectedRobot.version) === tradeVersion)
        && (tradeTag === 'all' || trade.tags?.includes(tradeTag))
        && (!tradeDate || dateKey === tradeDate)
    })
    return result.sort((a, b) => {
      if (tradeSort === 'best') return b.profit - a.profit
      if (tradeSort === 'worst') return a.profit - b.profit
      const aTime = new Date(a.exitDate ?? a.entryDate).getTime()
      const bTime = new Date(b.exitDate ?? b.entryDate).getTime()
      return tradeSort === 'oldest' ? aTime - bTime : bTime - aTime
    })
  }, [selectedRobot, tradeDate, tradeEnvironment, tradeResult, tradeSearch, tradeSide, tradeSort, tradeStatus, tradeTag, tradeVersion])
  const pageSize = 25
  const totalPages = Math.max(1, Math.ceil(filteredTrades.length / pageSize))
  const pagedTrades = filteredTrades.slice((tradePage - 1) * pageSize, tradePage * pageSize)

  const loadImportFile = async (file?: File) => {
    if (!file) return
    setIsParsing(true)
    try {
      const parsed = await parseAlgorithmFile(file)
      setParsedFile(parsed)
      setImportMapping(parsed.mapping)
      setIgnoredImportRows(new Set())
      onNotify(parsed.rows.length + ' filas leídas. Revisa el mapeo antes de importar.')
    } catch (error) {
      onNotify(error instanceof Error ? error.message : 'No se pudo leer el archivo.')
      setParsedFile(null)
    } finally {
      setIsParsing(false)
    }
  }

  const importPreview = useMemo(() => {
    if (!parsedFile || !selectedRobot) return []
    return buildAlgorithmTrades(parsedFile.rows, importMapping, selectedRobot.id, 'preview', importEnvironment, selectedRobot.trades)
  }, [importEnvironment, importMapping, parsedFile, selectedRobot])
  const importValid = importPreview.filter((row) => row.trade && !row.errors.length && !ignoredImportRows.has(row.row))
  const importInvalid = importPreview.filter((row) => row.errors.length)
  const importDuplicates = importValid.filter((row) => row.duplicate)
  const importUnmappedHeaders = parsedFile?.headers.filter((header) => !Object.values(importMapping).includes(header)) ?? []
  const importProfitSamples = parsedFile && importMapping.profit
    ? parsedFile.rows.slice(0, 20).map((row) => String(row[importMapping.profit] ?? '')).filter(Boolean)
    : []
  const importDecimalLabel = importProfitSamples.some((value) => value.includes(',')) ? 'Coma decimal detectada' : 'Punto decimal o valores numéricos'

  const downloadImportErrors = () => {
    if (!importInvalid.length) return
    const rows = ['Fila,Error', ...importInvalid.map((row) => row.row + ',"' + row.errors.join(' · ').replace(/"/g, '""') + '"')]
    downloadBlob('\uFEFF' + rows.join('\n'), 'text/csv;charset=utf-8', 'errores-importacion.csv')
  }

  const commitImport = async () => {
    if (!parsedFile || !selectedRobot) return
    const missing = ALGORITHM_IMPORT_COLUMNS.filter((column) => column.required && !importMapping[column.key])
    if (missing.length) { onNotify('Faltan columnas obligatorias: ' + missing.map((item) => item.label).join(', ')); return }
    const importId = uid()
    const built = buildAlgorithmTrades(parsedFile.rows, importMapping, selectedRobot.id, importId, importEnvironment, selectedRobot.trades)
    const accepted = built
      .filter((row) => row.trade && !row.errors.length && !ignoredImportRows.has(row.row) && (duplicateMode === 'include' || duplicateMode === 'replace' || !row.duplicate))
      .map((row) => ({ ...(row.trade as AlgorithmTrade), robotVersion: (row.trade as AlgorithmTrade).robotVersion ?? importVersion }))
    const replacedFingerprints = duplicateMode === 'replace'
      ? new Set(accepted.filter((trade) => built.find((row) => row.trade?.id === trade.id)?.duplicate).map(algorithmTradeFingerprint))
      : new Set<string>()
    const replacedTrades = duplicateMode === 'replace'
      ? selectedRobot.trades.filter((trade) => replacedFingerprints.has(algorithmTradeFingerprint(trade)))
      : []
    if (!accepted.length) { onNotify('No hay filas válidas nuevas para importar.'); return }
    const record = {
      id: importId, robotId: selectedRobot.id, fileName: parsedFile.fileName, importedAt: nowIso(), environment: importEnvironment, robotVersion: importVersion,
      rowsRead: built.length, rowsImported: accepted.length, rowsSkipped: built.length - accepted.length,
      rowsInvalid: built.filter((row) => row.errors.length).length, duplicates: built.filter((row) => row.duplicate).length,
      mapping: importMapping, tradeIds: accepted.map((trade) => trade.id), warnings: parsedFile.warnings, replacedTrades,
    }
    await replaceRobot({ ...selectedRobot, trades: [...accepted, ...selectedRobot.trades.filter((trade) => !replacedFingerprints.has(algorithmTradeFingerprint(trade)))], imports: [record, ...selectedRobot.imports], updatedAt: nowIso() }, accepted.length + ' operaciones importadas correctamente.')
    setParsedFile(null)
    setImportMapping({})
    setIgnoredImportRows(new Set())
    if (importInputRef.current) importInputRef.current.value = ''
  }

  const undoImport = async (importId: string) => {
    if (!selectedRobot || !window.confirm('Se borrarán solo las operaciones creadas por esta importación.')) return
    const record = selectedRobot.imports.find((item) => item.id === importId)
    if (!record) return
    const ids = new Set(record.tradeIds)
    const retained = selectedRobot.trades.filter((trade) => !ids.has(trade.id))
    const retainedFingerprints = new Set(retained.map(algorithmTradeFingerprint))
    const restored = (record.replacedTrades ?? []).filter((trade) => !retainedFingerprints.has(algorithmTradeFingerprint(trade)))
    await replaceRobot({ ...selectedRobot, trades: [...restored, ...retained], imports: selectedRobot.imports.filter((item) => item.id !== importId), updatedAt: nowIso() }, 'Importación deshecha sin afectar otras operaciones.')
  }

  const createCodeFile = async () => {
    if (!selectedRobot) return
    const name = window.prompt('Nombre del archivo Python', selectedRobot.codeFiles.length ? 'modulo.py' : 'main.py')?.trim()
    if (!name) return
    const file: AlgorithmCodeFile = { id: uid(), robotId: selectedRobot.id, name: name.endsWith('.py') ? name : name + '.py', language: 'python', content: '# ' + name + '\n', createdAt: nowIso(), updatedAt: nowIso() }
    await replaceRobot({ ...selectedRobot, codeFiles: [...selectedRobot.codeFiles, file], updatedAt: nowIso() }, 'Archivo Python creado.')
    setCodeFileId(file.id)
    setCodeDraft(file.content)
  }

  const uploadCodeFile = async (file?: File) => {
    if (!selectedRobot || !file) return
    if (file.size > 500 * 1024) { onNotify('El archivo de código supera 500 KB.'); return }
    if (!file.name.toLowerCase().endsWith('.py') && !file.name.toLowerCase().endsWith('.txt')) { onNotify('Solo se admiten archivos .py o .txt.'); return }
    const content = await file.text()
    const codeFile: AlgorithmCodeFile = { id: uid(), robotId: selectedRobot.id, name: file.name, language: file.name.endsWith('.py') ? 'python' : 'text', content, createdAt: nowIso(), updatedAt: nowIso() }
    await replaceRobot({ ...selectedRobot, codeFiles: [...selectedRobot.codeFiles, codeFile], updatedAt: nowIso() }, 'Código cargado y guardado.')
    setCodeFileId(codeFile.id)
    setCodeDraft(content)
  }

  const saveCodeVersion = async () => {
    if (!selectedRobot || !codeFileId) return
    const file = selectedRobot.codeFiles.find((item) => item.id === codeFileId)
    if (!file) return
    const notes = window.prompt('Describe brevemente los cambios de esta versión', 'Guardado manual')
    if (notes === null) return
    const versionNumber = 1 + Math.max(0, ...selectedRobot.codeVersions.filter((version) => version.fileId === file.id).map((version) => version.version))
    const updatedFile = { ...file, content: codeDraft, updatedAt: nowIso() }
    const version = { id: uid(), robotId: selectedRobot.id, fileId: file.id, version: versionNumber, content: codeDraft, createdAt: nowIso(), notes: notes.trim() || 'Guardado manual' }
    await replaceRobot({ ...selectedRobot, codeFiles: selectedRobot.codeFiles.map((item) => item.id === file.id ? updatedFile : item), codeVersions: [version, ...selectedRobot.codeVersions], updatedAt: nowIso() }, 'Código guardado como versión ' + versionNumber + '.')
  }

  const handleCodeKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Tab') return
    event.preventDefault()
    const target = event.currentTarget
    const start = target.selectionStart
    const end = target.selectionEnd
    const next = codeDraft.slice(0, start) + '    ' + codeDraft.slice(end)
    setCodeDraft(next)
    requestAnimationFrame(() => target.setSelectionRange(start + 4, start + 4))
  }

  const deleteCodeFile = async () => {
    if (!selectedRobot || !codeFileId || !window.confirm('¿Eliminar este archivo y todo su historial de versiones?')) return
    await replaceRobot({ ...selectedRobot, codeFiles: selectedRobot.codeFiles.filter((file) => file.id !== codeFileId), codeVersions: selectedRobot.codeVersions.filter((version) => version.fileId !== codeFileId), updatedAt: nowIso() }, 'Archivo de código eliminado.')
    setCodeFileId(null)
    setCodeDraft('')
  }

  const restoreCodeVersion = async (versionId: string) => {
    if (!selectedRobot) return
    const version = selectedRobot.codeVersions.find((item) => item.id === versionId)
    if (!version) return
    const updated = selectedRobot.codeFiles.map((file) => file.id === version.fileId ? { ...file, content: version.content, updatedAt: nowIso() } : file)
    await replaceRobot({ ...selectedRobot, codeFiles: updated, updatedAt: nowIso() }, 'Versión ' + version.version + ' restaurada.')
    setCodeFileId(version.fileId)
    setCodeDraft(version.content)
  }

  const markCodeVersion = async (versionId: string, label: 'stable' | 'real') => {
    if (!selectedRobot) return
    await replaceRobot({ ...selectedRobot, codeVersions: selectedRobot.codeVersions.map((version) => ({ ...version, label: version.id === versionId ? label : version.label === label ? undefined : version.label })), updatedAt: nowIso() }, label === 'stable' ? 'Versión marcada como estable.' : 'Versión marcada como real.')
  }

  const saveDocumentation = async () => {
    if (!selectedRobot) return
    await replaceRobot({ ...selectedRobot, documentation: { ...documentationDraft, updatedAt: nowIso() }, updatedAt: nowIso() }, 'Documentación de la estrategia guardada.')
    setDocumentationDirty(false)
  }

  const insertDocumentationSnippet = (prefix: string, suffix = '') => {
    setDocumentationDraft((current) => ({
      ...current,
      [activeDocumentationKey]: String(current[activeDocumentationKey] ?? '') + (String(current[activeDocumentationKey] ?? '') ? '\n' : '') + prefix + suffix,
    }))
    setDocumentationDirty(true)
  }

  const loadDocumentationTemplate = () => {
    setDocumentationDraft({
      summary: 'Objetivo del algoritmo y ventaja estadística que pretende explotar.',
      marketContext: 'Mercados, sesiones, volatilidad y condiciones donde debe operar.',
      entryRules: '1. Condición principal\n2. Confirmación\n3. Momento de ejecución',
      exitRules: 'Stop inicial, objetivo, break-even, salida temporal y salida por invalidación.',
      riskManagement: 'Riesgo máximo por operación, exposición simultánea y límite diario.',
      filters: 'Filtros horarios, de tendencia, volatilidad, noticias y liquidez.',
      parameters: 'Parámetros configurables, valor por defecto y rango validado.',
      indicators: 'Indicadores utilizados, parámetros y función de cada uno.',
      examples: 'Ejemplos de operaciones ganadoras, perdedoras y capturas relacionadas.',
      assumptions: 'Costes, deslizamiento, latencia y calidad de los datos asumidos.',
      knownRisks: 'Sobreajuste, cambios de régimen, huecos, correlación y fallos de infraestructura.',
      recommendedConditions: 'Condiciones de mercado donde el robot funciona mejor y cuándo debe permanecer detenido.',
      personalNotes: 'Notas personales, ideas de mejora y pruebas pendientes.',
      changelog: 'v1.0.0 · Primera versión documentada.',
    })
    setDocumentationDirty(true)
  }

  const addAttachments = async (files: FileList | null) => {
    if (!selectedRobot || !files?.length) return
    const allowed = ['pdf', 'txt', 'md', 'png', 'jpg', 'jpeg', 'csv', 'xlsx', 'xls', 'json', 'py']
    const accepted: AlgorithmAttachment[] = []
    for (const file of Array.from(files)) {
      const extension = file.name.split('.').pop()?.toLowerCase() ?? ''
      if (!allowed.includes(extension) || file.size > 1024 * 1024) { onNotify('Se omitió ' + file.name + ': formato no permitido o más de 1 MB.'); continue }
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result))
        reader.onerror = () => reject(reader.error)
        reader.readAsDataURL(file)
      })
      accepted.push({ id: uid(), robotId: selectedRobot.id, name: file.name, type: file.type || 'application/octet-stream', size: file.size, dataUrl, createdAt: nowIso() })
    }
    if (accepted.length) await replaceRobot({ ...selectedRobot, attachments: [...accepted, ...selectedRobot.attachments], updatedAt: nowIso() }, accepted.length + ' adjuntos guardados.')
  }

  const describeAttachment = async (id: string) => {
    if (!selectedRobot) return
    const attachment = selectedRobot.attachments.find((item) => item.id === id)
    if (!attachment) return
    const description = window.prompt('Descripción del archivo', attachment.description ?? '')
    if (description === null) return
    await replaceRobot({ ...selectedRobot, attachments: selectedRobot.attachments.map((item) => item.id === id ? { ...item, description: description.trim() || undefined } : item), updatedAt: nowIso() }, 'Descripción del adjunto actualizada.')
  }

  const removeAttachment = async (id: string) => {
    if (!selectedRobot) return
    await replaceRobot({ ...selectedRobot, attachments: selectedRobot.attachments.filter((item) => item.id !== id), updatedAt: nowIso() }, 'Adjunto eliminado.')
  }

  const robotVersions = [...new Set([selectedRobot?.version, ...(selectedRobot?.trades.map((trade) => trade.robotVersion) ?? [])].filter(Boolean) as string[])]
  const robotTags = [...new Set(selectedRobot?.trades.flatMap((trade) => trade.tags ?? []) ?? [])]
  const selectedCodeFile = selectedRobot?.codeFiles.find((file) => file.id === codeFileId) ?? null
  const codeVersions = selectedRobot?.codeVersions.filter((version) => version.fileId === codeFileId) ?? []
  const codeSearchCount = codeSearch ? codeDraft.toLowerCase().split(codeSearch.toLowerCase()).length - 1 : 0
  const codeLineNumbers = Array.from({ length: Math.max(1, codeDraft.split('\n').length) }, (_, index) => index + 1).join('\n')
  const weekdayStats = useMemo(() => groupProfitBy(scopedTrades, 'weekday').sort((a, b) => b.profit - a.profit), [scopedTrades])
  const hourStats = useMemo(() => groupProfitBy(scopedTrades, 'hour').sort((a, b) => b.profit - a.profit), [scopedTrades])
  const symbolStats = useMemo(() => groupProfitBy(scopedTrades, 'symbol').sort((a, b) => b.profit - a.profit), [scopedTrades])

  const calendarData = useMemo(() => {
    const map = new Map<string, { count: number; profit: number }>()
    scopedTrades.forEach((trade) => {
      const key = trade.entryDate.slice(0, 10)
      const value = map.get(key) ?? { count: 0, profit: 0 }
      value.count += 1
      value.profit += trade.profit
      map.set(key, value)
    })
    return map
  }, [scopedTrades])
  const calendarYear = calendarMonth.getFullYear()
  const calendarMonthIndex = calendarMonth.getMonth()
  const calendarDays = new Date(calendarYear, calendarMonthIndex + 1, 0).getDate()
  const calendarLeading = (new Date(calendarYear, calendarMonthIndex, 1).getDay() + 6) % 7
  const calendarMonthKey = calendarYear + '-' + String(calendarMonthIndex + 1).padStart(2, '0')
  const calendarMonthEntries = [...calendarData.entries()].filter(([key]) => key.startsWith(calendarMonthKey))
  const calendarMonthProfit = calendarMonthEntries.reduce((sum, [, value]) => sum + value.profit, 0)
  const calendarMonthOperations = calendarMonthEntries.reduce((sum, [, value]) => sum + value.count, 0)

  if (!selectedRobot) {
    return (
      <main className="algorithms-module">
        <section className="algo-page-header">
          <div>
            <span className="algo-eyebrow">Automatización y sistemas</span>
            <h1>Control de Algoritmos</h1>
            <p>Audita robots, importa ejecuciones y conserva su código y documentación en un único lugar.</p>
          </div>
          <button className="algo-button primary" type="button" onClick={() => openRobotModal()}>+ Añadir robot</button>
        </section>

        <section className="algo-panel algo-global-panel">
          <div className="algo-panel-heading">
            <div><h2>Visión global algorítmica</h2><p>Resultados combinados sin mezclar operaciones manuales.</p></div>
            <div className="algo-header-actions">
              <button className="algo-button ai" type="button" onClick={() => document.getElementById('algo-insights')?.scrollIntoView({ behavior: 'smooth' })}>✦ Análisis</button>
              <button className="algo-button" type="button" onClick={() => { void (async () => {
                const XLSX = await import('xlsx')
                const workbook = XLSX.utils.book_new()
                XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(visibleGlobalTrades), 'Operaciones robots')
                XLSX.writeFile(workbook, 'la-biblia-algoritmos.xlsx')
                onNotify('Informe global de algoritmos exportado.')
              })() }}>Exportar Excel</button>
            </div>
          </div>
          <div className="algo-filter-bar">
            <label><span>Buscar</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Nombre, mercado, símbolo..." /></label>
            <label><span>Estado</span><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as 'all' | AlgorithmStatus)}><option value="all">Todos</option>{Object.entries(STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label><span>Entorno</span><select value={environmentFilter} onChange={(event) => setEnvironmentFilter(event.target.value as 'all' | AlgorithmEnvironment)}><option value="all">Todos</option>{Object.entries(ENVIRONMENT_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label><span>Periodo</span><select value={globalPeriod} onChange={(event) => setGlobalPeriod(event.target.value)}><option value="1d">1 día</option><option value="1w">1 semana</option><option value="1m">1 mes</option><option value="3m">3 meses</option><option value="6m">6 meses</option><option value="1y">1 año</option><option value="all">Todo</option></select></label>
          </div>
          <div className="algo-metrics-grid global">
            <MetricCard icon="⌘" label="Robots" value={String(filteredRobots.length)} detail={filteredRobots.filter((robot) => ['active', 'live'].includes(robot.status)).length + ' activos'} tone="blue" />
            <MetricCard icon="€" label="Capital inicial" value={formatMoney(globalResultRobots.reduce((sum, robot) => sum + robot.initialCapital, 0), defaultCurrency)} detail={statusFilter === 'all' ? 'robots activos' : 'robots filtrados'} />
            <MetricCard icon="◉" label="Capital actual" value={formatMoney(globalResultRobots.reduce((sum, robot) => sum + robot.initialCapital, 0) + globalMetrics.netProfit, defaultCurrency)} detail={globalMetrics.totalTrades + ' operaciones'} tone="blue" />
            <MetricCard icon="↗" label="P/L neto" value={formatMoney(globalMetrics.netProfit, defaultCurrency)} detail={formatNumber(globalMetrics.returnPercent) + '% retorno'} tone={globalMetrics.netProfit >= 0 ? 'positive' : 'negative'} />
            <MetricCard icon="◎" label="Win rate" value={formatNumber(globalMetrics.winRate, 1) + '%'} detail={globalMetrics.wins + ' G · ' + globalMetrics.losses + ' P'} tone="purple" />
            <MetricCard icon="◇" label="Profit factor" value={globalMetrics.profitFactor == null ? '∞' : formatNumber(globalMetrics.profitFactor)} detail={'R/B ' + (globalMetrics.riskRewardRatio == null ? '∞' : formatNumber(globalMetrics.riskRewardRatio))} />
            <MetricCard icon="↓" label="Máx. drawdown" value={formatMoney(globalMetrics.maxDrawdown, defaultCurrency)} detail={formatNumber(globalMetrics.maxDrawdownPercent) + '%'} tone={globalMetrics.maxDrawdown > 0 ? 'negative' : 'neutral'} />
            <MetricCard icon="≈" label="Media por operación" value={formatMoney(globalMetrics.averageTrade, defaultCurrency)} detail="expectativa observada" tone={globalMetrics.averageTrade >= 0 ? 'positive' : 'negative'} />
            <MetricCard icon="+" label="Mejor operación" value={formatMoney(globalMetrics.bestTrade, defaultCurrency)} detail={'racha +' + globalMetrics.maxWinStreak} tone="positive" />
            <MetricCard icon="−" label="Peor operación" value={formatMoney(globalMetrics.worstTrade, defaultCurrency)} detail={'racha -' + globalMetrics.maxLossStreak} tone="negative" />
            <MetricCard icon="⌁" label="Comisiones" value={formatMoney(globalMetrics.commissionTotal, defaultCurrency)} detail="coste registrado" />
            <MetricCard icon="S" label="Sharpe" value={globalMetrics.sharpe == null ? '—' : formatNumber(globalMetrics.sharpe)} detail="estimación anualizada" />
            <MetricCard icon="So" label="Sortino" value={globalMetrics.sortino == null ? '—' : formatNumber(globalMetrics.sortino)} detail="riesgo bajista" />
            <MetricCard icon="+Ø" label="Ganancia media" value={formatMoney(globalMetrics.averageWin, defaultCurrency)} detail="operaciones ganadoras" tone="positive" />
            <MetricCard icon="−Ø" label="Pérdida media" value={formatMoney(globalMetrics.averageLoss, defaultCurrency)} detail="operaciones perdedoras" tone="negative" />
            <MetricCard icon="R" label="Recovery factor" value={globalMetrics.recoveryFactor == null ? '—' : formatNumber(globalMetrics.recoveryFactor)} detail="beneficio / drawdown" />
          </div>
          <div className="algo-chart-card">
            <div className="algo-card-heading"><div><h3>Curva conjunta</h3><p>Capital inicial más resultado acumulado de los robots activos o del estado filtrado.</p></div></div>
            <DataChart series={[{ label: 'Equity', color: '#007AFF', points: globalCurve }]} />
          </div>
          <div id="algo-insights" className="algo-insight-strip">
            <strong>Lectura rápida</strong>
            <span>{globalMetrics.closedTrades < 20 ? 'La muestra todavía es pequeña; evita conclusiones definitivas.' : 'La muestra ya permite comparar estabilidad entre robots.'}</span>
            <span>{globalMetrics.maxDrawdownPercent > 15 ? 'El drawdown global supera el 15%; revisa riesgo y correlaciones.' : 'El drawdown agregado está contenido respecto al capital declarado.'}</span>
          </div>
        </section>

        <section className="algo-robots-section">
          <div className="algo-section-heading"><div><h2>Mis robots</h2><p>{filteredRobots.length} sistemas visibles</p></div></div>
          {filteredRobots.length ? (
            <div className="algo-robot-grid">
              {filteredRobots.map((robot) => {
                const metrics = calculateAlgorithmMetrics(robot.trades, robot.initialCapital)
                return (
                  <article key={robot.id} className="algo-robot-card" style={{ '--robot-color': robot.color } as CSSProperties} onClick={() => { setSelectedRobotId(robot.id); setActiveTab('summary') }}>
                    <div className="algo-robot-card-top">
                      <span className="algo-robot-icon">⌁</span>
                      <div className="algo-robot-title"><strong>{robot.name}</strong><small>{robot.market || 'Mercado sin definir'} · {robot.timeframe}</small></div>
                      <div className="algo-menu-shell">
                        <button type="button" className="algo-icon-button" aria-label={'Opciones de ' + robot.name} onClick={(event) => { event.stopPropagation(); setOpenMenuId(openMenuId === robot.id ? null : robot.id) }}>•••</button>
                        {openMenuId === robot.id ? <div className="algo-menu" onClick={(event) => event.stopPropagation()}>
                          <button type="button" onClick={() => openRobotModal(robot)}>Editar</button>
                          <button type="button" onClick={() => void duplicateRobot(robot)}>Duplicar</button>
                          <button type="button" onClick={() => void archiveRobot(robot)}>{robot.status === 'archived' ? 'Restaurar' : 'Archivar'}</button>
                          <button type="button" onClick={() => exportRobot(robot)}>Exportar copia</button>
                          <button type="button" className="danger" onClick={() => void deleteRobot(robot)}>Eliminar</button>
                        </div> : null}
                      </div>
                    </div>
                    <div className="algo-badges"><span className={'algo-status ' + robot.status}>{STATUS_LABELS[robot.status]}</span><span>{ENVIRONMENT_LABELS[robot.environment]}</span><span>v{robot.version}</span></div>
                    <p>{robot.description || 'Sin descripción todavía.'}</p>
                    <div className="algo-card-dates"><span>Creado {new Date(robot.createdAt).toLocaleDateString('es-ES')}</span><span>Actualizado {new Date(robot.updatedAt).toLocaleDateString('es-ES')}</span></div>
                    <div className="algo-robot-stats">
                      <div><span>Capital inicial</span><strong>{formatMoney(robot.initialCapital, robot.currency)}</strong></div>
                      <div><span>Capital actual</span><strong>{formatMoney(robot.initialCapital + metrics.netProfit, robot.currency)}</strong></div>
                      <div><span>P/L</span><strong className={metrics.netProfit >= 0 ? 'positive' : 'negative'}>{formatMoney(metrics.netProfit, robot.currency)}</strong></div>
                      <div><span>Rentabilidad</span><strong>{formatNumber(metrics.returnPercent, 1)}%</strong></div>
                      <div><span>Operaciones</span><strong>{metrics.totalTrades}</strong></div>
                      <div><span>Win rate / DD</span><strong>{formatNumber(metrics.winRate, 0)}% · {formatNumber(metrics.maxDrawdownPercent, 1)}%</strong></div>
                    </div>
                    <div className="algo-card-health" aria-label="Contenido guardado"><span className={robot.codeFiles.length ? 'ready' : ''}>⌘ Código</span><span className={Object.values(robot.documentation).some((value) => String(value ?? '').trim()) ? 'ready' : ''}>≡ Documentación</span><span className={robot.imports.length ? 'ready' : ''}>⇩ Datos</span></div>
                  </article>
                )
              })}
            </div>
          ) : <div className="algo-empty-state"><span>⌁</span><h3>No hay robots en esta vista</h3><p>Crea el primero o cambia los filtros.</p><button className="algo-button primary" type="button" onClick={() => openRobotModal()}>Añadir robot</button></div>}
        </section>

        {robotModalOpen ? renderRobotModal() : null}
      </main>
    )
  }

  function renderRobotModal() {
    return (
      <div className="algo-modal-overlay" role="dialog" aria-modal="true" onMouseDown={(event) => { if (event.target === event.currentTarget) setRobotModalOpen(false) }}>
        <form className="algo-modal" onSubmit={saveRobot}>
          <div className="algo-modal-header"><div><span className="algo-eyebrow">Configuración del sistema</span><h2>{editingRobotId ? 'Editar robot' : 'Nuevo robot'}</h2></div><button className="algo-close" type="button" onClick={() => setRobotModalOpen(false)}>×</button></div>
          <div className="algo-form-grid">
            <label className="wide"><span>Nombre *</span><input value={robotForm.name} onChange={(event) => setRobotForm({ ...robotForm, name: event.target.value })} placeholder="Atlas Mean Reversion" /></label>
            <label className="wide"><span>Descripción</span><textarea value={robotForm.description} onChange={(event) => setRobotForm({ ...robotForm, description: event.target.value })} rows={3} /></label>
            <label><span>Versión</span><input value={robotForm.version} onChange={(event) => setRobotForm({ ...robotForm, version: event.target.value })} /></label>
            <label><span>Estado</span><select value={robotForm.status} onChange={(event) => setRobotForm({ ...robotForm, status: event.target.value as AlgorithmStatus })}>{Object.entries(STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label><span>Entorno principal</span><select value={robotForm.environment} onChange={(event) => setRobotForm({ ...robotForm, environment: event.target.value as AlgorithmEnvironment })}>{Object.entries(ENVIRONMENT_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label><span>Activo o mercado *</span><input required value={robotForm.market} onChange={(event) => setRobotForm({ ...robotForm, market: event.target.value })} placeholder="Futuros, Forex..." /></label>
            <label className="wide"><span>Símbolos</span><input value={robotForm.symbols} onChange={(event) => setRobotForm({ ...robotForm, symbols: event.target.value })} placeholder="ES, NQ, EURUSD" /></label>
            <label><span>Temporalidad *</span><input required value={robotForm.timeframe} onChange={(event) => setRobotForm({ ...robotForm, timeframe: event.target.value })} /></label>
            <label><span>Dirección</span><select value={robotForm.direction} onChange={(event) => setRobotForm({ ...robotForm, direction: event.target.value as 'long' | 'short' | 'both' })}><option value="both">Ambas</option><option value="long">Solo largos</option><option value="short">Solo cortos</option></select></label>
            <label><span>Capital inicial *</span><input required min="0" type="number" step="any" value={robotForm.initialCapital} onChange={(event) => setRobotForm({ ...robotForm, initialCapital: event.target.value })} /></label>
            <label><span>Moneda</span><select value={robotForm.currency} onChange={(event) => setRobotForm({ ...robotForm, currency: event.target.value as 'EUR' | 'USD' })}><option>EUR</option><option>USD</option></select></label>
            <label><span>Modelo de riesgo</span><select value={robotForm.riskMode} onChange={(event) => setRobotForm({ ...robotForm, riskMode: event.target.value as 'fixed' | 'percent' | 'unknown' })}><option value="percent">Porcentaje</option><option value="fixed">Importe fijo</option><option value="unknown">Sin definir</option></select></label>
            <label><span>Riesgo</span><input type="number" step="any" value={robotForm.riskValue} onChange={(event) => setRobotForm({ ...robotForm, riskValue: event.target.value })} /></label>
            <label className="wide"><span>Etiquetas</span><input value={robotForm.tags} onChange={(event) => setRobotForm({ ...robotForm, tags: event.target.value })} placeholder="tendencia, intradía, validado" /></label>
            <label><span>Fecha inicial</span><input type="date" value={robotForm.startDate} onChange={(event) => setRobotForm({ ...robotForm, startDate: event.target.value })} /></label>
            <label><span>Fecha final</span><input type="date" value={robotForm.endDate} onChange={(event) => setRobotForm({ ...robotForm, endDate: event.target.value })} /></label>
            <div className="algo-form-section-title wide"><strong>Configuración técnica</strong><span>Todo es opcional y puede completarse después.</span></div>
            <label><span>Tipo de estrategia</span><select value={robotForm.strategyType} onChange={(event) => setRobotForm({ ...robotForm, strategyType: event.target.value })}><option value="">Sin definir</option>{['Scalping','Intradía','Swing','Tendencial','Reversión a la media','Breakout','Arbitraje','Market Making','Otro'].map((value) => <option key={value}>{value}</option>)}</select></label>
            <label><span>Plataforma</span><input value={robotForm.platform} onChange={(event) => setRobotForm({ ...robotForm, platform: event.target.value })} placeholder="MetaTrader, Python, QuantConnect..." /></label>
            <label><span>Broker</span><input value={robotForm.broker} onChange={(event) => setRobotForm({ ...robotForm, broker: event.target.value })} /></label>
            <label><span>Lenguaje</span><input value={robotForm.programmingLanguage} onChange={(event) => setRobotForm({ ...robotForm, programmingLanguage: event.target.value })} /></label>
            <label><span>Versión de Python</span><input value={robotForm.pythonVersion} onChange={(event) => setRobotForm({ ...robotForm, pythonVersion: event.target.value })} /></label>
            <label><span>Librerías</span><input value={robotForm.libraries} onChange={(event) => setRobotForm({ ...robotForm, libraries: event.target.value })} placeholder="pandas, numpy, vectorbt" /></label>
            <label><span>Zona horaria</span><input value={robotForm.timezone} onChange={(event) => setRobotForm({ ...robotForm, timezone: event.target.value })} /></label>
            <label><span>Horario de operación</span><input value={robotForm.tradingHours} onChange={(event) => setRobotForm({ ...robotForm, tradingHours: event.target.value })} placeholder="09:00–17:30" /></label>
            <label><span>Máx. operaciones diarias</span><input type="number" value={robotForm.maxDailyTrades} onChange={(event) => setRobotForm({ ...robotForm, maxDailyTrades: event.target.value })} /></label>
            <label><span>Dimensionado de posición</span><input value={robotForm.positionSizing} onChange={(event) => setRobotForm({ ...robotForm, positionSizing: event.target.value })} /></label>
            <label><span>Modelo Stop Loss</span><input value={robotForm.stopLossModel} onChange={(event) => setRobotForm({ ...robotForm, stopLossModel: event.target.value })} /></label>
            <label><span>Modelo Take Profit</span><input value={robotForm.takeProfitModel} onChange={(event) => setRobotForm({ ...robotForm, takeProfitModel: event.target.value })} /></label>
            <label><span>Límite pérdida diaria</span><input type="number" step="any" value={robotForm.dailyLossLimit} onChange={(event) => setRobotForm({ ...robotForm, dailyLossLimit: event.target.value })} /></label>
            <label><span>Límite drawdown</span><input type="number" step="any" value={robotForm.maxDrawdownLimit} onChange={(event) => setRobotForm({ ...robotForm, maxDrawdownLimit: event.target.value })} /></label>
            <label><span>Comisión estimada</span><input type="number" step="any" value={robotForm.estimatedCommission} onChange={(event) => setRobotForm({ ...robotForm, estimatedCommission: event.target.value })} /></label>
            <label><span>Slippage estimado</span><input type="number" step="any" value={robotForm.estimatedSlippage} onChange={(event) => setRobotForm({ ...robotForm, estimatedSlippage: event.target.value })} /></label>
            <label className="algo-check-field"><input type="checkbox" checked={robotForm.trailingStop} onChange={(event) => setRobotForm({ ...robotForm, trailingStop: event.target.checked })} /><span>Usa trailing stop</span></label>
            <label className="algo-check-field"><input type="checkbox" checked={robotForm.breakEven} onChange={(event) => setRobotForm({ ...robotForm, breakEven: event.target.checked })} /><span>Usa break even</span></label>
            <fieldset className="algo-color-field wide"><legend>Color identificativo</legend>{COLORS.map((color) => <button type="button" key={color} className={robotForm.color === color ? 'selected' : ''} style={{ background: color }} onClick={() => setRobotForm({ ...robotForm, color })} aria-label={'Usar color ' + color} />)}</fieldset>
          </div>
          <div className="algo-modal-actions"><button className="algo-button" type="button" onClick={() => setRobotModalOpen(false)}>Cancelar</button><button className="algo-button primary" type="submit">Guardar robot</button></div>
        </form>
      </div>
    )
  }

  return (
    <main className="algorithms-module detail">
      <section className="algo-detail-header" style={{ '--robot-color': selectedRobot.color } as CSSProperties}>
        <button className="algo-back-button" type="button" onClick={() => setSelectedRobotId(null)}>‹ <span>Todos los robots</span></button>
        <div className="algo-detail-title"><span className="algo-robot-icon">⌁</span><div><span className="algo-eyebrow">{ENVIRONMENT_LABELS[selectedRobot.environment]} · v{selectedRobot.version}</span><h1>{selectedRobot.name}</h1><p>{selectedRobot.market || 'Mercado sin definir'} · {selectedRobot.symbols.join(', ') || 'Sin símbolos'} · {selectedRobot.timeframe}</p></div></div>
        <div className="algo-header-actions"><span className={'algo-status ' + selectedRobot.status}>{STATUS_LABELS[selectedRobot.status]}</span><button className="algo-button" type="button" onClick={() => exportRobot(selectedRobot)}>Copia JSON</button><button className="algo-button primary" type="button" onClick={() => openTradeModal()}>+ Operación</button></div>
      </section>

      <nav className="algo-tabs" aria-label="Secciones del robot">{TAB_LABELS.map((tab) => <button type="button" key={tab.key} className={activeTab === tab.key ? 'active' : ''} onClick={() => setActiveTab(tab.key)}>{tab.label}{tab.key === 'operations' ? <small>{selectedRobot.trades.length}</small> : null}</button>)}</nav>

      {activeTab === 'summary' ? (
        <section className="algo-panel">
          <div className="algo-panel-heading"><div><h2>Resumen de rendimiento</h2><p>Todos los indicadores se recalculan desde las operaciones filtradas.</p></div><div className="algo-header-actions"><button className="algo-button ai" type="button" onClick={() => setActiveTab('analysis')}>✦ Análisis avanzado</button><button className="algo-button" type="button" onClick={() => void exportTrades(selectedRobot)}>Exportar Excel</button></div></div>
          <div className="algo-filter-bar compact"><label><span>Entorno</span><select value={summaryEnvironment} onChange={(event) => setSummaryEnvironment(event.target.value as 'all' | AlgorithmEnvironment)}><option value="all">Todos</option>{Object.entries(ENVIRONMENT_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label><span>Versión</span><select value={summaryVersion} onChange={(event) => setSummaryVersion(event.target.value)}><option value="all">Todas</option>{robotVersions.map((version) => <option key={version} value={version}>v{version}</option>)}</select></label><label><span>Etiqueta</span><select value={summaryTag} onChange={(event) => setSummaryTag(event.target.value)}><option value="all">Todas</option>{robotTags.map((tag) => <option key={tag}>{tag}</option>)}</select></label><label><span>Desde</span><input type="date" value={rangeStart} onChange={(event) => setRangeStart(event.target.value)} /></label><label><span>Hasta</span><input type="date" value={rangeEnd} onChange={(event) => setRangeEnd(event.target.value)} /></label><button className="algo-text-button" type="button" onClick={() => { setRangeStart(''); setRangeEnd(''); setSummaryEnvironment('all'); setSummaryVersion('all'); setSummaryTag('all') }}>Limpiar</button></div>
          <div className="algo-metrics-grid">
            <MetricCard icon="€" label="Capital inicial" value={formatMoney(selectedRobot.initialCapital, selectedRobot.currency)} detail="base declarada" />
            <MetricCard icon="◉" label="Capital actual" value={formatMoney(selectedRobot.initialCapital + scopedMetrics.netProfit, selectedRobot.currency)} detail={formatNumber(scopedMetrics.returnPercent) + '% retorno'} tone="blue" />
            <MetricCard icon="↗" label="P/L neto" value={formatMoney(scopedMetrics.netProfit, selectedRobot.currency)} detail={'Bruto ' + formatMoney(scopedMetrics.grossProfit, selectedRobot.currency)} tone={scopedMetrics.netProfit >= 0 ? 'positive' : 'negative'} />
            <MetricCard icon="◎" label="Win rate" value={formatNumber(scopedMetrics.winRate, 1) + '%'} detail={scopedMetrics.wins + ' G · ' + scopedMetrics.losses + ' P'} tone="purple" />
            <MetricCard icon="◇" label="Profit factor" value={scopedMetrics.profitFactor == null ? '∞' : formatNumber(scopedMetrics.profitFactor)} detail={'R/B ' + (scopedMetrics.riskRewardRatio == null ? '∞' : formatNumber(scopedMetrics.riskRewardRatio))} />
            <MetricCard icon="↓" label="Máx. drawdown" value={formatMoney(scopedMetrics.maxDrawdown, selectedRobot.currency)} detail={formatNumber(scopedMetrics.maxDrawdownPercent) + '%'} tone="negative" />
            <MetricCard icon="↘" label="Drawdown actual" value={formatMoney(scopedMetrics.currentDrawdown, selectedRobot.currency)} detail={formatNumber(scopedMetrics.currentDrawdownPercent) + '%'} tone={scopedMetrics.currentDrawdown > 0 ? 'negative' : 'neutral'} />
            <MetricCard icon="≈" label="Esperanza" value={formatMoney(scopedMetrics.expectancy, selectedRobot.currency)} detail={'Media ' + formatMoney(scopedMetrics.averageTrade, selectedRobot.currency)} tone={scopedMetrics.expectancy >= 0 ? 'positive' : 'negative'} />
            <MetricCard icon="Σ" label="Operaciones" value={String(scopedMetrics.totalTrades)} detail={scopedMetrics.openTrades + ' abiertas'} tone="blue" />
            <MetricCard icon="S" label="Sharpe / Sortino" value={(scopedMetrics.sharpe == null ? '—' : formatNumber(scopedMetrics.sharpe)) + ' / ' + (scopedMetrics.sortino == null ? '—' : formatNumber(scopedMetrics.sortino))} detail="estimación anualizada" />
            <MetricCard icon="+" label="Mejor / peor" value={formatMoney(scopedMetrics.bestTrade, selectedRobot.currency)} detail={formatMoney(scopedMetrics.worstTrade, selectedRobot.currency)} tone="positive" />
            <MetricCard icon="⏱" label="Duración y rachas" value={formatAlgorithmDuration(scopedMetrics.averageDurationMinutes)} detail={'racha +' + scopedMetrics.maxWinStreak + ' / -' + scopedMetrics.maxLossStreak} />
            <MetricCard icon="L" label="Resultado long" value={formatMoney(scopedMetrics.longProfit, selectedRobot.currency)} detail="posiciones compradoras" tone={scopedMetrics.longProfit >= 0 ? 'positive' : 'negative'} />
            <MetricCard icon="S" label="Resultado short" value={formatMoney(scopedMetrics.shortProfit, selectedRobot.currency)} detail="posiciones vendedoras" tone={scopedMetrics.shortProfit >= 0 ? 'positive' : 'negative'} />
            <MetricCard icon="⌁" label="Comisiones" value={formatMoney(scopedMetrics.commissionTotal, selectedRobot.currency)} detail="coste acumulado" />
            <MetricCard icon="↝" label="Slippage" value={formatNumber(scopedMetrics.slippageTotal)} detail="total registrado" />
          </div>
          <div className="algo-chart-grid"><article className="algo-chart-card"><div className="algo-card-heading"><div><h3>Curva de equity</h3><p>Capital inicial y resultado acumulado.</p></div></div><DataChart series={[{ label: 'Equity', color: '#007AFF', points: equityCurve }]} /></article><article className="algo-chart-card"><div className="algo-card-heading"><div><h3>Drawdown</h3><p>Caída desde el máximo anterior.</p></div></div><DataChart series={[{ label: 'Drawdown', color: '#FF3B30', points: drawdownCurve }]} /></article></div>
          <article className="algo-calendar-card"><div className="algo-card-heading"><div><h3>Calendario de operaciones · {calendarMonth.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })}</h3><p>Pulsa un día para abrir sus operaciones · {calendarMonthOperations} operaciones · <strong className={calendarMonthProfit >= 0 ? 'positive' : 'negative'}>{formatMoney(calendarMonthProfit, selectedRobot.currency)}</strong> en el mes.</p></div><div className="algo-calendar-nav"><button type="button" onClick={() => setCalendarMonth(new Date(calendarYear, calendarMonthIndex - 1, 1))}>‹</button><button type="button" onClick={() => setCalendarMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1))}>Hoy</button><button type="button" onClick={() => setCalendarMonth(new Date(calendarYear, calendarMonthIndex + 1, 1))}>›</button></div></div><div className="algo-calendar-weekdays">{['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map((day) => <span key={day}>{day}</span>)}</div><div className="algo-calendar-grid">{Array.from({ length: calendarLeading }, (_, index) => <span className="blank" key={'blank-' + index} />)}{Array.from({ length: calendarDays }, (_, index) => { const day = index + 1; const key = calendarYear + '-' + String(calendarMonthIndex + 1).padStart(2, '0') + '-' + String(day).padStart(2, '0'); const value = calendarData.get(key); return <button type="button" key={key} className={value ? value.profit >= 0 ? 'has-profit' : 'has-loss' : ''} onClick={() => { setTradeDate(key); setActiveTab('operations') }}><strong>{day}</strong>{value ? <span>{value.count} ops</span> : null}{value ? <small>{formatMoney(value.profit, selectedRobot.currency)}</small> : null}</button> })}</div></article>
        </section>
      ) : null}

      {activeTab === 'operations' ? (
        <section className="algo-panel">
          <div className="algo-panel-heading"><div><h2>Historial de operaciones</h2><p>Edita, filtra o exporta las ejecuciones de este robot.</p></div><div className="algo-header-actions">{selectedTrades.size ? <button className="algo-button danger" type="button" onClick={() => void removeTrades([...selectedTrades])}>Eliminar {selectedTrades.size}</button> : null}<button className="algo-button" type="button" onClick={() => setShowExtendedTradeColumns((value) => !value)}>{showExtendedTradeColumns ? 'Columnas compactas' : 'Columnas completas'}</button><button className="algo-button" type="button" onClick={() => void exportTrades(selectedRobot, filteredTrades)}>Exportar vista</button><button className="algo-button primary" type="button" onClick={() => openTradeModal()}>+ Añadir</button></div></div>
          <div className="algo-filter-bar operations"><label><span>Buscar</span><input value={tradeSearch} onChange={(event) => { setTradeSearch(event.target.value); setTradePage(1) }} placeholder="Símbolo, setup, nota..." /></label><label><span>Entorno</span><select value={tradeEnvironment} onChange={(event) => setTradeEnvironment(event.target.value as 'all' | AlgorithmEnvironment)}><option value="all">Todos</option>{Object.entries(ENVIRONMENT_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label><span>Dirección</span><select value={tradeSide} onChange={(event) => setTradeSide(event.target.value as 'all' | TradeSide)}><option value="all">Todas</option><option value="long">Compra</option><option value="short">Venta</option></select></label><label><span>Estado</span><select value={tradeStatus} onChange={(event) => setTradeStatus(event.target.value as 'all' | 'open' | 'closed')}><option value="all">Todos</option><option value="open">Abiertas</option><option value="closed">Cerradas</option></select></label><label><span>Resultado</span><select value={tradeResult} onChange={(event) => setTradeResult(event.target.value as 'all' | 'win' | 'loss' | 'breakeven')}><option value="all">Todos</option><option value="win">Ganadoras</option><option value="loss">Perdedoras</option><option value="breakeven">Break even</option></select></label><label><span>Ordenar</span><select value={tradeSort} onChange={(event) => setTradeSort(event.target.value as 'newest' | 'oldest' | 'best' | 'worst')}><option value="newest">Más recientes</option><option value="oldest">Más antiguas</option><option value="best">Mayor resultado</option><option value="worst">Menor resultado</option></select></label><label><span>Versión</span><select value={tradeVersion} onChange={(event) => setTradeVersion(event.target.value)}><option value="all">Todas</option>{robotVersions.map((version) => <option key={version} value={version}>v{version}</option>)}</select></label><label><span>Etiqueta</span><select value={tradeTag} onChange={(event) => setTradeTag(event.target.value)}><option value="all">Todas</option>{robotTags.map((tag) => <option key={tag}>{tag}</option>)}</select></label><label><span>Fecha</span><input type="date" value={tradeDate} onChange={(event) => setTradeDate(event.target.value)} /></label>{tradeDate ? <button className="algo-text-button" type="button" onClick={() => setTradeDate('')}>Todas</button> : null}</div>
          <div className="algo-table-wrap"><table className="algo-table"><thead><tr><th><input type="checkbox" aria-label="Seleccionar página" checked={pagedTrades.length > 0 && pagedTrades.every((trade) => selectedTrades.has(trade.id))} onChange={(event) => { const next = new Set(selectedTrades); pagedTrades.forEach((trade) => { if (event.target.checked) next.add(trade.id); else next.delete(trade.id) }); setSelectedTrades(next) }} /></th><th>Entrada</th><th>Activo</th><th>Lado</th>{showExtendedTradeColumns ? <><th>Precios</th><th>SL / TP</th><th>Costes</th><th>Duración</th></> : null}<th>Entorno</th><th>Versión</th><th>Estado</th><th>Resultado</th><th>Setup</th><th aria-label="Acciones" /></tr></thead><tbody>{pagedTrades.map((trade) => <tr key={trade.id}><td><input type="checkbox" checked={selectedTrades.has(trade.id)} onChange={() => { const next = new Set(selectedTrades); if (next.has(trade.id)) next.delete(trade.id); else next.add(trade.id); setSelectedTrades(next) }} /></td><td><strong>{formatDate(trade.entryDate)}</strong><small>{trade.exitDate ? 'Salida ' + formatDate(trade.exitDate) : 'Sin cerrar'}</small></td><td><strong>{trade.symbol}</strong><small>{trade.externalId || 'ID interno'}</small></td><td><span className={'algo-side ' + trade.side}>{trade.side === 'long' ? 'Compra' : 'Venta'}</span><small>{trade.lots != null ? trade.lots + ' lotes' : trade.contracts != null ? trade.contracts + ' contratos' : ''}</small></td>{showExtendedTradeColumns ? <><td><strong>{trade.entryPrice ?? '—'} → {trade.exitPrice ?? '—'}</strong></td><td><strong>{trade.stopLoss ?? '—'} / {trade.takeProfit ?? '—'}</strong></td><td><strong>{formatMoney((trade.commission ?? 0) + (trade.swap ?? 0), selectedRobot.currency)}</strong><small>Slip. {trade.slippage ?? '—'}</small></td><td>{formatAlgorithmDuration(trade.durationMinutes ?? 0)}</td></> : null}<td>{ENVIRONMENT_LABELS[trade.environment]}</td><td>v{trade.robotVersion ?? selectedRobot.version}</td><td>{trade.status === 'closed' ? 'Cerrada' : 'Abierta'}</td><td><strong className={trade.profit >= 0 ? 'positive' : 'negative'}>{formatMoney(trade.profit, selectedRobot.currency)}</strong><small>{trade.profitPercent == null ? '' : formatNumber(trade.profitPercent) + '%'}{trade.commission != null ? ' · Comisión ' + formatMoney(trade.commission, selectedRobot.currency) : ''}</small></td><td>{trade.setup || '—'}</td><td><div className="algo-row-actions"><button type="button" onClick={() => openTradeModal(trade)}>Editar</button><button type="button" className="danger" onClick={() => void removeTrades([trade.id])}>Eliminar</button></div></td></tr>)}</tbody></table>{!pagedTrades.length ? <div className="algo-empty-inline">No hay operaciones con estos filtros.</div> : null}</div>
          <div className="algo-pagination"><span>{filteredTrades.length} operaciones</span><div><button type="button" disabled={tradePage === 1} onClick={() => setTradePage((page) => Math.max(1, page - 1))}>Anterior</button><span>{tradePage} / {totalPages}</span><button type="button" disabled={tradePage === totalPages} onClick={() => setTradePage((page) => Math.min(totalPages, page + 1))}>Siguiente</button></div></div>
        </section>
      ) : null}

      {activeTab === 'import' ? (
        <section className="algo-panel">
          <div className="algo-panel-heading"><div><h2>Importar operaciones</h2><p>Compatible con XLSX, XLS y CSV. Nada se guarda hasta confirmar el mapeo.</p></div><span className="algo-security-note">Máx. 10.000 filas · 12 MB</span></div>
          <input ref={importInputRef} hidden type="file" accept=".xlsx,.xls,.csv" onChange={(event) => void loadImportFile(event.target.files?.[0])} />
          <div className={'algo-dropzone ' + (isParsing ? 'loading' : '')} onDragOver={(event: DragEvent) => event.preventDefault()} onDrop={(event: DragEvent) => { event.preventDefault(); void loadImportFile(event.dataTransfer.files[0]) }}><span>⇩</span><h3>{isParsing ? 'Leyendo archivo…' : 'Arrastra aquí tu exportación'}</h3><p>La primera hoja se analizará localmente antes de guardar.</p><button className="algo-button primary" type="button" onClick={() => importInputRef.current?.click()}>Seleccionar archivo</button></div>
          {parsedFile ? <div className="algo-import-workspace"><div className="algo-import-summary"><div><span>Archivo</span><strong>{parsedFile.fileName}</strong><small>{parsedFile.sheetName}</small></div><div><span>Filas</span><strong>{parsedFile.rows.length}</strong></div><div><span>Válidas</span><strong className="positive">{importValid.length}</strong></div><div><span>Con error</span><strong className="negative">{importInvalid.length}</strong></div><div><span>Duplicadas</span><strong>{importDuplicates.length}</strong></div></div>
            <div className="algo-import-controls"><label><span>Guardar como</span><select value={importEnvironment} onChange={(event) => setImportEnvironment(event.target.value as AlgorithmEnvironment)}>{Object.entries(ENVIRONMENT_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label><span>Versión del robot</span><input value={importVersion} onChange={(event) => setImportVersion(event.target.value)} placeholder={selectedRobot.version} /></label><label><span>Duplicados</span><select value={duplicateMode} onChange={(event) => setDuplicateMode(event.target.value as 'skip' | 'replace' | 'include')}><option value="skip">Omitir duplicados</option><option value="replace">Sustituir los anteriores</option><option value="include">Importarlos igualmente</option></select></label></div>
            <div className="algo-import-diagnostics"><span><strong>{Object.values(importMapping).filter(Boolean).length}</strong> columnas relacionadas</span><span><strong>{importUnmappedHeaders.length}</strong> sin reconocer{importUnmappedHeaders.length ? ': ' + importUnmappedHeaders.slice(0, 4).join(', ') + (importUnmappedHeaders.length > 4 ? '…' : '') : ''}</span><span>{importDecimalLabel}</span><span>Moneda de destino: <strong>{selectedRobot.currency}</strong></span></div>
            <div className="algo-mapping-grid">{ALGORITHM_IMPORT_COLUMNS.map((column) => <label key={column.key} className={column.required && !importMapping[column.key] ? 'missing' : ''}><span>{column.label}{column.required ? ' *' : ''}</span><select value={importMapping[column.key] ?? ''} onChange={(event) => setImportMapping({ ...importMapping, [column.key]: event.target.value })}><option value="">No importar</option>{parsedFile.headers.map((header) => <option key={header} value={header}>{header}</option>)}</select></label>)}</div>
            <div className="algo-preview-table"><h3>Vista previa y validación</h3><div className="algo-table-wrap"><table className="algo-table"><thead><tr><th>Fila</th><th>Fecha</th><th>Activo</th><th>Lado</th><th>Resultado</th><th>Estado</th><th>Importar</th></tr></thead><tbody>{importPreview.slice(0, 12).map((row) => <tr key={row.row} className={row.errors.length ? 'invalid' : row.duplicate ? 'duplicate' : ''}><td>{row.row}</td><td>{row.trade ? formatDate(row.trade.entryDate) : '—'}</td><td>{row.trade?.symbol ?? '—'}</td><td>{row.trade?.side === 'long' ? 'Compra' : row.trade?.side === 'short' ? 'Venta' : '—'}</td><td>{row.trade ? formatMoney(row.trade.profit, selectedRobot.currency) : '—'}</td><td>{row.errors.length ? row.errors.join(' · ') : ignoredImportRows.has(row.row) ? 'Ignorada por el usuario' : row.duplicate ? 'Duplicada' : 'Lista'}</td><td><input type="checkbox" aria-label={'Importar fila ' + row.row} disabled={row.errors.length > 0} checked={!row.errors.length && !ignoredImportRows.has(row.row)} onChange={(event) => { const next = new Set(ignoredImportRows); if (event.target.checked) next.delete(row.row); else next.add(row.row); setIgnoredImportRows(next) }} /></td></tr>)}</tbody></table></div></div>
            <div className="algo-import-actions"><p>Se guardarán <strong>{duplicateMode === 'skip' ? importValid.length - importDuplicates.length : importValid.length}</strong> operaciones. Las filas inválidas nunca se importan.</p><div className="algo-header-actions">{importInvalid.length ? <button className="algo-button" type="button" onClick={downloadImportErrors}>Descargar errores</button> : null}<button className="algo-button" type="button" onClick={() => { setParsedFile(null); setImportMapping({}); setIgnoredImportRows(new Set()) }}>Cancelar</button><button className="algo-button primary" type="button" onClick={() => void commitImport()}>Confirmar importación</button></div></div>
          </div> : null}
          <div className="algo-subsection"><div className="algo-section-heading"><div><h3>Historial de importaciones</h3><p>Puedes deshacer una carga sin borrar las demás.</p></div></div>{selectedRobot.imports.length ? <div className="algo-import-history">{selectedRobot.imports.map((record) => <article key={record.id}><div><strong>{record.fileName}</strong><span>{formatDate(record.importedAt)} · {ENVIRONMENT_LABELS[record.environment]} · v{record.robotVersion ?? selectedRobot.version}</span></div><div><strong>{record.rowsImported} importadas</strong><span>{record.rowsInvalid} errores · {record.duplicates} duplicadas · completada</span></div><button className="algo-button danger subtle" type="button" onClick={() => void undoImport(record.id)}>Deshacer</button></article>)}</div> : <div className="algo-empty-inline">Todavía no hay importaciones.</div>}</div>
        </section>
      ) : null}

      {activeTab === 'code' ? (
        <section className="algo-panel">
          <div className="algo-panel-heading"><div><h2>Código Python</h2><p>Repositorio documental con versiones. El código nunca se ejecuta en el navegador.</p></div><div className="algo-header-actions"><input ref={codeInputRef} hidden type="file" accept=".py,.txt" onChange={(event) => void uploadCodeFile(event.target.files?.[0])} /><button className="algo-button" type="button" onClick={() => codeInputRef.current?.click()}>Subir archivo</button><button className="algo-button primary" type="button" onClick={() => void createCodeFile()}>+ Archivo</button></div></div>
          <div className="algo-code-layout"><aside className="algo-code-files"><span>Archivos</span>{selectedRobot.codeFiles.map((file) => <button type="button" key={file.id} className={codeFileId === file.id ? 'active' : ''} onClick={() => { setCodeFileId(file.id); setCodeDraft(file.content) }}><i>PY</i><span><strong>{file.name}</strong><small>{new Date(file.updatedAt).toLocaleDateString('es-ES')}</small></span></button>)}{!selectedRobot.codeFiles.length ? <p>Crea o sube tu primer archivo.</p> : null}</aside><div className={'algo-code-editor ' + (codeFullscreen ? 'fullscreen' : '')}>{selectedCodeFile ? <><div className="algo-code-toolbar"><strong>{selectedCodeFile.name}</strong><label><span>Buscar</span><input value={codeSearch} onChange={(event) => setCodeSearch(event.target.value)} placeholder="Texto..." /></label><span>{codeSearch ? codeSearchCount + ' coincidencias' : codeDraft.split('\n').length + ' líneas'}</span><button type="button" onClick={() => void navigator.clipboard.writeText(codeDraft)}>Copiar</button><button type="button" onClick={() => downloadBlob(codeDraft, 'text/x-python', selectedCodeFile.name)}>Descargar</button><button type="button" onClick={() => setCodeFullscreen((value) => !value)}>{codeFullscreen ? 'Salir de pantalla completa' : 'Pantalla completa'}</button></div><div className="algo-code-area"><pre aria-hidden="true" style={{ transform: 'translateY(-' + codeScrollTop + 'px)' }}>{codeLineNumbers}</pre><textarea spellCheck={false} value={codeDraft} onScroll={(event) => setCodeScrollTop(event.currentTarget.scrollTop)} onKeyDown={handleCodeKeyDown} onChange={(event) => setCodeDraft(event.target.value)} aria-label={'Editar ' + selectedCodeFile.name} /></div><div className="algo-code-actions"><button className="algo-button danger subtle" type="button" onClick={() => void deleteCodeFile()}>Eliminar archivo</button><button className="algo-button primary" type="button" onClick={() => void saveCodeVersion()}>Guardar nueva versión</button></div></> : <div className="algo-empty-state compact"><h3>Sin archivo seleccionado</h3><p>Crea o sube un archivo Python para documentar el robot.</p></div>}</div></div>
          {selectedCodeFile ? <div className="algo-subsection"><div className="algo-section-heading"><div><h3>Historial de versiones</h3><p>Restaura una copia anterior o identifica la que está estable y en real.</p></div></div>{codeVersions.length ? <div className="algo-version-list">{codeVersions.map((version) => <article key={version.id}><div><strong>v{version.version}</strong><span>{formatDate(version.createdAt)}</span></div><div className="algo-version-labels">{version.label ? <span className={version.label}>{version.label === 'stable' ? 'Estable' : 'Real'}</span> : <span>Sin etiqueta</span>}</div><div><button type="button" onClick={() => void markCodeVersion(version.id, 'stable')}>Marcar estable</button><button type="button" onClick={() => void markCodeVersion(version.id, 'real')}>Marcar real</button><button type="button" onClick={() => void restoreCodeVersion(version.id)}>Restaurar</button></div></article>)}</div> : <div className="algo-empty-inline">Guarda el código para crear la primera versión.</div>}</div> : null}
        </section>
      ) : null}

      {activeTab === 'documentation' ? (
        <section className="algo-panel">
          <div className="algo-panel-heading"><div><h2>Explicación de la estrategia</h2><p>Documentación estructurada para que el sistema pueda auditarse y mantenerse.</p>{documentationDirty ? <span className="algo-unsaved-badge">Cambios sin guardar</span> : null}</div><div className="algo-header-actions"><button className="algo-button" type="button" onClick={loadDocumentationTemplate}>Usar plantilla</button><button className="algo-button primary" type="button" disabled={!documentationDirty} onClick={() => void saveDocumentation()}>Guardar documentación</button></div></div>
          <div className="algo-document-toolbar" aria-label="Formato de documentación"><span>Aplicar en: <strong>{activeDocumentationKey}</strong></span><button type="button" onClick={() => insertDocumentationSnippet('## Título')}>Título</button><button type="button" onClick={() => insertDocumentationSnippet('**Texto en negrita**')}>Negrita</button><button type="button" onClick={() => insertDocumentationSnippet('- Elemento de lista')}>Lista</button><button type="button" onClick={() => insertDocumentationSnippet('~~~python\n# código\n~~~')}>Código</button><button type="button" onClick={() => insertDocumentationSnippet('[Texto del enlace](https://)')}>Enlace</button><button type="button" onClick={() => insertDocumentationSnippet('| Parámetro | Valor |\n| --- | --- |\n| Ejemplo | 1 |')}>Tabla</button></div>
          <div className="algo-document-grid">{([['summary', 'Resumen y ventaja'], ['marketContext', 'Contexto de mercado'], ['entryRules', 'Reglas de entrada'], ['exitRules', 'Reglas de salida'], ['riskManagement', 'Gestión del riesgo'], ['filters', 'Filtros'], ['parameters', 'Parámetros'], ['indicators', 'Indicadores utilizados'], ['examples', 'Ejemplos de operaciones'], ['assumptions', 'Supuestos'], ['knownRisks', 'Riesgos conocidos'], ['recommendedConditions', 'Condiciones recomendadas'], ['personalNotes', 'Notas personales'], ['changelog', 'Registro de cambios']] as Array<[keyof AlgorithmDocumentation, string]>).map(([key, label]) => <label key={key} className={key === 'summary' || key === 'entryRules' || key === 'exitRules' ? 'wide' : ''}><span>{label}</span><textarea rows={key === 'summary' ? 5 : 7} value={String(documentationDraft[key] ?? '')} onFocus={() => setActiveDocumentationKey(key as DocumentationField)} onChange={(event) => { setDocumentationDraft({ ...documentationDraft, [key]: event.target.value }); setDocumentationDirty(true) }} placeholder={'Escribe ' + label.toLowerCase() + '…'} /></label>)}</div>
        </section>
      ) : null}

      {activeTab === 'analysis' ? (
        <section className="algo-panel">
          <div className="algo-panel-heading"><div><span className="algo-eyebrow ai-text">✦ Inteligencia analítica</span><h2>Análisis del sistema</h2><p>Conclusiones deterministas calculadas con los datos filtrados; no inventa operaciones.</p></div></div>
          {scopedMetrics.closedTrades < 5 ? <div className="algo-analysis-warning"><strong>Muestra insuficiente</strong><p>Necesitas al menos 5 operaciones cerradas para mostrar conclusiones fiables. Actualmente hay {scopedMetrics.closedTrades}.</p></div> : <><div className="algo-analysis-hero"><div><span>Diagnóstico principal</span><h3>{scopedMetrics.expectancy > 0 && scopedMetrics.profitFactor && scopedMetrics.profitFactor > 1 ? 'El sistema presenta ventaja positiva en la muestra.' : 'La muestra todavía no demuestra una ventaja robusta.'}</h3><p>Win rate {formatNumber(scopedMetrics.winRate, 1)}%, profit factor {scopedMetrics.profitFactor == null ? 'sin pérdidas' : formatNumber(scopedMetrics.profitFactor)} y drawdown máximo {formatNumber(scopedMetrics.maxDrawdownPercent)}%.</p></div><span className={scopedMetrics.expectancy >= 0 ? 'positive-score' : 'negative-score'}>{scopedMetrics.expectancy >= 0 ? 'Favorable' : 'Revisar'}</span></div><div className="algo-analysis-grid"><article><h3>Fortalezas</h3><ul><li>{scopedMetrics.averageWin > Math.abs(scopedMetrics.averageLoss) ? 'La ganancia media supera la pérdida media.' : 'La tasa de acierto sostiene parte del resultado.'}</li><li>Mejor operación: {formatMoney(scopedMetrics.bestTrade, selectedRobot.currency)}.</li><li>Mejor racha: {scopedMetrics.maxWinStreak} operaciones.</li></ul></article><article><h3>Riesgos</h3><ul><li>Peor operación: {formatMoney(scopedMetrics.worstTrade, selectedRobot.currency)}.</li><li>Máxima racha de pérdidas: {scopedMetrics.maxLossStreak}.</li><li>{scopedMetrics.closedTrades < 30 ? 'Menos de 30 operaciones: alta incertidumbre estadística.' : 'La muestra supera 30 operaciones, pero conviene validar fuera de muestra.'}</li></ul></article><article><h3>Acciones sugeridas</h3><ul><li>Compara Backtest, Fuera de muestra, Demo y Real por separado.</li><li>Revisa símbolos y horas con expectativa negativa.</li><li>Marca una versión estable antes de llevar código a real.</li></ul></article></div><div className="algo-distribution-grid">{[['Día de la semana', weekdayStats], ['Hora', hourStats], ['Símbolo', symbolStats]].map(([title, rows]) => <article key={String(title)}><h3>{String(title)}</h3>{(rows as ReturnType<typeof groupProfitBy>).slice(0, 8).map((row) => <div key={row.label}><span>{row.label}</span><strong className={row.profit >= 0 ? 'positive' : 'negative'}>{formatMoney(row.profit, selectedRobot.currency)}</strong><small>{row.trades} ops · {row.trades ? Math.round((row.wins / row.trades) * 100) : 0}%</small></div>)}</article>)}</div></>}
        </section>
      ) : null}

      {activeTab === 'settings' ? (
        <section className="algo-panel">
          <div className="algo-panel-heading"><div><h2>Configuración y archivos</h2><p>Metadatos, seguridad documental y mantenimiento del robot.</p></div><button className="algo-button primary" type="button" onClick={() => openRobotModal(selectedRobot)}>Editar configuración</button></div>
          <div className="algo-settings-facts"><div><span>Creado</span><strong>{formatDate(selectedRobot.createdAt)}</strong></div><div><span>Última modificación</span><strong>{formatDate(selectedRobot.updatedAt)}</strong></div><div><span>Riesgo</span><strong>{selectedRobot.riskMode === 'unknown' ? 'Sin definir' : (selectedRobot.riskValue ?? 0) + (selectedRobot.riskMode === 'percent' ? '%' : ' ' + selectedRobot.currency)}</strong></div><div><span>Dirección</span><strong>{selectedRobot.direction === 'both' ? 'Largos y cortos' : selectedRobot.direction === 'long' ? 'Solo largos' : 'Solo cortos'}</strong></div></div>
          <div className="algo-subsection"><div className="algo-section-heading"><div><h3>Adjuntos</h3><p>PDF, texto, imágenes, Excel, CSV, JSON o Python. Máximo 1 MB por archivo.</p></div><><input ref={attachmentInputRef} hidden multiple type="file" accept=".pdf,.txt,.md,.png,.jpg,.jpeg,.csv,.xlsx,.xls,.json,.py" onChange={(event: ChangeEvent<HTMLInputElement>) => void addAttachments(event.target.files)} /><button className="algo-button" type="button" onClick={() => attachmentInputRef.current?.click()}>+ Añadir archivos</button></></div>{selectedRobot.attachments.length ? <div className="algo-attachment-grid">{selectedRobot.attachments.map((attachment) => <article key={attachment.id}><span>⌑</span><div><strong>{attachment.name}</strong><small>{Math.round(attachment.size / 1024)} KB · {new Date(attachment.createdAt).toLocaleDateString('es-ES')}{attachment.description ? ' · ' + attachment.description : ''}</small></div><button type="button" onClick={() => void describeAttachment(attachment.id)}>Descripción</button><a href={attachment.dataUrl} download={attachment.name}>Descargar</a><button type="button" onClick={() => void removeAttachment(attachment.id)}>Eliminar</button></article>)}</div> : <div className="algo-empty-inline">No hay documentos adjuntos.</div>}</div>
          <div className="algo-danger-zone"><div><h3>Zona de mantenimiento</h3><p>Archivar oculta el robot sin perder información. Eliminar borra todos sus datos.</p></div><button className="algo-button" type="button" onClick={() => void archiveRobot(selectedRobot)}>{selectedRobot.status === 'archived' ? 'Restaurar robot' : 'Archivar robot'}</button><button className="algo-button danger" type="button" onClick={() => void deleteRobot(selectedRobot)}>Eliminar definitivamente</button></div>
        </section>
      ) : null}

      {robotModalOpen ? renderRobotModal() : null}
      {tradeModalOpen ? <div className="algo-modal-overlay" role="dialog" aria-modal="true" onMouseDown={(event) => { if (event.target === event.currentTarget) setTradeModalOpen(false) }}><form className="algo-modal trade" onSubmit={saveTrade}><div className="algo-modal-header"><div><span className="algo-eyebrow">Operación algorítmica</span><h2>{editingTradeId ? 'Editar operación' : 'Nueva operación'}</h2></div><button className="algo-close" type="button" onClick={() => setTradeModalOpen(false)}>×</button></div><div className="algo-form-grid"><label><span>Entorno *</span><select value={tradeForm.environment} onChange={(event) => setTradeForm({ ...tradeForm, environment: event.target.value as AlgorithmEnvironment })}>{Object.entries(ENVIRONMENT_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label><span>Versión del robot</span><input value={tradeForm.robotVersion} onChange={(event) => setTradeForm({ ...tradeForm, robotVersion: event.target.value })} /></label><label><span>Estado</span><select value={tradeForm.status} onChange={(event) => setTradeForm({ ...tradeForm, status: event.target.value as 'open' | 'closed' })}><option value="closed">Cerrada</option><option value="open">Abierta</option></select></label><label><span>Entrada *</span><input type="datetime-local" value={tradeForm.entryDate} onChange={(event) => setTradeForm({ ...tradeForm, entryDate: event.target.value })} /></label><label><span>Salida</span><input type="datetime-local" disabled={tradeForm.status === 'open'} value={tradeForm.exitDate} onChange={(event) => setTradeForm({ ...tradeForm, exitDate: event.target.value })} /></label><label><span>Símbolo *</span><input value={tradeForm.symbol} onChange={(event) => setTradeForm({ ...tradeForm, symbol: event.target.value })} /></label><label><span>Dirección</span><select value={tradeForm.side} onChange={(event) => setTradeForm({ ...tradeForm, side: event.target.value as TradeSide })}><option value="long">Compra</option><option value="short">Venta</option></select></label>{([['entryPrice', 'Precio entrada'], ['exitPrice', 'Precio salida'], ['stopLoss', 'Stop loss'], ['takeProfit', 'Take profit'], ['lots', 'Lotes'], ['commission', 'Comisión'], ['swap', 'Swap'], ['slippage', 'Slippage'], ['points', 'Puntos'], ['contracts', 'Contratos'], ['profit', 'Resultado *'], ['profitPercent', 'Resultado %']] as Array<[keyof typeof tradeForm, string]>).map(([key, label]) => <label key={key}><span>{label}</span><input type="number" step="any" required={key === 'profit'} value={String(tradeForm[key])} onChange={(event) => setTradeForm({ ...tradeForm, [key]: event.target.value })} /></label>)}<label><span>Setup</span><input value={tradeForm.setup} onChange={(event) => setTradeForm({ ...tradeForm, setup: event.target.value })} /></label><label className="algo-check-field"><input type="checkbox" checked={tradeForm.breakEven} onChange={(event) => setTradeForm({ ...tradeForm, breakEven: event.target.checked })} /><span>Break even</span></label><label className="wide"><span>Motivo de entrada</span><input value={tradeForm.entryReason} onChange={(event) => setTradeForm({ ...tradeForm, entryReason: event.target.value })} /></label><label className="wide"><span>Motivo de salida</span><input value={tradeForm.exitReason} onChange={(event) => setTradeForm({ ...tradeForm, exitReason: event.target.value })} /></label><label className="wide"><span>Etiquetas</span><input value={tradeForm.tags} onChange={(event) => setTradeForm({ ...tradeForm, tags: event.target.value })} /></label><label className="wide"><span>Notas</span><textarea rows={3} value={tradeForm.notes} onChange={(event) => setTradeForm({ ...tradeForm, notes: event.target.value })} /></label></div><div className="algo-modal-actions"><button className="algo-button" type="button" onClick={() => setTradeModalOpen(false)}>Cancelar</button><button className="algo-button primary" type="submit">Guardar operación</button></div></form></div> : null}
    </main>
  )
}
