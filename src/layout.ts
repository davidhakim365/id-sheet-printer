export const CARD_W_MM = 90
export const CARD_H_MM = 60
export const PAPER_W_MM = 200
export const PAPER_H_MM = 300
export const COLS = 2
export const ROWS = 5
export const CARDS_PER_SHEET = COLS * ROWS

export type IdCard = {
  id: string
  name: string
  frontUrl: string
  backUrl: string | null
}

export type SheetSide = 'front' | 'back'

export type SheetLayout = {
  paperW: number
  paperH: number
  cardW: number
  cardH: number
  cols: number
  rows: number
  marginX: number
  marginY: number
  /** Space between the two columns of 5 cards (mm). */
  columnGap: number
}

/** Gap between the left and right columns of 5 cards. */
const COLUMN_GAP_MM = 10

/**
 * Fixed page: 200×300 mm, 9×6 cm cards, 2×5 = 10 per sheet.
 * 10mm center gap; edge margins take the leftover width (5mm each).
 */
export function getLayout(): SheetLayout {
  const paperW = PAPER_W_MM
  const paperH = PAPER_H_MM
  const cardW = CARD_W_MM
  const cardH = CARD_H_MM
  const cols = COLS
  const rows = ROWS
  const columnGap = COLUMN_GAP_MM
  const marginX = (paperW - cols * cardW - columnGap) / 2
  return {
    paperW,
    paperH,
    cardW,
    cardH,
    cols,
    rows,
    marginX,
    marginY: (paperH - rows * cardH) / 2,
    columnGap,
  }
}

export function frontSlotIndex(row: number, col: number, cols: number): number {
  return row * cols + col
}

/**
 * Horizontal flip (book-style left↔right): columns swap so backs
 * land behind the matching fronts after flipping the paper.
 */
export function backSlotIndex(row: number, col: number, cols: number): number {
  return row * cols + (cols - 1 - col)
}

export function chunkCards<T>(items: T[], size = CARDS_PER_SHEET): T[][] {
  const sheets: T[][] = []
  for (let i = 0; i < items.length; i += size) {
    sheets.push(items.slice(i, i + size))
  }
  return sheets
}

export function slotCard(
  sheet: Array<IdCard | undefined>,
  row: number,
  col: number,
  side: SheetSide,
  cols: number,
): IdCard | undefined {
  const index =
    side === 'front' ? frontSlotIndex(row, col, cols) : backSlotIndex(row, col, cols)
  return sheet[index]
}
