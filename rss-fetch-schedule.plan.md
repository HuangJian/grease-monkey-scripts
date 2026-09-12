# RSS 抓取调度：feed 级周期 + 条件请求

> 前置：`rss-reader.plan.md`（v1 契约、D1–D9 决策）。本 plan 只改抓取调度，不动视图/未读状态/OPML。

## 0. 一句话

把「整源一个 TTL」改成「**每个 feed 自己的到期时间**」：解析 feed 自报的更新周期、对未变更的源发条件请求拿 304、给单个失败的 feed 独立退避；顺带修掉 RSS codec 白名单丢字段导致「已禁用的源刷新后复活」。

## 1. 目标 / 非目标

**目标**

1. 每个 feed 按自己的周期抓取，长期不再更新的源不占用带宽。
2. 对支持 `ETag` / `Last-Modified` 的源，未变更时零下载（304）。
3. 单个 feed 失败可以快速重试，不必等整个源周期（现状最长 123 分钟）。
4. 用户仍有一个全局下限，避免任何源被过频抓取。

**非目标**

- 不改 `@match`（后台刷新仍只在已匹配站点发生，见 `rss-reader.plan.md` O1）。
- 不做全文抓取、推送通知、`skipHours` / `skipDays`、per-feed 手动周期编辑（见 Q5 / Q3）。
- 不改 retention、摘要窗口、未读状态、OPML、视图切换。

## 2. 现状核实（已读代码 + 实测）

| #   | 事实                                                                                                              | 证据                                                                                             |
| --- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| F1  | 整源共用一份 `fetchedAt`，任一 feed 成功即整源「新鲜」，所有启用 feed 一起重抓                                    | `cache.ts:36-39` `isStale`；`refresh.ts:69-90`；`fetcher.ts:99-107`                              |
| F2  | feed 自报周期完全未解析：`<ttl>` / `sy:updatePeriod` / `sy:updateFrequency` 无任何引用                            | `shared/feed-parser.ts` 全文；`FeedParseResult` 只有 `title`/`items`                             |
| F3  | 无任何条件请求，每次整包下载                                                                                      | `shared/request.ts:79-130` 只加 UA/Accept                                                        |
| F4  | 单 feed 失败只写 `error`，不触发任何退避；且**首次**失败把 `fetchedAt` 写成 `now`（「从未成功」被记为「刚抓过」） | `fetcher.ts:108-119`（`fetchedAt: prev?.fetchedAt ?? now`）                                      |
| F5  | RSS codec 是字段白名单，`enabled` 不在其中 → 一次缓存往返即丢失；`app/group-renderer.ts:31-45` 每次渲染都从缓存读 | 实测：`compressRssFeed` 输出 keys = `["i","t","u","fa","it"]`；`migrateCache` 回读后无 `enabled` |

F5 的用户可见后果：把某个源设为「禁用」后，下一次刷新/重载卡片里它又出现了（`visibleFeeds` 判定 `enabled !== false`）。**本次要一并修掉**，否则新加的调度字段会踩同一个坑。

## 3. 设计决策

### D1 抓取状态下沉到 feed 级

`RssFeed` 承载该 feed 自己的调度状态（见 §4）。源级 `CachedSource.fetchedAt` 只保留「最后一次源级刷新时间」的展示语义，不再参与 RSS 的抓取判定。

### D2 源级 TTL 变成「检查门」：`Source.isDue(cached, now)`

`Source` 增加**可选**同步方法 `isDue`，与既有 `refreshDailyAtLocalMidnight`（`types.ts:120`）同族；`runOpportunisticRefresh` 优先用它，未实现者行为完全不变：

```ts
const isDueNow = source.isDue
  ? source.isDue(cached, now)
  : source.refreshDailyAtLocalMidnight
    ? isStaleOnDayBoundary(cached, now)
    : isStale(cached, source.ttlMs, now)
```

