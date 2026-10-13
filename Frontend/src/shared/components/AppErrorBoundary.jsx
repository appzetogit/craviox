import { Component } from 'react'

// Shared with the vite:preloadError handler in index.jsx, so the two never
// reload back to back in a loop.
const RELOAD_FLAG = 'chunk_reload_at'
const RELOAD_COOLDOWN_MS = 15000

/** A screen that failed because its file is from an older deploy. */
const isChunkError = (error) =>
    /Loading chunk|dynamically imported module|Importing a module script failed|error loading dynamically|reading 'default'/i
        .test(String(error?.message || error || ''))

/** Reload once to pick up the new version; false if we just tried that. */
function reloadForNewVersion() {
    try {
        const last = Number(sessionStorage.getItem(RELOAD_FLAG) || 0)
        if (Date.now() - last < RELOAD_COOLDOWN_MS) return false
        sessionStorage.setItem(RELOAD_FLAG, String(Date.now()))
    } catch {
        // Storage blocked: still reload; the cooldown just cannot be enforced.
    }
    window.location.reload()
    return true
}

/**
 * Catches render errors so one broken screen does not take the whole app down.
 *
 * React unmounts the entire tree when a render throws and nothing catches it,
 * which is why a single failed route chunk produced a white page with no clue
 * what happened. The admin router lazy-loads 116 routes: when one of those
 * dynamic imports resolves to undefined, reading `.default` off it throws here
 * rather than anywhere the user could act on.
 *
 * A chunk that fails after a deploy is the common case and is fixed by loading
 * the page again, so that gets a button rather than an explanation.
 */
export default class AppErrorBoundary extends Component {
    constructor(props) {
        super(props)
        this.state = { error: null }
    }

    static getDerivedStateFromError(error) {
        return { error, reloading: false }
    }

    componentDidMount() {
        // Without this the boundary is a one-way door: once it catches, it stays
        // caught for the rest of the session and every subsequent page shows the
        // error screen even when that page is perfectly fine. Found by sweeping
        // the admin panel -- one broken route made the next seventeen look broken.
        //
        // react-router navigates with pushState, which fires no event, so the
        // history methods are patched once to emit one.
        if (!window.__navEventsPatched) {
            window.__navEventsPatched = true
            for (const name of ['pushState', 'replaceState']) {
                const original = history[name]
                history[name] = function patched(...args) {
                    const result = original.apply(this, args)
                    window.dispatchEvent(new Event('app:navigation'))
                    return result
                }
            }
        }
        this.reset = () => this.setState((s) => (s.error ? { error: null } : s))
        window.addEventListener('popstate', this.reset)
        window.addEventListener('app:navigation', this.reset)
    }

    componentWillUnmount() {
        window.removeEventListener('popstate', this.reset)
        window.removeEventListener('app:navigation', this.reset)
    }

    componentDidCatch(error, info) {
        // An old tab after a deploy: quietly load the new version instead of
        // showing an error. Only if that already failed do we show the screen.
        // index.jsx's vite:preloadError handler may have started that reload a
        // moment ago (it swallows the failed import, which is what lands here).
        let justReloaded = false
        try {
            justReloaded = Date.now() - Number(sessionStorage.getItem(RELOAD_FLAG) || 0) < 3000
        } catch {
            // Storage blocked: fall through to reloadForNewVersion.
        }
        if (isChunkError(error) && (justReloaded || reloadForNewVersion())) {
            this.setState({ reloading: true })
            return
        }
        console.error('Unhandled render error:', error, info?.componentStack)
        // Also to the server log, so a crash on a customer's phone can be seen
        // and fixed (POST /api/v1/client-errors only logs it).
        try {
            const base = String(import.meta.env.VITE_API_BASE_URL || '/api/v1').replace(/\/$/, '')
            fetch(`${base}/client-errors`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                keepalive: true,
                body: JSON.stringify({
                    message: String(error?.message || error),
                    stack: String(error?.stack || '').slice(0, 1500),
                    componentStack: String(info?.componentStack || '').slice(0, 1500),
                    url: window.location.pathname + window.location.search,
                }),
            }).catch(() => {})
        } catch {
            // Reporting must never make the crash screen itself fail.
        }
    }

    render() {
        const { error, reloading } = this.state
        if (!error) return this.props.children

        if (reloading) {
            return (
                <div style={{
                    minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontFamily: 'Poppins, system-ui, sans-serif', color: '#525252', fontSize: '14px', background: '#fff',
                }}>
                    Loading the latest version…
                </div>
            )
        }

        // A failed dynamic import is almost always a stale bundle, not a bug in
        // the screen itself, so it is worth saying so plainly.
        const chunkError = isChunkError(error)

        return (
            <div style={{
                minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: '24px', fontFamily: 'Poppins, system-ui, sans-serif', background: '#f5f5f5',
            }}>
                <div style={{
                    maxWidth: '520px', width: '100%', background: '#fff', borderRadius: '12px',
                    padding: '32px', boxShadow: '0 1px 3px rgba(0,0,0,.1)', textAlign: 'center',
                }}>
                    <h1 style={{ margin: '0 0 8px', fontSize: '20px', color: '#171717' }}>
                        {chunkError ? 'This page needs reloading' : 'Something went wrong'}
                    </h1>
                    <p style={{ margin: '0 0 24px', fontSize: '14px', color: '#525252', lineHeight: 1.6 }}>
                        {chunkError
                            ? 'The app was updated while this tab was open, so part of it could not load. Reloading picks up the new version.'
                            : 'This screen hit an unexpected error. Reloading usually clears it.'}
                    </p>
                    <button
                        type="button"
                        onClick={() => window.location.reload()}
                        style={{
                            background: '#F54A00', color: '#fff', border: 'none', borderRadius: '8px',
                            padding: '10px 20px', fontSize: '14px', cursor: 'pointer', fontWeight: 500,
                        }}
                    >
                        Reload
                    </button>
                    <details style={{ marginTop: '24px', textAlign: 'left' }}>
                        <summary style={{ fontSize: '12px', color: '#737373', cursor: 'pointer' }}>
                            Technical details
                        </summary>
                        <pre style={{
                            marginTop: '8px', fontSize: '11px', color: '#525252', whiteSpace: 'pre-wrap',
                            wordBreak: 'break-word', background: '#fafafa', padding: '12px', borderRadius: '6px',
                        }}>
                            {String(error?.message || error)}
                        </pre>
                    </details>
                </div>
            </div>
        )
    }
}
