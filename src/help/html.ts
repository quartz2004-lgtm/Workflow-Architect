import type { HelpBlock, HelpChapter } from './content'

function escape(text: string): string {
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;')
}
function blockHtml(block: HelpBlock): string {
  if ('text' in block) {
    const text = escape(block.text)
    switch (block.kind) {
      case 'heading': return `<h3>${text}</h3>`
      case 'note': return `<aside>${text}</aside>`
      case 'code': return `<pre><code>${text}</code></pre>`
      default: return `<p>${text}</p>`
    }
  }
  if (block.kind === 'table') return `<div class="table"><table><thead><tr>${block.columns.map(c => `<th scope="col">${escape(c)}</th>`).join('')}</tr></thead><tbody>${block.rows.map(row => `<tr>${row.map(cell => `<td>${escape(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`
  const tag = block.kind === 'steps' ? 'ol' : 'ul'
  return `<${tag}>${block.items.map(item => `<li>${escape(item)}</li>`).join('')}</${tag}>`
}

/** Self-contained offline document. All content is escaped; no scripts or external assets. */
export function almanacHtml(chapters: HelpChapter[]): string {
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>Workflow Architect — Альманах 0.2</title><style>
  :root{color-scheme:light}*{box-sizing:border-box}body{margin:0;background:#f7f8fa;color:#202630;font:16px/1.75 'Segoe UI',system-ui,sans-serif}main{max-width:1000px;margin:auto;padding:56px 32px}header{padding:24px 0 40px;border-bottom:2px solid #294b42}h1{font-size:42px;line-height:1.15;letter-spacing:-1px}h2{font-size:29px;line-height:1.3}h3{font-size:20px;margin-top:30px}a{color:#245746;text-underline-offset:4px}nav{columns:2;column-gap:32px;padding:28px 0}nav a{display:block;margin:0 0 12px;break-inside:avoid}section{padding:36px 0;border-top:1px solid #cad0d7;scroll-margin-top:20px}p{max-width:82ch}li{margin:10px 0;padding-left:5px}aside{padding:18px 22px;border-left:3px solid #517a69;background:#eaf0ed;margin:24px 0}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#e9edf1;padding:20px;border-radius:8px;font-size:14px;line-height:1.65}.table{overflow-x:auto}table{border-collapse:collapse;width:100%;font-size:14px}td,th{text-align:left;vertical-align:top;border-bottom:1px solid #cbd1d8;padding:12px;overflow-wrap:anywhere}th{background:#e9edf1}.label{color:#506158;font-size:12px;letter-spacing:2px;text-transform:uppercase}.summary{color:#53616f}.back{font-size:13px}@media(max-width:650px){main{padding:24px 18px}nav{columns:1}h1{font-size:32px}}@media print{body{background:white;font-size:11pt}main{max-width:none;padding:0}header{padding-top:0}nav{columns:2}section{break-before:page}h2,h3{break-after:avoid}tr,aside,pre{break-inside:avoid}th{background:none}.table{overflow:visible}.back{display:none}a{color:inherit}p{max-width:none}@page{size:A4;margin:18mm}}
  </style></head><body><main><header id="contents"><div class="label">Workflow Architect · Alpha 0.2 · Windows / Web</div><h1>Альманах</h1><p>От первой идеи до спецификации AI-системы. Назначение, функции, примеры, инженерные понятия и практические инструкции.</p><p>${chapters.length} глав · Редакция 09.10.2026 · Полная офлайн-копия</p><p>Нажмите на главу в оглавлении. Для поиска используйте Ctrl+F в браузере, для печати — Ctrl+P.</p></header><nav aria-label="Оглавление">${chapters.map((chapter, index) => `<a href="#${chapter.id}">${String(index + 1).padStart(2, '0')} · ${escape(chapter.title)}</a>`).join('')}</nav>${chapters.map((chapter, index) => `<section id="${chapter.id}"><div class="label">${escape(chapter.group)} · ${index + 1} / ${chapters.length}</div><h2>${escape(chapter.title)}</h2><p class="summary">${escape(chapter.summary)}</p>${chapter.blocks.map(blockHtml).join('')}<a class="back" href="#contents">↑ К оглавлению</a></section>`).join('')}</main></body></html>`
}
