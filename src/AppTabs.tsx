export type AppTab = 'print' | 'bulk' | 'private'

export function AppTabs({
  value,
  onChange,
}: {
  value: AppTab
  onChange: (tab: AppTab) => void
}) {
  return (
    <nav className="app-tabs" aria-label="App sections">
      <button type="button" data-active={value === 'print'} onClick={() => onChange('print')}>
        Print sheets
      </button>
      <button type="button" data-active={value === 'bulk'} onClick={() => onChange('bulk')}>
        Bulk IDs
      </button>
      <button type="button" data-active={value === 'private'} onClick={() => onChange('private')}>
        Private life
      </button>
    </nav>
  )
}