- RSS 实现：**至少一个「启用且到期」的 feed** → `true`（读内存 `currentOptions.feeds` 与 `cached.data` 按 url 配对）。
- `refreshSource` 不动 → 手动刷新永远可用（现状即如此，`refreshSource` 不检查 TTL）。
- 源级 `isInBackoff` 检查保留（只有「全部 feed 失败」才会写源级退避，语义不变）。
- 精度 = 触发节奏：前台 60s（`app/index.ts:30,157`）、后台 300s±60s（`:31-32,49-60`）、`visibilitychange`。**零新增配置项**。

### D3 生效周期 = `max(声明周期, 最小抓取间隔)`

```ts
resolveIntervalMs(declared, opts) =
  !opts.respectFeedPeriod || !declared ? floor : Math.max(declared, floor)
// floor = opts.ttlMinutes * 60_000
```

- `ttlMinutes` 语义从「源级刷新间隔」改为「**最小抓取间隔**」（编辑器标签同步改），默认值不动（见 Q4）。
- 声明周期的解析（`feed-parser.ts`，channel/feed 级元素）：

| 来源                                                                                                  | 折算                                                                                    |
| ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| RSS 2.0 `<ttl>`（整数分钟）                                                                           | `n × 60_000`                                                                            |
| RSS 1.0 `sy:updatePeriod` ∈ {hourly, daily, weekly, monthly, yearly} × `sy:updateFrequency`（缺省 1） | 60 / 1440 / 10080 / 43200 / 525600 分钟 × freq                                          |
| 两者同时存在                                                                                          | **取较小者**（各自语义都是「不必更频繁」，取小者更贴近「更新节奏」；仍受 `floor` 保护） |
| 缺失 / 非法（≤0、非数字、未知 period）                                                                | 视为未声明 → 用 `floor`                                                                 |

### D4 「尊重源声明」是开关

新增 `RssSourceOptions.respectFeedPeriod: boolean`，默认 `true`。关闭 = 全部按 `floor`（行为等价于「只改了检查粒度」），给用户退路，也便于 A/B 对比。

### D5 条件请求（ETag / Last-Modified）

用 `requestTextWithHeaders`（`request.ts:79-121`，已能拿到 `status` 与原始响应头；304 不是 >=400，不会被 reject）：

```ts
headers = { UA, Accept, ...(prev?.etag && { 'If-None-Match': prev.etag }),
                        ...(prev?.lastModified && { 'If-Modified-Since': prev.lastModified }) }
status === 304 → { ...prev, fetchedAt: now, attemptedAt: now, error: '',
                   failureCount: undefined, nextRetryAt: undefined }   // items 原样复用，零解析
status === 200 → 解析，并把响应头的 etag / last-modified 存回（头不存在则沿用 prev 的值）
```

- 需要一个小工具 `headerValue(rawHeaders, name)`；`res.headers` 是原始头字符串（多行、`\r?\n`），返回**原样值**（ETag 的引号与 `W/` 前缀必须保留，回发时不能用改动过的值）。
- 服务器不支持 → 返回 200 全量 → 退化为现状，无副作用。
- 降级：**上一次尝试失败时整个不发条件头**（`if (!prev || prev.error) return headers`），而不是失败后再去清掉凭据。原因：一个源的全部 feed 都失败时 `fetchRssFeeds` 会 throw，`refreshSource` 只把旧 `data` 写回缓存 —— 被清掉的凭据根本不会持久化。规则必须能从「上一次的结果」推导，不能依赖存储。代价是失败后多一次全量下载。

### D6 feed 级失败退避

失败：`failureCount++`、`attemptedAt = now`、**不推进 `fetchedAt`**、`nextRetryAt = now + feedRetryDelayMs(failureCount)`。
成功 / 304：`error = ''`、`failureCount`/`nextRetryAt` 清除、`fetchedAt = now`。

```
FEED_BACKOFF_DELAYS_MS = [1m, 2m, 5m, 10m, 30m, 60m]   // 6 档封顶，长期坏源最多每小时一次
```

与 `app/refresh.ts` 的 `computeBackoffMs`（`BACKOFF_DELAYS_MS`，1/2/5/10 分钟）语义一致但**独立实现**：`rss/` 不反向依赖 `app/`。若将来要统一，再下沉到 `shared/`。

到期判定：

