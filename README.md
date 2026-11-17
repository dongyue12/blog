# 冬月的博客

用 Node.js 从零手写的静态博客。没有框架、没有打包器，`node src/build.mjs` 把 `content/posts/*.md` 变成 `dist/` 下的纯静态文件。

## 常用命令

```bash
npm run build    # 构建
npm run size     # 体积预算检查（超预算退出码 1）
npm run serve    # 本地预览 → http://localhost:8000
npm run dev      # 构建 + 体积检查 + 起服务
```

## 日常写作

新建 `content/posts/012.标题.md`（编号 = 当前最大编号 + 1）：

```markdown
---
date: 2026-05-01
tags: [前端, 随笔]
---

正文用 Markdown 写。图片放 public/img/ 下，这里写 /img/文件名.webp。
```

## 写作约定（改了会断链，别改）

| 规则 | 说明 |
|---|---|
| 文件名 = `3位编号.标题.md` | 例如 `012.我的标题.md` |
| 编号从 `001` 开始，3 位定宽 | `1.x.md`、`01.x.md` 都会构建失败 |
| **编号永不重排、永不复用** | 编号就是 URL：`/posts/012/`，也是评论主键 |
| 新文章 = 最大编号 + 1 | 永远向后追加 |
| 列表顺序 = 编号倒序 | 编号大的在前，`date` 只作展示 |
| `tags` 写成数组 | `tags: [前端, 随笔]`，写成字符串会构建失败 |
| 标题不能含 `/ : * ? " < > \|` | 文件名禁用字符 |
| 标题最多约 80 个汉字 | 文件系统名上限 255 字节 |

## 目录结构

```
content/posts/*.md        文章源文件（唯一的输入）
content/links.json        友链数据
public/                   原样复制到 dist：img/、avatar.webp、robots.txt、_headers
src/style.css             样式表（构建时压缩并内联进每个页面）
src/config.mjs            站点配置（标题、域名、每页条数、giscus 评论）← 上线前改这里
src/utils.mjs             转义、日期、标签规范化、摘要
src/posts.mjs             扫描文章、解析 frontmatter、校验规格
src/templates.mjs         HTML 模板：文章页/首页/标签/搜索/友链/404
src/feed.mjs              rss.xml、sitemap.xml
src/links.mjs             读友链 JSON
src/minify.mjs            HTML / CSS 压缩（自己写，不引依赖）
src/image-size.mjs        读图片的宽高，给 <img> 补 width/height 防跳动
src/build.mjs             入口：串起所有步骤，写 dist/
src/size.mjs              体积预算检查
dist/                     构建产物（已在 .gitignore 里）
```

## 数据流

```
content/posts/*.md
  ↓ posts.mjs          gray-matter 拆 frontmatter，校验编号/日期/标签/冲突
  ↓ build.mjs          按编号倒序
  ↓ markdown-it        正文 → HTML（图片自动补 lazy/decoding/宽高）
  ↓ templates.mjs      套页面外壳（<head> 里内联压缩后的 CSS）
  ↓ minify.mjs         压掉 HTML 空白
dist/posts/012/index.html   →  URL: /posts/012/
```

## 性能设计（这些数字是量出来的，不是估的）

| 项 | 做法 | 效果 |
|---|---|---|
| CSS | 构建时压缩后**内联进 `<head>`** | 首屏少 1 个请求（省一次 RTT） |
| HTML | 自写压缩（保护 `<pre>`/`<script>`） | 原始体积 -75% |
| 图片 | WebP + 限宽 + `-strip` 去 EXIF | 139KB → 46KB |
| 图片属性 | 构建时读像素尺寸补 `width`/`height` | 消除 CLS（页面不跳动） |
| 图片加载 | `loading="lazy"` + `decoding="async"` | 首屏外不下载 |
| JS | 只用内联，无外部脚本（giscus 除外） | 首页 0 个外部请求 |
| 评论 | giscus `data-loading="lazy"` | 滚到评论区才加载 |
| 缓存 | `public/_headers` 给图片长缓存 | Cloudflare Pages 生效 |

**代价（有意接受）**：CSS 内联后每个 HTML 各自带一份副本。单个访客更省，全站总体积变大（只影响爬虫，不影响人）。想改回外部缓存：把 `templates.mjs` 里的 `<style>${CSS}</style>` 换回 `<link rel="stylesheet" href="/style.css">`，并在 `build.mjs` 里把 `src/style.css` 写进 `dist`。

## 体积预算

`npm run size` 会打印每个文件的 raw / gzip / brotli，并对三条预算做断言（超了退出码 1）：

```js
pageGzip: 7 * 1024,      // 单个 HTML
totalBrotli: 70 * 1024,  // 整站（不含图片）
images: 60 * 1024,       // 图片合计
```

**改完代码先跑这个，再提交。**

## 构建报错怎么办

构建失败时会列出**所有**问题，一次改完：

```
✗ 构建中止：2 篇文章不符合规格

  1) content/posts/002.code-test.md
     原因：缺少 date 字段（也可能是冒号后没空格…）
     改法：文件第 1 行写 ---，第 2 行写 date: 2026-11-17，第 3 行写 ---
```

| 报错 | 原因 |
|---|---|
| 文件名不合规 | 缺 3 位编号，或标题为空 |
| 编号 XXX 已被占用 | 两个文件用了同一个编号 |
| 缺少 date 字段 | 没写 `date: `，或**冒号后少了空格**（YAML 硬性要求） |
| tags 格式不对 | 写成了字符串，要写 `tags: [a, b]` |

## 部署

### Cloudflare Pages（推荐）

1. 推到 GitHub
2. Cloudflare Pages → 连接仓库
3. 构建命令：`npm run build`　输出目录：`dist`
4. 上线后把 `src/config.mjs` 的 `url` 改成真实域名（RSS/sitemap 需要）

### GitHub Pages

Settings → Pages → Source 选 GitHub Actions。

> ⚠️ 部署在**子路径**（`username.github.io/my-blog/`）时，所有 `/img/...`、`/avatar.webp` 的绝对路径都会 404。要么部署在根路径，要么给模板加 base 前缀。

## 已知限制

- 不支持草稿（没有 `draft` 字段）
- 没有语法高亮（代码块只有等宽字体和背景色）
- 搜索只覆盖标题/标签/摘要，不搜正文
- 标题受文件名限制（禁字符 + 约 80 汉字）
- 图片尺寸靠构建时读文件，外链图片无法补 `width`/`height`
