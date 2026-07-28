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
  theme?: 'dark' | 'light'
  visualThemeVersion?: number
  defaultCurrency?: 'EUR' | 'USD'
}

export interface AppData {
  strategies: Strategy[]
  accounts: FundingAccount[]
  operations: Operation[]
  settings: AppSettings
}
