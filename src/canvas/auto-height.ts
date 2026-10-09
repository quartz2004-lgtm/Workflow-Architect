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

/** Measures a detached visual copy; the result enters the normal resize command. */
export function contentHeight(card: HTMLElement, width: number, description: string, ports: boolean): number {
  const clone = card.cloneNode(true) as HTMLElement
  clone.classList.remove('compact')
  clone.classList.add('measure-height')
  if (!clone.querySelector('p')) { const body = document.createElement('p'); body.textContent = description; clone.querySelector('h3')?.after(body) }
  if (ports && !clone.querySelector('.node-foot')) { const foot = document.createElement('div'); foot.className = 'node-foot'; foot.textContent = 'вход / выход'; clone.append(foot) }
  clone.style.cssText = `position:fixed;left:-100000px;top:0;width:${width}px;height:auto;visibility:hidden;pointer-events:none;`
  document.body.append(clone)
  try { return Math.min(1200, Math.max(100, Math.ceil(clone.getBoundingClientRect().height))) }
  finally { clone.remove() }
}
