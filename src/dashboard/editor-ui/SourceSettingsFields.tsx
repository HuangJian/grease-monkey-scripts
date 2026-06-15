import type { BadgeType } from '../types'

export type SourceSettingsFieldsProps = {
  tabTitle: string
  onTabTitleChange: (val: string) => void
  priority: number
  onPriorityChange: (val: number) => void
  badgeType: string
  onBadgeTypeChange: (val: BadgeType) => void
}

export function SourceSettingsFields({
  tabTitle,
  onTabTitleChange,
  priority,
  onPriorityChange,
  badgeType,
  onBadgeTypeChange,
}: SourceSettingsFieldsProps) {
  return (
    <div class="gm-sp-editor-source-settings">
      <label class="gm-sp-editor-row">
        <span>Tab 标题</span>
        <input
          type="text"
          class="gm-sp-input"
          placeholder="留空使用默认"
          value={tabTitle}
          onInput={(e) => onTabTitleChange((e.target as HTMLInputElement).value)}
        />
      </label>
      <label class="gm-sp-editor-row">
        <span>优先级</span>
        <input
          type="number"
          class="gm-sp-input"
          value={priority}
          onInput={(e) => onPriorityChange(Number((e.target as HTMLInputElement).value))}
        />
      </label>
      <label class="gm-sp-editor-row">
        <span>Badge 显示</span>
        <select
          value={badgeType}
          onChange={(e) => onBadgeTypeChange((e.target as HTMLSelectElement).value as BadgeType)}
        >
          <option value="default">默认</option>
          <option value="none">不显示</option>
          <option value="allUnread">全部未读数</option>
          <option value="todayUnread">今日未读数</option>
        </select>
      </label>
    </div>
  )
}
