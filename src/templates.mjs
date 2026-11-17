import { escapeHtml, formatDate } from './utils.mjs'; // 转义 + 日期格式化
import { SITE } from './config.mjs'; // 站点信息

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

// 一篇文章的完整页面
// 两股数据流，处理方式完全相反：
//   title / date  是纯文本 → 必须转义，否则标题里的 < 会破坏标签结构
//   html          是 markdown 渲染出的 HTML → 绝对不能转义，转了就变成一堆尖括号文本
export function layout({ title, date, html }) {
  const day = formatDate(date);
  const safeTitle = escapeHtml(title); // 只转义这一份，html 原样插入

  const body = `  <header class="site-header">
    <a href="/">← 返回首页</a>
  </header>
  <main>
    <article>
      <h1>${safeTitle}</h1>
      <time class="post-date" datetime="${day}">${day}</time>
      ${html}
    </article>
  </main>`;

  return shell({ title: `${title} · ${SITE.title}`, body });
}

// 一张文章卡片：列表页的最小单位，以后改样式只改这里
function postCard(post) {
  const day = formatDate(post.date);
  return `      <li class="post-card">
        <a class="post-card__title" href="/posts/${post.slug}/">${escapeHtml(post.title)}</a>
        <time class="post-card__date" datetime="${day}">${day}</time>
      </li>`;
}

// 首页：文章列表（顺序由调用方排好，这里不再排序）
export function listPage({ posts }) {
  const list =
    posts.length === 0
      ? '      <li class="post-card post-card--empty">还没有文章，去 content/posts 里建一篇吧。</li>'
      : posts.map(postCard).join('\n');

  const body = `  <header class="site-header">
    <h1 class="site-title">${escapeHtml(SITE.title)}</h1>
  </header>
  <main>
    <ul class="post-list">
${list}
    </ul>
  </main>`;

  return shell({ title: SITE.title, body });
}

// 404 页：必须是根目录的单个 404.html，服务器找不到路径时直接读这个文件
export function notFoundPage({ posts }) {
  const links = posts
    .slice(0, 5)
    .map((p) => `      <li class="post-card"><a class="post-card__title" href="/posts/${p.slug}/">${escapeHtml(p.title)}</a></li>`)
    .join('\n');

  const body = `  <header class="site-header">
    <h1 class="site-title">${escapeHtml(SITE.title)}</h1>
  </header>
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
