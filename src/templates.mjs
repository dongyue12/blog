import { escapeHtml, formatDate, tagSlug } from './utils.mjs'; // 转义 + 日期 + 标签规范化
import { SITE } from './config.mjs'; // 站点信息（含 giscus 评论配置）

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

  btn.addEventListener('click', function () {
    // 系统开了「减少动态效果」就直接跳，不做平滑滚动
    var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' });
  });
})();`;

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
  <script>${THEME_INIT}</script>
  <link rel="stylesheet" href="/style.css">
  <link rel="alternate" type="application/rss+xml" title="${escapeHtml(SITE.title)}" href="/rss.xml">
</head>
<body>
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
