export type TradeSide = 'long' | 'short'
export type ResultType = 'win' | 'loss' | 'breakeven'
export type EmotionalState = 'Neutral' | 'Calm' | 'Nervous' | 'Overconfident' | 'Distracted'

export interface Operation {
  id: string
  strategyId: string
  date: string
  exitDate?: string
  asset: string
  side: TradeSide
  entry: number
  exit: number
  size: number
  result: ResultType
  notes: string
  screenshotPath?: string
  rrRatio?: string
  stopLoss?: number | null
  takeProfit?: number | null
  setupType?: string
  emotionalState?: EmotionalState
  followedPlan?: boolean
  plValue?: number
  plPercent?: number
  commission?: number
  swap?: number
  riskMoney?: number
  riskPercent?: number
  benefitMoney?: number
  benefitPercent?: number
  balanceBefore?: number
  balanceAfter?: number
  equity?: number
  drawdownProduced?: number
  points?: number
  lots?: number
  valuePerPoint?: number
  contracts?: number
  instrument?: string
  broker?: string
  account?: string
  entryType?: string
  breakEven?: boolean
  labels?: string[]
  benefitCurrency?: string
}

export type StrategyState = 'active' | 'inactive'
export type StrategyEnvironment = 'real'
export type FundingAccountStatus = 'evaluation' | 'funded' | 'suspended' | 'passed' | 'closed'

export interface Strategy {
  id: string
  name: string
  description: string
  market?: string
  asset?: string
  timeframe?: string
  state?: StrategyState
  color?: string
  environment?: StrategyEnvironment
  createdAt: string
  // Extended metadata for strategy creation
  imagePath?: string
  initialBalance?: number
  broker?: string
  brokerAccount?: string
  brokerPassword?: string
}

export interface FundingAccountWithdrawal {
  id: string
  date: string
  amount: number
  currency?: 'EUR' | 'USD'
  notes?: string
}

export interface FundingAccount {
  id: string
  name: string
  firmName: string
  status: FundingAccountStatus
  color?: string
  initialCapital: number
  dailyLossLimit: number
  maxLossLimit: number
  purchaseDate: string
  statusChangedAt?: string
  fundedAt?: string
  suspendedAt?: string
  examCost: number
  currency?: 'EUR' | 'USD'
  websiteUrl?: string
  username?: string
  password?: string
  createdAt: string
  updatedAt?: string
  withdrawals: FundingAccountWithdrawal[]
}

export interface AppSettings {
  dataFolder: string | null
  appName?: string
  primaryColor?: string
  backgroundColor?: string
  theme?: 'dark' | 'light'
  visualThemeVersion?: number
  defaultCurrency?: 'EUR' | 'USD'
}

export type AlgorithmStatus = 'development' | 'backtesting' | 'demo' | 'live' | 'paused' | 'discarded' | 'archived' | 'testing' | 'active'
export type AlgorithmEnvironment = 'backtest' | 'out_of_sample' | 'demo' | 'real'
export type AlgorithmDirection = 'long' | 'short' | 'both'
export type AlgorithmTradeStatus = 'open' | 'closed'

export interface AlgorithmTrade {
  id: string
  robotId: string
  importId?: string
  externalId?: string
  robotVersion?: string
  environment: AlgorithmEnvironment
  entryDate: string
  exitDate?: string
  symbol: string
  side: TradeSide
  status: AlgorithmTradeStatus
  entryPrice?: number
  exitPrice?: number
  stopLoss?: number
  takeProfit?: number
  size?: number
  lots?: number
  commission?: number
  swap?: number
  slippage?: number
  points?: number
  contracts?: number
  breakEven?: boolean
  profit: number
  profitPercent?: number
  balance?: number
  equity?: number
  drawdown?: number
  durationMinutes?: number
  setup?: string
  entryReason?: string
  exitReason?: string
  tags?: string[]
  notes?: string
  sourceRow?: number
  createdAt: string
  updatedAt: string
}

export interface AlgorithmImportRecord {
  id: string
  robotId: string
  fileName: string
  importedAt: string
  environment: AlgorithmEnvironment
  robotVersion?: string
  rowsRead: number
  rowsImported: number
  rowsSkipped: number
  rowsInvalid: number
  duplicates: number
  mapping: Record<string, string>
  tradeIds: string[]
  warnings: string[]
  replacedTrades?: AlgorithmTrade[]
}

export interface AlgorithmCodeVersion {
  id: string
  robotId: string
  fileId: string
  version: number
  content: string
  notes?: string
  createdAt: string
  label?: 'stable' | 'real'
}

export interface AlgorithmCodeFile {
  id: string
  robotId: string
  name: string
  language: 'python' | 'text'
  content: string
  createdAt: string
  updatedAt: string
}

export interface AlgorithmAttachment {
  id: string
  robotId: string
  name: string
  type: string
  size: number
  description?: string
  dataUrl: string
  createdAt: string
}

export interface AlgorithmDocumentation {
  summary: string
  marketContext: string
  entryRules: string
  exitRules: string
  riskManagement: string
  filters: string
  parameters: string
  indicators: string
  examples: string
  assumptions: string
  knownRisks: string
  recommendedConditions: string
  personalNotes: string
  changelog: string
  updatedAt?: string
}

export interface AlgorithmRobot {
  id: string
  name: string
  description: string
  version: string
  status: AlgorithmStatus
  environment: AlgorithmEnvironment
  market: string
  symbols: string[]
  timeframe: string
  direction: AlgorithmDirection
  initialCapital: number
  currency: 'EUR' | 'USD'
  riskMode: 'fixed' | 'percent' | 'unknown'
  riskValue?: number
  tags: string[]
  color: string
  strategyType?: string
  platform?: string
  broker?: string
  programmingLanguage?: string
  pythonVersion?: string
  libraries?: string[]
  timezone?: string
  tradingHours?: string
  maxDailyTrades?: number
  stopLossModel?: string
  takeProfitModel?: string
  trailingStop?: boolean
  breakEven?: boolean
  dailyLossLimit?: number
  maxDrawdownLimit?: number
  positionSizing?: string
  estimatedCommission?: number
  estimatedSlippage?: number
  startDate?: string
  endDate?: string
  createdAt: string
  updatedAt: string
  archivedAt?: string
  trades: AlgorithmTrade[]
  imports: AlgorithmImportRecord[]
  codeFiles: AlgorithmCodeFile[]
  codeVersions: AlgorithmCodeVersion[]
  attachments: AlgorithmAttachment[]
  documentation: AlgorithmDocumentation
}

export interface AppData {
  strategies: Strategy[]
  accounts: FundingAccount[]
  operations: Operation[]
  algorithms: AlgorithmRobot[]
  settings: AppSettings
}
