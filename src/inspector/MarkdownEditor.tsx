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

import CodeMirror from '@uiw/react-codemirror'
import { markdownKeymap, markdownLanguage, pasteURLAsLink } from '@codemirror/lang-markdown'
import { EditorView, keymap } from '@codemirror/view'
import { Prec } from '@codemirror/state'

const theme = EditorView.theme({
  '&': { backgroundColor: 'var(--canvas)', color: 'var(--text)', fontSize: '14px' },
  '.cm-content': { fontFamily: 'var(--mono)', minHeight: '350px' },
  '.cm-gutters': { backgroundColor: 'var(--panel)', color: 'var(--muted)', borderColor: 'var(--border)' },
  '&.cm-focused': { outline: '1px solid var(--accent)' },
}, { dark: true })
// Prompt editing needs Markdown, not the nested HTML/CSS/JS language bundle.
const extensions = [markdownLanguage, Prec.high(keymap.of(markdownKeymap)), pasteURLAsLink, EditorView.lineWrapping, EditorView.contentAttributes.of({ 'aria-label': 'Редактор Markdown' }), theme]
export default function MarkdownEditor({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return <CodeMirror value={value} extensions={extensions} theme="dark" onChange={onChange} />
}
