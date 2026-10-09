export function downloadText(name: string, content: string) {
  const type = name.endsWith('.md') ? 'text/markdown;charset=utf-8' : /\.ya?ml$/.test(name) ? 'application/yaml;charset=utf-8' : 'application/json;charset=utf-8'
  downloadBlob(name, new Blob([content], { type }))
}
export function downloadBlob(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = name
  anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
