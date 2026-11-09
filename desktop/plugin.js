import { atom, host, SESSION_ROW_AREAS, TITLEBAR_AREAS, useI18n, useValue } from '@hermes/plugin-sdk'
import { useEffect, useRef, useState } from 'react'
import { jsx, jsxs } from 'react/jsx-runtime'

const ID = 'hermes-session-signal'
const ATTRIBUTE = 'data-session-signal'
const PRESENTATION = {
  idle: { label: '', color: 'var(--ui-text-tertiary)' },
  draft: { label: '', color: 'var(--ui-text-tertiary)' },
  working: { label: 'Working', color: 'color-mix(in srgb, var(--ui-accent) 75%, var(--ui-text-primary))' },
  background: { label: 'Background', color: 'var(--ui-text-tertiary)' },
  'needs-input': { label: 'Input', color: 'light-dark(var(--color-amber-700), var(--color-amber-400))' },
  unread: { label: 'Done', color: 'color-mix(in srgb, var(--ui-success) 65%, var(--ui-text-primary))' }
}

export function readNativeState(row, labels) {
  const dots = [...row.querySelectorAll('span[aria-label]')]
    .filter(node => !node.closest('[data-signal-badge]'))
  const has = key => labels[key] && dots.some(node => node.getAttribute('aria-label') === labels[key])
  if (has('needsInput')) return 'needs-input'
  if (has('sessionRunning')) return 'working'
  if (has('backgroundRunning')) return 'background'
  if (has('finishedUnread')) return 'unread'
  if (has('draftSession')) return 'draft'
  return 'idle'
}

export const CSS = `
[data-session-signal] {
  --signal-row-height: 2.25rem;
  --signal-row-inset: .625rem;
  --signal-row-radius: .375rem;
  --signal-title-size: .875rem;
  --signal-label-size: .6875rem;
  --signal-gap: .5rem;
  border-radius: var(--signal-row-radius);
  transition: opacity 160ms ease, background-color 120ms ease;
}
[data-signal-layout="compact"] { min-height: var(--signal-row-height); }
[data-signal-layout="compact"] > [data-signal-body] { padding-inline-start: var(--signal-row-inset); gap: var(--signal-gap); }
[data-signal-title] { font-size: var(--signal-title-size); line-height: 1.35; }
[data-signal-focused="true"] [data-signal-title],
[data-session-signal="needs-input"] [data-signal-title],
[data-session-signal="unread"] [data-signal-title] { font-weight: 500; color: var(--ui-text-primary); }
[data-session-signal]:hover { background-color: var(--ui-row-hover-background); }
[data-signal-focused="true"], [data-signal-focused="true"]:hover { background-color: var(--ui-row-active-background); }
[data-session-signal]:has(:focus-visible) { outline: 2px solid var(--ui-accent); outline-offset: -2px; }
[data-session-signal] > .arc-row { display: none; }
[data-session-signal="idle"]:not([data-signal-focused="true"]):not(:hover):not(:focus-within),
[data-session-signal="draft"]:not([data-signal-focused="true"]):not(:hover):not(:focus-within) { opacity: .55; }
[data-session-signal="working"]:not([data-signal-focused="true"]):not(:hover):not(:focus-within),
[data-session-signal="background"]:not([data-signal-focused="true"]):not(:hover):not(:focus-within) { opacity: .7; }
.signal-badge { display: inline-flex; align-items: center; flex-shrink: 0; font-size: var(--signal-label-size); font-weight: 500; line-height: 1.45; white-space: nowrap; pointer-events: none; }
.signal-badge:empty { display: none; }
.signal-orb { width: .375rem; height: .375rem; flex-shrink: 0; border-radius: 50%; background: currentColor; }
.signal-bar { display: inline-flex; align-items: center; gap: .25rem; -webkit-app-region: no-drag; }
.signal-bar button { display: inline-flex; align-items: center; gap: .375rem; border: 0; border-radius: .375rem; background: transparent; padding: .25rem .5rem; font-size: .6875rem; font-weight: 500; line-height: 1.45; font-variant-numeric: tabular-nums; cursor: pointer; }
.signal-bar button:hover { background: var(--ui-row-active-background); }
.signal-bar button:focus-visible { outline: 2px solid var(--ui-accent); outline-offset: 2px; }
@media (prefers-reduced-motion: reduce) { [data-session-signal] { transition: none; } }
`

