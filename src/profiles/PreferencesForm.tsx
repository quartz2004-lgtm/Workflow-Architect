import { templates } from '../domain/templates'
import type { ProfilePreferences } from './schema'

export function PreferencesForm({ value, change }: { value: ProfilePreferences; change: (value: ProfilePreferences) => void }) {
  const update = (patch: Partial<ProfilePreferences>) => change({ ...value, ...patch })
  return <div className="profile-preferences">
    <label className="field"><span>Подробность Inspector</span><select value={value.detail} onChange={e => update({ detail: e.target.value as ProfilePreferences['detail'] })}><option value="guided">Пошагово — сначала основные поля</option><option value="technical">Все технические разделы</option></select></label>
    <label className="field"><span>Плотность интерфейса</span><select value={value.density} onChange={e => update({ density: e.target.value as ProfilePreferences['density'] })}><option value="comfortable">Комфортная</option><option value="compact">Компактная</option></select></label>
    <label className="field"><span>Движение интерфейса</span><select value={value.motion} onChange={e => update({ motion: e.target.value as ProfilePreferences['motion'] })}><option value="system">По настройке системы</option><option value="reduced">Минимальное</option></select></label>
    <label className="field"><span>Режим нового пустого проекта</span><select value={value.defaultMode} onChange={e => update({ defaultMode: e.target.value as ProfilePreferences['defaultMode'] })}><option value="concept">Concept — начать с идеи</option><option value="engineering">Engineering — формальная архитектура</option></select></label>
    <fieldset><legend>Избранные примеры</legend>{templates.map(template => <label className="profile-check" key={template.id}><input type="checkbox" checked={value.favoriteTemplates.includes(template.id)} onChange={e => update({ favoriteTemplates: e.target.checked ? [...value.favoriteTemplates, template.id] : value.favoriteTemplates.filter(id => id !== template.id) })} />{template.title}</label>)}</fieldset>
    <fieldset><legend>Рекомендуемые будущие лимиты</legend><p className="muted">В 0.2.0 выполнение отсутствует. Эти значения сохраняются как предпочтения и пока ничего не ограничивают.</p><div className="profile-preferences"><label className="field"><span>Шагов на запуск</span><input type="number" min="1" max="1000" required value={value.recommendedMaxSteps} onChange={e => update({ recommendedMaxSteps: e.target.valueAsNumber })} /></label><label className="field"><span>Стоимость запуска, USD</span><input type="number" min="0" max="1000" step="0.01" required value={value.recommendedMaxCost} onChange={e => update({ recommendedMaxCost: e.target.valueAsNumber })} /></label></div></fieldset>
  </div>
}
