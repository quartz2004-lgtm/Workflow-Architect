/*
Copyright (C) 2026  quartz2004

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with this program.  If not, see <https://gnu.org>.
*/

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
