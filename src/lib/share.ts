export interface ShareItem {
  name: string
  color: string
  value: string
  share: number
  note: string
}

export interface ShareData {
  month: string
  hero: [string, string]
  perMonth: string
  perYear: string | null
  approx: boolean
  items: ShareItem[]
  categories: { name: string; color: string; share: number }[]
  paid: number
  charges: number
  toCome: string
}

const SCALE = 2
const MONO = 'ui-monospace, "SF Mono", Menlo, monospace'
type Ctx = CanvasRenderingContext2D

function palette(): (name: string) => string {
  const style = getComputedStyle(document.documentElement)
  return (name) => style.getPropertyValue(`--${name}`).trim()
}

async function loadFonts(): Promise<void> {
  await Promise.all(['300 160px Manrope', '500 30px Manrope', '600 28px Manrope', '700 28px Manrope'].map((f) => document.fonts.load(f)))
}

function surface(width: number, height: number): { canvas: HTMLCanvasElement; ctx: Ctx } {
  const canvas = document.createElement('canvas')
  canvas.width = width * SCALE
  canvas.height = height * SCALE
  const ctx = canvas.getContext('2d')!
  ctx.scale(SCALE, SCALE)
  return { canvas, ctx }
}

function spacing(ctx: Ctx, px: number): void {
  if ('letterSpacing' in ctx) (ctx as Ctx & { letterSpacing: string }).letterSpacing = `${px}px`
}

function ellipsize(ctx: Ctx, text: string, max: number): string {
  if (ctx.measureText(text).width <= max) return text
  let out = text
  while (out && ctx.measureText(`${out}…`).width > max) out = out.slice(0, -1)
  return `${out.trimEnd()}…`
}

function pct(share: number): string {
  return `${Math.max(1, Math.round(share * 100))}%`
}

function wordmark(ctx: Ctx, t: (n: string) => string, x: number, y: number, size: number, align: 'left' | 'center'): void {
  ctx.font = `300 ${size}px Manrope`
  spacing(ctx, -size * 0.04)
  const sub = ctx.measureText('sub').width
  const start = align === 'center' ? x - (sub + ctx.measureText('brook').width) / 2 : x
  ctx.textAlign = 'left'
  ctx.fillStyle = t('leaf')
  ctx.fillText('sub', start, y)
  ctx.fillStyle = t('ink')
  ctx.fillText('brook', start + sub, y)
  spacing(ctx, 0)
}

