// Talks to the Spyhop board that already runs on this Mac (127.0.0.1:47613).
// Spyhop finds and summarizes the sessions; this worker only passes its state to the panel
// and forwards the few actions the panel offers to the board's own endpoints.
import type { OrcaWorkerApi } from 'orca/worker'
import { readFileSync } from 'node:fs'
import { execFile } from 'node:child_process'

const BOARD = 'http://127.0.0.1:47613'
const TOKEN_FILE = '/tmp/progress-board/token' // the board's key for POST requests

function key(): string {
  return readFileSync(TOKEN_FILE, 'utf8').trim()
}

async function post(path: string, body: string): Promise<string> {
  const res = await fetch(`${BOARD}${path}?k=${encodeURIComponent(key())}`, { method: 'POST', body })
  const text = await res.text()
  if (!res.ok) throw Object.assign(new Error(text || `board answered ${res.status}`), { code: 'board_error' })
  return text
}

export default function activate(orca: OrcaWorkerApi): void {
  orca.panels.handle('spyhop.state', async () => {
    try {
      const res = await fetch(`${BOARD}/state.json`, { cache: 'no-store' })
      if (!res.ok) return { error: `Spyhop answered ${res.status}` }
      return { state: await res.json() }
    } catch {
      return { error: 'offline' }
    }
  })

  // Sort and grouping are the board's own settings, so the app board changes with them.
  orca.panels.handle('spyhop.config', async (input: { group_by?: string; sort?: string }) => {
    const req: Record<string, string> = {}
    if (input.group_by) req.group_by = input.group_by
    if (input.sort) req.sort = input.sort
    return { ok: (await post('/config', JSON.stringify(req))) === 'saved' }
  })

  orca.panels.handle('spyhop.toggle', async (input: { log: string; label: string; done: boolean }) => {
    return { ok: (await post('/toggle', JSON.stringify(input))) === 'ok' }
  })

  orca.panels.handle('spyhop.close', async (input: { handle: string }) => {
    return { ok: (await post('/close', input.handle)) === 'ok' }
  })

  orca.panels.handle('spyhop.switch', async (input: { handle: string }) => {
    const res = await fetch(`${BOARD}/switch?h=${encodeURIComponent(input.handle)}`)
    const text = await res.text()
    return { ok: res.ok && text !== 'fail', result: text }
  })

  orca.panels.handle('spyhop.copy', async (input: { text: string }) => {
    await new Promise<void>((resolve, reject) => {
      const p = execFile('pbcopy', (err) => (err ? reject(err) : resolve()))
      p.stdin?.end(input.text)
    })
    return { ok: true }
  })
}
