# grease-monkey-scripts

一套 Tampermonkey 油猴脚本，用来改善日常浏览体验。

## 脚本列表

| 脚本                                        | 说明                                                                   | 适用站点                                            |
| ------------------------------------------- | ---------------------------------------------------------------------- | --------------------------------------------------- |
| [article-preloader](src/article-preloader/) | 小说自动预加载下一章，多页章节合并成一页                               | xbiquge.so, biduoxs.com, sudugu.org, tongrenxsw.com |
| [dashboard](src/dashboard/)                 | 个人仪表盘浮层（双击 Shift 呼出），聚合天气、V2EX、Reddit、小说、TNews | mail.google.com, v2ex.com, github.com               |
| [hupu-time-saver](src/hupu-time-saver/)     | 虎扑论坛用户标签 + 评论高亮，按信誉等级标注                            | hupu.com                                            |
| [reddit-time-saver](src/reddit-time-saver/) | Reddit 用户标签 + 评论高亮，按信誉等级标注                             | reddit.com                                          |
| [v2ex-time-saver](src/v2ex-time-saver/)     | V2EX 用户标签、多页合并、讨论嵌入、评论高亮                            | v2ex.com                                            |

## 公共能力

- **用户标签**：在 V2EX、Reddit、虎扑三站通用的个人信誉系统，支持自定义标签和颜色高亮
- **仪表盘**：一个浮层看天气、热帖、小说更新、科技新闻
- **阅读增强**：自动合并分页、预加载下一页、键盘快捷导航

## 开发

```sh
bun install
bun run build        # 生成可安装的 .user.js 文件
bun test             # 跑测试
bun run check        # 完整检查（类型 + lint + 格式化 + 测试 + 构建）
```

## 安装

1. 浏览器装好 [Tampermonkey](https://www.tampermonkey.net/)
2. 执行构建命令，或者直接用 `dist/` 目录里现成的文件
3. 在 Tampermonkey 里打开 `.user.js` 文件完成安装
