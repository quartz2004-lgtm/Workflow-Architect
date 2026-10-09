import type { ProfilePreferences, SetupAnswers } from './schema'

export interface Recommendation { id: string; title: string; reason: string; preferences: ProfilePreferences }
/** Local, explainable setup rules. No model, network or credentials required. */
export function recommendPreferences(answers: SetupAnswers): Recommendation[] {
  const needsGuidance = answers.experience === 'beginner' || answers.practice === 'needs-help'
  const base: ProfilePreferences = { detail: needsGuidance ? 'guided' : 'technical', density: answers.experience === 'advanced' ? 'compact' : 'comfortable', motion: 'system', defaultMode: answers.control === 'manual' && !needsGuidance ? 'engineering' : 'concept', favoriteTemplates: [], recommendedMaxSteps: needsGuidance ? 10 : 20, recommendedMaxCost: 1 }
  const interests = `${answers.goals} ${answers.tasks} ${answers.services}`.toLowerCase()
  if (/исслед|анализ|research/.test(interests)) base.favoriteTemplates.push('research')
  if (/текст|контент|видео|content|youtube/.test(interests)) base.favoriteTemplates.push('content')
  if (/автомат|telegram|телеграм|api/.test(interests)) base.favoriteTemplates.push('automation')
  return [
    { id: 'recommended', title: needsGuidance ? 'Пошаговое знакомство' : 'Рабочее пространство инженера', reason: needsGuidance ? 'Сначала основные поля и Concept-узлы; технические подробности можно раскрыть.' : 'Технические поля сразу доступны; режим нового проекта учитывает предпочтение ручного управления.', preferences: base },
    { id: 'alternative', title: needsGuidance ? 'Все технические подробности' : 'Спокойное проектирование', reason: 'Альтернативный вариант: измените любой параметр вручную перед сохранением.', preferences: { ...base, detail: needsGuidance ? 'technical' : 'guided', density: 'comfortable', defaultMode: 'concept' } },
  ]
}
