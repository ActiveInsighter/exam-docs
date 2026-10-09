// Adapted from clone-website reading-motion: preserve the measured OpenAI selection path.
export interface LineRect { x: number; y: number; width: number; height: number }
export const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, Number.isFinite(value) ? value : min))
const smoothstep = (value: number) => value * value * (3 - 2 * value)

/** Range rectangles from nested rich text, coalesced into visual lines. */
export function mergeLineRects(rects: readonly LineRect[]): LineRect[] {
  const lines: LineRect[] = []
  for (const rect of rects.filter(r => r.width > 0 && r.height > 0).toSorted((a, b) => a.y - b.y || a.x - b.x)) {
    const previous = lines.at(-1)
    if (previous && Math.abs(previous.y - rect.y) < Math.min(previous.height, rect.height) * 0.5) {
      const right = Math.max(previous.x + previous.width, rect.x + rect.width)
      const bottom = Math.max(previous.y + previous.height, rect.y + rect.height)
      previous.x = Math.min(previous.x, rect.x)
      previous.y = Math.min(previous.y, rect.y)
      previous.width = right - previous.x
      previous.height = bottom - previous.y
    } else lines.push({ ...rect })
  }
  return lines
}

export function measureLines(text: HTMLElement, origin: DOMRect): LineRect[] {
  const walker = document.createTreeWalker(text, NodeFilter.SHOW_TEXT)
  const rects: LineRect[] = []
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const range = document.createRange()
    range.selectNodeContents(node)
    for (const r of range.getClientRects()) rects.push({ x: r.left - origin.left, y: r.top - origin.top, width: r.width, height: r.height })
  }
  return mergeLineRects(rects)
}

function contactOffset(progress: number, start: number, end: number, rtl: boolean) {
  const sign = rtl ? -1 : 1
  const entering = progress < start
  const remaining = entering ? 1 - clamp(progress / start) : clamp((progress - end) / (1 - end))
  const x = entering ? -36 * sign : 64 * sign
  const y = entering ? 48 : -40
  const bow = entering ? 18 * sign : 20 * sign
  const length = Math.hypot(x, y)
  const t = 1 - remaining
  return { x: remaining * x - 2 * remaining * t * y / length * bow, y: remaining * y + 2 * remaining * t * x / length * bow }
}

export function highlightFrame(lines: readonly LineRect[], progress: number, rtl = false) {
  const p = clamp(progress)
  const total = lines.reduce((sum, line) => sum + line.width, 0) + 24 * Math.max(0, lines.length - 1)
  let distance = clamp((p - 0.2) / 0.6) * total
  let x = 0, y = 0, lineOpacity = 1
  const fills = lines.map((line, index) => {
    const fill = clamp(distance, 0, line.width)
    if (distance >= 0) {
      x = line.x + (rtl ? line.width - fill : fill)
      y = line.y + line.height * 0.65
      const edge = Math.min(60, line.width * 0.45)
      lineOpacity = smoothstep(Math.min(index > 0 ? clamp(fill / edge) : 1, index < lines.length - 1 ? clamp((line.width - fill) / edge) : 1))
    }
    distance -= line.width
    const next = lines[index + 1]
    if (next && distance >= 0 && distance <= 24) {
      lineOpacity = 0
      if (distance >= 12) { x = next.x + (rtl ? next.width : 0); y = next.y + next.height * 0.65 }
    }
    distance -= 24
    return fill / line.width
  })
  const offset = contactOffset(p, 0.2, 0.8, rtl)
  const contact = smoothstep(clamp(Math.min(clamp((p - 0.2) / 0.6), 1 - clamp((p - 0.2) / 0.6)) / 0.1))
  return { fills, x: x + offset.x, y: y + offset.y, rotation: p >= 0.2 && p <= 0.8 ? (rtl ? 90 : 0) : (p < 0.2 ? 51 : 75), scale: 1 - 0.14 * contact, opacity: lines.length ? lineOpacity * Math.min(clamp(p / 0.08), clamp((1 - p) / 0.12)) : 0 }
}
