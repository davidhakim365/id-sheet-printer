import { useEffect, useId, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { AppTabs, type AppTab } from './AppTabs'
import {
  buildIdZip,
  clampRect,
  defaultBarcodeRect,
  downloadBlob,
  loadImage,
  type RectPct,
} from './compose'

function makeId() {
  return crypto.randomUUID()
}

function fileBaseName(file: File) {
  return file.name.replace(/\.[^.]+$/, '')
}

type ImageAsset = {
  id: string
  name: string
  url: string
}

type Handle = 'move' | 'nw' | 'ne' | 'sw' | 'se'

type DragState = {
  handle: Handle
  startX: number
  startY: number
  startRect: RectPct
  stageW: number
  stageH: number
}

export default function BulkIds({
  tab,
  onTab,
}: {
  tab: AppTab
  onTab: (tab: AppTab) => void
}) {
  const [template, setTemplate] = useState<ImageAsset | null>(null)
  const [layoutBarcode, setLayoutBarcode] = useState<ImageAsset | null>(null)
  const [dataset, setDataset] = useState<ImageAsset[]>([])
  const [rect, setRect] = useState<RectPct>({ x: 29, y: 78, w: 42, h: 12 })
  const [lockAspect, setLockAspect] = useState(false)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const templateInputRef = useRef<HTMLInputElement>(null)
  const barcodeInputRef = useRef<HTMLInputElement>(null)
  const datasetInputRef = useRef<HTMLInputElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<DragState | null>(null)
  const templateRef = useRef(template)
  const layoutBarcodeRef = useRef(layoutBarcode)
  const datasetRef = useRef(dataset)
  const lockId = useId()
  templateRef.current = template
  layoutBarcodeRef.current = layoutBarcode
  datasetRef.current = dataset

  useEffect(() => {
    return () => {
      const currentTemplate = templateRef.current
      const currentBarcode = layoutBarcodeRef.current
      if (currentTemplate) URL.revokeObjectURL(currentTemplate.url)
      if (currentBarcode) URL.revokeObjectURL(currentBarcode.url)
      for (const item of datasetRef.current) URL.revokeObjectURL(item.url)
    }
  }, [])

  useEffect(() => {
    function onMove(event: PointerEvent) {
      const drag = dragRef.current
      if (!drag) return
      const dx = ((event.clientX - drag.startX) / drag.stageW) * 100
      const dy = ((event.clientY - drag.startY) / drag.stageH) * 100
      const start = drag.startRect
      let next: RectPct

      if (drag.handle === 'move') {
        next = { ...start, x: start.x + dx, y: start.y + dy }
      } else if (drag.handle === 'se') {
        next = { ...start, w: start.w + dx, h: start.h + dy }
      } else if (drag.handle === 'nw') {
        next = { x: start.x + dx, y: start.y + dy, w: start.w - dx, h: start.h - dy }
      } else if (drag.handle === 'ne') {
        next = { x: start.x, y: start.y + dy, w: start.w + dx, h: start.h - dy }
      } else {
        next = { x: start.x + dx, y: start.y, w: start.w - dx, h: start.h + dy }
      }

      if (lockAspect && drag.handle !== 'move') {
        const aspect = start.w / start.h
        if (drag.handle === 'se' || drag.handle === 'ne') {
          next.h = next.w / aspect
          if (drag.handle === 'ne') next.y = start.y + start.h - next.h
        } else {
          next.w = next.h * aspect
          next.x = start.x + start.w - next.w
          if (drag.handle === 'nw') next.y = start.y + start.h - next.h
        }
      }

      setRect(clampRect(next))
    }

    function onUp() {
      dragRef.current = null
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
  }, [lockAspect])

  async function placeDefaultRect(templateUrl: string, barcodeUrl: string) {
    const [t, b] = await Promise.all([loadImage(templateUrl), loadImage(barcodeUrl)])
    setRect(
      defaultBarcodeRect(t.naturalWidth, t.naturalHeight, b.naturalWidth, b.naturalHeight),
    )
  }

  async function setTemplateFile(file: File | undefined) {
    if (!file) return
    if (template) URL.revokeObjectURL(template.url)
    const next = { id: makeId(), name: fileBaseName(file), url: URL.createObjectURL(file) }
    setTemplate(next)
    setError(null)
    if (layoutBarcode) {
      try {
        await placeDefaultRect(next.url, layoutBarcode.url)
      } catch {
        setError('Could not read the blank ID or barcode image.')
      }
    }
  }

  async function setLayoutBarcodeFile(file: File | undefined) {
    if (!file) return
    if (layoutBarcode) URL.revokeObjectURL(layoutBarcode.url)
    const next = { id: makeId(), name: fileBaseName(file), url: URL.createObjectURL(file) }
    setLayoutBarcode(next)
    setError(null)
    if (template) {
      try {
        await placeDefaultRect(template.url, next.url)
      } catch {
        setError('Could not read the blank ID or barcode image.')
      }
    }
  }

  function addDatasetFiles(files: FileList | null) {
    if (!files?.length) return
    const next = Array.from(files).map((file) => ({
      id: makeId(),
      name: fileBaseName(file),
      url: URL.createObjectURL(file),
    }))
    setDataset((prev) => [...prev, ...next])
    setError(null)
  }

  function removeDatasetItem(id: string) {
    setDataset((prev) => {
      const target = prev.find((item) => item.id === id)
      if (target) URL.revokeObjectURL(target.url)
      return prev.filter((item) => item.id !== id)
    })
  }

  function clearAll() {
    if (template) URL.revokeObjectURL(template.url)
    if (layoutBarcode) URL.revokeObjectURL(layoutBarcode.url)
    for (const item of dataset) URL.revokeObjectURL(item.url)
    setTemplate(null)
    setLayoutBarcode(null)
    setDataset([])
    setProgress(null)
    setError(null)
    if (templateInputRef.current) templateInputRef.current.value = ''
    if (barcodeInputRef.current) barcodeInputRef.current.value = ''
    if (datasetInputRef.current) datasetInputRef.current.value = ''
  }

  function startDrag(handle: Handle, event: ReactPointerEvent) {
    event.preventDefault()
    event.stopPropagation()
    const stage = stageRef.current
    if (!stage) return
    const box = stage.getBoundingClientRect()
    dragRef.current = {
      handle,
      startX: event.clientX,
      startY: event.clientY,
      startRect: rect,
      stageW: box.width,
      stageH: box.height,
    }
  }

  async function resetPlacement() {
    if (!template || !layoutBarcode) return
    await placeDefaultRect(template.url, layoutBarcode.url)
  }

  async function generateZip() {
    if (!template || !layoutBarcode || !dataset.length) return
    setBusy(true)
    setError(null)
    setProgress({ done: 0, total: dataset.length })
    try {
      const blob = await buildIdZip(template.url, dataset, rect, (done, total) => {
        setProgress({ done, total })
      })
      downloadBlob(blob, 'bulk-ids.zip')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not generate the ID set.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="app">
      <div className="screen-ui">
        <AppTabs value={tab} onChange={onTab} />
        <header className="hero">
          <div className="hero-copy">
            <p className="brand">ID Sheet Printer</p>
            <h1>Stamp barcodes onto a blank ID, then export a JPEG set.</h1>
            <p className="lede">
              Load one front without a barcode, place a sample barcode on it, then apply a
              folder of barcode images. Each result is saved as a JPEG in a ZIP.
            </p>
          </div>
          <div className="hero-stats" aria-hidden="true">
            <div>
              <span>{template ? 1 : 0}</span>
              <small>blank ID</small>
            </div>
            <div>
              <span>{dataset.length}</span>
              <small>barcodes</small>
            </div>
            <div>
              <span>JPG</span>
              <small>ZIP export</small>
            </div>
          </div>
        </header>

        <section className="panel actions">
          <div className="action-row">
            <button type="button" className="btn primary" onClick={() => templateInputRef.current?.click()}>
              {template ? 'Replace blank ID' : 'Add blank ID'}
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => barcodeInputRef.current?.click()}
              disabled={!template}
            >
              {layoutBarcode ? 'Replace layout barcode' : 'Add barcode to place'}
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => datasetInputRef.current?.click()}
              disabled={!template}
            >
              Add barcode dataset
            </button>
            <button
              type="button"
              className="btn danger"
              onClick={clearAll}
              disabled={!template && !layoutBarcode && !dataset.length}
            >
              Clear all
            </button>
          </div>

          <div className="toggles">
            <label htmlFor={lockId}>
              <input
                id={lockId}
                type="checkbox"
                checked={lockAspect}
                onChange={(e) => setLockAspect(e.target.checked)}
              />
              Lock barcode aspect ratio
            </label>
          </div>

          <div className="print-row">
            <button
              type="button"
              className="btn primary"
              disabled={!template || !layoutBarcode || !dataset.length || busy}
              onClick={() => void generateZip()}
            >
              {busy ? 'Generating…' : `Generate ${dataset.length} JPEG${dataset.length === 1 ? '' : 's'} ZIP`}
            </button>
            <button
              type="button"
              className="btn"
              disabled={!template || !layoutBarcode || busy}
              onClick={() => void resetPlacement()}
            >
              Reset barcode position
            </button>
            {progress && (
              <p className="hint">
                {progress.done} / {progress.total} IDs encoded
              </p>
            )}
            {error && <p className="hint warn">{error}</p>}
          </div>

          <ol className="howto">
            <li>Add the blank front ID (no barcode on it).</li>
            <li>Add one barcode and drag or resize it on the ID.</li>
            <li>Add the barcode dataset — each file replaces that barcode in the same place.</li>
            <li>Generate a ZIP of JPEGs, named after each barcode file.</li>
          </ol>

          <input
            ref={templateInputRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              void setTemplateFile(e.target.files?.[0])
              e.target.value = ''
            }}
          />
          <input
            ref={barcodeInputRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              void setLayoutBarcodeFile(e.target.files?.[0])
              e.target.value = ''
            }}
          />
          <input
            ref={datasetInputRef}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(e) => {
              addDatasetFiles(e.target.files)
              e.target.value = ''
            }}
          />
        </section>

        <section className="panel preview">
          <h2>Placement</h2>
          {!template ? (
            <p className="empty">Add a blank ID to place the barcode.</p>
          ) : (
            <div className="bulk-stage-wrap">
              <div ref={stageRef} className="bulk-stage">
                <img src={template.url} alt="Blank ID template" draggable={false} />
                {layoutBarcode && (
                  <button
                    type="button"
                    className="barcode-box"
                    aria-label="Barcode overlay — drag to move, corners to resize"
                    style={{
                      left: `${rect.x}%`,
                      top: `${rect.y}%`,
                      width: `${rect.w}%`,
                      height: `${rect.h}%`,
                    }}
                    onPointerDown={(event) => startDrag('move', event)}
                  >
                    <img src={layoutBarcode.url} alt="" draggable={false} />
                    {(['nw', 'ne', 'sw', 'se'] as const).map((handle) => (
                      <span
                        key={handle}
                        className={`barcode-handle ${handle}`}
                        onPointerDown={(event) => startDrag(handle, event)}
                      />
                    ))}
                  </button>
                )}
              </div>
              {!layoutBarcode && <p className="hint">Add a barcode to drag and resize on this ID.</p>}
            </div>
          )}
        </section>

        {dataset.length > 0 && (
          <section className="panel queue">
            <h2>Barcode dataset · {dataset.length}</h2>
            <ul className="barcode-grid">
              {dataset.map((item) => (
                <li key={item.id}>
                  <img src={item.url} alt="" />
                  <span>{item.name}</span>
                  <button type="button" className="danger-text" onClick={() => removeDatasetItem(item.id)}>
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  )
}
