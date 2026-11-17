import { escapeHtml, formatDate, tagSlug } from './utils.mjs'; // 转义 + 日期 + 标签规范化
import { SITE } from './config.mjs'; // 站点信息（含 giscus 评论配置）

// 全站导航，改这里就等于改所有页面
const NAV = [
  { href: '/tags/', label: '标签' },
  { href: '/search/', label: '搜索' },
  { href: '/links/', label: '友链' },
];

// 页面外壳：每页都一样的 <head> 和骨架，抽出来只写一次
function shell({ title, description = SITE.description, body }) {
  return `<!DOCTYPE html>
<html lang="${SITE.lang}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <link rel="stylesheet" href="/style.css">
  <link rel="alternate" type="application/rss+xml" title="${escapeHtml(SITE.title)}" href="/rss.xml">
</head>
<body>
${body}
</body>
</html>`;
}

// 站点头部：站名 + 全站导航
function siteHeader() {
  const links = NAV.map((n) => `<a href="${n.href}">${n.label}</a>`).join('\n      ');
  return `  <header class="site-header">
    <a class="site-title" href="/">${escapeHtml(SITE.title)}</a>
    <nav class="site-nav">
      ${links}
    </nav>
  </header>`;
}

// 一篇文章的完整页面
// 两股数据流，处理方式完全相反：
//   title / tags  是纯文本 → 必须转义
//   html          是 markdown 渲染出的 HTML → 绝对不能转义
export function layout({ title, date, html, tags = [] }) {
  const day = formatDate(date);
  const safeTitle = escapeHtml(title);

  const tagList =
    tags.length === 0
      ? ''
      : `        <ul class="tag-list">
${tags.map((t) => `          <li><a class="tag" href="/tags/${tagSlug(t)}/">${escapeHtml(t)}</a></li>`).join('\n')}
        </ul>\n`;

  // 日期和标签放在同一行：.post-meta 是一个 flex 行
  const body = `${siteHeader()}
  <main>
    <article>
      <h1>${safeTitle}</h1>
      <div class="post-meta">
        <time class="post-date" datetime="${day}">${day}</time>
${tagList}      </div>
      ${html}
    </article>
${commentBox()}${html.includes('<img ') ? lightbox() : ''}  </main>`;

  return shell({ title: `${title} · ${SITE.title}`, body });
}

// 评论区：Giscus 走 GitHub Discussions，按 pathname 找对应讨论串
// 它是整站唯一的第三方 JS，且只在文章页、滚动到附近才加载
function commentBox() {
  const g = SITE.giscus;
  if (!g) return ''; // 没配就整块不渲染

  return `      <section class="comments">
        <h2 class="comments__title">评论</h2>
        <div class="giscus"
          data-repo="${g.repo}"
          data-repo-id="${g.repoId}"
          data-category="${g.category}"
          data-category-id="${g.categoryId}"
          data-mapping="${g.mapping}"
          data-strict="${g.strict}"
          data-reactions-enabled="${g.reactionsEnabled}"
          data-emit-metadata="${g.emitMetadata}"
          data-input-position="${g.inputPosition}"
          data-theme="preferred_color_scheme"
          data-lang="${g.lang}"
          data-loading="${g.loading}"></div>
      </section>
      <script src="https://giscus.app/client.js"
        data-repo="${g.repo}"
        data-repo-id="${g.repoId}"
        data-category="${g.category}"
        data-category-id="${g.categoryId}"
        data-mapping="${g.mapping}"
        data-strict="${g.strict}"
        data-reactions-enabled="${g.reactionsEnabled}"
        data-emit-metadata="${g.emitMetadata}"
        data-input-position="${g.inputPosition}"
        data-theme="preferred_color_scheme"
        data-lang="${g.lang}"
        data-loading="${g.loading}"
        crossorigin="anonymous"
        async></script>\n`;
}

// 图片点击放大：用原生 <dialog>，零依赖、零构建，就这 15 行
// 只有正文里真的有 <img> 时才注入，没有图片的文章页一个字节都不多
function lightbox() {
  return `      <dialog id="lightbox" class="lightbox">
        <img id="lightbox-img" alt="">
      </dialog>
      <script>
        const box = document.getElementById('lightbox');
        const big = document.getElementById('lightbox-img');
        for (const img of document.querySelectorAll('article img')) {
          img.addEventListener('click', () => {
            big.src = img.src; // 用卡片图自己的地址，不改尺寸
            big.alt = img.alt;
            box.showModal(); // 原生模态：自动有遮罩、自动锁滚动、Esc 自动关
          });
        }
        box.addEventListener('click', () => box.close()); // 点哪里都关
      </script>\n`;
}

// 一张文章卡片：列表页的最小单位，以后改样式只改这里
function postCard(post) {
  const day = formatDate(post.date);
  return `      <li class="post-card">
        <a class="post-card__title" href="/posts/${post.slug}/">${escapeHtml(post.title)}</a>
        <time class="post-card__date" datetime="${day}">${day}</time>
      </li>`;
}

// 分页导航：第 1 页是 /，第 N 页是 /page/N/
function pagination({ page, totalPages }) {
  if (totalPages <= 1) return '';
  const prev =
    page > 1
      ? `<a class="page-link" href="${page === 2 ? '/' : `/page/${page - 1}/`}">← 上一页</a>`
      : '<span class="page-link page-link--off">← 上一页</span>';
  const next =
    page < totalPages
      ? `<a class="page-link" href="/page/${page + 1}/">下一页 →</a>`
      : '<span class="page-link page-link--off">下一页 →</span>';

  return `
    <nav class="pagination">
      ${prev}
      <span class="page-link page-link--num">${page} / ${totalPages}</span>
      ${next}
    </nav>`;
}

