# TweetMark

**免费给 Twitter/X 的收藏(Bookmark)加上文件夹和备注** —— 不用买 X Premium。

收藏推文时,TweetMark 自动按关键词规则把它归入文件夹(AI / 课程 / 股票 / 其他,可自定义),并弹出一个不打扰的小窗,让你顺手记一句「为什么收藏」。之后在插件的管理页里按文件夹浏览、全文搜索、随时导出。

*A free Chrome extension that adds folders and notes to Twitter/X bookmarks. Auto-categorizes by keyword rules when you bookmark, with an unobtrusive popup for jotting down why you saved it. All data stays in your browser — no server, no tracking. UI is currently in Chinese.*

## 功能

- **自动分类**:收藏瞬间按关键词规则归入文件夹;英文整词匹配、中文包含匹配、支持 `/正则/`(如美股 ticker `$TSLA`)
- **收藏原因**:弹窗里一句话备注;回车保存,Esc 或 10 秒不操作则静默保存,不打断刷推
- **全入口捕获**:通过拦截 X 的 CreateBookmark 请求检测收藏动作——按钮、菜单、快捷键 `b` 都能触发
- **管理页**:按文件夹浏览、搜索正文/作者/备注、改备注、移动、删除
- **数据自主**:全部存本地,一键导出/导入 JSON,换电脑不丢
- **隐私**:无后端、无统计、不上传任何数据,详见 [PRIVACY.md](PRIVACY.md)

## 安装

> 尚未上架 Chrome Web Store,目前以开发者模式加载:

1. 下载本仓库(`git clone` 或 Code → Download ZIP 后解压)
2. Chrome 地址栏打开 `chrome://extensions`,右上角开启「开发者模式」
3. 点「加载已解压的扩展程序」,选择本项目文件夹
4. 打开 twitter.com / x.com(已开着的标签页要刷新一次),收藏任意推文即可看到弹窗
5. 点工具栏的 TweetMark 图标打开管理页(图标默认收在拼图菜单 🧩 里,可点图钉固定)

## 使用

| 操作 | 方法 |
|---|---|
| 收藏并分类 | 点推文的 Bookmark 按钮 → 弹窗中确认/修改文件夹、填备注 → 回车 |
| 快速收藏 | 弹窗出现后不用管它,10 秒后按自动分类静默保存(Esc 立即静默保存,时长可在设置中调整) |
| 本条不记录 | 弹窗中点「不保存」(不影响 X 原生收藏) |
| 浏览/搜索/编辑 | 点插件图标打开管理页 |
| 自定义文件夹和关键词 | 管理页 → 设置 · 文件夹与规则 |
| 备份/迁移 | 管理页 → 导出 JSON / 导入 JSON |

## 已知限制

- 仅支持 Chrome(Manifest V3);Edge 等 Chromium 内核浏览器理论可用,未测试
- 依赖 X 前端的 `data-testid` 和 `CreateBookmark` 接口名,X 大改版可能暂时失效(修复入口:`content.js` 顶部 `SELECTORS`、`page-hook.js`);解析失败时会降级为只保存推文链接
- 存量收藏(装插件之前收藏的)暂不导入,规划中
- 数据存在浏览器本地,重装浏览器/卸载插件前请先导出备份

## 技术说明

纯原生 HTML/CSS/JS,无构建、无依赖:

| 文件 | 作用 |
|---|---|
| `manifest.json` | MV3 配置 |
| `page-hook.js` | 注入页面主世界,拦截 CreateBookmark 请求(收藏检测主路径) |
| `content.js` | 解析推文、弹窗交互;按钮点击监听作为备份路径 |
| `defaults.js` | 默认文件夹/关键词与匹配逻辑(三端共用) |
| `background.js` | 点图标打开管理页;安装时初始化数据 |
| `manage.html/js` | 管理页(浏览器直接打开可进入示例数据预览模式) |

设计文档见 [docs/需求文档.md](docs/需求文档.md)。

## License

[MIT](LICENSE)
