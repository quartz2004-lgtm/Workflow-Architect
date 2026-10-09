import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Autosave } from '../persistence/autosave'
import { Modal } from '../shared/Modal'
import { useProfile } from './context'
import { PreferencesForm } from './PreferencesForm'
import { Setup } from './Setup'
import type { Profile } from './schema'

export function ProfileMenu({ autosave }: { autosave: Autosave }) {
  const session = useProfile()
  const [open, setOpen] = useState(false)
  if (!session) return null
  return <><button className="profile-button" onClick={() => setOpen(true)} aria-label={`Профили: ${session.profile.name}`}>◎ {session.profile.name}</button>{open && createPortal(<ProfileDialog autosave={autosave} close={() => setOpen(false)} />, document.body)}</>
}

function ProfileDialog({ autosave, close }: { autosave: Autosave; close: () => void }) {
  const session = useProfile()!
  const [draft, setDraft] = useState(session.profile)
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [setup, setSetup] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [loaded, setLoaded] = useState(false)
  useEffect(() => {
    let live = true
    void session.repository.list().then(items => {
      if (!live) return
      setProfiles(items)
      const current = items.find(profile => profile.id === session.profile.id)
      if (current) setDraft(current)
      setLoaded(true)
    }).catch(error => { if (live) setError(String(error)) })
    return () => { live = false }
  }, [session.repository, session.profile.id])
  const save = async (profile: Profile) => { await session.save(profile); close() }
  const switchTo = async (profile: Profile) => {
    setBusy(true); setError('')
    try {
      await autosave.flush()
      if (autosave.statusStore.getState().status !== 'saved') throw new Error('Сначала сохраните текущий проект. При конфликте сохраните свои правки отдельной копией.')
      await session.repository.activate(profile.id)
      window.location.reload()
    } catch (error) { setError(error instanceof Error ? error.message : String(error)); setBusy(false) }
  }
  return <Modal wide title="Локальные профили" className={session.profile.preferences.motion === 'reduced' ? 'profile-reduced-motion' : ''} close={() => { if (!busy) close() }}>
    {setup ? <Setup initial={draft} complete={save} cancel={() => setSetup(false)} /> : <>
      <p className="muted">Настройки индивидуальны. Проекты общие на этом устройстве; у каждого профиля свой последний открытый проект.</p>
      <div className="profile-switcher">{profiles.map(profile => <button disabled={busy || profile.id === session.profile.id} key={profile.id} onClick={() => { void switchTo(profile) }}>{profile.name}{profile.id === session.profile.id ? ' · текущий' : ' · переключиться'}</button>)}</div>
      <form onSubmit={e => { e.preventDefault(); setBusy(true); setError(''); void save(draft).catch(error => { setError(error instanceof Error ? error.message : String(error)); setBusy(false) }) }}>
        <fieldset disabled={busy || !loaded} className="setup-fields"><label className="field"><span>Имя профиля</span><input required maxLength={80} value={draft.name} onChange={e => setDraft(p => ({ ...p, name: e.target.value }))} /></label>
          <PreferencesForm value={draft.preferences} change={preferences => setDraft(p => ({ ...p, preferences }))} />
          <div className="setup-actions"><button className="primary">Сохранить настройки профиля</button><button type="button" onClick={() => setSetup(true)}>Пройти настройку заново</button></div>
        </fieldset>
      </form>
    </>}
    {error && <p role="alert" className="field-error">{error}</p>}
  </Modal>
}
