import { access, cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import electron from 'electron'
await access(electron)
const target = new URL('../.desktop-app/', import.meta.url)
const repository = resolve(dirname(fileURLToPath(import.meta.url)), '..')
if (resolve(fileURLToPath(target)) !== resolve(repository, '.desktop-app')) throw new Error('Unsafe staging directory')
await rm(target, { recursive: true, force: true })
await mkdir(target, { recursive: true })
for (const folder of ['dist', 'desktop-dist', 'desktop/assets']) {
  await cp(new URL(`../${folder}`, import.meta.url), new URL(folder, target), { recursive: true })
}
const { version } = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
await writeFile(new URL('package.json', target), JSON.stringify({
  name: 'workflow-architect', version, private: true,
  description: 'Visual engineering environment for AI workflows',
  author: 'Workflow Architect', main: 'desktop-dist/main.cjs',
}, null, 2))