export function createSignalModel() {
  const rows = new Map()
  const cursors = new Map()
  const counts = atom({ 'needs-input': 0, unread: 0 })
  function refresh() {
    const next = { 'needs-input': 0, unread: 0 }
    const sessions = new Set()
    for (const entry of rows.values()) {
      if (!sessions.has(entry.sessionId) && entry.state in next) {
        next[entry.state]++
        sessions.add(entry.sessionId)
      }
    }
    const current = counts.get()
    if (current['needs-input'] !== next['needs-input'] || current.unread !== next.unread) counts.set(next)
  }
  return {
    counts,
    update: (token, entry) => {
      const previous = rows.get(token)
      if (previous?.sessionId === entry.sessionId && previous.state === entry.state && previous.row === entry.row) return
      rows.set(token, entry)
      refresh()
    },
    remove: token => { rows.delete(token); refresh() },
    clear: () => { rows.clear(); cursors.clear(); refresh() },
    openNext: state => {
      const seen = new Set()
      const targets = [...rows.values()]
        .filter(entry => entry.state === state && entry.row.isConnected)
        .sort((a, b) => a.row.compareDocumentPosition(b.row) & 4 ? -1 : a.row === b.row ? 0 : 1)
        .filter(entry => {
          if (seen.has(entry.sessionId)) return false
          seen.add(entry.sessionId)
          return true
        })
      if (!targets.length) return
      const focused = targets.findIndex(entry => entry.row.getAttribute('data-signal-focused') === 'true')
      const previous = focused >= 0 ? focused : targets.findIndex(entry => entry.sessionId === cursors.get(state))
      const target = targets[(previous + 1) % targets.length]
      const button = target.row.querySelector('[data-signal-body]')
      if (button) cursors.set(state, target.sessionId)
      button?.click()
    }
  }
}

export function SignalRow({ sessionId, model }) {
  const marker = useRef(null)
  const [state, setState] = useState('idle')
  const [density, setDensity] = useState(() => host.settings.get('sessionListDensity'))
  const focused = useValue(host.state.focusedStoredSessionId)
  const { t } = useI18n()
  const labels = t.sidebar.row

  useEffect(() => host.settings.subscribe('sessionListDensity', setDensity), [])

  useEffect(() => {
    const row = marker.current?.closest('.row-hover')
    if (!row) return
    const token = marker.current
    const title = row.querySelector('.hover-marquee')
    const body = title?.closest('button')
    title?.setAttribute('data-signal-title', '')
    body?.setAttribute('data-signal-body', '')
    row.setAttribute('data-signal-layout', body?.classList.contains('flex-col') ? 'card' : density)
    const sync = () => {
      const next = readNativeState(row, labels)
      if (row.getAttribute(ATTRIBUTE) !== next) row.setAttribute(ATTRIBUTE, next)
      const focus = String(focused === sessionId || row.classList.contains('bg-(--ui-row-active-background)'))
      if (row.getAttribute('data-signal-focused') !== focus) row.setAttribute('data-signal-focused', focus)
      setState(previous => previous === next ? previous : next)
      model.update(token, { sessionId, state: next, row })
    }
    sync()
    const observer = new MutationObserver(sync)
    observer.observe(row, { subtree: true, childList: true, attributes: true, attributeFilter: ['aria-label', 'class'] })
    return () => {
      observer.disconnect()
      row.removeAttribute(ATTRIBUTE)
      row.removeAttribute('data-signal-focused')
      row.removeAttribute('data-signal-layout')
      title?.removeAttribute('data-signal-title')
      body?.removeAttribute('data-signal-body')
      model.remove(token)
    }
  }, [sessionId, focused, density, labels, model])

  const variant = PRESENTATION[state]
  return jsx('span', {
    ref: marker,
    'data-signal-badge': '',
    'data-signal-session': sessionId,
    className: 'signal-badge',
    style: { color: variant.color },
    'aria-hidden': true,
    children: variant.label || null
  })
}

export function SignalBar({ model }) {
  const counts = useValue(model.counts)
  return jsxs('span', {
    className: 'signal-bar',
    role: 'group',
    'aria-label': 'Visible session notifications',
    children: [
      ...['needs-input', 'unread'].filter(state => counts[state] > 0).map(state => jsx('button', {
        type: 'button',
        style: { color: PRESENTATION[state].color },
        title: `Open next visible chat ${state === 'unread' ? 'with an unread completion' : 'needing input'}`,
        'aria-label': `${counts[state]} visible ${state === 'unread' ? 'done chats' : 'chats need input'}. Open next`,
        onClick: () => model.openNext(state),
        children: [
          jsx('span', { className: 'signal-orb', 'aria-hidden': true }),
          jsx('span', { children: `${counts[state]} ${PRESENTATION[state].label}` })
        ]
      }, state))
    ]
  })
}

export default {
  id: ID,
  name: 'Session Signal',
  description: 'T3-style slim session rows, quiet status labels, and input and done navigation.',
  register(ctx) {
    const model = createSignalModel()
    const stylesheet = document.createElement('style')
    stylesheet.id = `${ID}-style`
    stylesheet.textContent = CSS
    document.head.appendChild(stylesheet)
    ctx.onDispose(() => { stylesheet.remove(); model.clear() })
    ctx.register({ id: 'row', area: SESSION_ROW_AREAS.trailing, data: { render: props => jsx(SignalRow, { ...props, model }) } })
    ctx.register({ id: 'bar', area: TITLEBAR_AREAS.left, render: () => jsx(SignalBar, { model }) })
  }
}
