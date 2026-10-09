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
