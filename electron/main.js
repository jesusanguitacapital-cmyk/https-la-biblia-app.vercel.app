import path from 'node:path'
import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { promises as fs } from 'node:fs'

const DATA_FILE_NAME = 'data.json'
const APP_STATE_FILE_NAME = 'app-state.json'
const SCREENSHOTS_DIR = 'screenshots'
let writeQueue = Promise.resolve()

function getDefaultDataFolder() {
  return path.join(app.getPath('userData'), 'trading-tracker')
}

async function ensureDataFolder(folder) {
  await fs.mkdir(folder, { recursive: true })
  const screenshotsFolder = path.join(folder, SCREENSHOTS_DIR)
  await fs.mkdir(screenshotsFolder, { recursive: true })
  return folder
}

async function readDataFile(folder) {
  const filePath = path.join(folder, DATA_FILE_NAME)
  try {
    const raw = await fs.readFile(filePath, 'utf8')
    return JSON.parse(raw)
  } catch (error) {
    if (error.code === 'ENOENT') {
      return null
    }
    throw error
  }
}

async function writeDataFile(folder, data) {
  const filePath = path.join(folder, DATA_FILE_NAME)
  writeQueue = writeQueue.then(() => writeJsonAtomic(filePath, data))
  await writeQueue
}

function getAppStatePath() {
  return path.join(app.getPath('userData'), APP_STATE_FILE_NAME)
}

async function writeJsonAtomic(filePath, data) {
  const tempPath = `${filePath}.tmp`
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(tempPath, JSON.stringify(data, null, 2), 'utf8')
  await fs.rename(tempPath, filePath)
}

async function readAppState() {
  const filePath = getAppStatePath()
  try {
    const raw = await fs.readFile(filePath, 'utf8')
    const parsed = JSON.parse(raw)
    return typeof parsed === 'object' && parsed ? parsed : {}
  } catch (error) {
    if (error.code === 'ENOENT') {
      return {}
    }
    throw error
  }
}

async function writeAppState(state) {
  await writeJsonAtomic(getAppStatePath(), state)
}

async function getActiveDataFolder() {
  const state = await readAppState()
  const folder = state.activeDataFolder || getDefaultDataFolder()
  await ensureDataFolder(folder)
  return folder
}

async function setActiveDataFolder(folder) {
  await ensureDataFolder(folder)
  await writeAppState({ activeDataFolder: folder })
  return folder
}

async function copyScreenshot(sourcePath, folder) {
  const screenshotsFolder = path.join(folder, SCREENSHOTS_DIR)
  await fs.mkdir(screenshotsFolder, { recursive: true })
  const fileName = `${Date.now()}-${path.basename(sourcePath)}`
  const destination = path.join(screenshotsFolder, fileName)
  await fs.copyFile(sourcePath, destination)
  return destination
}

function getMimeType(filePath) {
  const extension = path.extname(filePath).toLowerCase()
  if (extension === '.png') return 'image/png'
  if (extension === '.jpg' || extension === '.jpeg') return 'image/jpeg'
  if (extension === '.webp') return 'image/webp'
  return 'application/octet-stream'
}

async function imagePathToDataUrl(imagePath) {
  const buffer = await fs.readFile(imagePath)
  const mimeType = getMimeType(imagePath)
  return `data:${mimeType};base64,${buffer.toString('base64')}`
}

function extractJsonObject(text) {
  if (typeof text !== 'string' || !text.trim()) {
    throw new Error('La respuesta del modelo de visión llegó vacía.')
  }
  const fenced = text.match(/```json\s*([\s\S]*?)```/i) || text.match(/```\s*([\s\S]*?)```/i)
  const candidate = fenced?.[1] || text
  const start = candidate.indexOf('{')
  const end = candidate.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('La respuesta del modelo de visión no contiene JSON válido.')
  }
  return JSON.parse(candidate.slice(start, end + 1))
}

