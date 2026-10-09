import { writeFile } from 'node:fs/promises'
import { chapters } from '../src/help/content.ts'
import { almanacHtml } from '../src/help/html.ts'
await writeFile(new URL('../docs/Workflow_Architect_Almanac.html', import.meta.url), almanacHtml(chapters), 'utf8')
console.log(`Almanac: ${chapters.length} chapters → docs/Workflow_Architect_Almanac.html`)
