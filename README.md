# 我的博客

用 Node.js 从零手写的静态博客。没有框架、没有打包器，`node src/build.mjs` 把 `content/posts/*.md` 变成 `dist/` 下的纯静态 HTML。

## 日常写作（你只需要记住这三步）

```bash
# 1. 新建一篇文章（编号 = 当前最大编号 + 1，永不复用）
#    文件名格式：3位编号.标题.md
vim content/posts/012.我的新文章标题.md
```

```markdown
---
date: 2026-05-01
---

正文用 Markdown 写。图片放 public/img/ 下，这里写 /img/文件名.jpg。
```

```bash
# 2. 构建
npm run build

# 3. 本地预览 → http://localhost:8000
npm run serve
```

## 写作约定（改了会导致断链，别改）

| 规则 | 说明 |
|---|---|
| 文件名 = `3位编号.标题.md` | 例如 `012.我的标题.md` |
| 编号从 `001` 开始，3 位定宽 | `1.x.md`、`01.x.md` 都会构建失败 |
| **编号永不重排、永不复用** | 编号就是 URL：`/posts/012/` |
| 新文章 = 最大编号 + 1 | 永远向后追加 |
| 列表顺序 = 编号倒序 | 编号大的在前，`date` 只作展示 |
| 标题里不能有 `/ : * ? " < > \|` | 文件名禁用字符 |
| 标题最多约 80 个汉字 | 文件系统名上限 255 字节，中文 3 字节/字 |

## 目录结构

```
content/posts/*.md     文章源文件（唯一的输入）
public/                原样复制到 dist：style.css、img/、robots.txt
src/config.mjs         站点配置（标题、作者、域名）← 上线前改这里
src/utils.mjs          转义、日期格式化
src/posts.mjs          扫描 content/posts，解析 frontmatter，校验规格
src/templates.mjs      HTML 模板：文章页、首页、404
src/feed.mjs           rss.xml、sitemap.xml
src/build.mjs          入口：串起上面所有步骤，写 dist/
dist/                  构建产物，已在 .gitignore 里
```

## 数据流

```
content/posts/*.md
   ↓ posts.mjs     gray-matter 拆出 { slug, title, date, body }，校验编号/日期/冲突
   ↓ build.mjs     按编号倒序排好
   ↓ markdown-it   body → HTML
   ↓ templates.mjs 套页面外壳
dist/posts/012/index.html  →  URL: /posts/012/
```

## 想读懂代码？按这个顺序看

1. `src/utils.mjs` —— 20 行，两个纯函数，无依赖
2. `src/config.mjs` —— 就是一堆常量
3. `src/posts.mjs` —— 核心逻辑：读目录 → 正则拆文件名 → 校验 → 返回数组
4. `src/templates.mjs` —— 全是字符串拼装，注意 `escapeHtml` 只用在 title 上，不用在 html 上
5. `src/build.mjs` —— 只做编排，按顺序调用上面几个
6. `src/feed.mjs` —— 生成 XML，可以最后看

## 构建报错怎么办

构建失败时会列出**所有**问题，一次改完即可：

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
| 缺少 date 字段 | frontmatter 里没写 `date: `，或**冒号后少了空格**（YAML 硬性要求） |

## 部署

### Cloudflare Pages（推荐，免费 + 自动 HTTPS）

1. 代码推到 GitHub
2. Cloudflare Dashboard → Pages → 连接仓库
3. 构建命令：`npm run build`　输出目录：`dist`
4. 上线后把 `src/config.mjs` 里的 `url` 改成真实域名（RSS/sitemap 要用）

### GitHub Pages

仓库 Settings → Pages → Source 选 GitHub Actions，或者用 `username.github.io` 仓库部署在根路径。

> ⚠️ 如果部署在**子路径**（如 `username.github.io/my-blog/`），所有 `/style.css`、`/img/...` 的绝对路径都会 404。要么部署在根路径，要么给模板加 base 前缀。

## 已知限制

- 图片没有 `width`/`height`，加载时会有轻微跳动（CLS）
- 不支持草稿（没有 `draft` 字段）
- 不支持标签 / 归档页 / 站内搜索
- 标题不能含问号等字符；超长标题受文件名上限约束

## 性能预算

- 首页 JS：0 KB
- 首页总请求：1 个 HTML + 1 个 CSS
- 构建耗时：约 0.06 秒
