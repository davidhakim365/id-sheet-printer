import { useState } from 'react'
import type { AppTab } from './AppTabs'
import BulkIds from './BulkIds'
import PrintSheets from './PrintSheets'
import './App.css'

export default function App() {
  const [tab, setTab] = useState<AppTab>('print')

  if (tab === 'bulk') {
    return <BulkIds tab={tab} onTab={setTab} />
  }

  return <PrintSheets tab={tab} onTab={setTab} />
}
