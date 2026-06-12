export type TabsItem = {
  id: string
  text: string
  badge?: string | number | null
}

export type TabsProps = {
  items: TabsItem[]
  activeId: string
  onActive: (id: string) => void
}

export function Tabs({ items, activeId, onActive }: TabsProps) {
  return (
    <div class="gm-sp-tabs" role="tablist">
      {items.map((item) => {
        const active = item.id === activeId
        const showBadge = item.badge != null && item.badge !== 0 && item.badge !== ''
        return (
          <button
            type="button"
            class={`gm-sp-tab${active ? ' gm-sp-tab-active' : ''}`}
            role="tab"
            aria-selected={active}
            data-tab-id={item.id}
            onClick={() => onActive(item.id)}
          >
            <span>{item.text}</span>
            <span class="gm-sp-tab-badge" hidden={showBadge ? undefined : true}>
              {item.badge}
            </span>
          </button>
        )
      })}
    </div>
  )
}
