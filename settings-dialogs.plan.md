# 设置弹窗：把 rss/novels 的原则推广到所有面板

## 背景

rss 与 novels 的设置弹窗已按三条原则重做（`editor-dialog.plan.md`）：

1. **宽度由编辑器声明**：`SourceEditorResult.size` ∈ `sm 420 / md 520 / lg 760 / xl 1080`，CSS 按视口夹取；不再由内容撑开。
2. **长列表要有工具条**：搜索 + 状态筛选 + 分页 + 批量操作 + 行默认折叠（`EditorListToolbar`，共享）。
3. **行内操作键统一**：↑ ↓ × 用共享图标（`ArrowUpIcon` / `ArrowDownIcon` / `DeleteIcon`），样式统一在 `overlay/editor.css`。

本计划把同样的处理推广到其余源。

## 盘点（现状 → 目标）

| 源      | 表单内容                         | 行内按钮              | 现状             | 目标                   |
| ------- | -------------------------------- | --------------------- | ---------------- | ---------------------- |
| xit     | 文本域 + 并排预览                | 无                    | `xl` ✅          | 保持                   |
| rss     | 100 源列表                       | 共享图标 ✅           | `lg` + 工具条 ✅ | 完成                   |
| novels  | 50 本书                          | 共享图标 ✅           | `xl` + 工具条 ✅ | 完成                   |
| hupu    | 版块列表（几十）+ 7 个数值       | `ChipList` 旧类 + ▲▼× | 默认 md          | `lg` + 图标化 + 工具条 |
| reddit  | subreddit 列表（几十）+ 5 个数值 | `ChipList` 旧类 + ▲▼× | 默认 md          | `lg` + 图标化 + 工具条 |
| weather | 城市列表（约 20）+ 坐标          | 删除已图标化，↑↓ 旧类 | 默认 md          | `lg` + 图标化 + 工具条 |
| xueqiu  | API URL + System Prompt 文本域   | 无                    | 默认 md          | `lg`                   |
| v2ex    | 5 个数值                         | 无                    | 默认 md          | `sm`                   |
| tnews   | 4 个字段                         | 无                    | 默认 md          | `sm`                   |
| misc    | 3 个字段                         | 无                    | 默认 md          | `sm`                   |

## 分期

- **P1 尺寸声明** ✅（e63b036 之后的独立小提交候选）：hupu / reddit / weather / xueqiu → `lg`；v2ex / tnews / misc → `sm`；xit 已是 `xl`。
- **P2 行内按钮图标化** ✅：`ChipList`（hupu + reddit 同时受益）与 weather 的 ↑↓ 统一到共享图标与 `.gm-sp-item-move` / `.gm-sp-item-remove`；editor.css 里 `.gm-sp-editor-chip-move/remove` 旧样式已删（无引用）。
- **P3 长列表工具条** ✅：hupu 版块、reddit subreddit、weather 城市全部改为折叠行列表（`useRowBrowser` 共享钩子 + `EditorListToolbar`）。设计决策（用户拍板 B）：放弃 chip 墙，三处与 rss/novels 交互完全一致 —— 搜索、分页（30/30/20 每页）、勾选 + 批量删除、行点击展开就地编辑（改名 blur 提交，`renameKey` 迁移选中与展开状态）。weather 的坐标/CMA 编辑放进展开区，折叠行只显示摘要。**未引入 enabled 字段**：版块/subreddit 没有停用语义，批量操作只做删除；若以后要"停用某个版块"，需要先改配置 schema。
- **P4 一致性收尾** ⬜：视观感再定，例如 misc 手写的源设置区是否复用 `SourceSettingsFields`。

## 验证方式

`tmp/all-editors-live.mjs`：一个活页面覆盖多个源（`?source=hupu` / `weather`，`?boards=` / `?cities=` 控制条目数），配合 `tmp/shot-all-editors.mjs` 截图与量测。实测 hupu（30 板块）与 weather（20 城市）：弹窗 760px、90/60 个按钮全部 24×24 且带 SVG 图标。

## 设计决策（待定）

- **chip 墙 vs 行式列表**：hupu / reddit 现在是"一次性铺开的 chip 墙"。改造成折叠行列表（与 rss/novels 一致）更整齐，但会让"扫一眼有哪些版块"变成"点开才看到"。P3 之前需要拍板：保留 chip 外观只加工具条，还是改成折叠行。
- **weather 城市行**：一行里已有城市名 + 坐标 + CMA + 操作位，展开后的编辑区是否按需展开（现在常驻显示坐标）。

## 风险

- `ChipList` 是共享组件，改动会同时影响所有使用者，需要确认使用者清单。
- 长列表改造会引入新的选中/分页状态，每个源都要补测试（对齐 rss/novels 的做法）。
