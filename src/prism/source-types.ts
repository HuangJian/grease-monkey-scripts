// Cross-feature source aggregation. This is the single sanctioned module that
// imports every feature's data type to form the `AnySource` discriminated union
// (§2.6) and the `readSourceData` erasure point. It imports only core `types`
// (never feature config), keeping feature dirs free of cross-feature imports and
// `../types` a true leaf.
import type { Source, CachedSource } from './types'
import type { V2exTopic } from './v2ex/types'
import type { WeatherData } from './weather/types'
import type { NovelData } from './novels/types'
import type { RedditRenderData } from './reddit/source'
import type { HupuRenderData } from './hupu/source'
import type { TnewsItem } from './tnews/types'
import type { XueqiuRenderData } from './xueqiu/types'
import type { XitData } from './xit/types'
import type { MiscData } from './misc/types'

export type AnySource =
  | Source<V2exTopic[], 'v2ex'>
  | Source<WeatherData, 'weather'>
  | Source<NovelData, 'novels'>
  | Source<RedditRenderData, 'reddit'>
  | Source<HupuRenderData, 'hupu'>
  | Source<TnewsItem[], 'tnews'>
  | Source<XueqiuRenderData, 'xueqiu-news'>
  | Source<XueqiuRenderData, 'xueqiu-hot'>
  | Source<XitData, 'xit'>
  | Source<MiscData, 'misc'>

/**
 * Single, type-safe cache-read erasure point (§2.6). Given a (possibly
 * narrowed) `Source<T>`, recovers `T | null` from a `CachedSource<unknown>`
 * without scattering `as T | null` / `as unknown` across the render layer.
 * When `source` is a discriminated-union member (e.g. after `findSource` +
 * `id` narrowing), `T` is the source's real data type; in a heterogeneous
 * `CardGroup` loop `T` degenerates to the union and the cast degrades to
 * `as unknown` — which is the inherent erasure documented in S8.plan.md §1.7.
 */
export function readSourceData<T, Id extends string>(
  _source: Source<T, Id>,
  cached: CachedSource<unknown> | null,
): T | null {
  return (cached?.data ?? null) as T | null
}
