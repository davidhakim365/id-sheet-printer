import { useEffect, useId, useMemo, useRef, useState } from 'react'
import {
  CARDS_PER_SHEET,
  chunkCards,
  getLayout,
  slotCard,
} from './layout'
import type { IdCard, SheetLayout, SheetSide } from './layout'
import './App.css'

function makeId() {
  return crypto.randomUUID()
}

function revokeUrls(cards: IdCard[]) {
  for (const card of cards) {
    URL.revokeObjectURL(card.frontUrl)
    if (card.backUrl) URL.revokeObjectURL(card.backUrl)
  }
}

function fileBaseName(file: File) {
  return file.name.replace(/\.[^.]+$/, '')
}

export default function App() {
  const [cards, setCards] = useState<IdCard[]>([])
  const [showGuides, setShowGuides] = useState(true)
  const [rotateCards, setRotateCards] = useState(false)
  const [flipHorizontal, setFlipHorizontal] = useState(false)
  const [reverseBackSheets, setReverseBackSheets] = useState(true)
  const [printSide, setPrintSide] = useState<SheetSide | null>(null)
  const frontInputRef = useRef<HTMLInputElement>(null)
  const backInputRef = useRef<HTMLInputElement>(null)
  const pairFrontRef = useRef<HTMLInputElement>(null)
  const pairBackRef = useRef<HTMLInputElement>(null)
  const pendingPairFront = useRef<File | null>(null)
  const guidesId = useId()
  const rotateId = useId()
  const flipId = useId()
  const reverseId = useId()

  const layout = useMemo(() => getLayout(), [])
  const sheets = useMemo(() => chunkCards(cards), [cards])
  const missingBacks = cards.filter((c) => !c.backUrl).length

  useEffect(() => {
    const style = document.getElementById('print-page-size') ?? document.createElement('style')
    style.id = 'print-page-size'
    style.textContent = `@page { size: ${layout.paperW}mm ${layout.paperH}mm; margin: 0; }`
    if (!style.parentNode) document.head.appendChild(style)
  }, [layout.paperW, layout.paperH])

  useEffect(() => {
    if (!printSide) return
    const previous = document.title
    document.title = printSide === 'front' ? 'ID Fronts' : 'ID Backs'
    const timer = window.setTimeout(() => {
      window.print()
      setPrintSide(null)
      document.title = previous
    }, 50)
    return () => window.clearTimeout(timer)
  }, [printSide])

  function addFronts(files: FileList | null) {
    if (!files?.length) return
    const next = Array.from(files).map((file) => ({
      id: makeId(),
      name: fileBaseName(file),
      frontUrl: URL.createObjectURL(file),
      backUrl: null,
    }))
    setCards((prev) => [...prev, ...next])
  }

  function assignBacksInOrder(files: FileList | null) {
    if (!files?.length) return
    const backs = Array.from(files)
    setCards((prev) => {
      const updated = [...prev]
      let bi = 0
      for (let i = 0; i < updated.length && bi < backs.length; i++) {
        if (!updated[i].backUrl) {
          updated[i] = {
            ...updated[i],
            backUrl: URL.createObjectURL(backs[bi]),
          }
          bi++
        }
      }
      return updated
    })
  }

  function startPairFront(files: FileList | null) {
    const file = files?.[0]
    if (!file) return
    pendingPairFront.current = file
    pairBackRef.current?.click()
  }

  function finishPairBack(files: FileList | null) {
    const front = pendingPairFront.current
    const back = files?.[0]
    pendingPairFront.current = null
    if (pairFrontRef.current) pairFrontRef.current.value = ''
    if (pairBackRef.current) pairBackRef.current.value = ''
    if (!front) return

    const card: IdCard = {
      id: makeId(),
      name: fileBaseName(front),
      frontUrl: URL.createObjectURL(front),
      backUrl: back ? URL.createObjectURL(back) : null,
    }
    setCards((prev) => [...prev, card])
  }

  function setCardBack(cardId: string, file: File | null) {
    setCards((prev) =>
      prev.map((card) => {
        if (card.id !== cardId) return card
        if (card.backUrl) URL.revokeObjectURL(card.backUrl)
        return {
          ...card,
          backUrl: file ? URL.createObjectURL(file) : null,
        }
      }),
    )
  }

  function removeCard(cardId: string) {
    setCards((prev) => {
      const target = prev.find((c) => c.id === cardId)
      if (target) {
        URL.revokeObjectURL(target.frontUrl)
        if (target.backUrl) URL.revokeObjectURL(target.backUrl)
      }
      return prev.filter((c) => c.id !== cardId)
    })
  }

  function moveCard(cardId: string, dir: -1 | 1) {
    setCards((prev) => {
      const index = prev.findIndex((c) => c.id === cardId)
      const next = index + dir
      if (index < 0 || next < 0 || next >= prev.length) return prev
      const copy = [...prev]
      ;[copy[index], copy[next]] = [copy[next], copy[index]]
      return copy
    })
  }

  function clearAll() {
    setCards((prev) => {
      revokeUrls(prev)
      return []
    })
  }

  const printSheets =
    printSide === 'back' && reverseBackSheets ? [...sheets].reverse() : sheets

  return (
    <div className="app" data-printing={printSide ? 'true' : 'false'}>
      <div className="screen-ui">
        <header className="hero">
          <div className="hero-copy">
            <p className="brand">ID Sheet Printer</p>
            <h1>Print 10 cards per sheet, fronts then flipped backs.</h1>
            <p className="lede">
              Cards are {layout.cardW}&nbsp;×&nbsp;{layout.cardH}&nbsp;mm on{' '}
              {layout.paperW}&nbsp;×&nbsp;{layout.paperH}&nbsp;mm paper (2×5), with{' '}
              {layout.marginX}&nbsp;mm edge margins and a {layout.columnGap}&nbsp;mm
              center gap. After printing fronts, flip the stack horizontally and
              print backs — columns are mirrored so each back lands behind its front.
            </p>
          </div>
          <div className="hero-stats" aria-hidden="true">
            <div>
              <span>{cards.length}</span>
              <small>IDs loaded</small>
            </div>
            <div>
              <span>{sheets.length}</span>
              <small>sheets</small>
            </div>
            <div>
              <span>{CARDS_PER_SHEET}</span>
              <small>per sheet</small>
            </div>
          </div>
        </header>

        <section className="panel actions">
          <div className="action-row">
            <button type="button" className="btn primary" onClick={() => frontInputRef.current?.click()}>
              Add front images
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => backInputRef.current?.click()}
              disabled={!cards.some((c) => !c.backUrl)}
            >
              Assign backs in order
            </button>
            <button type="button" className="btn" onClick={() => pairFrontRef.current?.click()}>
              Add front + back pair
            </button>
            <button type="button" className="btn danger" onClick={clearAll} disabled={!cards.length}>
              Clear all
            </button>
          </div>

          <div className="toggles">
            <label htmlFor={rotateId}>
              <input
                id={rotateId}
                type="checkbox"
                checked={rotateCards}
                onChange={(e) => setRotateCards(e.target.checked)}
              />
              Rotate IDs 90° (page stays 200×300)
            </label>
            <label htmlFor={flipId}>
              <input
                id={flipId}
                type="checkbox"
                checked={flipHorizontal}
                onChange={(e) => setFlipHorizontal(e.target.checked)}
              />
              Flip IDs horizontally
            </label>
            <label htmlFor={guidesId}>
              <input
                id={guidesId}
                type="checkbox"
                checked={showGuides}
                onChange={(e) => setShowGuides(e.target.checked)}
              />
              Cut guides
            </label>
            <label htmlFor={reverseId}>
              <input
                id={reverseId}
                type="checkbox"
                checked={reverseBackSheets}
                onChange={(e) => setReverseBackSheets(e.target.checked)}
              />
              Reverse back sheet order (for flipping the whole stack)
            </label>
          </div>

          <div className="print-row">
            <button
              type="button"
              className="btn primary"
              disabled={!cards.length}
              onClick={() => setPrintSide('front')}
            >
              Print fronts
            </button>
            <button
              type="button"
              className="btn primary"
              disabled={!cards.length || missingBacks === cards.length}
              onClick={() => setPrintSide('back')}
            >
              Print backs (mirrored)
            </button>
            {missingBacks > 0 && cards.length > 0 && (
              <p className="hint warn">{missingBacks} card{missingBacks === 1 ? '' : 's'} missing a back image.</p>
            )}
          </div>

          <ol className="howto">
            <li>Add front images (order = print order).</li>
            <li>Assign back images in the same order, or add pairs.</li>
            <li>
              Use <strong>Rotate IDs 90°</strong> or <strong>Flip IDs horizontally</strong>
              if images need correcting — page layout stays the same.
            </li>
            <li>Print fronts. Use actual size / 100% scale, no fit-to-page.</li>
            <li>Flip the paper stack horizontally (left ↔ right), reinsert, print backs.</li>
          </ol>

          <input
            ref={frontInputRef}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(e) => {
              addFronts(e.target.files)
              e.target.value = ''
            }}
          />
          <input
            ref={backInputRef}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(e) => {
              assignBacksInOrder(e.target.files)
              e.target.value = ''
            }}
          />
          <input
            ref={pairFrontRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => startPairFront(e.target.files)}
          />
          <input
            ref={pairBackRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => finishPairBack(e.target.files)}
          />
        </section>

        {cards.length > 0 && (
          <section className="panel queue">
            <h2>Card queue</h2>
            <ul className="card-list">
              {cards.map((card, index) => (
                <li key={card.id}>
                  <div className="thumbs">
                    <img src={card.frontUrl} alt="" />
                    {card.backUrl ? (
                      <img src={card.backUrl} alt="" />
                    ) : (
                      <button
                        type="button"
                        className="back-slot"
                        onClick={() => {
                          const input = document.createElement('input')
                          input.type = 'file'
                          input.accept = 'image/*'
                          input.onchange = () => {
                            const file = input.files?.[0] ?? null
                            setCardBack(card.id, file)
                          }
                          input.click()
                        }}
                      >
                        + back
                      </button>
                    )}
                  </div>
                  <div className="meta">
                    <strong>
                      #{index + 1} · sheet {Math.floor(index / CARDS_PER_SHEET) + 1}
                    </strong>
                    <span>{card.name}</span>
                  </div>
                  <div className="row-actions">
                    <button type="button" onClick={() => moveCard(card.id, -1)} disabled={index === 0}>
                      ↑
                    </button>
                    <button
                      type="button"
                      onClick={() => moveCard(card.id, 1)}
                      disabled={index === cards.length - 1}
                    >
                      ↓
                    </button>
                    <button type="button" className="danger-text" onClick={() => removeCard(card.id)}>
                      Remove
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="panel preview">
          <h2>Sheet preview</h2>
          {!sheets.length ? (
            <p className="empty">Add ID images to preview sheets.</p>
          ) : (
            <div className="preview-grid">
              {sheets.map((sheet, sheetIndex) => (
                <div key={`front-preview-${sheetIndex}`} className="preview-block">
                  <p>Sheet {sheetIndex + 1} · Front</p>
                  <PaperSheet
                    sheet={sheet}
                    side="front"
                    layout={layout}
                    rotateIds={rotateCards}
                    flipHorizontal={flipHorizontal}
                    showGuides={showGuides}
                    label={`F${sheetIndex + 1}`}
                  />
                  <p>Sheet {sheetIndex + 1} · Back (mirrored for horizontal flip)</p>
                  <PaperSheet
                    sheet={sheet}
                    side="back"
                    layout={layout}
                    rotateIds={rotateCards}
                    flipHorizontal={flipHorizontal}
                    showGuides={showGuides}
                    label={`B${sheetIndex + 1}`}
                  />
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <div className="print-root" aria-hidden={!printSide}>
        {printSide &&
          printSheets.map((sheet, sheetIndex) => (
            <PaperSheet
              key={`print-${printSide}-${sheetIndex}`}
              sheet={sheet}
              side={printSide}
              layout={layout}
              rotateIds={rotateCards}
              flipHorizontal={flipHorizontal}
              showGuides={showGuides}
              label={`${printSide === 'front' ? 'F' : 'B'}${sheetIndex + 1}`}
            />
          ))}
      </div>
    </div>
  )
}

function PaperSheet({
  sheet,
  side,
  layout,
  rotateIds,
  flipHorizontal,
  showGuides,
  label,
}: {
  sheet: IdCard[]
  side: SheetSide
  layout: SheetLayout
  rotateIds: boolean
  flipHorizontal: boolean
  showGuides: boolean
  label: string
}) {
  const slots: Array<IdCard | undefined> = Array.from({ length: CARDS_PER_SHEET }, (_, i) => sheet[i])
  const fitClass = [
    'card-fit',
    rotateIds ? 'is-rotated' : '',
    flipHorizontal ? 'is-flipped' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div
      className={`sheet ${showGuides ? 'with-guides' : ''}`}
      data-side={side}
      style={{
        width: `${layout.paperW}mm`,
        height: `${layout.paperH}mm`,
        padding: `${layout.marginY}mm ${layout.marginX}mm`,
        ['--preview-scale' as string]: '0.42',
        ['--paper-w' as string]: `${layout.paperW}mm`,
        ['--paper-h' as string]: `${layout.paperH}mm`,
        ['--card-w' as string]: `${layout.cardW}mm`,
        ['--card-h' as string]: `${layout.cardH}mm`,
      }}
    >
      <span className="sheet-label">{label}</span>
      <div
        className="sheet-grid"
        style={{
          gridTemplateColumns: `repeat(${layout.cols}, ${layout.cardW}mm)`,
          gridTemplateRows: `repeat(${layout.rows}, ${layout.cardH}mm)`,
          columnGap: `${layout.columnGap}mm`,
        }}
      >
        {Array.from({ length: layout.rows }, (_, row) =>
          Array.from({ length: layout.cols }, (_, col) => {
            const card = slotCard(slots, row, col, side, layout.cols)
            const imageUrl = side === 'front' ? card?.frontUrl : card?.backUrl
            return (
              <div key={`${row}-${col}`} className="card-cell">
                {imageUrl ? (
                  <div className={fitClass}>
                    <img src={imageUrl} alt="" />
                  </div>
                ) : (
                  <div className="card-empty">{side === 'back' && card ? 'No back' : ''}</div>
                )}
              </div>
            )
          }),
        )}
      </div>
    </div>
  )
}
