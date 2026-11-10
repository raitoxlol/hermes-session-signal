import { atom, host, SESSION_ROW_AREAS, TITLEBAR_AREAS, useValue } from '@hermes/plugin-sdk'
import { useEffect, useRef } from 'react'
import { jsx } from 'react/jsx-runtime'

const ID = 'hermes-session-signal'
const badgeStyle = {
  display: 'inline-flex', alignItems: 'center', flexShrink: 0,
  fontSize: '.6875rem', fontWeight: 500, lineHeight: 1.45,
  whiteSpace: 'nowrap', color: 'var(--ui-accent)'
}

export function createSignalModel() {
  const rows = new Map()
  const working = atom([])
  return {
    working,
    update(token, sessionId, busy) {
      rows.set(token, { sessionId, busy })
      this.refresh()
    },
    remove(token) { rows.delete(token); this.refresh() },
    clear() { rows.clear(); this.refresh() },
    refresh() {
      const next = [...new Set([...rows.values()].filter(row => row.busy).map(row => row.sessionId))].sort()
      if (JSON.stringify(next) !== JSON.stringify(working.get())) working.set(next)
    },
    openNext() {
      const ids = working.get()
      if (!ids.length) return
      const index = ids.indexOf(host.state.focusedStoredSessionId.get())
      void host.openSession(ids[(index + 1) % ids.length]).catch(error => host.notifyError(error, 'Could not open session'))
    }
  }
}

export function SignalRow({ sessionId, model }) {
  const busyBySession = useValue(host.state.busyBySession)
  const focused = useValue(host.state.focusedStoredSessionId)
  const runtime = useValue(host.state.focusedSessionId)
  const binding = useRef({ sessionId, runtimeId: sessionId })
  const token = useRef({})
  if (binding.current.sessionId !== sessionId) binding.current = { sessionId, runtimeId: sessionId }
  // Row slots carry durable ids; the busy map carries runtime ids. Remember
  // the SDK's focused pair so a background row survives that distinction.
  if (focused === sessionId && runtime) binding.current.runtimeId = runtime
  const busy = Boolean(busyBySession[binding.current.runtimeId])
  useEffect(() => {
    model.update(token.current, sessionId, busy)
  }, [sessionId, busy, model])
  useEffect(() => {
    const key = token.current
    return () => model.remove(key)
  }, [model])
  return jsx('span', {
    'data-signal-session': sessionId,
    'data-signal-working': String(busy),
    'data-signal-focused': String(focused === sessionId),
    style: { ...badgeStyle, pointerEvents: 'none' },
    children: busy ? 'Working' : null
  })
}

export function SignalBar({ model }) {
  const working = useValue(model.working)
  return jsx('span', {
    'data-signal-bar': '',
    style: { display: 'inline-flex', WebkitAppRegion: 'no-drag' },
    children: working.length ? jsx('button', {
      type: 'button',
      style: { ...badgeStyle, border: 0, borderRadius: '.375rem', background: 'transparent', padding: '.25rem .5rem', cursor: 'pointer' },
      'aria-label': `${working.length} visible working chats. Open next`,
      onClick: () => model.openNext(),
      children: `${working.length} Working`
    }) : null
  })
}

export default {
  id: ID,
  name: 'Session Signal',
  description: 'SDK-backed Working labels and navigation for visible sessions.',
  register(ctx) {
    const model = createSignalModel()
    ctx.onDispose(() => model.clear())
    ctx.register({ id: 'row', area: SESSION_ROW_AREAS.trailing, data: { render: props => jsx(SignalRow, { ...props, model }) } })
    ctx.register({ id: 'bar', area: TITLEBAR_AREAS.left, render: () => jsx(SignalBar, { model }) })
  }
}
