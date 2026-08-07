export type OperationExtractionDraft = {
  asset?: string
  date?: string
  exitDate?: string
  side?: 'long' | 'short'
  entry?: number
  exit?: number
  stopLoss?: number
  takeProfit?: number
  lotSize?: number
  plValue?: number
  plPercent?: number
  commission?: number
  swap?: number
  rrRatio?: string
  setupType?: string
  notes?: string
  broker?: string
  account?: string
  entryType?: string
  emotionalState?: 'Neutral' | 'Calm' | 'Nervous' | 'Overconfident' | 'Distracted'
  followedPlan?: boolean
  result?: 'win' | 'loss' | 'breakeven'
}

export type OperationExtractionFieldStatus = 'detected' | 'review' | 'missing'

export type OperationExtractionFieldKey =
  | 'asset'
  | 'side'
  | 'lotSize'
  | 'date'
  | 'exitDate'
  | 'entry'
  | 'exit'
  | 'stopLoss'
  | 'takeProfit'
  | 'commission'
  | 'swap'
  | 'rate'
  | 'plValue'

export type OperationExtractionField = {
  key: OperationExtractionFieldKey
  label: string
  value: string
  status: OperationExtractionFieldStatus
}

export type OperationExtractionResult = {
  draft: OperationExtractionDraft
  fields: OperationExtractionField[]
  rawText?: string
  warnings: string[]
  provider: 'electron-vision' | 'http-vision' | 'browser-ocr' | 'heuristic'
}

const hasElectronVision = () =>
  typeof window !== 'undefined'
  && Boolean(window.tradingApp?.extractOperationFromImage)

const toNumber = (value: unknown): number | undefined => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined
  if (typeof value !== 'string') return undefined
  const cleaned = value.trim().replace(/[^\d,.-]/g, '').replace(',', '.')
  if (!cleaned) return undefined
  const parsed = Number(cleaned)
  return Number.isFinite(parsed) ? parsed : undefined
}

const toSide = (value: unknown): 'long' | 'short' | undefined => {
  if (typeof value !== 'string') return undefined
  const normalized = value.toLowerCase().trim()
  if (['long', 'buy', 'compra'].includes(normalized)) return 'long'
  if (['short', 'sell', 'venta'].includes(normalized)) return 'short'
  return undefined
}

const toResult = (value: unknown): 'win' | 'loss' | 'breakeven' | undefined => {
  if (typeof value === 'string') {
    const normalized = value.toLowerCase().trim()
    if (normalized === 'win' || normalized === 'loss' || normalized === 'breakeven') return normalized
    if (normalized === 'ganancia') return 'win'
    if (normalized === 'pérdida' || normalized === 'perdida') return 'loss'
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (value > 0) return 'win'
    if (value < 0) return 'loss'
    return 'breakeven'
  }
  return undefined
}

const inferSideFromStops = (
  entry?: number,
  stopLoss?: number,
  takeProfit?: number,
): 'long' | 'short' | undefined => {
  if (entry == null) return undefined
  if (stopLoss != null && takeProfit != null) {
    if (stopLoss < entry && takeProfit > entry) return 'long'
    if (stopLoss > entry && takeProfit < entry) return 'short'
  }
  if (stopLoss != null) {
    if (stopLoss < entry) return 'long'
    if (stopLoss > entry) return 'short'
  }
  if (takeProfit != null) {
    if (takeProfit > entry) return 'long'
    if (takeProfit < entry) return 'short'
  }
  return undefined
}

const inferResultFromTrade = (
  side?: 'long' | 'short',
  entry?: number,
  exit?: number,
): 'win' | 'loss' | 'breakeven' | undefined => {
  if (!side || entry == null || exit == null) return undefined
  if (entry === exit) return 'breakeven'
  if (side === 'long') return exit > entry ? 'win' : 'loss'
  return exit < entry ? 'win' : 'loss'
}

const inferRrRatio = (
  side?: 'long' | 'short',
  entry?: number,
  stopLoss?: number,
  takeProfit?: number,
  exit?: number,
): string | undefined => {
  if (!side || entry == null || stopLoss == null) return undefined
  const risk = Math.abs(entry - stopLoss)
  if (risk <= 0) return undefined
  const realizedMove = exit == null
    ? undefined
    : Math.abs(side === 'long' ? exit - entry : entry - exit)
  const targetMove = takeProfit == null
    ? undefined
    : Math.abs(side === 'long' ? takeProfit - entry : entry - takeProfit)
  const reward = realizedMove && realizedMove > 0 ? realizedMove : targetMove
  if (reward == null || reward < 0) return undefined
  const rr = reward / risk
  if (!Number.isFinite(rr) || rr <= 0) return undefined
  return `1:${rr.toFixed(2).replace(/\.?0+$/, '')}`
}

