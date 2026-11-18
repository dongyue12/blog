import { readFileSync } from 'node:fs'; // 构建期读样式表
import { escapeHtml, formatDate, tagSlug } from './utils.mjs'; // 转义 + 日期 + 标签规范化
import { minifyCss } from './minify.mjs'; // 样式压缩
import { SITE } from './config.mjs'; // 站点信息（含 giscus 评论配置）

// 样式表在构建时读进来、压成一行、直接内联进 <head>
// 这样首屏少一个请求（省一次 RTT），代价是每页多约 2KB gzip
const CSS = minifyCss(readFileSync(new URL('./style.css', import.meta.url), 'utf8'));

// 主题脚本：必须放在 <head> 里、样式表之前执行，否则会闪一下白色（FOUC）
// 三种状态：auto（跟随系统）/ light / dark，存在 localStorage 的 theme 键里
const THEME_INIT = `(function () {
  var KEY = 'theme';
  var root = document.documentElement;
  var mq = window.matchMedia('(prefers-color-scheme: dark)');
  function pref() { try { return localStorage.getItem(KEY) || 'auto'; } catch (e) { return 'auto'; } }
  function resolve(p) { return p === 'auto' ? (mq.matches ? 'dark' : 'light') : p; }
  window.__theme = {
    pref: pref,
    resolve: resolve,
    set: function (p) {
      try { p === 'auto' ? localStorage.removeItem(KEY) : localStorage.setItem(KEY, p); } catch (e) {}
      root.dataset.theme = resolve(p);
    }
  };
  root.dataset.theme = resolve(pref());
  mq.addEventListener('change', function () { if (pref() === 'auto') root.dataset.theme = resolve('auto'); });
})();`;

// 按钮逻辑：放在 </body> 前，此时 DOM 已就绪
const THEME_BUTTON = `(function () {
  var btn = document.getElementById('theme-toggle');
  if (!btn) return;
  var ORDER = ['auto', 'light', 'dark'];
  var LABEL = { auto: '跟随系统', light: '浅色', dark: '深色' };
  var ICON = { auto: '\u25d0', light: '\u2600', dark: '\u263e' };

  function render() {
    var p = window.__theme.pref();
    btn.textContent = ICON[p];
    btn.title = '主题：' + LABEL[p] + '，点击切换';
    btn.setAttribute('aria-label', '主题：' + LABEL[p] + '，点击切换');
  }

  // 把当前主题推给 giscus 的 iframe（评论框自己不认我们的属性）
  function syncGiscus() {
    var f = document.querySelector('iframe.giscus-frame');
    if (f) {
      f.contentWindow.postMessage({ giscus: { setConfig: { theme: document.documentElement.dataset.theme } } }, 'https://giscus.app');
    }
  }

  btn.addEventListener('click', function () {
    var next = ORDER[(ORDER.indexOf(window.__theme.pref()) + 1) % ORDER.length];
    document.documentElement.classList.add('theme-transition'); // 只在切换这几百毫秒内开过渡
    window.__theme.set(next);
    render();
    syncGiscus();
    clearTimeout(window.__themeTimer);
    window.__themeTimer = setTimeout(function () {
      document.documentElement.classList.remove('theme-transition');
    }, 320);
  });

  // 用户手动选过主题时，评论框可能已经按系统主题渲染了，短暂轮询纠正
  if (window.__theme.pref() !== 'auto') {
    var n = 0;
    var iv = setInterval(function () { syncGiscus(); if (++n > 20) clearInterval(iv); }, 500);
  }

  render();
})();`;

