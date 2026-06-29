// commands to convert image to base64 data uri
// echo "data:image/x-icon;base64,$(base64 -b 0 -i ./xxx.ico)"
// echo "data:image/png;base64,$(base64 -b 0 -i ./xxx.png)"
// echo "data:image/jpg;base64,$(base64 -b 0 -i ./xxx.jpg)"
const DATA_URI_RE = /^data:image\/(?:png|jpe?g|x-icon|vnd\.microsoft\.icon);base64,/i

function isSvgString(text: string): boolean {
  return text.trimStart().startsWith('<svg')
}

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
            key={item.id}
            type="button"
            class={`gm-sp-tab${active ? ' gm-sp-tab-active' : ''}`}
            role="tab"
            aria-selected={active}
            data-tab-id={item.id}
            onClick={() => onActive(item.id)}
          >
            <span>
              {isSvgString(item.text) ? (
                <span class="gm-sp-tab-icon" dangerouslySetInnerHTML={{ __html: item.text }} />
              ) : DATA_URI_RE.test(item.text) ? (
                <img src={item.text} alt="" class="gm-sp-tab-icon" />
              ) : (
                item.text
              )}
            </span>
            <span class="gm-sp-tab-badge" hidden={showBadge ? undefined : true}>
              {item.badge}
            </span>
          </button>
        )
      })}
    </div>
  )
}
