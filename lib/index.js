// dsh-mcp-nestorclub — Host half.
//
// The bundle patch inserts the shipped @deepseek-ai/dsh-mcp-client row for
// mcp.nestorclub.com. That row cannot carry the API key: the key belongs to the
// person using the plugin, not to the repository. This half asks for it, in
// three surfaces that all call the same two functions:
//
//   * the card on the plugin's page in the Web Plugins list (lib/client.js),
//   * the /mcp-key slash command,
//   * a JSON API under /mcp-nestorclub/*.
//
// Saving never rewrites the profile by hand: it goes through the config editor
// service, which validates the full candidate and persists the same override a
// person would otherwise write into cordis.patch.yml.

const ROW_ID = 'mcp-nestorclub'
const KEY_HEADER = 'x-api-key'
const DEFAULT_URL = 'https://mcp.nestorclub.com'
const PROBE_TIMEOUT_MS = 15000

export const inject = ['webServer', 'commands', 'configEditor']

function errText(error) {
  if (error === null || error === undefined) return 'unknown error'
  if (typeof error === 'object' && error.message !== undefined) return String(error.message)
  return String(error)
}

function clip(text, max) {
  const value = String(text === undefined || text === null ? '' : text).replace(/\s+/g, ' ').trim()
  const limit = typeof max === 'number' ? max : 240
  return value.length <= limit ? value : value.slice(0, limit) + '...'
}

function findEntry(ctx) {
  let editor
  try {
    editor = ctx.get('configEditor')
  } catch {
    return undefined
  }
  if (editor === undefined || typeof editor.entries !== 'function') return undefined
  try {
    return editor.entries().find((entry) => entry.options !== undefined && entry.options.id === ROW_ID)
  } catch {
    return undefined
  }
}

function rowConfig(entry) {
  const config = entry === undefined ? undefined : entry.options.config
  return config !== null && typeof config === 'object' ? config : {}
}

function serverUrl(entry) {
  const url = rowConfig(entry).url
  return typeof url === 'string' && url.trim() !== '' ? url.trim() : DEFAULT_URL
}

function readKey(entry) {
  const headers = rowConfig(entry).headers
  if (headers === null || typeof headers !== 'object') return undefined
  const value = headers[KEY_HEADER]
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined
}

function maskKey(value) {
  if (typeof value !== 'string' || value === '') return null
  return value.length <= 4 ? '****' : '****' + value.slice(-4)
}

async function probe(url, key) {
  const value = typeof key === 'string' ? key.trim() : ''
  if (value === '') return { ok: false, error: 'Ключ пустой.' }
  const body = {
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2026-07-28',
      capabilities: {},
      clientInfo: { name: 'dsh-mcp-nestorclub', version: '0.2.0' },
    },
  }
  let response
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        [KEY_HEADER]: value,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    })
  } catch (error) {
    return { ok: false, error: 'Сервер недоступен: ' + errText(error) }
  }
  let text = ''
  try {
    text = await response.text()
  } catch {
    text = ''
  }
  if (!response.ok) {
    const detail = text.trim() === '' ? '' : ': ' + clip(text)
    return { ok: false, error: 'Сервер отклонил ключ (HTTP ' + response.status + ')' + detail }
  }
  if (!text.includes('nestorclub-mcp')) {
    return { ok: false, error: 'Неожиданный ответ сервера: ' + clip(text) }
  }
  return { ok: true }
}

async function saveKey(ctx, key) {
  const value = typeof key === 'string' ? key.trim() : ''
  if (value === '') throw new Error('Ключ пустой.')
  const editor = ctx.get('configEditor')
  if (editor === undefined || typeof editor.edit !== 'function') {
    throw new Error('Служба редактирования конфигурации недоступна.')
  }
  const entry = findEntry(ctx)
  if (entry === undefined) {
    throw new Error('Строка mcp-nestorclub не найдена: плагин dsh-mcp-nestorclub не загружен.')
  }
  await editor.edit(entry, (current) => {
    const base = current !== null && typeof current === 'object' ? current : {}
    const headers = base.headers !== null && typeof base.headers === 'object' ? { ...base.headers } : {}
    headers[KEY_HEADER] = value
    return { ...base, headers }
  })
}

