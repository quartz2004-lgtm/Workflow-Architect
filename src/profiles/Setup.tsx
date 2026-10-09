import { useState } from 'react'
import { PreferencesForm } from './PreferencesForm'
import { recommendPreferences } from './recommendations'
import type { Profile, SetupAnswers } from './schema'

export function Setup({ initial, complete, cancel }: { initial: Profile; complete: (profile: Profile) => Promise<void>; cancel?: () => void }) {
  const [profile, setProfile] = useState(initial)
  const [step, setStep] = useState(0)
  const [practice, setPractice] = useState('')
  const [feedback, setFeedback] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const answer = (patch: Partial<SetupAnswers>) => setProfile(p => ({ ...p, answers: { ...p.answers, ...patch } }))
  const save = async (skip: boolean) => {
    setBusy(true); setError('')
    try { await complete(skip ? { ...initial, onboarding: 'skipped' } : { ...profile, onboarding: 'completed' }) }
    catch (error) { setError(error instanceof Error ? error.message : String(error)); setBusy(false) }
  }
  const recommend = () => {
    const suggested = recommendPreferences(profile.answers)[0]!
    setProfile(p => ({ ...p, preferences: suggested.preferences })); setStep(2)
  }
  return <section className="profile-setup" aria-label="Первая настройка">
    <span className="eyebrow">WORKFLOW ARCHITECT · ВАШЕ ПРОСТРАНСТВО</span><h1>Настроим приложение под вас</h1>
    <p className="muted">Локально, без аккаунта и ключа модели. Можно пропустить и вернуться через «Профили».</p>
    <ol className="setup-steps">{['Ваши задачи', 'Небольшая практика', 'Ваши настройки'].map((label, index) => <li key={label} aria-current={index === step ? 'step' : undefined}>{label}</li>)}</ol>
    <form onSubmit={e => { e.preventDefault(); if (step === 0) setStep(1); else if (step === 1) recommend(); else void save(false) }}>
      <fieldset disabled={busy} className="setup-fields">
        {step === 0 && <>
          <label className="field"><span>Имя профиля</span><input required maxLength={80} value={profile.name} onChange={e => setProfile(p => ({ ...p, name: e.target.value }))} /></label>
          <label className="field"><span>Что хотите получить от приложения?</span><textarea maxLength={2000} value={profile.answers.goals} placeholder="Например, готовить материалы или автоматизировать рабочие задачи" onChange={e => answer({ goals: e.target.value })} /></label>
          <label className="field"><span>Ваши типичные задачи</span><textarea maxLength={2000} value={profile.answers.tasks} onChange={e => answer({ tasks: e.target.value })} /></label>
          <div className="profile-preferences"><label className="field"><span>Опыт проектирования процессов</span><select value={profile.answers.experience} onChange={e => answer({ experience: e.target.value as SetupAnswers['experience'] })}><option value="beginner">Начинаю знакомиться</option><option value="confident">Есть опыт</option><option value="advanced">Уверенно работаю с архитектурой</option></select></label>
          <label className="field"><span>Предпочтительный способ управления</span><select value={profile.answers.control} onChange={e => answer({ control: e.target.value as SetupAnswers['control'] })}><option value="assisted">С рекомендациями</option><option value="manual">Вручную</option></select></label></div>
          <label className="field"><span>Какими сервисами пользуетесь?</span><input maxLength={2000} value={profile.answers.services} placeholder="Названия сервисов, без паролей и ключей" onChange={e => answer({ services: e.target.value })} /></label>
          <p className="muted">Ответы помогут выбрать начальные настройки и примеры. Подключения к сервисам появятся в следующих версиях.</p>
        </>}
        {step === 1 && <>
          <h2>Запрос → обработка → результат</h2><p>Нужно получить запрос, подготовить отчёт с помощью ИИ и сохранить документ. Выберите подходящую структуру.</p>
          <div className="practice-options">{[['correct', 'Trigger → Agent → Artifact'], ['tool', 'Tool → Note → Group'], ['concept', 'Concept → Concept → Concept']].map(([id, title]) => <label className="profile-check" key={id}><input type="radio" name="practice" value={id} checked={practice === id} onChange={e => { setPractice(e.target.value); setFeedback(''); answer({ practice: 'not-started' }) }} />{title}</label>)}</div>
          <button type="button" disabled={!practice} onClick={() => { const correct = practice === 'correct'; answer({ practice: correct ? 'completed' : 'needs-help' }); setFeedback(correct ? 'Верно: Trigger принимает событие, Agent отвечает за обработку, Artifact описывает результат.' : practice === 'concept' ? 'Concept подходит для наброска. Для инженерной схемы уточните роли: Trigger → Agent → Artifact.' : 'Tool описывает инструмент; Note и Group помогают организовать редактор. Здесь нужны Trigger → Agent → Artifact.') }}>Проверить ответ</button>
          <p role="status">{feedback}</p><p className="muted">Это отдельное упражнение. Ваши проекты не изменяются. Практику можно пропустить.</p>
        </>}
        {step === 2 && <>
          <h2>Выберите удобный вариант</h2><p className="muted">Рекомендации рассчитаны локально по вашим ответам и практике. Любое поле можно изменить вручную.</p>
          <div className="setup-recommendations">{recommendPreferences(profile.answers).map(item => <button type="button" key={item.id} onClick={() => setProfile(p => ({ ...p, preferences: item.preferences }))}><strong>{item.title}</strong><span>{item.reason}</span></button>)}</div>
          <PreferencesForm value={profile.preferences} change={preferences => setProfile(p => ({ ...p, preferences }))} />
        </>}
        {error && <p role="alert" className="field-error">{error}</p>}
        <div className="setup-actions">{step > 0 && <button type="button" onClick={() => setStep(s => s - 1)}>Назад</button>}<button className="primary">{step === 2 ? 'Сохранить и открыть редактор' : step === 1 ? 'К рекомендациям' : 'Далее'}</button>{cancel ? <button type="button" onClick={cancel}>Отменить</button> : <button type="button" onClick={() => { void save(true) }}>Пропустить настройку</button>}</div>
      </fieldset>
    </form>
  </section>
}
