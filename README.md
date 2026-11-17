# 冬月的博客

用 Node.js 从零手写的静态博客：Markdown 进，纯静态 HTML 出。

## 技术栈

| 部分 | 用什么 |
|---|---|
| 运行时 | Node.js 22（ESM，`.mjs`） |
| 依赖 | 仅 2 个：`gray-matter`（拆 frontmatter）、`markdown-it`（Markdown → HTML） |
| 模板 | 原生 JS 模板字符串，无模板引擎 |
| 样式 | 原生 CSS，构建时压缩并内联进页面 |
| 前端脚本 | 原生 JS 内联，无框架；评论用 Giscus（GitHub Discussions） |
| 构建 | 自己写的 `src/build.mjs`，无打包器 |
| 产物 | `dist/` 纯静态文件，零后端 |

## 命令

```bash
npm run dev      # 预览开发：改文件自动重建 + 浏览器自动刷新 → http://localhost:8000
npm run build    # 构建，产物写入 dist/
npm run serve    # 只服务 dist/（不重建、不注入开发脚本）
npm run size     # 查看体积报告，超出预算会返回退出码 1
```

首次使用先装依赖：

```bash
npm install
```

## 写一篇文章

在 `content/posts/` 建文件，文件名格式 `3位编号.标题.md`，编号取当前最大值 + 1：

```markdown
---
date: 2026-05-01
tags: [随笔]
---

正文用 Markdown 写。图片放 `public/img/`，这里写 `/img/文件名.webp`。
```

- 编号即 URL：`012.标题.md` → `/posts/012/`，**不复用、不重排**
- `date:` 冒号后必须有空格
- 标题里不能有 `/ : * ? " < > |`
