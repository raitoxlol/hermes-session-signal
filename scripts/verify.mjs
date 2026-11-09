#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { pathToFileURL } from 'node:url'

const project = path.resolve(import.meta.dirname, '..')
const root = process.env.SIGNAL_HERMES_ROOT || path.join(os.homedir(), '.hermes', 'hermes-agent')
const { register } = await import(pathToFileURL(path.join(root, 'node_modules/tsx/dist/esm/api/index.mjs')))
register()
const provider = await import(pathToFileURL(path.join(root, 'tests-js/scripts/mock-provider-config.ts')))
const mockApi = await import(pathToFileURL(path.join(root, 'tests-js/scripts/mock-server.ts')))
const { waitForChatReady } = await import(pathToFileURL(path.join(root, 'tests-js/scripts/desktop-chat-smoke.ts')))
const { expect, _electron } = await import(pathToFileURL(path.join(root, 'node_modules/@playwright/test/index.mjs')))

const evidence = process.env.SIGNAL_EVIDENCE_DIR ? path.resolve(process.env.SIGNAL_EVIDENCE_DIR) : path.join(project, 'evidence')
fs.mkdirSync(evidence, { recursive: true })
const checks = []
const record = name => { checks.push(name); console.log(`PASS ${name}`) }
const sandboxRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-session-signal-'))
const sandbox = { root: sandboxRoot, hermesHome: path.join(sandboxRoot, 'hermes-home'), userDataDir: path.join(sandboxRoot, 'user-data') }
// Source bootstrap republishes these shared launchers even with an isolated home.
// Restore only our temporary repins; preserve any concurrent legitimate repair.
const launchers = ['hermes', 'hermes-acp'].map(name => {
  const file = path.join(root, '.hermes/bin', name)
  return { file, contents: fs.existsSync(file) ? fs.readFileSync(file) : null }
})
fs.mkdirSync(sandbox.hermesHome, { recursive: true })
fs.mkdirSync(sandbox.userDataDir, { recursive: true })
fs.writeFileSync(path.join(sandbox.userDataDir, 'window-state.json'), JSON.stringify({ x: 0, y: 0, width: 1220, height: 800, isMaximized: false }))
const mock = await mockApi.startMockServer({ holdFirstCompletionContaining: 'Session Signal smoke test' })
let app, page