// 返回顶部：滚动超过一屏就出现，右下角固定
// 用 rAF 节流，避免 scroll 每帧都改 DOM
// 页面上有右侧目录（文章页 / 宽屏文档页）时，按钮对齐到目录列的右边缘，
// 而不是贴在窗口角落 —— 自标尺未知（目录栏固定 14rem），用 JS 量一次就行
const BACK_TO_TOP = `(function () {
  var btn = document.getElementById('to-top');
  if (!btn) return;
  var ticking = false;

  function update() {
    btn.classList.toggle('is-visible', window.scrollY > 400);
    ticking = false;
  }
  window.addEventListener('scroll', function () {
    if (!ticking) { ticking = true; requestAnimationFrame(update); }
  }, { passive: true });   // passive：告诉浏览器我不阻止滚动，滚起来更顺
  update();

  // 按钮贴在正文的右边一点，而不是窗口角落：
  // 量正文（文档页 = article，列表页 = main）的右边缘，向右让出一个小间隙
  // 布局只在窗口大小变化时变 → 不用跟着滚动算
  // 注意：不能写 'article, main'——选择器列表按文档顺序取第一个，main 在外层会先命中
  var anchor = document.querySelector('article') || document.querySelector('main');
  function place() {
    if (!anchor) return;
    var rect = anchor.getBoundingClientRect();
    if (rect.width === 0) { btn.style.right = ''; return; }

    var GAP = 6;                                   // 离正文右边多少
    var width = btn.offsetWidth || 36;
    var right = document.documentElement.clientWidth - rect.right - GAP - width;
    btn.style.right = Math.max(12, Math.round(right)) + 'px';   // 窄屏时不要跑出屏
  }
  place();
  window.addEventListener('resize', place);

  btn.addEventListener('click', function () {
    // 系统开了「减少动态效果」就直接跳，不做平滑滚动
    var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' });
  });
})();`;

// 全站导航，改这里就等于改所有页面
const NAV = [
  { href: '/docs/', label: '文档' },
  { href: '/tags/', label: '标签' },
  { href: '/search/', label: '搜索' },
  { href: '/links/', label: '友链' },
];

// 页面外壳：每页都一样的 <head> 和骨架，抽出来只写一次
// bodyClass：个别页面需要改全局布局（比如文章页带右栏目录时，站头也跟着变宽）
function shell({ title, description = SITE.description, body, comments = false, canonical = '', bodyClass = '' }) {
  return `<!DOCTYPE html>
<html lang="${SITE.lang}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}">
${canonical ? `  <link rel="canonical" href="${SITE.url}${canonical}">\n` : ''}  <script>${THEME_INIT}</script>
${comments ? '  <link rel="preconnect" href="https://giscus.app" crossorigin>\n' : ''}  <style>${CSS}</style>
  <link rel="alternate" type="application/rss+xml" title="${escapeHtml(SITE.title)}" href="/rss.xml">
</head>
<body${bodyClass ? ` class="${bodyClass}"` : ''}>
${body}
<button id="to-top" class="to-top" type="button" aria-label="返回顶部" title="返回顶部">↑</button>
<script>${THEME_BUTTON}</script>
<script>${BACK_TO_TOP}</script>
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
      <button id="theme-toggle" class="theme-toggle" type="button" aria-label="切换主题">◐</button>
    </nav>
  </header>`;
}

// 「本页目录」：文章页和文档页共用一个右栏
// extraClass 给文档页用来区分窄宽屏（文章页 ≥60rem 就显示，文档页要 ≥78rem）
function tocList(toc) {
  return toc
    .map((h) => `            <li class="toc-item toc-item--h${h.level}"><a href="#${h.id}">${escapeHtml(h.text)}</a></li>`)
    .join('\n');
}

function tocAside(toc, extraClass = '') {
  return `    <aside class="toc-aside${extraClass ? ` ${extraClass}` : ''}">
      <nav aria-label="本页目录">
        <p class="toc-aside__title">本页目录</p>
        <ul>
${tocList(toc)}
        </ul>
      </nav>
    </aside>`;
}