```ts
isFeedDue(feed, now, intervalMs) =
  now >= nextFetchAtOf(feed, intervalMs) && !(feed.nextRetryAt && now < feed.nextRetryAt)

nextFetchAtOf(feed, intervalMs) = feed.fetchedAt > 0 ? feed.fetchedAt + intervalMs : 0 // 0 = 从未成功 → 立即到期
```

### D7 codec 补白名单（含修 F5）

`codec.ts:347-370` 的 `compressRssFeed` / `expandRssFeed` 增加新字段短名，并补上 `enabled`：

| 字段                    | 短名        | 编码                                                                   |
| ----------------------- | ----------- | ---------------------------------------------------------------------- |
| `enabled: false`        | `en`        | 直接存 `0`（省略即视为启用，与 `!== false` 语义一致）                  |
| `declaredIntervalMs`    | `di`        | 存**分钟**（`/60000`，它是时长不是时间戳，不能走 `compressTimestamp`） |
| `attemptedAt`           | `aa`        | `compressTimestamp`                                                    |
| `nextRetryAt`           | `nr`        | `compressTimestamp`                                                    |
| `failureCount`          | `fc`        | 数字                                                                   |
| `etag` / `lastModified` | `et` / `lm` | 字符串                                                                 |

`CACHE_SCHEMA_VERSION` / `CACHE_CODEC_VERSION` **不 bump**：新字段全部可选，旧缓存缺字段 → 视为「从未成功」→ 下一轮各抓一次，自愈。若这次改动也让 expand 语义变化（仅新增字段），无需迁移。

### D8 源级「全部失败」只统计真正发出的请求

`fetchRssFeeds` 原来的规则是「所有 feed 的 `error` 非空 → throw」。在 feed 级调度下这会误报：一个源里所有 feed 都还没到期、但各自带着上一次的旧 `error` 时，一次请求都没发，却会把源判为失败并触发源级退避（每个 tick 一次）。

改为让 `fetchOneFeed` 额外返回 `attempted`，只有「**发出过请求**的 feed 全部失败」才 throw：

```ts
const requested = attempts.filter((a) => a.attempted)
if (requested.length > 0 && requested.every((a) => a.feed.error !== '')) throw new Error(...)
```

未发请求的 feed（未到期 / 退避中 / 已禁用）保留自己的 `error` 文本以便 UI 显示，但不参与失败判定。

### D9 手动刷新越过 feed 级门（`FetchOptions.force`）

`refreshSource` 本来就不看 TTL，但 feed 级门在 `fetchRssFeeds` 内部，所以卡片刷新按钮会「看起来没反应」——没到期的 feed 一个都不抓。§8 验收第 5 条要求手动刷新立即抓。

- `Source.fetch(runtime, prevData, options?: FetchOptions)`：新增可选第三参，`FetchOptions = { force?: boolean }`。
- `app/index.ts` 的 `doRefreshSource`（只有刷新按钮走这条路）传 `{ force: true }`；机会性刷新与后台定时不传。
- `refreshSource(runtime, source, options?)` 原样透传给 `fetch`。
- `feedSchedule` 收到 `force` 时跳过周期门与退避门，但**已禁用的 feed 仍然跳过**。副作用是有意为之：点一次就重试一次坏源，这是用户从「长周期/退避」里出来的唯一出口。
- 若点击时已有一次自动刷新在飞，`refreshAndRerender` 会复用那个 promise（同一次刷新，不再多打一次请求）。

### D10 不动的部分

`FEED_FETCH_CONCURRENCY = 4`（`rss/constants.ts:9`）、`SUMMARY_KEEP_COUNT`、`merge.ts` 的 retention/cap/sort、`state.ts` 的 TTL 规则、源级退避阶梯、`lock.ts` 跨标签页互斥。

## 4. 数据结构变更

