# 重构全量回归审计（frontend.refactor.md ↔ 现状）

> 方法：重读 `frontend.refactor.md` 全文（§0–§7），对每条"位置/方案"在当前代码上做取证核对。
> 状态图例：✅ 已闭环 ｜ ⚠️ 部分（有残留）｜ ❌ 未做 ｜ — 本次未逐项复核
> 审计时点：S12 已提交（`8735bac`），S13 仅出计划未实施。

## 结论速览

| §        | 主题                                             | 状态 | 关键证据                                                                                                                |
| -------- | ------------------------------------------------ | ---- | ----------------------------------------------------------------------------------------------------------------------- |
| 1.1      | xueqiu 黑名单 sanitizer / ReDoS                  | ✅   | `xueqiu/component.tsx:6` 改引 `shared/sanitize`，`:347`/`:360` 用白名单；`unescapeHtml` 已删                            |
| 1.2      | JSX 双重转义                                     | ⚠️   | **残留 1 处**：`editor-ui/ChipList.tsx:92`                                                                              |
| 2.1      | loadConfig 不校验                                | ✅   | `config/load.ts:11-17` merge→validate→warn 回落，返回 `Config`                                                          |
| 2.2      | 键空间 4 套漂移                                  | ⚠️   | **残留 2 处**：`save-filter.ts:34-36`、`xit/filters.ts:5`                                                               |
| 2.3      | validate 白名单/excess-key                       | ✅   | 各 section `X_FIELDS ... as const satisfies (keyof Config[x])[]` + `rejectUnknownKeys`；`cmaStationId` 已校验（`:123`） |
| 2.4      | codec 无迁移                                     | ✅   | `cache.ts:16` 改为 `migrateCache`，`:17-19` 不可迁移才 warn 丢弃                                                        |
| 2.5      | deepMerge `as T`                                 | —    | 未逐项复核（优先级低于其余项）                                                                                          |
| 2.6      | source-registry 抹泛型                           | ⚠️   | 11 处 → 1 处（`card-group.ts:18`，有授权注释）；`match.ts:12` 残留 1 处 `as any`                                        |
| 2.7      | 预览 `undefined as any`                          | ✅   | 全仓 `undefined as any` **0 处**                                                                                        |
| 2.8      | xueqiu hotSource 空 fetch                        | ✅   | 已实现真实取数（`xueqiu/fetcher.test.ts` 有 SkipRefreshError / 排序用例）                                               |
| 2.9      | 配置构造期快照                                   | ✅   | 9 个 source 全部 `get ttlMs()`（v2ex/tnews/reddit/hupu/xueqiu×2/weather/novels/misc）                                   |
| 3.1      | novels 翻页无上限                                | ✅   | `defaults.ts:38` = 200；`fetcher.ts:231/249` 消费且有 `Number.isFinite` 守卫                                            |
| 3.2      | merge O(n²)                                      | ✅   | `nodeByVariant` Map 取代全量扫描（`:56-57`）；空 textKey 跳过（`:93`）                                                  |
| 3.3      | 全局并发                                         | ✅   | `shared/concurrency.ts` + `app/refresh.ts:6` 接入                                                                       |
| 3.4      | SafeLine PoW                                     | ✅   | `MAX_DIFFICULTY_BITS=20` 护栏（`:265-267`）＋超限 `throw`（`:286`），`return '0'` 已无                                  |
| 3.5      | hupu 惰性正则 / tnews 二次处理                   | ✅   | **已修（本次）**：hupu 改 `extractDataJson()` 线性扫描；`stripImgSizeAttrs` 删除，尺寸控制移入 CSS              |
| 4.1      | 7 个导入环 + 无门禁                              | ✅   | `.oxlintrc.json:20` `import/no-cycle: error`                                                                            |
| 4.2      | 定时器 / 时钟                                    | ⚠️   | 定时器 ✅（S12）；**时钟 ❌**（S13 待做）                                                                               |
| 4.4      | feature→shell/card 反向依赖                      | ⚠️   | **残留 5 处** feature→`card/primitives`                                                                                 |
| 4.5      | 模块级可变状态                                   | ✅   | `let nextId` / `new WeakMap` 均无命中                                                                                   |
| 4.6      | xit 双份 header state                            | ✅   | `createXitHeaderState()` 工厂（header.tsx:31），source 与 render 共用                                                   |
| 4.7      | Source 接口不齐                                  | ⚠️   | 编译期 `SourceShape` 清单 ✅；显式 `loadState: undefined` 未做                                                          |
| 4.8–4.13 | 抓取层 / 重试 / GBK / 重复实现 / 死代码 / 兼容性 | ✅   | S11 + S12 全部闭环                                                                                                      |
| 5.1      | dist 孤儿                                        | ✅   | dist 仅剩 6 个脚本，与 6 个 src 入口一一对应                                                                            |
| 5.2      | SWC 过激进                                       | ✅   | `unsafe`/`properties`/`hoist_props` 已移除（`passes:3`、`inline:2` 保留）                                               |
| 5.3      | prod 含 console.debug                            | ✅   | `:407` 属 **Phase 1 debug 产物**；prod 改注释标记（`:212`），实测 prod 计数 0                                           |
| 5.4      | oxlint 规则面                                    | ✅   | `import/no-cycle: error` + `perf: warn`                                                                                 |
| 5.5      | tsconfig 收紧                                    | ✅   | `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` 均已开                                                        |
| 5.6      | 测试缺口                                         | ⚠️   | 仍缺 8 个模块，见下                                                                                                     |