// 一篇文章的完整页面
// 两股数据流，处理方式完全相反：
//   title / tags  是纯文本 → 必须转义
//   html          是 markdown 渲染出的 HTML → 绝对不能转义
// toc：h2/h3 列表。标题太少就不显示右栏（两三个标题的目录只是干扰）
export function layout({ title, date, html, tags = [], toc = [] }) {
  const day = formatDate(date);
  const safeTitle = escapeHtml(title);
  const hasToc = toc.length >= 3;

  const tagList =
    tags.length === 0
      ? ''
      : `        <ul class="tag-list">
${tags.map((t) => `          <li><a class="tag" href="/tags/${tagSlug(t)}/">${escapeHtml(t)}</a></li>`).join('\n')}
        </ul>\n`;

  // 日期和标签放在同一行：.post-meta 是一个 flex 行
  const article = `    <article>
      <h1>${safeTitle}</h1>
      <div class="post-meta">
        <time class="post-date" datetime="${day}">${day}</time>
${tagList}      </div>
      ${html}
    </article>`;

  // 有目录：正文限宽在左，目录吸顶在右；没目录：就是原来那个单列
  // 评论 / 灯箱也是 main 的直接子元素，用 grid-column 让它们对齐正文而不是拉满全宽
  const main = hasToc ? `  <main class="post-main">` : `  <main>`;

  const body = `${siteHeader()}
${main}
${article}${hasToc ? `\n${tocAside(toc)}` : ''}
${commentBox()}${html.includes('<img ') ? lightbox() : ''}  </main>`;

  return shell({ title: `${title} · ${SITE.title}`, body, comments: Boolean(SITE.giscus), bodyClass: hasToc ? 'has-toc' : '' });
}

