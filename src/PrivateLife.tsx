import { useEffect, useId, useState } from 'react'
import { AppTabs, type AppTab } from './AppTabs'
import {
  readPrivateLifeStatus,
  writePrivateLife,
  type PrivateNote,
} from './privateLifeStore'

type Phase = 'loading' | 'offline' | 'setup' | 'locked' | 'open'

function formatWhen(iso: string) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function noteSnapshot(notes: PrivateNote[]) {
  return JSON.stringify(notes)
}

export default function PrivateLife({
  tab,
  onTab,
}: {
  tab: AppTab
  onTab: (tab: AppTab) => void
}) {
  const [phase, setPhase] = useState<Phase>('loading')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [sessionPassword, setSessionPassword] = useState('')
  const [notes, setNotes] = useState<PrivateNote[]>([])
  const [savedSnapshot, setSavedSnapshot] = useState('[]')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [nextPassword, setNextPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const passwordId = useId()
  const confirmId = useId()
  const titleId = useId()
  const bodyId = useId()
  const nextPasswordId = useId()

  const selected = notes.find((note) => note.id === selectedId) ?? null
  const dirty = noteSnapshot(notes) !== savedSnapshot

  useEffect(() => {
    let cancelled = false
    readPrivateLifeStatus()
      .then((data) => {
        if (cancelled) return
        setPhase(data.hasPassword ? 'locked' : 'setup')
      })
      .catch(() => {
        if (!cancelled) setPhase('offline')
      })
    return () => {
      cancelled = true
    }
  }, [])

  function openWith(nextPasswordValue: string, nextNotes: PrivateNote[]) {
    setSessionPassword(nextPasswordValue)
    setNotes(nextNotes)
    setSavedSnapshot(noteSnapshot(nextNotes))
    setSelectedId(nextNotes[0]?.id ?? null)
    setPassword('')
    setConfirmPassword('')
    setPhase('open')
  }

  async function createPassword() {
    setError(null)
    setStatus(null)
    if (password.length < 4) {
      setError('Use at least 4 characters.')
      return
    }
    if (password !== confirmPassword) {
      setError('Those passwords do not match.')
      return
    }
    setBusy(true)
    try {
      const data = await writePrivateLife({ action: 'set-password', password })
      openWith(password, data.notes ?? [])
      setStatus('Password saved into src/privateLife.data.ts')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save the password.')
    } finally {
      setBusy(false)
    }
  }

  async function unlock() {
    setError(null)
    setStatus(null)
    setBusy(true)
    try {
      const data = await writePrivateLife({ action: 'unlock', password })
      openWith(password, data.notes ?? [])
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not unlock.')
    } finally {
      setBusy(false)
    }
  }

  function lock() {
    setSessionPassword('')
    setNotes([])
    setSavedSnapshot('[]')
    setSelectedId(null)
    setNextPassword('')
    setStatus(null)
    setError(null)
    setPhase('locked')
  }

  function addNote() {
    const now = new Date().toISOString()
    const note: PrivateNote = {
      id: crypto.randomUUID(),
      title: '',
      body: '',
      createdAt: now,
      updatedAt: now,
    }
    setNotes((prev) => [note, ...prev])
    setSelectedId(note.id)
    setStatus(null)
  }

  function updateSelected(patch: Partial<Pick<PrivateNote, 'title' | 'body'>>) {
    if (!selectedId) return
    const updatedAt = new Date().toISOString()
    setNotes((prev) =>
      prev.map((note) => (note.id === selectedId ? { ...note, ...patch, updatedAt } : note)),
    )
    setStatus(null)
  }

  function deleteSelected() {
    if (!selectedId) return
    const next = notes.filter((note) => note.id !== selectedId)
    setNotes(next)
    setSelectedId(next[0]?.id ?? null)
    setStatus(null)
  }

  async function saveNotes() {
    setError(null)
    setBusy(true)
    try {
      const data = await writePrivateLife({
        action: 'save',
        password: sessionPassword,
        notes,
      })
      const next = data.notes ?? notes
      setNotes(next)
      setSavedSnapshot(noteSnapshot(next))
      setSelectedId((current) =>
        next.some((note) => note.id === current) ? current : (next[0]?.id ?? null),
      )
      setStatus('Saved into src/privateLife.data.ts')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save.')
    } finally {
      setBusy(false)
    }
  }

  async function changePassword() {
    setError(null)
    setStatus(null)
    if (nextPassword.length < 4) {
      setError('Use at least 4 characters.')
      return
    }
    setBusy(true)
    try {
      await writePrivateLife({
        action: 'change-password',
        password: sessionPassword,
        nextPassword,
      })
      setSessionPassword(nextPassword)
      setNextPassword('')
      setStatus('Password updated in src/privateLife.data.ts')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not change the password.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="app">
      <div className="screen-ui">
        <AppTabs value={tab} onChange={onTab} />
        <header className="hero">
          <div className="hero-copy">
            <p className="brand">Private life</p>
            <h1>A locked notebook stored in the project code.</h1>
            <p className="lede">
              Notes are written into <code>src/privateLife.data.ts</code>. The password is stored
              there as a hash. Nothing goes into a database.
            </p>
          </div>
          <div className="hero-stats is-single" aria-hidden="true">
            <div>
              <span>{phase === 'open' ? notes.length : '—'}</span>
              <small>{phase === 'open' ? 'notes' : 'locked'}</small>
            </div>
          </div>
        </header>

        {phase === 'loading' && (
          <section className="panel">
            <p className="hint">Opening the private file…</p>
          </section>
        )}

        {phase === 'offline' && (
          <section className="panel">
            <h2>Dev server needed</h2>
            <p className="hint">
              This tab writes the source file through the local Vite server. Restart{' '}
              <code>npm run dev</code>, then open Private life again.
            </p>
          </section>
        )}

        {phase === 'setup' && (
          <section className="panel lock-card">
            <h2>Choose a password</h2>
            <form
              className="stack-form"
              onSubmit={(event) => {
                event.preventDefault()
                void createPassword()
              }}
            >
              <label className="field" htmlFor={passwordId}>
                <span>Password</span>
                <input
                  id={passwordId}
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </label>
              <label className="field" htmlFor={confirmId}>
                <span>Confirm password</span>
                <input
                  id={confirmId}
                  type="password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                />
              </label>
              {error && <p className="private-error">{error}</p>}
              <button type="submit" className="btn primary" disabled={busy}>
                Save password into code
              </button>
            </form>
          </section>
        )}

        {phase === 'locked' && (
          <section className="panel lock-card">
            <h2>Unlock</h2>
            <form
              className="stack-form"
              onSubmit={(event) => {
                event.preventDefault()
                void unlock()
              }}
            >
              <label className="field" htmlFor={passwordId}>
                <span>Password</span>
                <input
                  id={passwordId}
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </label>
              {error && <p className="private-error">{error}</p>}
              <button type="submit" className="btn primary" disabled={busy || !password}>
                Unlock
              </button>
            </form>
          </section>
        )}

        {phase === 'open' && (
          <>
            <section className="panel">
              <div className="action-row">
                <button type="button" className="btn primary" onClick={addNote}>
                  New note
                </button>
                <button type="button" className="btn primary" onClick={() => void saveNotes()} disabled={busy || !dirty}>
                  Save into code
                </button>
                <button type="button" className="btn" onClick={lock}>
                  Lock
                </button>
                {dirty && <p className="hint warn">Unsaved changes</p>}
                {status && <p className="hint">{status}</p>}
              </div>
              {error && <p className="private-error">{error}</p>}

              <div className="private-layout">
                <ul className="private-list">
                  {notes.length === 0 && <li className="empty">No notes yet.</li>}
                  {notes.map((note) => (
                    <li key={note.id}>
                      <button
                        type="button"
                        data-active={note.id === selectedId}
                        onClick={() => setSelectedId(note.id)}
                      >
                        <strong>{note.title.trim() || 'Untitled'}</strong>
                        <small>{formatWhen(note.updatedAt)}</small>
                      </button>
                    </li>
                  ))}
                </ul>

                {selected ? (
                  <div className="stack-form">
                    <label className="field" htmlFor={titleId}>
                      <span>Title</span>
                      <input
                        id={titleId}
                        value={selected.title}
                        onChange={(event) => updateSelected({ title: event.target.value })}
                      />
                    </label>
                    <label className="field" htmlFor={bodyId}>
                      <span>Note</span>
                      <textarea
                        id={bodyId}
                        value={selected.body}
                        onChange={(event) => updateSelected({ body: event.target.value })}
                      />
                    </label>
                    <button type="button" className="btn danger" onClick={deleteSelected}>
                      Delete note
                    </button>
                  </div>
                ) : (
                  <p className="empty">Add a note, then save it into the source file.</p>
                )}
              </div>
            </section>

            <section className="panel lock-card">
              <h2>Change password</h2>
              <form
                className="stack-form"
                onSubmit={(event) => {
                  event.preventDefault()
                  void changePassword()
                }}
              >
                <label className="field" htmlFor={nextPasswordId}>
                  <span>New password</span>
                  <input
                    id={nextPasswordId}
                    type="password"
                    autoComplete="new-password"
                    value={nextPassword}
                    onChange={(event) => setNextPassword(event.target.value)}
                  />
                </label>
                <button type="submit" className="btn" disabled={busy || !nextPassword}>
                  Update password in code
                </button>
              </form>
            </section>
          </>
        )}
      </div>
    </div>
  )
}