```ts
export type RssFeed = {
  /* 既有 */ id
  title
  url
  items
  error
  fetchedAt
  enabled?
  /** 上次成功时间（语义收紧：只在成功/304 时推进）。既有字段，不改名。 */
  fetchedAt: number
  /** 每次尝试（含失败）的时间；独立于 fetchedAt（修 F4）。 */
  attemptedAt?: number
  /** 连续失败次数，成功清零。 */
  failureCount?: number
  /** 该 feed 的退避到期时间。 */
  nextRetryAt?: number
  /** feed 自报周期（ms）。0/缺失 = 未声明 → 用 floor。 */
  declaredIntervalMs?: number
  /** 条件请求凭据，原样回发。 */
  etag?: string
  lastModified?: string
}

export type RssSourceOptions = {
  /* 既有 */ feeds
  ttlMinutes
  retentionDays
  maxItemsPerFeed
  viewMode
  /** 是否按 feed 自报周期抓取；false = 全部按 ttlMinutes。默认 true。 */
  respectFeedPeriod: boolean
}
```

`Source` 新增：

```ts
/** 自定义到期判定；缺省用 ttlMs / refreshDailyAtLocalMidnight。 */
readonly isDue?: (cached: CachedSource<unknown> | null, now: number) => boolean
```

## 5. 新文件 `src/prism/rss/schedule.ts`（纯函数）

```ts
export function resolveIntervalMs(
  declaredMs: number | undefined,
  minIntervalMinutes: number,
  respectFeedPeriod: boolean,
): number
export function nextFetchAtOf(feed: RssFeed, intervalMs: number): number
export function isFeedDue(feed: RssFeed, now: number, intervalMs: number): boolean
export function feedRetryDelayMs(failureCount: number): number
export function isAnyFeedDue(
  feeds: readonly RssFeedConfig[],
  cached: ReadonlyArray<RssFeed> | null | undefined,
  options: RssSourceOptions,
  now: number,
): boolean
```

放进 `fetcher.ts` 会让「周期计算」与「IO」互相遮蔽，也难测；纯函数独立成文件后 `fetcher.ts` 只留 IO 与组装。

## 6. 实施步骤

### P1 核心（可独立验收）

1. `src/prism/shared/feed-parser.ts`：`FeedParseResult` 增加 `declaredIntervalMs?: number`；新增导出 `parseDeclaredIntervalMs(container: Element): number`（`<ttl>` + `sy:updatePeriod`/`sy:updateFrequency`，含非法值回落）。`tnews` 只用 `title`/`items`，不受影响。
2. `src/prism/rss/types.ts`：按 §4 扩展 `RssFeed` / `RssSourceOptions`。
3. `src/prism/rss/schedule.ts`（新）：§5 的函数 + `FEED_BACKOFF_DELAYS_MS`。
4. `src/prism/shared/request.ts`：新增 `headerValue(rawHeaders: string, name: string): string`（大小写不敏感、`\r?\n` 分词、值原样返回）——条件请求要读 `ETag` / `Last-Modified`，将来其它源也能用。
5. `src/prism/rss/fetcher.ts`：
   - `FetchRssFeedsOptions` 增加 `minIntervalMinutes` / `respectFeedPeriod`；
   - `fetchOneFeed` 先算 `intervalMs` / `isFeedDue`，未到期直接返回上一份 feed（**零请求**）；
   - 用 `requestTextWithHeaders` 做条件请求与 304 分支（D5）；
   - 失败分支按 D6 写 `attemptedAt` / `failureCount` / `nextRetryAt`，**不再**写 `fetchedAt`；
   - 成功分支把 `declaredIntervalMs` / `etag` / `lastModified` 落地。
6. `src/prism/rss/source.tsx`：实现 `isDue`（用 `currentOptions` + `cached.data`，见 D2），`fetch` 透传新 options。
7. `src/prism/types.ts` + `src/prism/app/refresh.ts`：加 `isDue` 类型与 `runOpportunisticRefresh` 的分支（D2）。
8. 配置链：`rss/constants.ts`（`DEFAULT_RESPECT_FEED_PERIOD`）→ `config/defaults.ts`（`rss.respectFeedPeriod`，白名单自动同步）→ `config/validate.ts`（布尔校验 + `RSS_FIELDS`）→ `rss/editor/types.ts` 的 `coerceRssOptions` → `rss/editor/form.tsx`（`ttlMinutes` 标签改「最小抓取间隔（分钟）」+ 一个「遵循源声明周期」勾选框，走 `viewMode` 那种 select/checkbox 通道，不进 `ADVANCED_FIELDS` 的数字通道）。
9. `src/prism/codec.ts`：D7 的字段补齐（含 `enabled`）。