// 评论区：Giscus 走 GitHub Discussions，按 pathname 找对应讨论串
// 它是整站唯一的第三方 JS，且只在文章页、滚动到附近才加载
function commentBox() {
  const g = SITE.giscus;
  if (!g) return ''; // 没配就整块不渲染

  return `      <section class="comments">
        <h2 class="comments__title">评论</h2>
        <div class="giscus"></div>
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

// 图片点击放大 + 滚轮对准鼠标缩放 + 按住左键拖动平移
// 用原生 <dialog>，零依赖；只有正文里有 <img> 时才注入
// 注意：这里不用模板字符串（避免和外层反引号打架），一律用字符串拼接
function lightbox() {
  return `      <dialog id="lightbox" class="lightbox">
        <img id="lightbox-img" alt="" draggable="false">
      </dialog>
      <script>
        const box = document.getElementById('lightbox');
        const big = document.getElementById('lightbox-img');
        const MIN = 0.5, MAX = 5, STEP = 1.15;
        let scale = 1, x = 0, y = 0;      // 当前缩放倍率和平移量
        let dragging = false, sx = 0, sy = 0, ox = 0, oy = 0, moved = 0;

        function apply() {
          big.style.transform = 'translate(' + x + 'px,' + y + 'px) scale(' + scale + ')';
        }
        function reset() { scale = 1; x = 0; y = 0; moved = 0; apply(); }

        // 点正文里的图片 → 打开灯箱
        for (const img of document.querySelectorAll('article img')) {
          img.addEventListener('click', () => {
            big.src = img.src;
            big.alt = img.alt;
            reset();
            box.showModal();   // 原生模态：遮罩、锁滚动、Esc 关闭都是自带的
          });
        }

        // 滚轮缩放：以鼠标所在位置为锚点，那个点始终留在鼠标下面
        box.addEventListener('wheel', (e) => {
          e.preventDefault();  // 不然整个页面跟着滚
          const rect = big.getBoundingClientRect();
          const next = Math.min(MAX, Math.max(MIN, scale * (e.deltaY < 0 ? STEP : 1 / STEP)));
          const k = next / scale;            // 本次实际放大倍数（撞到上下限时会被夹住）
          // 鼠标相对「图片中心」的位置
          const mx = e.clientX - (rect.left + rect.width / 2);
          const my = e.clientY - (rect.top + rect.height / 2);
          x = x + mx * (1 - k);              // 反向补偿位移，锚点才不会跑
          y = y + my * (1 - k);
          scale = next;
          apply();
        }, { passive: false });             // 要 preventDefault 就不能用默认 passive

        // 只有按住左键才平移（右键/中键/多点触控都不触发）
        big.addEventListener('pointerdown', (e) => {
          if (e.button !== 0 || !e.isPrimary) return;
          e.preventDefault();                // 阻止浏览器开始「拖拽图片」的原生行为
          dragging = true; moved = 0;
          sx = e.clientX; sy = e.clientY; ox = x; oy = y;
          big.setPointerCapture(e.pointerId); // 拖出图片范围也不丢事件
        });
        big.addEventListener('pointermove', (e) => {
          if (!dragging) return;
          x = ox + (e.clientX - sx);
          y = oy + (e.clientY - sy);
          moved = Math.hypot(e.clientX - sx, e.clientY - sy);
          apply();
        });
        big.addEventListener('pointerup', (e) => {
          if (e.button !== 0) return;
          dragging = false;
        });
        big.addEventListener('pointercancel', () => { dragging = false; });

        // 只有点「遮罩背景」才关闭（拖动过就不算点击）；双击复位
        box.addEventListener('click', (e) => { if (e.target === box && moved < 4) box.close(); });
        big.addEventListener('dblclick', reset);
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

/* ---------- 文档 ---------- */

// 侧边栏目录：当前分类的整棵树，当前页高亮
// 文件夹只当小标题用，不单独出页面（分类页已经把内容列全了）
function docSidebar({ category, currentUrl }) {
  const render = (nodes) =>
    nodes
      .map((node) => {
        if (node.type === 'dir') {
          return `          <li class="doc-nav__dir">
            <span class="doc-nav__label">${escapeHtml(node.title)}</span>
            <ul>
${render(node.children)}
            </ul>
          </li>`;
        }
        const current = node.url === currentUrl ? ' aria-current="page"' : '';
        return `          <li><a href="${node.url}"${current}>${escapeHtml(node.title)}</a></li>`;
      })
      .join('\n');

  return `      <aside class="doc-sidebar">
        <nav class="doc-nav" aria-label="文档目录">
          <p class="doc-nav__head">
            <a href="${category.url}">${escapeHtml(category.title)}</a>
            <a class="doc-nav__all" href="/docs/">全部</a>
          </p>
          <ul>
${render(category.children)}
          </ul>
        </nav>
      </aside>`;
}

// 文档总览：所有分类 + 每个分类下的子文件夹
// 没有分类时给一句提示，别让页面空着
const DOC_HINT = '把文章放进 content/document 下的文件夹里，一个文件夹就是一个分类。';

export function docsPage({ categories }) {
  const items =
    categories.length === 0
      ? `      <li class="post-card post-card--empty">还没有文档。${DOC_HINT}</li>`
      : categories
          .map((cat) => {
            const sub = cat.children.filter((n) => n.type === 'dir').map((n) => escapeHtml(n.title));
            return `      <li class="doc-cat">
        <a class="doc-cat__title" href="${cat.url}">${escapeHtml(cat.title)}<span class="doc-cat__count">${cat.docs.length} 篇</span></a>
${cat.description ? `        <p class="doc-cat__desc">${escapeHtml(cat.description)}</p>\n` : ''}${sub.length ? `        <p class="doc-cat__sub">${sub.join(' · ')}</p>\n` : ''}      </li>`;
          })
          .join('\n');

  const body = `${siteHeader()}
  <main>
    <h1 class="page-title">文档</h1>
    <ul class="doc-cat-list">
${items}
    </ul>
  </main>`;

  return shell({ title: `文档 · ${SITE.title}`, body });
}

// 分类首页 = 该分类的第一篇：点分类直接开读，少一次点击
// 想回头看全目录，左侧边栏里就是完整列表
export function categoryPage({ category, doc, html, toc = [], next = null }) {
  return docView({
    category,
    doc,
    html,
    toc,
    prev: null,
    next,
    crumbs: ['<a href="/docs/">文档</a>', `<span aria-current="page">${escapeHtml(category.title)}</span>`],
    title: `${category.title} · 文档 · ${SITE.title}`,
    description: category.description || doc.description || SITE.description,
    canonical: doc.url, // 同一个正文有两个地址，告诉搜索引擎以文章地址为准
  });
}

// 上一篇 / 下一篇：文档是按编号顺序读的，这个比日期有用
function docPager(prev, next) {
  if (!prev && !next) return '';

  const item = (doc, dir, cls) =>
    doc
      ? `<a class="doc-pager__link ${cls}" href="${doc.url}"><span class="doc-pager__dir">${dir}</span>${escapeHtml(doc.title)}</a>`
      : `<span class="doc-pager__link ${cls} doc-pager__link--off"></span>`;

  return `      <nav class="doc-pager" aria-label="上一篇 / 下一篇">
        ${item(prev, '← 上一篇', '')}
        ${item(next, '下一篇 →', 'doc-pager__link--next')}
      </nav>\n`;
}

// 一篇文档：左侧目录、右侧正文
// toc 由 build 从正文标题里抽出来（[{ level, id, text }]），这里只负责画
export function docPage({ category, doc, html, toc = [], prev = null, next = null }) {
  const crumbs = [
    '<a href="/docs/">文档</a>',
    `<a href="${category.url}">${escapeHtml(category.title)}</a>`,
    ...doc.crumbs.map((c) => `<span>${escapeHtml(c)}</span>`),
    `<span aria-current="page">${escapeHtml(doc.title)}</span>`,
  ].join(' / ');

  return docView({
    category,
    doc,
    html,
    toc,
    prev,
    next,
    crumbs,
    title: `${doc.title} · ${category.title} · ${SITE.title}`,
    description: doc.description || category.description || SITE.description,
  });
}

// 文档页和分类首页的唯一区别只有面包屑、标题和上下篇，骨架都在这儿
function docView({ category, doc, html, toc, prev, next, crumbs, title, description, canonical = '' }) {
  // 分类首页传进来的面包屑是个数组，这里统一拼成一行
  const trail = Array.isArray(crumbs) ? crumbs.join(' / ') : crumbs;
  const hasToc = toc.length > 1;

  // 窄屏（放不下三栏）时，目录折叠在正文顶部；宽屏时挂到右侧（.doc-toc-aside）
  // 两份用同一份数据渲染，CSS 按宽度只留一份
  const tocHtml = hasToc
    ? `        <details class="doc-toc">
          <summary class="doc-toc__title">本页目录（${toc.length} 节，点击展开）</summary>
          <ul>
${tocList(toc)}
          </ul>
        </details>\n`
    : '';

  const body = `${siteHeader()}
  <main class="doc-main">
    <nav class="doc-crumbs" aria-label="面包屑">${trail}</nav>
    <div class="doc-layout">
${docSidebar({ category, currentUrl: doc.url })}
      <article class="doc-body">
        <h1>${escapeHtml(doc.title)}</h1>
${tocHtml}        ${html}
${docPager(prev, next)}      </article>
${hasToc ? `${tocAside(toc, 'doc-toc-aside')}\n` : ''}    </div>
${html.includes('<img ') ? lightbox() : ''}  </main>`;

  return shell({ title, body, description, canonical });
}

// 搜索页：唯一必须带 JS 的页面（静态站点没有服务端，只能在浏览器里过滤）
export function searchPage() {
  const body = `${siteHeader()}
  <main>
    <h1 class="page-title">搜索</h1>
    <p class="post-date">按标题、标签、摘要过滤文章和文档，数据来自 /search.json</p>
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
        a.href = it.url; // 文章和文档都自带 url，这里不用拼
        a.textContent = it.title; // 用 textContent 而不是 innerHTML：标题里的 < 不会被当成标签
        const span = document.createElement('span');
        span.className = 'post-card__date';
        span.textContent = it.date || (it.kind === 'doc' ? '文档' : '');
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

  return shell({ title: `友链 · ${SITE.title}`, body, comments: Boolean(SITE.giscus) });
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