---

## 一、正确性问题

### C1（中）§1.2 双重转义残留 —— `editor-ui/ChipList.tsx:92`

```tsx
{
  renderLabel ? renderLabel(name) : escapeHtml(name)
}
```

这是 **JSX 文本子节点**位置：Preact 会自动转义，`escapeHtml` 造成二次编码 —— 标签名含 `&` 时显示 `&amp;`，与 §1.2 描述的用户可见 bug 完全一致。

对照已修对的用法：`v2ex/component.tsx:102`、`reddit/component.tsx:124`、`hupu/component.tsx:125` 均为 `dangerouslySetInnerHTML={{__html: escapeHtml(x) + suffix}}`（正确）。同一仓库两种写法并存，说明 §1.2 当时漏扫了 `editor-ui/`。

**建议**：`:92` 去掉 `escapeHtml`；顺带全仓复查是否还有 JSX 子节点位的 `escapeHtml`。

### C2（中）§2.2 键空间仍有两处第二定义

- `save-filter.ts:34-36` 自建 `CACHE_KEY_PREFIX`/`STATE_KEY_PREFIX`/`LOCK_KEY_PREFIX`。虽然派生自 `keys.ts` 的 `KEY_PREFIX`，但**格式是重新拼的**：一旦 `keys.ts` 的 `CACHE_KEY()` 格式变更，`save-filter` 的 `startsWith` 解析会**静默失配**（不报错，只是过滤失效）。
- `xit/filters.ts:5` `const STORAGE_KEY = 'dashboard:v2:xit-filters'`，与 `keys.ts:15` `XIT_FILTERS_KEY = 'dashboard:v2:xit-filters'` **同一键两处硬编码**。这正是 §2.2 想消灭的漂移。

**建议**：`save-filter.ts` 改为 `keys.ts` 导出的前缀常量；`xit/filters.ts:5` 改用 `XIT_FILTERS_KEY`。

### C3（低）§2.6 残留一处 `as any` —— `xit/query/match.ts:12`

```ts
;(['today', 'thisweek', 'thismonth', 'thisyear', 'everyday'] as const).includes(value as any)
```

与文档基线"审查范围内零 `any`"矛盾。修法很简单：把数组断言为 `readonly string[]` 即可去掉 `as any`。

---

## 二、完整性问题

### I1 ~~（高）§3.5 两项**完全未做**~~ → **已修复**

1. **hupu**：惰性量词正则 `\{[\s\S]*?\}` 已删除，改为 `extractDataJson()`（`hupu/fetcher.ts`）用 `indexOf` 线性扫描：定位 `window.$$data` → `=` → 首个 `{` → `</script>`，再取该区间内最后一个 `}`。语义与原正则一致（原正则的惰性匹配同样会展开到 `</script>` 前的最后一个 `}`）。
2. **tnews**：`stripImgSizeAttrs` 定义与调用均已删除，`renderBody` 直接输出已净化 HTML。

**修复过程中发现的额外缺陷（原文档未记录）**：`src/prism/overlay/tnews.css` 的三条规则选择器是 `.gm-sp-tnews-body`，而**这个类在 TSX 中根本不存在** —— 展开行 body 用的是共享类 `.gm-sp-expandable-body`（`shared/expandable-list.tsx:86`）。即这三条规则一直是**死 CSS**，描述区图片此前**没有任何 CSS 尺寸约束**，`stripImgSizeAttrs` 是唯一控制。

因此本次把 img 规则改挂到真实容器 `.gm-sp-tnews img` 并补 `width: auto`（与文档"用 CSS `.gm-sp-tnews img { width:auto }`"的建议一致）；余下 `.gm-sp-tnews-body p`（`:3`）与 `.gm-sp-tnews-body a`（`:21`）**同为死规则，未动**，是否激活属视觉变更，需你决定。