### P2 可观测性（可选，先做 UI 文案）

10. `rss/component.tsx` 的 `FeedBlock` 头部：`每 N 分钟` + `下次 X 分钟后`（用 `nextFetchAtOf`）；错误行补「N 分钟后重试」。样式加在 `overlay/rss.css`。
11. `rss-reader.plan.md`：非目标里的「单源独立刷新间隔」改为指向本 plan（避免文档语义漂移）。

### P3 可选

12. `source.ttlMs` 记账：fetch 后把「本次生效的最大周期」存在 source 实例内存里，让卡片右上角的「数据陈旧」徽标（`card/primitives.tsx:46`，`ttlMs × 3`）不再对 daily 源长期常亮；cold start 回落 `ttlMinutes`。

## 7. 测试计划

| 文件                                    | 用例                                                                                                                                                                                                                                                                                                                                                                  |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `test/prism/rss/schedule.test.ts`（新） | `resolveIntervalMs`（未声明 / 声明更短 / 声明更长 / 开关关闭）；`isFeedDue` 边界（`fetchedAt=0`、正好到期、退避中、退避已过）；`feedRetryDelayMs` 阶梯与封顶；`isAnyFeedDue` 含禁用源与缓存缺失                                                                                                                                                                       |
| `test/prism/rss/fetcher.test.ts`        | 未到期 → `runtime.lastRequest` 为 `null`（**零请求**）；到期 → 抓一次并推进 `fetchedAt`；304（`queueResponse(url, '', 304, 'ETag: "v1"')`）→ 复用 prev items、推进 `fetchedAt`、清 error；二次请求带 `If-None-Match`（断言 `lastRequest.headers`）；失败 → 写 `attemptedAt`/`failureCount`/`nextRetryAt` 且 `fetchedAt` 不变；成功后清零；条件请求失败 → 条件头被丢弃 |
| `test/prism/shared/feed-parser.test.ts` | `<ttl>60</ttl>`；`<sy:updatePeriod>daily</sy:updatePeriod><sy:updateFrequency>2</sy:updateFrequency>`；两者并存取小者；非法值（`0`、`abc`、未知 period）→ 未声明                                                                                                                                                                                                      |
| `test/prism/refresh.test.ts`            | `isDue: () => false` 跳过；`isDue: () => true` 抓；无 `isDue` 的源行为不变；`isDue` 为 true 但源级退避未过 → 仍跳过                                                                                                                                                                                                                                                   |
| `test/prism/shared/request.test.ts`     | `headerValue` 大小写不敏感、`\r\n` 分词、缺失返回空、ETag 引号与 `W/` 原样保留                                                                                                                                                                                                                                                                                        |
| `test/prism/codec.test.ts`              | RSS 往返保留 `enabled:false`（F5 回归）+ 全部新字段；`declaredIntervalMs` 按分钟存                                                                                                                                                                                                                                                                                    |
| `test/prism/rss/source.test.ts`         | `respectFeedPeriod` 经 `coerceRssOptions` 的缺省与类型校验                                                                                                                                                                                                                                                                                                            |
| `test/prism/rss/component.test.tsx`     | P2 的周期/重试文案                                                                                                                                                                                                                                                                                                                                                    |

沿用既有脚手架：`createRuntime()` 的 `runtime.setClock/queueResponse/lastRequest/stores`（`test/runtime.ts`）。

## 8. 验收清单（手动）