export function apply(ctx) {
  const webServer = ctx.get('webServer')
  const commands = ctx.get('commands')

  const status = () => {
    const entry = findEntry(ctx)
    const key = readKey(entry)
    return {
      present: entry !== undefined,
      url: serverUrl(entry),
      serverName: rowConfig(entry).serverName === undefined ? 'web' : rowConfig(entry).serverName,
      configured: key !== undefined,
      masked: maskKey(key),
    }
  }

  const save = async (key) => {
    const check = await probe(serverUrl(findEntry(ctx)), key)
    if (!check.ok) return check
    await saveKey(ctx, key)
    return { ok: true }
  }

  // ---- JSON API used by the card in the Web Plugins list ---------------------
  if (webServer !== undefined && typeof webServer.register === 'function') {
    const sendJson = (res, code, payload) => {
      res.statusCode = code
      res.setHeader('content-type', 'application/json; charset=utf-8')
      res.setHeader('cache-control', 'no-store')
      res.end(JSON.stringify(payload))
    }
    const readJson = (req) => new Promise((resolve) => {
      const chunks = []
      req.on('data', (chunk) => chunks.push(chunk))
      req.on('end', () => {
        try {
          resolve(chunks.length === 0 ? {} : JSON.parse(Buffer.concat(chunks).toString('utf8')))
        } catch {
          resolve(null)
        }
      })
      req.on('error', () => resolve(null))
    })
    try {
      ctx.effect(() => webServer.register({
        kind: 'prefix',
        path: '/mcp-nestorclub',
        handler: async (req, res) => {
          const pathname = (req.url === undefined ? '/' : req.url).split('?')[0]
          const method = req.method === undefined ? 'GET' : req.method
          try {
            if (pathname === '/mcp-nestorclub/status' && method === 'GET') {
              return sendJson(res, 200, status())
            }
            if (pathname === '/mcp-nestorclub/key' && method === 'POST') {
              const body = await readJson(req)
              if (body === null || typeof body.key !== 'string') {
                return sendJson(res, 400, { ok: false, error: 'Тело запроса: { "key": "..." }' })
              }
              const result = await save(body.key)
              return sendJson(res, result.ok ? 200 : 400, result)
            }
            if (pathname === '/mcp-nestorclub/check' && method === 'POST') {
              const entry = findEntry(ctx)
              const key = readKey(entry)
              if (key === undefined) return sendJson(res, 400, { ok: false, error: 'Ключ не задан.' })
              const result = await probe(serverUrl(entry), key)
              return sendJson(res, result.ok ? 200 : 400, result)
            }
            return sendJson(res, 404, { error: 'not found' })
          } catch (error) {
            return sendJson(res, 500, { ok: false, error: errText(error) })
          }
        },
      }), 'dsh-mcp-nestorclub: /mcp-nestorclub API')
    } catch (error) {
      console.error('dsh-mcp-nestorclub: API route: ' + errText(error))
    }
  }

  // ---- /mcp-key --------------------------------------------------------------
  if (commands !== undefined && typeof commands.register === 'function') {
    try {
      ctx.effect(() => commands.register({
        name: 'mcp-key',
        description: 'Show or set the API key of the nestorclub MCP server (/mcp-key <key>).',
        input: { hint: '<key>' },
        handler: async ({ rawInput }) => {
          const input = rawInput === undefined || rawInput === null ? '' : String(rawInput).trim()
          if (input === '') {
            const state = status()
            if (!state.configured) {
              return { kind: 'success', text: 'MCP nestorclub: ключ не задан. Вставьте его командой /mcp-key <ключ> или в карточке плагина на странице Plugins.' }
            }
            return { kind: 'success', text: 'MCP nestorclub: ключ задан (' + state.masked + '). Заменить: /mcp-key <ключ>.' }
          }
          try {
            const result = await save(input)
            if (!result.ok) return { kind: 'error', text: result.error }
            return { kind: 'success', text: 'Ключ сохранён, MCP nestorclub переподключён.' }
          } catch (error) {
            return { kind: 'error', text: errText(error) }
          }
        },
      }), 'dsh-mcp-nestorclub: /mcp-key command')
    } catch (error) {
      console.error('dsh-mcp-nestorclub: /mcp-key command: ' + errText(error))
    }
  }

  if (status().configured !== true) {
    console.warn('dsh-mcp-nestorclub: ключ MCP-сервера не задан — задайте его командой /mcp-key <ключ> или в карточке плагина на странице Plugins.')
  }
}