export async function drawPoster(data: ShareData, hideAmounts: boolean): Promise<HTMLCanvasElement> {
  await loadFonts()
  const t = palette()
  const W = 1080
  const H = 1350
  const L = 96
  const R = W - 96
  const { canvas, ctx } = surface(W, H)
  ctx.fillStyle = t('paper')
  ctx.fillRect(0, 0, W, H)

  wordmark(ctx, t, L, 122, 34, 'left')
  ctx.font = '700 18px Manrope'
  spacing(ctx, 1.8)
  ctx.fillStyle = t('ink-3')
  ctx.textAlign = 'right'
  ctx.fillText(`MY SUBSCRIPTIONS · ${data.month.toUpperCase()}`, R, 120)
  spacing(ctx, 0)
  ctx.textAlign = 'left'

  const [whole, decimals] = hideAmounts ? [String(data.items.length), ' subs'] : data.hero
  let size = 168
  const fit = () => {
    ctx.font = `300 ${size}px Manrope`
    spacing(ctx, -size * 0.05)
    return ctx.measureText(whole + decimals).width
  }
  while (fit() > R - L && size > 56) size -= 4
  ctx.fillStyle = t('ink')
  ctx.fillText(whole, L, 330)
  ctx.fillStyle = t('ink-3')
  ctx.fillText(decimals, L + ctx.measureText(whole).width, 330)
  spacing(ctx, 0)

  ctx.font = '500 30px Manrope'
  ctx.fillStyle = t('ink-2')
  if (hideAmounts) ctx.fillText('tracked in one calm stream', L, 392)
  else {
    const lead = data.perYear ? 'a month · ' : 'a month'
    ctx.fillText(lead, L, 392)
    if (data.perYear) {
      const x = L + ctx.measureText(lead).width
      ctx.font = '700 30px Manrope'
      ctx.fillStyle = t('ink')
      ctx.fillText(data.perYear, x, 392)
      const x2 = x + ctx.measureText(data.perYear).width
      ctx.font = '500 30px Manrope'
      ctx.fillStyle = t('ink-2')
      ctx.fillText(' a year', x2, 392)
    }
  }

  const gap = 6
  const usable = R - L - gap * Math.max(0, data.categories.length - 1)
  let x = L
  for (const c of data.categories) {
    const w = Math.max(10, usable * c.share)
    ctx.fillStyle = t(c.color)
    ctx.beginPath()
    ctx.roundRect(x, 452, Math.min(w, R - x), 22, 6)
    ctx.fill()
    x += w + gap
  }

  ctx.font = '600 20px Manrope'
  let lx = L
  let ly = 522
  for (const c of data.categories) {
    const label = `${c.name} `
    const width = 24 + ctx.measureText(label + pct(c.share)).width
    if (lx + width > R) { lx = L; ly += 36 }
    ctx.fillStyle = t(c.color)
    ctx.beginPath()
    ctx.roundRect(lx, ly - 15, 14, 14, 5)
    ctx.fill()
    ctx.fillStyle = t('ink-2')
    ctx.fillText(label, lx + 24, ly)
    ctx.fillStyle = t('ink-3')
    ctx.fillText(pct(c.share), lx + 24 + ctx.measureText(label).width, ly)
    lx += width + 28
  }

  const rowH = 82
  const top = ly + 46
  const bottom = data.approx ? 1190 : 1220
  const fits = Math.floor((bottom - top) / rowH)
  const shown = data.items.length > fits ? data.items.slice(0, fits - 1) : data.items
  shown.forEach((item, i) => {
    const y = top + i * rowH
    ctx.fillStyle = t('line')
    ctx.fillRect(L, y, R - L, 1)
    ctx.fillStyle = t(`${item.color}-soft`)
    ctx.beginPath()
    ctx.roundRect(L, y + 13, 56, 56, 18)
    ctx.fill()
    ctx.fillStyle = t(item.color)
    ctx.font = '700 24px Manrope'
    ctx.textAlign = 'center'
    ctx.fillText(item.name.charAt(0).toUpperCase(), L + 28, y + 50)
    const value = hideAmounts ? pct(item.share) : item.value
    ctx.font = '700 28px Manrope'
    ctx.textAlign = 'right'
    ctx.fillStyle = t('ink')
    ctx.fillText(value, R, y + 51)
    const valueWidth = ctx.measureText(value).width
    ctx.textAlign = 'left'
    ctx.font = '600 28px Manrope'
    ctx.fillText(ellipsize(ctx, item.name, R - L - 78 - valueWidth - 24), L + 78, y + 51)
  })
  if (shown.length < data.items.length) {
    const y = top + shown.length * rowH
    ctx.fillStyle = t('line')
    ctx.fillRect(L, y, R - L, 1)
    ctx.font = '600 24px Manrope'
    ctx.fillStyle = t('ink-3')
    ctx.fillText(`and ${data.items.length - shown.length} more`, L + 78, y + 49)
  }

  if (data.approx && !hideAmounts) {
    ctx.font = '500 18px Manrope'
    ctx.fillStyle = t('ink-3')
    ctx.fillText("Other currencies converted at today's rates.", L, 1222)
  }
  ctx.fillStyle = t('line')
  ctx.fillRect(L, 1244, R - L, 1)
  ctx.font = '500 20px Manrope'
  ctx.fillStyle = t('ink-3')
  ctx.fillText('Free, open source, no account.', L, 1290)
  ctx.font = '700 20px Manrope'
  ctx.fillStyle = t('ink-2')
  ctx.textAlign = 'right'
  ctx.fillText('subbrook.com', R, 1290)
  return canvas
}