| #   | 场景                                                        | 期望                                                                       |
| --- | ----------------------------------------------------------- | -------------------------------------------------------------------------- |
| 1   | 加一个 `<ttl>1440</ttl>` 的源 + 一个无声明的源，最小间隔 15 | 前者约 1 天一次，后者约 15 分钟一次（网络面板可数）                        |
| 2   | 同一源连续两次刷新                                          | 第二次带 `If-None-Match`；服务器支持时返回 304、条目不变、时间戳更新       |
| 3   | 把一个源设为禁用                                            | 刷新后卡片里**不再**出现该源（F5 回归）                                    |
| 4   | 故意加一个 404 源                                           | 该源显示「刷新失败」，其它源正常；该源按 1/2/5/10 分钟退避重试而非等整周期 |
| 5   | 手点刷新按钮                                                | 不受任何到期判定阻挡，立即抓                                               |
| 6   | 关闭「遵循源声明周期」                                      | 所有源回到统一按最小间隔抓取                                               |

## 9. 风险与已知取舍

- **R1 检查精度**：判定由 60s 前台 tick / 300s±60s 后台 tick 驱动，所以周期精度是「分钟级 + ≤5 分钟后台延迟」；关闭标签页期间不抓（`@match` 未扩大，既有取舍）。
- **R2 时间戳精度**：`fetchedAt`/`nextRetryAt` 经 `compressTimestamp` 是**分钟**精度（`codec.ts:19-22`），判定有 ≤60s 误差。`minInterval` 下限 1 分钟，不要引入秒级周期。
- **R3 长期坏源**：退避封顶 1 小时 → 一个永久 404 的源最多每小时被请求一次（现状是每 123 分钟一次，量级相同）。
- **R4 声明周期可能很长**：`yearly` 折算 365 天，用户会以为「不更新了」。所以 D4 的开关 + P2 的「每 N 分钟」文案是必要的，不能只改调度不改可见性。
- **R5 条件请求的兼容性**：GM 层一般可透传自定义头，但个别 CDN 行为未知；D5 的降级路径保证失败不会卡死。首次上线需要实测 2–3 个真实源（含 GitHub Releases 这类强 ETag 源）。
- **R6 `isDue` 用内存 options**：`isDue` 是同步方法，用 source 实例里的 `currentOptions`（`loadState`/`fetch`/编辑器保存后刷新）。编辑器保存会触发 `doRefreshSource` → `loadConfig` + 刷新，所以新增源能立刻被判为到期；纯 storage 外部改动（另一个标签页）要等下一次 `loadFreshOptions`。
- **R7 跨层**：`rss/schedule.ts` 自带退避表，不 import `app/refresh.ts`（避免 feature 反向依赖组合层）；两处阶梯若将来分叉，需在注释里互相指向。

## 10. 待拍板

| #   | 问题                                                                                        | 推荐                                                                                     |
| --- | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Q1  | 周期语义：`max(声明, 最小间隔)`（A）／`声明优先、用户值仅兜底`（B）／per-feed 手动覆盖（C） | **A**                                                                                    |
| Q2  | `<ttl>` 与 `sy:updatePeriod` 并存时取小者（更及时）还是大者（更保守）                       | 取**小者**                                                                               |
| Q3  | 是否做条件请求（ETag / Last-Modified）                                                      | **做**（收益最大，风险最低）                                                             |
| Q4  | 默认「最小抓取间隔」保持 123 分钟还是下调（如 30）                                          | 保持 **123** 不改默认值；要见效需手动调小，编辑器加提示文案。若希望开箱即用可改为 **30** |
| Q5  | 是否纳入 `skipHours` / `skipDays`                                                           | **不纳入**（v1 非目标）                                                                  |

已拍板（2026-09-12）：Q1–Q5 全部按推荐执行。

## 11. 实施记录（2026-09-12，P1 落地）

`bun run check`：**1741 pass / 0 fail**（typecheck · lint · format · test · build 全绿），prism 产物 246.5 KB / hash `ef01252e`。

**新增**

- `src/prism/rss/schedule.ts` —— `FEED_BACKOFF_DELAYS_MS` / `resolveIntervalMs` / `nextFetchAtOf` / `feedRetryDelayMs` / `isFeedDue` / `feedSchedule`
- `test/prism/rss/schedule.test.ts`

**修改**

