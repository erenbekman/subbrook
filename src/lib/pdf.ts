import type { TextItem } from 'pdfjs-dist/types/src/display/api'

export async function pdfRows(buffer: ArrayBuffer): Promise<string[][]> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  pdfjs.GlobalWorkerOptions.workerSrc = (await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url')).default
  const task = pdfjs.getDocument({ data: new Uint8Array(buffer) })
  const doc = await task.promise
  const rows: string[][] = []
  for (let p = 1; p <= doc.numPages; p++) {
    const content = await (await doc.getPage(p)).getTextContent()
    const items = content.items.filter((i): i is TextItem => 'str' in i && i.str.trim() !== '')
    const lines: { y: number; items: TextItem[] }[] = []
    for (const item of items) {
      const y = item.transform[5]
      let line = lines.find((l) => Math.abs(l.y - y) < 2.5)
      if (!line) lines.push((line = { y, items: [] }))
      line.items.push(item)
    }
    lines.sort((a, b) => b.y - a.y)
    for (const line of lines) {
      line.items.sort((a, b) => a.transform[4] - b.transform[4])
      const cells: string[] = []
      let end = -Infinity
      for (const item of line.items) {
        const x = item.transform[4]
        if (!cells.length || x - end > 8) cells.push(item.str.trim())
        else cells[cells.length - 1] += (x - end > 1 ? ' ' : '') + item.str.trim()
        end = x + item.width
      }
      rows.push(cells)
    }
  }
  await task.destroy()
  if (!rows.length) throw new Error('This PDF has no text in it (it may be a scan). Export a CSV or Excel file from your bank instead.')
  return rows
}