try {
  provider.writeMockProviderConfig(sandbox.hermesHome, mock.url)
  provider.writeEnvFile(sandbox.hermesHome, 'e2e-mock-key', mock.url)
  const pluginDir = path.join(sandbox.hermesHome, 'desktop-plugins/hermes-session-signal')
  fs.mkdirSync(pluginDir, { recursive: true })
  fs.copyFileSync(path.join(project, 'desktop/plugin.js'), path.join(pluginDir, 'plugin.js'))
  const cleanEnv = Object.fromEntries(Object.entries(process.env).filter(([key, value]) => value && !/(_API_KEY|_TOKEN|_SECRET|_PASSWORD|_CREDENTIALS|_ACCESS_KEY|_PRIVATE_KEY)$/.test(key) && !key.startsWith('HERMES_') && !key.endsWith('_BASE_URL')))
  app = await _electron.launch({
    executablePath: '/Applications/Hermes.app/Contents/MacOS/Hermes',
    args: ['--disable-gpu', '--no-sandbox'],
    cwd: path.join(root, 'apps/desktop'),
    env: {
      ...cleanEnv,
      HOME: sandbox.root,
      HERMES_HOME: sandbox.hermesHome,
      HERMES_DESKTOP_USER_DATA_DIR: sandbox.userDataDir,
      HERMES_DESKTOP_IGNORE_EXISTING: '1',
      HERMES_DESKTOP_ISOLATED_BACKEND: '1',
      HERMES_DESKTOP_HERMES_ROOT: root,
      HERMES_DISABLE_LAZY_INSTALLS: '1',
      HERMES_DESKTOP_APP_NAME: `SessionSignalTest-${Date.now()}`,
      HERMES_DESKTOP_SKIP_QUIT_CONFIRM: '1'
    }
  })
  page = await app.firstWindow()
  await page.emulateMedia({ reducedMotion: 'reduce' })
  page.on('pageerror', error => console.log(`PAGE ERROR ${error.message}`))
  await waitForChatReady(page, 120_000)
  await expect(page.locator('.signal-bar')).toBeAttached({ timeout: 20_000 })
  record('disk plugin loads in existing Hermes Electron renderer')

  const send = async text => {
    const composer = page.locator('[data-composer-target]:not([data-pane-hidden] [data-composer-target])').last().locator('[contenteditable="true"]').first()
    await composer.waitFor({ state: 'visible' })
    await composer.fill(text)
    await composer.press('Enter')
  }
  // Capture the native sidebar in this fixed 1220x800 test window. DOM bounds
  // and capturePage rectangles use different units under Hermes's UI scale.
  // These inspected native capture bounds include all demo rows and attention
  // counts, excluding the transcript and the footer's local workspace name.
  const captureSidebar = async name => {
    const png = await app.evaluate(async ({ BrowserWindow }, rect) => {
      const window = BrowserWindow.getAllWindows()[0]
      return (await window.webContents.capturePage(rect)).toPNG().toString('base64')
    }, { x: 0, y: 0, width: 286, height: 600 })
    fs.writeFileSync(path.join(evidence, name), Buffer.from(png, 'base64'))
  }
  await send('Review the Hermes session sidebar and preserve native actions when a long title truncates')
  await expect(page.getByText(mockApi.MOCK_REPLY, { exact: true }).first()).toBeVisible({ timeout: 60_000 })
  await expect(page.locator('[data-session-signal="idle"]')).toHaveCount(1, { timeout: 60_000 })
  const firstRow = page.locator('[data-session-signal]').first()
  const firstId = await firstRow.locator('[data-signal-session]').getAttribute('data-signal-session')
  const originalRow = page.locator('[data-session-signal]').filter({ has: page.locator(`[data-signal-session="${firstId}"]`) })
  await expect(firstRow).toHaveAttribute('data-signal-layout', 'compact')
  await expect.poll(() => firstRow.evaluate(node => Math.round(node.getBoundingClientRect().height))).toBe(36)
  await expect.poll(() => firstRow.locator('[data-signal-title]').evaluate(node => getComputedStyle(node).fontSize)).toBe('14px')
  await expect.poll(() => firstRow.locator('[data-signal-title]').evaluate(node => node.scrollWidth > node.clientWidth)).toBe(true)
  record('T3 slim geometry and long-title truncation preserve the native title')
  await page.getByText('New session', { exact: true }).click()
  await send('Session Signal smoke test')
  await expect(page.locator('[data-session-signal="working"]')).toHaveCount(1, { timeout: 60_000 })
  await expect.poll(() => mock.heldCompletionCount(), { timeout: 60_000 }).toBe(1)
  await expect(page.locator('[data-session-signal="working"] .signal-badge')).toHaveText('Working')
  await expect(page.locator('[data-session-signal] .signal-orb')).toHaveCount(0)
  record('real gateway stream produces Working label without a duplicate status dot')
  await originalRow.locator('[data-signal-body]').click()
  await expect(originalRow).toHaveAttribute('data-signal-focused', 'true')
  await expect(originalRow).toHaveAttribute('data-session-signal', 'idle')
  await page.mouse.move(500, 100)
  await expect.poll(() => page.locator('[data-session-signal="working"]').evaluate(node => getComputedStyle(node).opacity)).toBe('0.7')
  record('background working chat dims to 70 percent')
  await captureSidebar('07-working-sidebar.png')
  mock.releaseHeldStream()
  await expect(page.locator('[data-session-signal="unread"]')).toHaveCount(1)
  await expect(page.locator('.signal-bar button')).toHaveText('1 Done')
  record('real background completion drives Done orb and attention bar')
  await page.screenshot({ path: path.join(evidence, '02-done.png') })
  await page.locator('.signal-bar button').click()
  await expect(page.locator('[data-session-signal="unread"]')).toHaveCount(0, { timeout: 15_000 })
  record('attention bar follows native row navigation and acknowledges unread')
  const quietRow = page.locator('[data-session-signal="idle"][data-signal-focused="false"]')
  await page.mouse.move(500, 100)
  await expect.poll(() => quietRow.evaluate(node => getComputedStyle(node).opacity)).toBe('0.55')
  const quietId = await quietRow.locator('[data-signal-session]').getAttribute('data-signal-session')
  const trackedRow = page.locator('[data-session-signal]').filter({ has: page.locator(`[data-signal-session="${quietId}"]`) })
  await trackedRow.hover()
  await expect.poll(() => trackedRow.evaluate(node => getComputedStyle(node).opacity)).toBe('1')
  await page.mouse.move(500, 100)
  await expect.poll(async () => {
    const [state, opacity] = await trackedRow.evaluate(node => [node.getAttribute('data-session-signal'), getComputedStyle(node).opacity])
    return (state === 'idle' && opacity === '0.55') || (state === 'unread' && opacity === '1')
  }).toBe(true)
  record('idle chat dims to 55 percent and hover restores full visibility')
  await page.screenshot({ path: path.join(evidence, '01-idle.png') })

  await send(`Check session attention. ${mockApi.BLOCKING_CLARIFY_TRIGGER}`)
  await expect(page.locator('[data-session-signal="needs-input"]')).toHaveCount(1, { timeout: 60_000 })
  await expect(page.getByRole('button', { name: /chats need input/ })).toHaveText('1 Input')
  await expect(page.locator('[data-session-signal="needs-input"] .signal-badge')).toHaveText('Input')
  record('real clarify tool and gateway events produce Input state')
  await page.screenshot({ path: path.join(evidence, '03-input.png') })

  await page.getByRole('button', { name: /chats need input/ }).click()
  await expect(page.locator('[data-session-signal="needs-input"]')).toHaveCount(1)
  record('opening an input-required chat does not clear the blocking state')

  for (const task of ['Review keyboard navigation', 'Check native session actions']) {
    await page.getByText('New session', { exact: true }).click()
    await send(`${task}. ${mockApi.BLOCKING_CLARIFY_TRIGGER}`)
    await expect(page.locator('[data-session-signal="needs-input"]')).toHaveCount(task.startsWith('Review') ? 2 : 3, { timeout: 60_000 })
  }
  await expect(page.getByRole('button', { name: /chats need input/ })).toHaveText('3 Input')
  const visited = []
  for (let step = 0; step < 4; step++) {
    const previous = await page.locator('[data-session-signal="needs-input"][data-signal-focused="true"] [data-signal-session]').getAttribute('data-signal-session')
    await page.getByRole('button', { name: /chats need input/ }).click()
    await expect.poll(() => page.locator('[data-session-signal="needs-input"][data-signal-focused="true"] [data-signal-session]').getAttribute('data-signal-session')).not.toBe(previous)
    visited.push(await page.locator('[data-session-signal="needs-input"][data-signal-focused="true"] [data-signal-session]').getAttribute('data-signal-session'))
  }
  expect(new Set(visited.slice(0, 3)).size).toBe(3)
  expect(visited[3]).toBe(visited[0])
  record('attention navigation visits all three real input requests and wraps in sidebar order')

  const inputRow = page.locator('[data-session-signal="needs-input"][data-signal-focused="true"]')
  await page.keyboard.press('Tab')
  await inputRow.locator('[data-signal-body]').focus()
  await expect.poll(() => inputRow.evaluate(node => getComputedStyle(node).outlineStyle)).toBe('solid')
  await expect.poll(() => inputRow.evaluate(node => getComputedStyle(node).opacity)).toBe('1')
  record('keyboard focus keeps the selected row visible with a focus outline')
  await inputRow.hover()
  await inputRow.locator('[data-row-actions] button').last().click()
  await expect(page.getByRole('menuitem', { name: /Rename/ }).first()).toBeVisible()
  await page.keyboard.press('Escape')
  record('native session action menu remains reachable')

  await page.mouse.move(500, 100)
  await page.screenshot({ path: path.join(evidence, '04-session-list.png') })
  await page.getByRole('button', { name: 'Filters', exact: true }).click()
  await page.getByRole('menuitemcheckbox', { name: 'Inbox style', exact: true }).click()
  await page.keyboard.press('Escape')
  await expect(page.locator('[data-signal-layout="card"]')).toHaveCount(4)
  await expect.poll(() => page.locator('[data-signal-layout="card"]').first().evaluate(node => node.getBoundingClientRect().height)).toBeGreaterThanOrEqual(54)
  await page.screenshot({ path: path.join(evidence, '05-inbox.png') })
  record('native Inbox layout retains its multiline geometry and all session decorations')
  await page.getByRole('button', { name: 'Filters', exact: true }).click()
  await page.getByRole('menuitemcheckbox', { name: 'Inbox style', exact: true }).click()
  await page.keyboard.press('Escape')
  await expect(page.locator('[data-signal-layout="compact"]')).toHaveCount(4)

  await page.emulateMedia({ colorScheme: 'dark' })
  await expect.poll(() => page.evaluate(() => document.documentElement.classList.contains('dark'))).toBe(true)
  await expect(page.locator('[data-session-signal="needs-input"] .signal-badge')).toHaveCount(3)
  await page.screenshot({ path: path.join(evidence, '06-dark.png') })
  await captureSidebar('08-attention-sidebar.png')
  await page.emulateMedia({ colorScheme: 'light' })
  await expect.poll(() => page.evaluate(() => document.documentElement.classList.contains('dark'))).toBe(false)
  record('light and dark system appearance use the native theme and retain input labels')

  await page.getByRole('button', { name: 'Open settings', exact: true }).click()
  await page.getByRole('button', { name: 'Appearance', exact: true }).click()
  await page.getByRole('button', { name: 'Window & layout', exact: true }).click()
  for (const [name, layout, minimum] of [['Comfortable', 'comfortable', 44], ['Detailed', 'detailed', 62], ['Compact', 'compact', 36]]) {
    await page.getByRole('button', { name, exact: true }).click()
    await expect(page.locator(`[data-signal-layout="${layout}"]`)).toHaveCount(4)
    await expect.poll(() => page.locator(`[data-signal-layout="${layout}"]`).first().evaluate(node => Math.round(node.getBoundingClientRect().height))).toBeGreaterThanOrEqual(minimum)
  }
  await page.getByRole('button', { name: 'Close settings', exact: true }).click()
  const boxes = await page.locator('[data-session-signal]').evaluateAll(nodes => nodes.map(node => ({ top: node.getBoundingClientRect().top, bottom: node.getBoundingClientRect().bottom })).sort((a, b) => a.top - b.top))
  expect(boxes.every((box, index) => index === 0 || box.top >= boxes[index - 1].bottom - .1)).toBe(true)
  record('native Compact, Comfortable and Detailed settings keep measured rows from overlapping')

  await page.getByText('Capabilities', { exact: true }).click()
  await page.getByRole('button', { name: 'Plugins', exact: true }).first().click()
  await page.getByRole('textbox', { name: 'Search plugins', exact: true }).fill('Session Signal')
  await page.getByRole('switch', { name: 'Session Signal', exact: true }).click()
  await expect(page.locator('.signal-bar')).toHaveCount(0)
  await expect(page.locator('[data-session-signal]')).toHaveCount(0)
  await expect(page.locator('[data-signal-focused]')).toHaveCount(0)
  await expect(page.locator('[data-signal-layout], [data-signal-title], [data-signal-body]')).toHaveCount(0)
  await expect(page.locator('#hermes-session-signal-style')).toHaveCount(0)
  record('native plugin switch removes bar, styling attributes, and row badges')
  await page.getByRole('switch', { name: 'Session Signal', exact: true }).click()
  await expect(page.locator('.signal-bar')).toHaveCount(1)
  await expect(page.locator('#hermes-session-signal-style')).toHaveCount(1)
  await expect(page.locator('[data-session-signal="needs-input"]')).toHaveCount(3)
  record('re-enabling recovers the current input state without duplicate registrations')

  fs.writeFileSync(path.join(evidence, 'verification.json'), JSON.stringify({ status: 'passed', checks, boundary: 'installed Hermes package, isolated real backend, local mock inference; real gateway stream, background completion, and clarify', at: new Date().toISOString() }, null, 2))
} catch (error) {
  if (page) {
    await page.screenshot({ path: path.join(evidence, 'failure.png') }).catch(() => {})
    fs.writeFileSync(path.join(evidence, 'failure.txt'), await page.locator('body').innerText().catch(() => 'No page text'))
  }
  fs.writeFileSync(path.join(evidence, 'verification.json'), JSON.stringify({ status: 'failed', checks, error: String(error), at: new Date().toISOString() }, null, 2))
  throw error
} finally {
  await app?.close().catch(() => {})
  mock.releaseHeldStream()
  await mock.close()
  for (const { file, contents } of launchers) {
    if (!fs.existsSync(file) || !fs.readFileSync(file, 'utf8').includes(sandbox.root)) continue
    if (contents) fs.writeFileSync(file, contents)
    else fs.rmSync(file)
  }
  fs.rmSync(sandbox.root, { recursive: true, force: true })
}
