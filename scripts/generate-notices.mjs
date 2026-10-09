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

import { readFile, readdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const lock = JSON.parse(await readFile(resolve(root, 'package-lock.json'), 'utf8'))
const sections = []
const inventory = []
for (const [path, entry] of Object.entries(lock.packages).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) {
  if (!path) continue
  const name = path.slice(path.lastIndexOf('node_modules/') + 'node_modules/'.length)
  inventory.push(`| ${name} | ${entry.version} | ${entry.license ?? 'Not specified'} | ${entry.dev ? 'Build/test' : 'Production dependency'} |`)
  if (entry.dev) continue
  const directory = resolve(root, path)
  const metadata = JSON.parse(await readFile(resolve(directory, 'package.json'), 'utf8'))
  if (metadata.name !== name || metadata.version !== entry.version) throw new Error(`Run npm ci: installed ${path} does not match lockfile`)
  let files = (await readdir(directory, { withFileTypes: true })).filter(item => item.isFile() && /^(licen[cs]e|copying|notice)([._-]|$)/i.test(item.name)).map(item => item.name).sort()
  let texts = await Promise.all(files.map(async name => ({ name, text: await readFile(resolve(directory, name), 'utf8') })))
  if (!texts.length && ['@uiw/react-codemirror', '@uiw/codemirror-extensions-basic-setup'].includes(name) && entry.version === '4.25.12') {
    files = ['LICENSE (upstream v4.25.12)']
    texts = [{ name: files[0], text: await readFile(resolve(root, 'docs/third-party/uiw-react-codemirror-4.25.12-LICENSE.txt'), 'utf8') }]
  }
  if (!texts.length) throw new Error(`Missing license text for ${name}@${entry.version}; review upstream and vendor its versioned license before release`)
  sections.push(`## ${name}@${entry.version}\n\nDeclared license: ${entry.license}\n\n${texts.map(({ name, text }) => `### ${name}\n\n\`\`\`text\n${text.replace(/\r\n/g, '\n').trim()}\n\`\`\``).join('\n\n')}`)
}
const notices = `# Third-party notices\n\nGenerated from package-lock.json and installed production dependencies by npm run notices:generate. Includes transitive dependencies and type packages classified as production by npm; inclusion does not imply every package is bundled.\n\nThese notices apply to third-party components, not the Workflow Architect source license.\n\nElectron is distributed separately under its license. The Windows application also includes LICENSE.electron.txt and LICENSES.chromium.html alongside the executable; preserve those files. Build/test tools are listed in docs/DEPENDENCIES.md and are not shipped as application node_modules.\n\nThe two uiw packages omit LICENSE from their npm archives. Their versioned upstream license is retained in docs/third-party; see that directory's README.\n\n${sections.join('\n\n')}\n`
const dependencies = `# Dependency inventory\n\nGenerated from package-lock.json by npm run notices:generate. All locked packages are listed, including optional platform packages and build/test tools. Actual installation varies by operating system. License identifiers are metadata, not a compatibility assessment. Shipped production license texts are in [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md).\n\n| Package | Version | Declared license | Use |\n| --- | --- | --- | --- |\n${inventory.join('\n')}\n`
for (const [path, text] of [['THIRD_PARTY_NOTICES.md', notices], ['docs/DEPENDENCIES.md', dependencies]]) {
  if (process.argv.includes('--check')) {
    const actual = await readFile(resolve(root, path), 'utf8')
    if (actual.replace(/\r\n/g, '\n') !== text) throw new Error(`${path} is stale; run npm run notices:generate`)
  } else await writeFile(resolve(root, path), text)
}
console.log(`Third-party notices: ${sections.length} production entries; inventory: ${inventory.length} locked entries`)
