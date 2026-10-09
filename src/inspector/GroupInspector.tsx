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

import { useEditor } from '../app/context'
import { groupSchema, type Group } from '../domain/schema'
import { SelectField, TextField } from './controls'

export function GroupInspector({ group }: { group: Group }) {
  const editor = useEditor()
  return <><div className="inspector-intro"><span className="eyebrow">GROUP</span><h2>Подсистема</h2><p>{group.nodeIds.length} узлов в группе</p></div>
    <TextField key={`${group.id}:${group.title}`} label="Название группы" helpKey="group.title" value={group.title} commit={title => editor.safely(() => editor.execute({ type: 'edit-group', id: group.id, changes: { title } }))} />
    <TextField key={`${group.id}:${group.description}`} label="Описание группы" helpKey="group.description" value={group.description} multiline commit={description => editor.safely(() => editor.execute({ type: 'edit-group', id: group.id, changes: { description } }))} />
    <SelectField label="Цвет группы" helpKey="group.color" value={group.color ?? ''} options={['neutral', 'violet', 'cyan', 'emerald', 'amber', 'blue', 'rose', 'indigo', 'slate']} commit={value => editor.safely(() => editor.execute({ type: 'edit-group', id: group.id, changes: { color: groupSchema.parse({ ...group, color: value || undefined }).color } }))} />
    <div className="inline-actions"><button onClick={() => editor.safely(() => editor.execute({ type: 'edit-group', id: group.id, changes: { collapsed: !group.collapsed } }))}>{group.collapsed ? 'Развернуть группу' : 'Свернуть группу'}</button>
      <button onClick={() => editor.safely(() => editor.execute({ type: 'ungroup', id: group.id }))}>Разгруппировать</button>
      <button onClick={() => editor.safely(() => editor.execute({ type: 'convert-group', id: group.id }))}>Преобразовать в Subworkflow</button>
      <button onClick={() => editor.safely(() => editor.execute({ type: 'delete', nodeIds: [], edgeIds: [], groupIds: [group.id] }))}>Удалить группу с узлами</button>
    </div>
  </>
}