> 产物取证：prod 的 CSS 经 LZ-string 压缩后运行时解压（`scripts/build-userscript.ts:276`），故 prod 内搜不到 CSS 文本；已通过 debug 产物（`dist/prism.debug.js:15054-15061`）确认规则内容正确。

### I2（中）§5.6 仍有 8 个模块零测试

`app/source-registry.ts`、`app/lifecycle.ts`、`app/sync-bootstrap.ts`、`app/shortcut-bootstrap.ts`、`header-state.ts`、`xit/component/header.tsx`、`xit/editor.tsx`、`shell/editor.tsx`。

其中 `source-registry` 承载 §2.6/§4.7 的类型契约（`SourceShape` 编译期守卫），`header-state` 是跨 6 个 feature 复用的有状态工具——**这两个零测试的风险最高**。

已补上的：`shared/sanitize.test.ts`（P0 兜底 ✅）、`novels/merge.test.ts` ✅、`app/any-source.test.ts` ✅、`misc/openrouter.test.ts`（S12 新增）。

### I3（低）§4.7 显式标注未做

`SourceShape` 编译期清单已到位（`source-registry.ts:18-25`），但"无状态 source 显式写 `loadState: undefined` 并注释原因"**未执行**（`loadState:` 零命中）。此项价值有限 —— 在 `exactOptionalPropertyTypes` 下显式写 `undefined` 未必合适，建议**放弃该子项**而非补做。

---

## 三、健壮性与可扩展性

### R1（中）§4.4 仍存 5 处 feature → `card/primitives` 反向依赖

`tnews/component.tsx:2`、`v2ex/component.tsx:5`、`xueqiu/component.tsx:2`、`hupu/component.tsx:5`、`reddit/component.tsx:5` 均 `import { ItemActions } from '../card/primitives'`。

已修好的部分：`xit/component/body.tsx` → shell/editor 已断；`card/card.tsx`、`card/tabs-card.tsx` → shell/editor 已断（`createEditHandler` 已抽走）。

**残留的根因**是 `ItemActions` 被当作跨 feature 的共享 UI 原语使用，却仍住在 `card/` 层。分层上 card 与 feature 同属"展示层"，feature 反向引用 card 会让 card 的任何改动波及 5 个 feature。

**建议**：把 `ItemActions` 下沉到 `shared/`（对齐 §4.4"抽到 shared"的思路），5 处 import 一并改路径。

### R2（低）§2.6 擦除点集中化的取舍

`card-group.ts:18` 是全仓唯一 `AnySource → Source<unknown>[]` 的擦除点，且有注释说明"sanctioned erasure happens HERE"。相比原来的 11 处散落擦除，这是明显进步（类型信息在 registry 与编排层完整保留）。可扩展性上的**剩余限制**是：渲染层（`tabs`/`card`）拿到的仍是 `Source<unknown>`，新增 source 时 `data` prop 依旧无编译期检查。要彻底解决需把 `CardGroup` 参数化为 `CardGroup<T>` 或让渲染入口按 `source.id` 收窄 —— 成本不低，建议作为独立议题评估，而非默认要做。

---

## 四、未覆盖项（诚实声明）

本次未逐项复核：`§2.5 deepMerge` 签名收紧、`§4.3 types.ts 是否叶子`、`§4.11` 的三行表格（S11 已处理，本次未复查 sudugu 时间解析是否仍重复）、`§4.12` 观察项、`§6 路线图`中 S1–S6 的历史提交逐条比对（采用"看现状是否达标"而非"看每个 commit 做了什么"）。

---

## 五、建议的下一步

按"正确性 → 完整性 → 健壮性"排序：

1. **§1.2 残留**（C1）+ **§2.2 残留**（C2）+ **§2.6 `as any`**（C3）：三处都是 1–3 行的点修，可打包成一个极小阶段。
2. **§3.5**（I1）：hupu 切段解析 + tnews 去 `stripImgSizeAttrs` 改 CSS，改动局部、收益明确。
3. **§4.4**（R1）：`ItemActions` 下沉 `shared/`，5 处 import 改路径。
4. **§5.6**（I2）：优先补 `source-registry` 与 `header-state` 的纯逻辑单测。
5. **S13（§4.2 时钟）**：已出计划，与上述互不阻塞。

> 若只挑一件事做：**§3.5** 是唯一"文档明确要求、至今一项都没动"的 P2 条目，且是性能悬崖（1MB HTML 上的回溯型正则）。
