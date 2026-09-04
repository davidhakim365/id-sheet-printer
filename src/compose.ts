import JSZip from 'jszip'

export type RectPct = {
  x: number
  y: number
  w: number
  h: number
}

export function clampRect(rect: RectPct): RectPct {
  const w = Math.min(100, Math.max(3, rect.w))
  const h = Math.min(100, Math.max(3, rect.h))
  return {
    x: Math.min(100 - w, Math.max(0, rect.x)),
    y: Math.min(100 - h, Math.max(0, rect.y)),
    w,
    h,
  }
}

export function defaultBarcodeRect(
  templateW: number,
  templateH: number,
  barcodeW: number,
  barcodeH: number,
): RectPct {
  const w = 42
  const h = w * (templateW / templateH) * (barcodeH / barcodeW)
  return clampRect({
    x: (100 - w) / 2,
    y: 100 - h - 7,
    w,
    h,
  })
}

export function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Failed to load image'))
    img.src = url
  })
}

export async function composeIdJpeg(
  templateUrl: string,
  barcodeUrl: string,
  rect: RectPct,
  quality = 0.95,
): Promise<Blob> {
  const [template, barcode] = await Promise.all([loadImage(templateUrl), loadImage(barcodeUrl)])
  const canvas = document.createElement('canvas')
  canvas.width = template.naturalWidth
  canvas.height = template.naturalHeight
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas is not available')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(template, 0, 0)
  ctx.drawImage(
    barcode,
    (rect.x / 100) * canvas.width,
    (rect.y / 100) * canvas.height,
    (rect.w / 100) * canvas.width,
    (rect.h / 100) * canvas.height,
  )
  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, 'image/jpeg', quality)
  })
  if (!blob) throw new Error('JPEG encode failed')
  return blob
}

export function uniqueJpegName(base: string, used: Set<string>): string {
  const safe = base.replace(/[^\w.\- ()]+/g, '_').trim() || 'id'
  let name = `${safe}.jpg`
  let n = 2
  while (used.has(name.toLowerCase())) {
    name = `${safe}-${n}.jpg`
    n += 1
  }
  used.add(name.toLowerCase())
  return name
}

export async function buildIdZip(
  templateUrl: string,
  barcodes: Array<{ name: string; url: string }>,
  rect: RectPct,
  onProgress?: (done: number, total: number) => void,
): Promise<Blob> {
  const zip = new JSZip()
  const used = new Set<string>()
  for (let i = 0; i < barcodes.length; i++) {
    const blob = await composeIdJpeg(templateUrl, barcodes[i].url, rect)
    zip.file(uniqueJpegName(barcodes[i].name, used), blob)
    onProgress?.(i + 1, barcodes.length)
  }
  return zip.generateAsync({ type: 'blob' })
}

export function downloadBlob(blob: Blob, filename: string) {
  const href = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = href
  a.download = filename
  a.click()
  URL.revokeObjectURL(href)
}