async function extractOperationFromImageWithOpenAI(imagePath) {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    throw new Error('Falta OPENAI_API_KEY. Configura la clave antes de usar la extracción por visión.')
  }

  const model = process.env.OPENAI_VISION_MODEL || 'gpt-4.1-mini'
  const dataUrl = await imagePathToDataUrl(imagePath)
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'trading_operation_extraction',
          strict: true,
          schema: {
            type: 'object',
            additionalProperties: false,
            properties: {
              asset: { type: ['string', 'null'] },
              date: { type: ['string', 'null'], description: 'Formato YYYY-MM-DDTHH:mm' },
              exitDate: { type: ['string', 'null'], description: 'Formato YYYY-MM-DDTHH:mm' },
              side: { type: ['string', 'null'], enum: ['long', 'short', null] },
              entry: { type: ['number', 'null'] },
              exit: { type: ['number', 'null'] },
              stopLoss: { type: ['number', 'null'] },
              takeProfit: { type: ['number', 'null'] },
              lotSize: { type: ['number', 'null'] },
              plValue: { type: ['number', 'null'] },
              plPercent: { type: ['number', 'null'] },
              rrRatio: { type: ['string', 'null'] },
              result: { type: ['string', 'null'], enum: ['win', 'loss', 'breakeven', null] },
              setupType: { type: ['string', 'null'] },
              entryType: { type: ['string', 'null'] },
              emotionalState: { type: ['string', 'null'], enum: ['Neutral', 'Calm', 'Nervous', 'Overconfident', 'Distracted', null] },
              followedPlan: { type: ['boolean', 'null'] },
              notes: { type: ['string', 'null'] },
              rawText: { type: ['string', 'null'] },
            },
            required: [
              'asset',
              'date',
              'exitDate',
              'side',
              'entry',
              'exit',
              'stopLoss',
              'takeProfit',
              'lotSize',
              'plValue',
              'plPercent',
              'rrRatio',
              'result',
              'setupType',
              'entryType',
              'emotionalState',
              'followedPlan',
              'notes',
              'rawText',
            ],
          },
        },
      },
      messages: [
        {
          role: 'system',
          content: 'Eres un extractor experto de operaciones de trading desde capturas de MetaTrader 5. Devuelve solo JSON válido siguiendo el schema. Lee la ventana como un ticket de operación de MT5 y prioriza estos campos visibles: símbolo/activo, tipo (buy/sell), hora de apertura, hora de cierre, precio de apertura, precio de cierre, stop loss, take profit, volumen, comisión, swap/tasa y beneficio. Reglas estrictas: interpreta buy como long y sell como short; conserva los números exactamente como aparecen, convirtiéndolos a number; convierte fecha y hora al formato YYYY-MM-DDTHH:mm; si un dato no aparece o no se puede confirmar visualmente, devuelve null; no inventes valores; rawText debe contener el texto visible más relevante de la captura, especialmente encabezado, precios y fechas.',
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Analiza esta captura de MetaTrader 5 como si fuera un resumen/ticket de una operación cerrada. Extrae únicamente lo que se vea en la imagen. Busca especialmente etiquetas como sell/buy, volumen, hora de apertura, hora de cierre, precio de apertura, precio de cierre, stop loss, take profit, comisión, swap/tasa y beneficio. Si el activo aparece en el encabezado (por ejemplo XAUUSD, EURUSD, BTCUSD), úsalo como asset. Calcula result a partir de beneficio si está visible; si no, usa la relación entre entrada/salida y el lado de la operación. Usa rawText para devolver una transcripción útil de los datos clave visibles.',
            },
            {
              type: 'image_url',
              image_url: {
                url: dataUrl,
              },
            },
          ],
        },
      ],
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`OpenAI Vision devolvió ${response.status}: ${errorText}`)
  }

  const payload = await response.json()
  const content = payload?.choices?.[0]?.message?.content
  if (typeof content !== 'string') {
    throw new Error('OpenAI Vision no devolvió contenido interpretable.')
  }

  return extractJsonObject(content)
}

async function extractOperationFromImageWithTesseract(imagePath) {
  const { createWorker } = await import('tesseract.js')
  const worker = await createWorker(['eng', 'spa'])
  try {
    const { data } = await worker.recognize(imagePath)
    const rawText = typeof data?.text === 'string' ? data.text.trim() : ''
    if (!rawText) {
      throw new Error('OCR local no detectó texto utilizable en la captura.')
    }
    return {
      rawText,
    }
  } finally {
    await worker.terminate()
  }
}

async function extractOperationFromImage(imagePath) {
  const errors = []

  try {
    return await extractOperationFromImageWithOpenAI(imagePath)
  } catch (error) {
    errors.push(error instanceof Error ? error.message : 'Falló OpenAI Vision.')
  }

  try {
    return await extractOperationFromImageWithTesseract(imagePath)
  } catch (error) {
    errors.push(error instanceof Error ? error.message : 'Falló OCR local.')
  }

  throw new Error(`No se pudo extraer la operación desde la imagen. ${errors.join(' | ')}`)
}

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 860,
    minWidth: 940,
    minHeight: 720,
    webPreferences: {
      preload: path.join(app.getAppPath(), 'electron', 'preload.cjs'),
      contextIsolation: true,
      sandbox: false,
    },
  })

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    mainWindow.loadFile(path.join(app.getAppPath(), 'dist', 'index.html'))
  }
}

app.whenReady().then(() => {
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

ipcMain.handle('storage/get-default-folder', async () => {
  const folder = await getActiveDataFolder()
  return folder
})

ipcMain.handle('storage/select-folder', async () => {
  const result = await dialog.showOpenDialog({
    title: 'Seleccionar carpeta de datos de trading',
    properties: ['openDirectory', 'createDirectory'],
  })
  if (result.canceled || result.filePaths.length === 0) {
    return null
  }
  const folder = result.filePaths[0]
  return setActiveDataFolder(folder)
})

ipcMain.handle('storage/load-data', async () => {
  const folder = await getActiveDataFolder()
  const data = await readDataFile(folder)
  return { folder, data }
})

ipcMain.handle('storage/save-data', async (_, { folder, data }) => {
  const targetFolder = folder || await getActiveDataFolder()
  await setActiveDataFolder(targetFolder)
  await writeDataFile(targetFolder, data)
  return { folder: targetFolder }
})

ipcMain.handle('storage/copy-image', async (_, { imagePath, folder }) => {
  const targetFolder = folder || await getActiveDataFolder()
  await setActiveDataFolder(targetFolder)
  const copiedPath = await copyScreenshot(imagePath, targetFolder)
  return { path: copiedPath }
})

ipcMain.handle('storage/select-image', async () => {
  const result = await dialog.showOpenDialog({
    title: 'Seleccionar imagen de captura de pantalla',
    properties: ['openFile'],
    filters: [{ name: 'Imágenes', extensions: ['png', 'jpg', 'jpeg', 'webp'] }],
  })
  if (result.canceled || result.filePaths.length === 0) {
    return null
  }
  return result.filePaths[0]
})

ipcMain.handle('ai/extract-operation-from-image', async (_, { imagePath }) => {
  if (!imagePath) {
    throw new Error('No se recibió ninguna imagen para analizar.')
  }
  return extractOperationFromImage(imagePath)
})