export async function drawReceipt(data: ShareData, hideAmounts: boolean): Promise<HTMLCanvasElement> {
  await loadFonts()
  const t = palette()
  const W = 600
  const PX = 80
  const IN = PX + 32
  const OUT = W - PX - 32
  const items = data.items.slice(0, 16)
  const height = 596 + items.reduce((h, i) => h + (i.note ? 44 : 24), 0) + (data.items.length > items.length ? 24 : 0) + (data.perYear ? 24 : 0)
  const { canvas, ctx } = surface(W, height)
  ctx.fillStyle = t('sunken')
  ctx.fillRect(0, 0, W, height)

  const paperTop = 56
  const paperBottom = height - 56
  ctx.fillStyle = t('surface')
  ctx.fillRect(PX, paperTop + 12, W - PX * 2, paperBottom - paperTop - 24)
  for (let x = PX; x < W - PX; x += 12) {
    ctx.beginPath()
    ctx.moveTo(x, paperTop + 12)
    ctx.lineTo(x + 6, paperTop + 6)
    ctx.lineTo(x + 12, paperTop + 12)
    ctx.moveTo(x, paperBottom - 12)
    ctx.lineTo(x + 6, paperBottom - 6)
    ctx.lineTo(x + 12, paperBottom - 12)
    ctx.fill()
  }

  const amount = (v: string) => (hideAmounts ? '•••' : v)
  const dashed = (y: number) => {
    ctx.strokeStyle = t('line-strong')
    ctx.lineWidth = 2
    ctx.setLineDash([6, 5])
    ctx.beginPath()
    ctx.moveTo(IN, y)
    ctx.lineTo(OUT, y)
    ctx.stroke()
    ctx.setLineDash([])
  }
  const line = (left: string, right: string, y: number, weight = 400, sizePx = 15, color = t('ink')) => {
    ctx.font = `${weight} ${sizePx}px ${MONO}`
    ctx.fillStyle = color
    ctx.textAlign = 'right'
    ctx.fillText(right, OUT, y)
    const rightWidth = ctx.measureText(right).width
    ctx.textAlign = 'left'
    ctx.fillText(ellipsize(ctx, left, OUT - IN - rightWidth - 12), IN, y)
  }
  const center = (text: string, y: number, weight = 400, color = t('ink')) => {
    ctx.font = `${weight} 15px ${MONO}`
    ctx.fillStyle = color
    ctx.textAlign = 'center'
    ctx.fillText(text, W / 2, y)
    ctx.textAlign = 'left'
  }

  let y = paperTop + 12 + 46
  wordmark(ctx, t, W / 2, y, 30, 'center')
  y += 30
  spacing(ctx, 1.8)
  center('SUBSCRIPTION RECEIPT', y, 700)
  spacing(ctx, 0)
  y += 22
  center(`${data.month.toUpperCase()} · NO. ${String(data.items.length).padStart(4, '0')}`, y, 400, t('ink-3'))
  y += 26
  dashed(y)
  y += 30

  for (const item of items) {
    line(item.name.toUpperCase(), amount(item.value), y)
    y += 24
    if (item.note) {
      ctx.font = `400 13px ${MONO}`
      ctx.fillStyle = t('ink-3')
      ctx.fillText(`  ${item.note}`, IN, y - 4)
      y += 20
    }
  }
  if (data.items.length > items.length) {
    line(`AND ${data.items.length - items.length} MORE`, '', y, 400, 15, t('ink-3'))
    y += 24
  }

  y += 2
  dashed(y)
  y += 30
  line('ITEMS', String(data.items.length), y)
  y += 26
  line('PER MONTH', amount(data.perMonth), y, 700, 18)
  y += 24
  if (data.perYear) {
    line('PER YEAR', amount(data.perYear), y)
    y += 24
  }
  y += 4
  dashed(y)
  y += 32
  center(`PAID THIS MONTH: ${data.paid} OF ${data.charges}`, y, 400, t('ink-2'))
  y += 22
  center(`STILL TO COME: ${amount(data.toCome)}`, y, 400, t('ink-2'))
  y += 30
  center('THANK YOU FOR NOT FORGETTING', y, 700)
  y += 24

  const widths = [3, 1, 2, 1, 1, 3, 2, 1, 3, 1, 1, 2, 3, 1, 2, 1, 1, 3, 1, 2, 2, 1, 3, 1, 1, 2, 1, 3, 2, 1, 1, 2, 3, 1, 2, 1, 3, 1, 1, 2]
  const barWidth = widths.reduce((a, w) => a + w + 2, -2)
  let bx = W / 2 - barWidth / 2
  ctx.fillStyle = t('ink')
  for (const w of widths) {
    ctx.fillRect(bx, y, w, 56)
    bx += w + 2
  }
  y += 56 + 28
  ctx.font = `400 13px ${MONO}`
  ctx.fillStyle = t('ink-3')
  ctx.textAlign = 'center'
  ctx.fillText(data.approx && !hideAmounts ? "≈ converted at today's rates · subbrook.com" : 'subbrook.com · free, open source, no account', W / 2, y)
  return canvas
}