// 首页：文章列表（顺序由调用方排好，这里不再排序）
export function listPage({ posts, page = 1, totalPages = 1 }) {
  const list =
    posts.length === 0
      ? '      <li class="post-card post-card--empty">还没有文章，去 content/posts 里建一篇吧。</li>'
      : posts.map(postCard).join('\n');

  const title = page > 1 ? `第 ${page} 页 · ${SITE.title}` : SITE.title;

  const body = `${siteHeader()}
  <main>
    <ul class="post-list">
${list}
    </ul>${pagination({ page, totalPages })}
  </main>`;

  return shell({ title, body });
}

// 标签总览：所有标签 + 每个标签下的文章数
export function tagsPage({ tags }) {
  const items =
    tags.length === 0
      ? '    <li class="post-card post-card--empty">还没有任何标签。在文章的 frontmatter 里加 tags: [前端] 即可。</li>'
      : tags
          .map(
            (t) => `      <li><a class="tag-cloud__item" href="/tags/${tagSlug(t.name)}/">${escapeHtml(t.name)}<span class="tag-cloud__count">${t.count}</span></a></li>`
          )
          .join('\n');

  const body = `${siteHeader()}
  <main>
    <h1 class="page-title">标签</h1>
    <ul class="tag-cloud">
${items}
    </ul>
  </main>`;

  return shell({ title: `标签 · ${SITE.title}`, body });
}

// 单个标签下的文章列表
export function tagPage({ tag, posts }) {
  const list =
    posts.length === 0
      ? '      <li class="post-card post-card--empty">这个标签下还没有文章。</li>'
      : posts.map(postCard).join('\n');

  const body = `${siteHeader()}
  <main>
    <h1 class="page-title">标签：${escapeHtml(tag)}</h1>
    <p class="post-date">共 ${posts.length} 篇　<a href="/tags/">← 全部标签</a></p>
    <ul class="post-list">
${list}
    </ul>
  </main>`;

  return shell({ title: `${tag} · ${SITE.title}`, body });
}

// 搜索页：唯一必须带 JS 的页面（静态站点没有服务端，只能在浏览器里过滤）
export function searchPage() {
  const body = `${siteHeader()}
  <main>
    <h1 class="page-title">搜索</h1>
    <p class="post-date">按标题、标签、摘要过滤，数据来自 /search.json</p>
    <input id="q" class="search-input" type="search" placeholder="输入关键词…" autocomplete="off">
    <p id="count" class="post-date"></p>
    <ul id="results" class="post-list"></ul>
  </main>
  <script>
    const q = document.getElementById('q');
    const results = document.getElementById('results');
    const count = document.getElementById('count');
    let items = [];

    // 只在搜索页加载索引，首页依然是 0 JS
    fetch('/search.json').then((r) => r.json()).then((data) => { items = data; render(); });

    function render() {
      const kw = q.value.trim().toLowerCase();
      const hit = kw === '' ? [] : items.filter((it) =>
        it.title.toLowerCase().includes(kw) ||
        it.tags.some((t) => t.toLowerCase().includes(kw)) ||
        it.excerpt.toLowerCase().includes(kw)
      );

      count.textContent = kw === '' ? '' : \`找到 \${hit.length} 篇\`;
      results.textContent = ''; // 清空

      for (const it of hit) {
        const li = document.createElement('li');
        li.className = 'post-card';
        const a = document.createElement('a');
        a.className = 'post-card__title';
        a.href = \`/posts/\${it.slug}/\`;
        a.textContent = it.title; // 用 textContent 而不是 innerHTML：标题里的 < 不会被当成标签
        const span = document.createElement('span');
        span.className = 'post-card__date';
        span.textContent = it.date;
        li.append(a, span);
        results.append(li);
      }
    }

    q.addEventListener('input', render);
  </script>`;

  return shell({ title: `搜索 · ${SITE.title}`, body });
}

// 友链页：数据来自 content/links.json
export function linksPage({ links }) {
  const items =
    links.length === 0
      ? '      <li class="post-card post-card--empty">还没有友链，编辑 content/links.json 添加。</li>'
      : links
          .map(
            (l) => `      <li class="friend">
        <a class="friend__link" href="${escapeHtml(l.url)}" target="_blank" rel="noopener noreferrer">
          ${l.avatar ? `<img class="friend__avatar" src="${escapeHtml(l.avatar)}" alt="" width="48" height="48" loading="lazy" decoding="async">` : ''}
          <span class="friend__body">
            <span class="friend__name">${escapeHtml(l.name)}</span>
            <span class="friend__desc">${escapeHtml(l.desc ?? '')}</span>
          </span>
        </a>
      </li>`
          )
          .join('\n');

  const body = `${siteHeader()}
  <main>
    <h1 class="page-title">友链</h1>
    <ul class="friend-list">
${items}
    </ul>
${commentBox()}  </main>`;

  return shell({ title: `友链 · ${SITE.title}`, body });
}

// 404 页：必须是根目录的单个 404.html，服务器找不到路径时直接读这个文件
export function notFoundPage({ posts }) {
  const links = posts
    .slice(0, 5)
    .map((p) => `      <li class="post-card"><a class="post-card__title" href="/posts/${p.slug}/">${escapeHtml(p.title)}</a></li>`)
    .join('\n');

  const body = `${siteHeader()}
  <main>
    <article>
      <h1>404</h1>
      <p class="post-date">这个地址不存在，可能是文章被删了，或者链接打错了。</p>
      <p><a href="/">← 回首页</a></p>
      <h2>最近的文章</h2>
      <ul class="post-list">
${links}
      </ul>
    </article>
  </main>`;

  return shell({ title: `404 · ${SITE.title}`, body });
}
