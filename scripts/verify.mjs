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
  await expect(page.locator('[data-signal-bar]')).toBeAttached({ timeout: 20_000 })
  record('disk plugin loads in existing Hermes Electron renderer')

  const send = async text => {
    const composer = page.locator('[data-composer-target]:not([data-pane-hidden] [data-composer-target])').last().locator('[contenteditable="true"]').first()
    await composer.waitFor({ state: 'visible' })
    await composer.fill(text)
    await composer.press('Enter')
  }
  await send('Review the Hermes session sidebar')
  await expect(page.getByText(mockApi.MOCK_REPLY, { exact: true }).first()).toBeVisible({ timeout: 60_000 })
  await expect(page.locator('[data-signal-session]')).toHaveCount(1, { timeout: 60_000 })
  const firstId = await page.locator('[data-signal-session]').getAttribute('data-signal-session')
  await expect(page.locator('[data-signal-working="true"]')).toHaveCount(0)
  record('idle session has no invented Input or Done label')

  await page.getByText('New session', { exact: true }).click()
  await send('Session Signal smoke test')
  await expect.poll(() => mock.heldCompletionCount(), { timeout: 60_000 }).toBe(1)
  await expect(page.locator('[data-signal-working="true"]')).toHaveText('Working', { timeout: 20_000 })
  await expect(page.getByRole('button', { name: '1 visible working chats. Open next' })).toBeVisible()
  const workingId = await page.locator('[data-signal-working="true"]').getAttribute('data-signal-session')
  record('real gateway turn produces SDK-backed Working badge and count')
  await page.screenshot({ path: path.join(evidence, 'working.png') })

  const nativeRow = id => page.locator('.row-hover').filter({ has: page.locator(`[data-signal-session="${id}"]`) })
  await nativeRow(firstId).locator('button').first().click()
  await expect(page.locator(`[data-signal-session="${firstId}"]`)).toHaveAttribute('data-signal-focused', 'true')
  await expect(page.locator('[data-signal-working="true"]')).toHaveCount(1)
  await expect.poll(() => nativeRow(workingId).evaluate(node => getComputedStyle(node).opacity)).toBe('1')
  record('background Working badge persists without dimming the native row')
  await page.getByRole('button', { name: '1 visible working chats. Open next' }).click()
  await expect(page.locator(`[data-signal-session="${workingId}"]`)).toHaveAttribute('data-signal-focused', 'true')
  record('Working count opens the durable session through host.openSession')
  mock.releaseHeldStream()
  await expect(page.locator('[data-signal-working="true"]')).toHaveCount(0, { timeout: 60_000 })
  await expect(page.locator('[data-signal-bar] button')).toHaveCount(0)
  record('completion clears Working without synthesizing Done or unread state')

  await nativeRow(workingId).hover()
  await nativeRow(workingId).locator('[data-row-actions] button').last().click()
  await expect(page.getByRole('menuitem', { name: /Rename/ }).first()).toBeVisible()
  await page.keyboard.press('Escape')
  record('native session menu remains reachable')
  await expect(page.locator('[data-session-signal], [data-signal-layout], [data-signal-title], [data-signal-body]')).toHaveCount(0)
  await expect(page.locator('#hermes-session-signal-style')).toHaveCount(0)
  record('plugin adds no attributes to native row parts and injects no global stylesheet')

  await page.getByText('Capabilities', { exact: true }).click()
  await page.getByRole('button', { name: 'Plugins', exact: true }).first().click()
  await page.getByRole('textbox', { name: 'Search plugins', exact: true }).fill('Session Signal')
  await page.getByRole('switch', { name: 'Session Signal', exact: true }).click()
  await expect(page.locator('[data-signal-bar], [data-signal-session]')).toHaveCount(0)
  record('disabling removes all plugin-owned contributions')
  await page.getByRole('switch', { name: 'Session Signal', exact: true }).click()
  await expect(page.locator('[data-signal-bar]')).toHaveCount(1)
  await expect(page.locator('[data-signal-session]')).toHaveCount(2)
  record('re-enabling restores one bar and one badge per mounted row')

  fs.writeFileSync(path.join(evidence, 'verification.json'), JSON.stringify({ status: 'passed', checks, boundary: 'installed Hermes package, isolated real backend, local mock inference; SDK Working state and navigation', at: new Date().toISOString() }, null, 2))
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
