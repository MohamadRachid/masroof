import type { MasroofDB, Row, SyncedTable } from './db'

// SPEC §6 Settings → export JSON: the user's own live rows, unsynced ones included. Rates are global, so they stay out.

const EXPORTED = ['accounts', 'categories', 'entries', 'plans', 'plan_envelopes', 'recurring', 'reconciliations', 'settings'] as const satisfies readonly SyncedTable[]

export type DataExport = {
  app: 'masroof'
  version: string
  exported_at: string
  tables: Record<(typeof EXPORTED)[number], Row[]>
}

export async function collectExport(db: MasroofDB, version: string, exportedAt: string): Promise<DataExport> {
  const pairs = await Promise.all(
    EXPORTED.map(async (table) => [table, (await db.tableOf(table).toArray()).filter((r) => !r.deleted_at)] as const),
  )
  return { app: 'masroof', version, exported_at: exportedAt, tables: Object.fromEntries(pairs) as DataExport['tables'] }
}

export function exportFileName(today: string): string {
  return `masroof-${today}.json`
}

/** Phones that can share the file get the share sheet; everything else gets a normal download. */
export async function saveExportFile(data: DataExport, fileName: string): Promise<void> {
  const file = new File([JSON.stringify(data, null, 2)], fileName, { type: 'application/json' })
  if (window.matchMedia('(pointer: coarse)').matches && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] })
      return
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return // the user closed the share sheet
    }
  }
  const url = URL.createObjectURL(file)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.append(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