| 文件                                                               | 改动                                                                                                                           |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| `shared/feed-parser.ts`                                            | `FeedParseResult.declaredIntervalMs` + `parseDeclaredIntervalMs`（`<ttl>`、`sy:updatePeriod` × `updateFrequency`，并存取小者） |
| `shared/request.ts`                                                | `headerValue`（原样返回值，保住 ETag 的引号与 `W/`）                                                                           |
| `rss/types.ts`                                                     | `RssFeed` 新增 6 个调度/凭据字段；`RssSourceOptions.respectFeedPeriod`                                                         |
| `rss/fetcher.ts`                                                   | 到期门（未到期零请求，但仍过 retention）、条件请求与 304、feed 级退避、`attempted` 失败判定                                    |
| `rss/source.tsx`                                                   | `isDue` 实现 + 透传调度参数                                                                                                    |
| `rss/constants.ts` · `rss/editor/types.ts` · `rss/editor/form.tsx` | `DEFAULT_RESPECT_FEED_PERIOD`、`coerceRssOptions`、标签改「最小抓取间隔」+ 「遵循源声明周期」勾选框                            |
| `prism/types.ts` · `app/refresh.ts`                                | `Source.isDue` 钩子与优先级分支                                                                                                |
| `config/defaults.ts` · `config/validate.ts`                        | `rss.respectFeedPeriod` 默认值与布尔校验（含 `RSS_FIELDS` 白名单）                                                             |
| `codec.ts`                                                         | RSS feed 字段白名单补齐（`en`/`aa`/`nr`/`fc`/`di`/`et`/`lm`），顺带修掉 `enabled` 被丢弃的 F5                                  |
| 测试 9 个文件                                                      | `rss/{fetcher,schedule,editor-types,editor,source,source-view}`、`shared/{feed-parser,request}`、`refresh`、`codec`            |

**实现期修正**

- D5 的降级改为「上次失败则不发条件头」（§3 D5），不再依赖清空凭据 —— 失败的源会 throw，清掉的凭据不会持久化。
- 新增 D8（`attempted` 规则）：否则「全部 feed 未到期但带旧 error」会让源级退避每个 tick 空转。
- 新增 D9（`FetchOptions.force`）：一开始漏掉了「刷新手势」这一路 —— feed 级门在 `fetchRssFeeds` 内部，而 `refreshSource` 只看源级 TTL，于是卡片刷新按钮在未到期时会静默无动作，违反 §8 验收第 5 条。现由 `doRefreshSource` → `refreshAndRerender` → `refreshSource` → `Source.fetch` 逐层透传 `{ force: true }`。
- 编辑器 `ttlMinutes` 的行标签由「刷新间隔」改为「最小抓取间隔」，既有测试的标签断言同步更新。
- `fetcher.test.ts` 的共享 `OPTS` 显式关掉调度（`ttlMinutes: 1` + `respectFeedPeriod: false`），让 v1 的抓取/解析用例保持原语义。

**第二批（P2 / P3，同日）**

- P2 文案落地：`rss/component.tsx` 的 `FeedBlock` 增加一行调度提示（`每 12 小时 · 下次 8 小时后`，到期时显示 `待刷新`），错误行补「（N 分钟后重试）」；新增 `formatIntervalLabel` / `formatCountdownLabel`（导出，便于单测）与卡片级 `useTickingNow`（30s 一次，不按 feed 各起一个定时器）；样式 `.gm-sp-rss-feed-schedule` 落在 `overlay/rss.css`。提示由 `source.tsx` 通过 `scheduleHint` 注入（options 归 source 所有，卡片保持无状态）。
- P3 落地：`source.tsx` 用 `effectiveMaxIntervalMs` 记账（初始回落 `ttlMinutes`，每次 fetch 后取全部 feed 生效周期的最大值）作为 `ttlMs`，使卡片右上角「数据陈旧」徽标不再对 daily 源长期常亮。**取舍**：徽标因此不再承担「源卡死」告警职责 —— 该职责转由 P2 的错误行 + 重试倒计时承担（`rss-fetch-schedule.plan.md` R4 的推论）。
- 校验：scoped `bun run check`（prism）**1517 pass / 0 fail**，prism 247.5 KB / hash `15aa32ac`。
