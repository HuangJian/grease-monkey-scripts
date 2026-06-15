import {
  HUPU_AUTHOR_TAGS_KEY,
  HUPU_AUTHOR_TAGS_LS_KEY,
  type AuthorTagMap,
  parseAuthorTagMap,
} from '../../shared/author-labels'
import type { Runtime } from '../../runtime'
import { loadConfigSection } from '../config'
import type { Source, SourceHeaderProps, SourceSettings } from '../types'
import type { DateFilter } from '../date-filter'
import { DateFilterGroup } from '../date-filter'
import { HupuComponent } from './component'
import { createExpandCollapse } from '../expand-collapse'
import { createHupuEditor } from './editor/form'
import { fetchHupu } from './fetcher'
import { mergeBoardPosts, selectPostsPerBoard } from './scoring'
import { createHupuState } from './state'
import type { HupuPost, HupuSourceOptions } from './types'

export type HupuRenderData = Record<string, HupuPost[]>

export function createHupuSource(options: HupuSourceOptions): Source<HupuRenderData> {
  const state = createHupuState()
  const expandCollapse = createExpandCollapse()
  let authorTagMap: AuthorTagMap = {}
  const headerState: { dateFilter: DateFilter } = { dateFilter: '全' }

  async function syncAuthorTags(runtime: Runtime): Promise<void> {
    try {
      const host = runtime.location.hostname
      const isHupu = host === 'hupu.com' || host.endsWith('.hupu.com')
      if (isHupu) {
        const raw = localStorage.getItem(HUPU_AUTHOR_TAGS_LS_KEY)
        if (raw) {
          authorTagMap = parseAuthorTagMap(JSON.parse(raw))
          await runtime.setValue(HUPU_AUTHOR_TAGS_KEY, authorTagMap)
          return
        }
      }
      const stored = await runtime.getValue<unknown>(HUPU_AUTHOR_TAGS_KEY, null)
      authorTagMap = stored ? parseAuthorTagMap(stored) : {}
    } catch {
      authorTagMap = {}
    }
  }

  return {
    id: 'hupu',
    title: '虎扑热帖',
    ttlMs: options.ttlMinutes * 60_000,
    groupId: 'browse',
    order: 4,
    headerState,
    RenderHeader: (props: SourceHeaderProps<HupuRenderData>) => (
      <DateFilterGroup
        value={headerState.dateFilter}
        onChange={(f) => {
          headerState.dateFilter = f
          props.onHeaderChange?.()
        }}
      />
    ),
    async fetch(runtime, _prevData) {
      const fresh = await loadFreshHupuOptions(runtime, options)
      console.debug('[gm-dashboard] hupu.fetch start boards=', fresh.boards)
      await state.loadFromStorage(runtime)
      await syncAuthorTags(runtime)
      const [fetchResult, history] = await Promise.all([
        fetchHupu(runtime, fresh),
        state.loadHistory(runtime, fresh.historyDays),
      ])
      console.debug(
        '[gm-dashboard] hupu.fetch ok boards=',
        fetchResult.boards.map((p) => p.board),
        'history=',
        history.length,
        'partial=',
        fetchResult.partialErrors,
      )
      const merged = mergeBoardPosts(fetchResult.boards, history)
      const now = Date.now()
      const selected = selectPostsPerBoard(merged, { ...fresh, now })
      const visible: HupuRenderData = {}
      selected.forEach((posts, board) => {
        visible[board] = state.filterVisible(posts)
      })
      const todayStartMs = new Date(now)
      todayStartMs.setUTCHours(0, 0, 0, 0)
      const todayMs = todayStartMs.getTime()
      const allFetched: HupuPost[] = fetchResult.boards.flatMap(({ posts }) =>
        posts.filter((p) => {
          if (p.created < todayMs) return p.replies >= fresh.olderMinReplies
          return p.replies >= fresh.todayMinReplies
        }),
      )
      await state.saveHistory(runtime, allFetched, fresh.historyDays)
      await state.saveToStorage(runtime)
      return visible
    },
    RenderComponent: ({ data, root, runtime }) => (
      <HupuComponent
        data={data}
        root={root}
        runtime={runtime}
        state={state}
        expandCollapse={expandCollapse}
        authorTagMap={authorTagMap}
        dateFilter={headerState.dateFilter}
      />
    ),
    async loadState(runtime) {
      await state.loadFromStorage(runtime)
      await syncAuthorTags(runtime)
    },
    createEditor(settings: SourceSettings) {
      return createHupuEditor(options, settings)
    },
  }
}

function coerceHupuOptions(
  raw: Record<string, unknown>,
  fallback: HupuSourceOptions,
): HupuSourceOptions {
  return {
    ttlMinutes:
      typeof raw['ttlMinutes'] === 'number' ? (raw['ttlMinutes'] as number) : fallback.ttlMinutes,
    boards:
      Array.isArray(raw['boards']) && (raw['boards'] as unknown[]).length > 0
        ? (raw['boards'] as unknown[]).map((s) => String(s)).filter((s) => s.length > 0)
        : fallback.boards,
    historyDays:
      typeof raw['historyDays'] === 'number'
        ? (raw['historyDays'] as number)
        : fallback.historyDays,
    todayMinReplies:
      typeof raw['todayMinReplies'] === 'number'
        ? (raw['todayMinReplies'] as number)
        : fallback.todayMinReplies,
    olderMinReplies:
      typeof raw['olderMinReplies'] === 'number'
        ? (raw['olderMinReplies'] as number)
        : fallback.olderMinReplies,
    ageHalfLifeDays:
      typeof raw['ageHalfLifeDays'] === 'number'
        ? (raw['ageHalfLifeDays'] as number)
        : fallback.ageHalfLifeDays,
    lightsWeight:
      typeof raw['lightsWeight'] === 'number'
        ? (raw['lightsWeight'] as number)
        : fallback.lightsWeight,
    repliesWeight:
      typeof raw['repliesWeight'] === 'number'
        ? (raw['repliesWeight'] as number)
        : fallback.repliesWeight,
  }
}

export async function loadFreshHupuOptions(
  runtime: Runtime,
  fallback: HupuSourceOptions,
): Promise<HupuSourceOptions> {
  return loadConfigSection(runtime, 'hupu', fallback, (raw) => coerceHupuOptions(raw, fallback))
}
