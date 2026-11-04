# Reddit feed 分组轮转（plan）

## 背景

Reddit 匿名 JSON 被 2026 政策封禁后，数据源改为 Atom feed。实测约束：

- **单次请求硬顶 100 条**（`limit=500` 也只回 100；单 sub 同样 100）。
- **限流 ≈ 1 次成功 / 50 秒 / IP**（`x-ratelimit-reset` 全路径共享）。
- 100 条由一次 multi-sub 请求内的所有成员**分摊**：当前 5 个 sub 实测
  `china_irl 48 / localllama 21 / opencode 16 / programming 10 / opencodecli 5`。
- `after` 游标仍有效（第 2 页与第 1 页零重叠），但每页要再等 50 秒。

目标：让冷门 sub 也能拿到更多条目，同时**不阻塞首屏**。

## 方案：按组轮转

把 `subreddits` 里的 section 分成 K 组，每次刷新只抓其中 1 组（该组独占 100 条配额），
其余组沿用缓存。K 组轮完一圈后回到第 1 组。

### D1. 分组粒度 = 1 个 section（已定）

一个 section（含 `a+b` 合并组）作为一个不可拆单元，**每次刷新只抓 1 个 section**，
`K = section 数`。不新增 `groupSize` 配置项。

理由：100 条在所有成员间分摊，只有让一个 section 独占整个请求，冷门 sub 才能拿满
（`opencodecli` 5 → 最多 100）；合并组语义也不被拆散。

- 5 个 section → 5 组，一圈 5 次刷新（TTL 30 分钟时每个 sub 2.5 小时更新一次）
- 1 个 section → K = 1，退化成当前行为

### D2. 冷启动：按周期逐组补（已定）

不阻塞首屏。首次 fetch 只抓第 1 组（1 秒返回），其余 section 为空、不渲染；
后续每个 TTL 周期补一组，约 `K × TTL` 后填满。

- **不做"缺失优先"**：那会让一个始终取不到数据的 section 永久霸占每一轮，其他组永
  不更新。纯轮转天然保证 `K` 轮内每个 section 都被尝试一次。
- 失败**不推进**指针：这一轮抛错就下一次重试同一组，避免静默跳过整整一圈。

### D3. 轮转指针持久化

`nextGroupIndex` 存进 reddit 的 storage（复用 `state` 的 load/save）。
不用时间片推导：刷新由 `runOpportunisticRefresh` 按 TTL 触发，时刻不对齐，推导会漂。

### D4. 未抓取的 section 用缓存保留

**这是本方案唯一的风险点。** `mergeSubPosts` 当前只输出 `liveBySub` 里有的 sub
（`liveSubs.has(prevSub)` 才保留 prev 条目），未抓的 section 会被整段丢掉。

改法：把"本轮抓取过的 section 集合"显式传入，未抓的 section 从 `prevById` 原样重建。
**分组键是权威归属**（虎扑 `2e02276` 教训）：重建时 `sub` 必须取自缓存分组键，
不能从条目的 `url` 反推。

必须有回归测试：`refreshSource` 跑两轮、第二轮只抓另一组，断言第一组的条目仍在。

### D5. 可见性

- 未更新的 section 沿用现有条目时间 badge，不改 UI 结构。
- 抓取组信息只进 `console.debug`（`[gm-dashboard] reddit group i/K`）。
- 编辑器 `groupSize` 字段旁说明：越小条目越多、但每个 section 更新越慢。

## 非目标

- 不做 `after` 游标翻页（每页 +50s 阻塞，且 hot 游标会漂）。
- 不接 OAuth（需 Responsible Builder Policy 审批）。
- 不改现有的 `metrics: false` 语义与 feed 保序策略。

## 影响文件

| 文件                | 改动                                                                      |
| ------------------- | ------------------------------------------------------------------------- |
| `reddit/source.tsx` | 分组选组、读/写轮转指针、把未抓 section 以空 live 传入 merge              |
| `reddit/state.ts`   | 持久化 `currentGroup` / `advanceGroup`                                    |
| `reddit/fetcher.ts` | 不改签名：source 传 `{ ...options, subreddits: [target] }` 即可           |
| `reddit/scoring.ts` | 去掉 `liveBySub` 的空组过滤：未抓 section 以 `posts: []` 占位才能带出缓存 |

## 测试计划（已实现于 `test/prism/sources/reddit/source.test.ts`）

1. 轮转：4 次 fetch 的请求路径依次为 `a → b → c → a`。
2. 保留：第 2 次只抓 `b`，`a` 的缓存条目仍在且归属 `a`（防虎扑回归）。
3. 空分区：未抓且无缓存的 section 不进 `visible`，不渲染空 section。
4. 失败不推进：403 后用同一 section 重试。
5. 指针持久化：新建 source 实例从 `b` 继续，而不是回到 `a`。

## 已确认

1. 每组 1 个 section（`K = section 数`），不引入 `groupSize` 配置项。
2. 冷启动按周期逐组补，首屏只出第 1 组。

## 运行时含义

- 调度走 `isDue`（优先级高于 `ttlMs`）：**每 `ttlMinutes / K` 抓一个 section，一圈正好一个 TTL**。
  5 个 section + TTL 30 分钟 → 每 6 分钟抓一个 sub，每个 sub 每 30 分钟更新一次。
- 下限 60 秒：section 超过 30 个时 `30min/K < 60s`，会被夹到 1 分钟，避免撞上 feed 的
  ~1 次/分钟限流（代价是此时一圈长于 TTL）。
- **`ttlMs` 保持配置值不变**，它只驱动卡片「数据陈旧」badge；若把 `ttlMs` 也改成 6 分钟，
  该 badge 会在每次刷新后几分钟就亮起来。
- 调度精度：面板打开时每 60 秒检查一次（偏差 ≤1 分钟）；关闭时后台 5–6 分钟一次。
- 手动刷新走 `refreshSource({ force: true })`，每次推进一个 section；相邻两次需间隔约
  50 秒，否则 429 且指针不推进（会重试同一组）。