const normalizeDateTime = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined
  const input = value.trim()
  if (!input) return undefined

  const buildLocalDateTime = (
    yearValue: string | number,
    monthValue: string | number,
    dayValue: string | number,
    hourValue: string | number = 0,
    minuteValue: string | number = 0,
  ) => {
    const year = Number(yearValue)
    const month = Number(monthValue)
    const day = Number(dayValue)
    const hour = Number(hourValue)
    const minute = Number(minuteValue)
    if (
      !Number.isInteger(year)
      || !Number.isInteger(month)
      || !Number.isInteger(day)
      || !Number.isInteger(hour)
      || !Number.isInteger(minute)
      || year < 1900
      || year > 2200
      || month < 1
      || month > 12
      || day < 1
      || day > 31
      || hour < 0
      || hour > 23
      || minute < 0
      || minute > 59
    ) return undefined

    const candidate = new Date(year, month - 1, day, hour, minute)
    if (
      candidate.getFullYear() !== year
      || candidate.getMonth() !== month - 1
      || candidate.getDate() !== day
      || candidate.getHours() !== hour
      || candidate.getMinutes() !== minute
    ) return undefined

    return [
      year,
      String(month).padStart(2, '0'),
      String(day).padStart(2, '0'),
    ].join('-') + 'T' + [
      String(hour).padStart(2, '0'),
      String(minute).padStart(2, '0'),
    ].join(':')
  }

  const iso = input.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ](\d{1,2}):(\d{2}))?/)
  if (iso) return buildLocalDateTime(iso[1], iso[2], iso[3], iso[4] ?? 0, iso[5] ?? 0)

  const european = input.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2}|\d{4})(?:[ T](\d{1,2}):(\d{2})(?::\d{2})?)?$/)
  if (european) {
    const [, day, month, rawYear, hour = '0', minute = '0'] = european
    const year = rawYear.length === 2
      ? Number(rawYear) >= 70 ? `19${rawYear}` : `20${rawYear}`
      : rawYear
    return buildLocalDateTime(year, month, day, hour, minute)
  }

  const parsed = new Date(input)
  if (Number.isNaN(parsed.getTime())) return undefined
  return buildLocalDateTime(
    parsed.getFullYear(),
    parsed.getMonth() + 1,
    parsed.getDate(),
    parsed.getHours(),
    parsed.getMinutes(),
  )
}

