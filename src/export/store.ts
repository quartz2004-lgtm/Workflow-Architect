import { createStore } from 'zustand/vanilla'
import type { ExportTarget } from './exporters'

export function createExportStore() {
  return createStore(() => ({ open: false, target: 'archive' as ExportTarget, busy: false, error: null as string | null }))
}