const parseMetaTraderText = (text: string) => {
  const source = text.replace(/\r/g, '')
  const lines = source
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

  const normalizeLabel = (value: string) =>
    value
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/0/g, 'o')
      .replace(/1/g, 'i')
      .replace(/5/g, 's')
      .replace(/[^a-z\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()

  const findLine = (aliases: string[]) => {
    const normalizedAliases = aliases.map((item) => normalizeLabel(item))
    return lines.find((line) => {
      const normalizedLine = normalizeLabel(line)
      return normalizedAliases.some((alias) => normalizedLine.includes(alias) || alias.includes(normalizedLine))
    })
  }

  const pickDateTimeFromLine = (aliases: string[]) => {
    const line = findLine(aliases)
    if (!line) return undefined
    const matched = line.match(/(\d{2}[./-]\d{2}[./-]\d{2,4}\s+\d{2}:\d{2}(?::\d{2})?)/)
    return normalizeDateTime(matched?.[1])
  }

  const pickNumberFromLine = (aliases: string[]) => {
    const line = findLine(aliases)
    if (!line) return undefined
    const matches = [...line.matchAll(/-?\d[\d.,]*/g)].map((match) => match[0])
    const candidate = matches.at(-1)
    return toNumber(candidate)
  }

  const get = (regex: RegExp) => source.match(regex)?.[1]?.trim()
  const pickNumber = (regex: RegExp) => toNumber(get(regex))
  const pickFromLine = (labelRegex: RegExp) => {
    const line = source.split('\n').find((item) => labelRegex.test(item))
    if (!line) return undefined
    const match = line.match(/(-?\d[\d.,]*)\s*$/)
    return match?.[1]
  }

  const sideText = get(/\b(BUY|SELL|LONG|SHORT)\b/i)
  const headerAssetMatch = source.match(/([A-Z0-9]{3,}(?:[._-][A-Z0-9]{1,})*)\s*,?\s*(?:BUY|SELL|LONG|SHORT)\b/i)
  const parsed: OperationExtractionDraft & { rate?: number; rawText?: string } = {
    asset: headerAssetMatch?.[1] ?? get(/\b([A-Z0-9._-]{3,20})\b(?=.*\b(?:BUY|SELL|LONG|SHORT)\b)/i),
    side: toSide(sideText),
    lotSize: pickNumber(/(?:Volumen|Volume|Lots?)\s*[:=.\s]*([\d.,-]+)/i) ?? pickNumberFromLine(['Volumen', 'Volume', 'Lots']),
    date:
      normalizeDateTime(get(/(?:Hora de apertura|Open(?:ing)?\s*time)\s*[:=.\s]*([^\n]+)/i) ?? pickFromLine(/(?:Hora de apertura|Open(?:ing)?\s*time)/i))
      ?? pickDateTimeFromLine(['Hora de apertura', 'Hora apert', 'Open time', 'Opening time']),
    exitDate:
      normalizeDateTime(get(/(?:Hora de cierre|Close(?:d)?\s*time)\s*[:=.\s]*([^\n]+)/i) ?? pickFromLine(/(?:Hora de cierre|Close(?:d)?\s*time)/i))
      ?? pickDateTimeFromLine(['Hora de cierre', 'Hora cierr', 'Close time', 'Closed time']),
    entry: pickNumber(/(?:Precio de apertura|Open(?:ing)?\s*price)\s*[:=.\s]*([\d.,-]+)/i) ?? pickNumberFromLine(['Precio de apertura', 'Precio apert', 'Open price', 'Opening price']),
    exit: pickNumber(/(?:Precio de cierre|Close(?:d)?\s*price)\s*[:=.\s]*([\d.,-]+)/i) ?? pickNumberFromLine(['Precio de cierre', 'Precio cierr', 'Close price', 'Closed price']),
    stopLoss: pickNumber(/(?:Stop\s*Loss|S\/L)\s*[:=.\s]*([\d.,-]+)/i) ?? pickNumberFromLine(['Stop Loss', 'S L']),
    takeProfit: pickNumber(/(?:Take\s*Profit|T\/P)\s*[:=.\s]*([\d.,-]+)/i) ?? pickNumberFromLine(['Take Profit', 'T P']),
    commission: pickNumber(/(?:Comisi[oó]n|Commission)\s*[:=.\s]*([\d.,-]+)/i) ?? pickNumberFromLine(['Comisión', 'Comision', 'Commission']),
    swap: pickNumber(/(?:Swap)\s*[:=.\s]*([\d.,-]+)/i) ?? pickNumberFromLine(['Swap']),
    rate: pickNumber(/(?:Tasa|Rate)\s*[:=.\s]*([\d.,-]+)/i) ?? pickNumberFromLine(['Tasa', 'Rate']),
    plValue:
      pickNumber(/(?:^|\n)\s*(?:Beneficio|P\/L)\s*[:=.\s]*([\d.,-]+)/im)
      ?? pickNumberFromLine(['Beneficio', 'P/L', 'P L']),
    rawText: source,
  }

  if (!parsed.side) {
    const fallbackSide = source.match(/\b(BUY|SELL)\b/i)?.[1]
    parsed.side = toSide(fallbackSide)
  }

  parsed.side ||= inferSideFromStops(parsed.entry, parsed.stopLoss, parsed.takeProfit)
  parsed.rrRatio = inferRrRatio(parsed.side, parsed.entry, parsed.stopLoss, parsed.takeProfit, parsed.exit)
  parsed.result = toResult(parsed.plValue) ?? inferResultFromTrade(parsed.side, parsed.entry, parsed.exit)
  return parsed
}

const hasMeaningfulExtraction = (draft: OperationExtractionDraft) => {
  const hasCore =
    draft.asset
    && draft.side
    && draft.entry != null
    && draft.exit != null
    && draft.date
    && draft.exitDate
  const hasRiskOrPnL =
    draft.stopLoss != null
    || draft.takeProfit != null
    || draft.plValue != null
  return Boolean(hasCore && hasRiskOrPnL)
}

const extractionScore = (draft: OperationExtractionDraft) => {
  const keyValues = [
    draft.asset,
    draft.side,
    draft.lotSize,
    draft.date,
    draft.exitDate,
    draft.entry,
    draft.exit,
    draft.stopLoss,
    draft.takeProfit,
    draft.commission,
    draft.swap,
    draft.plValue,
  ]
  return keyValues.filter((value) => value !== undefined && value !== null && String(value).trim() !== '').length
}

const normalizePayload = (payload: unknown) => {
  if (!payload || typeof payload !== 'object') return {}
  const record = payload as Record<string, unknown>
  const rawText = typeof record.rawText === 'string' ? record.rawText : ''
  const parsedText = rawText ? parseMetaTraderText(rawText) : {}
  const base: OperationExtractionDraft & { rate?: number; rawText?: string } = {
    asset: typeof record.asset === 'string' ? record.asset : parsedText.asset,
    date: normalizeDateTime(record.date) ?? parsedText.date,
    exitDate: normalizeDateTime(record.exitDate) ?? parsedText.exitDate,
    side: toSide(record.side) ?? parsedText.side,
    entry: toNumber(record.entry) ?? parsedText.entry,
    exit: toNumber(record.exit) ?? parsedText.exit,
    stopLoss: toNumber(record.stopLoss) ?? parsedText.stopLoss,
    takeProfit: toNumber(record.takeProfit) ?? parsedText.takeProfit,
    lotSize: toNumber(record.lotSize ?? record.volume ?? record.size) ?? parsedText.lotSize,
    commission: toNumber(record.commission) ?? parsedText.commission,
    swap: toNumber(record.swap) ?? parsedText.swap,
    rate: toNumber(record.rate) ?? parsedText.rate,
    plValue: toNumber(record.plValue ?? record.profit) ?? parsedText.plValue,
    rawText: rawText || parsedText.rawText,
  }

  const result = toResult(record.result) ?? toResult(base.plValue)
  const side = base.side ?? inferSideFromStops(base.entry, base.stopLoss, base.takeProfit)
  const rrRatio = typeof record.rrRatio === 'string'
    ? record.rrRatio
    : inferRrRatio(side, base.entry, base.stopLoss, base.takeProfit, base.exit)
  return {
    ...base,
    side,
    rrRatio,
    result: result ?? inferResultFromTrade(side, base.entry, base.exit),
  }
}

const heuristicFromInput = (input: File | string) => {
  const text = typeof input === 'string' ? input : `${input.name} ${(input as File).type ?? ''}`
  const side = /sell|short|venta/i.test(text) ? 'short' : /buy|long|compra/i.test(text) ? 'long' : undefined
  const asset = text.match(/[A-Z]{3,6}(?:[./_-][A-Z]{2,6})?/g)?.[0]
  return {
    asset,
    side,
    result: undefined,
  } as OperationExtractionDraft
}

const withFinalResult = (draft: OperationExtractionDraft): OperationExtractionDraft => {
  if (draft.result) return draft
  if (typeof draft.plValue === 'number') {
    return { ...draft, result: toResult(draft.plValue) }
  }
  return draft
}

const toField = (
  key: OperationExtractionFieldKey,
  label: string,
  value: unknown,
  preferReview: boolean,
): OperationExtractionField => {
  const exists = value !== null && value !== undefined && String(value).trim() !== ''
  if (!exists) {
    return { key, label, value: 'No detectado', status: 'missing' }
  }
  return {
    key,
    label,
    value: String(value),
    status: preferReview ? 'review' : 'detected',
  }
}

const buildFields = (
  draft: OperationExtractionDraft & { rate?: number },
  provider: OperationExtractionResult['provider'],
) => {
  const reviewByProvider = provider === 'heuristic'
  return [
    toField('asset', 'Activo detectado', draft.asset, reviewByProvider),
    toField('side', 'Tipo de operación', draft.side === 'long' ? 'Buy / Long' : draft.side === 'short' ? 'Sell / Short' : '', reviewByProvider),
    toField('lotSize', 'Volumen', draft.lotSize, reviewByProvider),
    toField('date', 'Hora de apertura', draft.date, reviewByProvider),
    toField('exitDate', 'Hora de cierre', draft.exitDate, reviewByProvider),
    toField('entry', 'Precio de entrada', draft.entry, reviewByProvider),
    toField('exit', 'Precio de salida', draft.exit, reviewByProvider),
    toField('stopLoss', 'Stop Loss', draft.stopLoss, reviewByProvider),
    toField('takeProfit', 'Take Profit', draft.takeProfit, reviewByProvider),
    toField('commission', 'Comisión', draft.commission, reviewByProvider),
    toField('swap', 'Swap', draft.swap, reviewByProvider),
    toField('rate', 'Tasa', draft.rate, reviewByProvider),
    toField('plValue', 'Beneficio', draft.plValue, reviewByProvider),
  ]
}

const parseLocalVisionPayload = (payload: unknown) => {
  if (!payload || typeof payload !== 'object') return {}
  const parsed = normalizePayload(payload)
  return parsed
}

const extractRawTextWithBrowserTesseract = async (file: File) => {
  const { createWorker } = await import('tesseract.js')
  const worker = await createWorker(['eng', 'spa'])
  try {
    const { data } = await worker.recognize(file)
    return typeof data?.text === 'string' ? data.text.trim() : ''
  } finally {
    await worker.terminate()
  }
}

export async function extractOperationFromImage(input: File | string): Promise<OperationExtractionResult> {
  const warnings: string[] = []
  const heuristic = heuristicFromInput(input)
  let bestDraft = withFinalResult(heuristic)
  let bestProvider: OperationExtractionResult['provider'] = 'heuristic'
  let bestRawText: string | undefined
  let bestScore = extractionScore(bestDraft)

  if (hasElectronVision() && typeof input === 'string') {
    try {
      const payload = await window.tradingApp.extractOperationFromImage({ imagePath: input })
      const normalized = parseLocalVisionPayload(payload)
      const draft = withFinalResult({ ...heuristic, ...normalized })
      const candidateScore = extractionScore(draft)
      if (candidateScore > bestScore) {
        bestDraft = draft
        bestProvider = 'electron-vision'
        bestRawText = (normalized as { rawText?: string }).rawText
        bestScore = candidateScore
      }
      if (hasMeaningfulExtraction(draft)) {
        return {
          draft,
          fields: buildFields(draft as OperationExtractionDraft & { rate?: number }, 'electron-vision'),
          rawText: (normalized as { rawText?: string }).rawText,
          warnings,
          provider: 'electron-vision',
        }
      }
      warnings.push('La extracción por visión devolvió pocos datos. Intentando mejorar con fallback.')
    } catch (error) {
      warnings.push(error instanceof Error ? error.message : 'Falló la extracción local por visión.')
    }
  }

  const endpoint = import.meta.env.VITE_AI_VISION_ENDPOINT
  if (endpoint) {
    const formData = new FormData()
    if (typeof input === 'string') {
      warnings.push('El endpoint HTTP de visión requiere un archivo. Se usó fallback heurístico.')
    } else {
      formData.append('image', input)
      const response = await fetch(endpoint, {
        method: 'POST',
        body: formData,
      })
      if (!response.ok) {
        warnings.push(`Servicio de visión devolvió ${response.status}.`)
      } else {
        const payload = await response.json()
        const normalized = normalizePayload(payload)
        const draft = withFinalResult({ ...heuristic, ...normalized })
        const candidateScore = extractionScore(draft)
        if (candidateScore > bestScore) {
          bestDraft = draft
          bestProvider = 'http-vision'
          bestRawText = (normalized as { rawText?: string }).rawText
          bestScore = candidateScore
        }
        return {
          draft,
          fields: buildFields(draft as OperationExtractionDraft & { rate?: number }, 'http-vision'),
          rawText: (normalized as { rawText?: string }).rawText,
          warnings,
          provider: 'http-vision',
        }
      }
    }
  }

  if (typeof input !== 'string') {
    try {
      const rawText = await extractRawTextWithBrowserTesseract(input)
      if (rawText) {
        const parsed = parseMetaTraderText(rawText)
        const draft = withFinalResult({ ...heuristic, ...parsed })
        const candidateScore = extractionScore(draft)
        if (candidateScore > bestScore) {
          bestDraft = draft
          bestProvider = 'browser-ocr'
          bestRawText = rawText
          bestScore = candidateScore
        }
        if (hasMeaningfulExtraction(draft)) {
          return {
            draft,
            fields: buildFields(draft as OperationExtractionDraft & { rate?: number }, 'browser-ocr'),
            rawText,
            warnings,
            provider: 'browser-ocr',
          }
        }
      }
    } catch (error) {
      warnings.push(error instanceof Error ? error.message : 'Falló OCR local en navegador.')
    }
  }

  if (bestScore <= extractionScore(heuristic)) {
    warnings.push('Se aplicó un análisis preliminar. Revisa manualmente los campos no detectados.')
  } else {
    warnings.push('Se aplicó el mejor resultado disponible de la extracción. Revisa los campos faltantes.')
  }
  return {
    draft: bestDraft,
    fields: buildFields(bestDraft, bestProvider),
    rawText: bestRawText,
    warnings,
    provider: bestProvider,
  }
}

export async function extractOperationDraft(input: File | string): Promise<OperationExtractionDraft> {
  const result = await extractOperationFromImage(input)
  return result.draft
}
