import { escapeHtml, formatDate } from './utils.mjs'; // 转义 + 日期格式化
import { excerpt } from './utils.mjs'; // 正文压成纯文本摘要
import { SITE } from './config.mjs'; // 站点信息

// RSS 2.0：订阅器靠它抓文章，博客上线后必备
// 只放最近的若干篇：文章多了以后，RSS 里塞全部会变成几百 KB 的大文件
export function rssFeed({ posts, limit = 20 }) {
  const items = posts
    .slice(0, limit)
    .map((post) => {
      const link = `${SITE.url}/posts/${post.slug}/`;
      return `    <item>
      <title>${escapeHtml(post.title)}</title>
      <link>${escapeHtml(link)}</link>
      <guid isPermaLink="true">${escapeHtml(link)}</guid>
      <pubDate>${post.date.toUTCString()}</pubDate>
      <description>${escapeHtml(excerpt(post.body))}</description>
    </item>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeHtml(SITE.title)}</title>
    <link>${escapeHtml(SITE.url)}</link>
    <description>${escapeHtml(SITE.description)}</description>
    <language>${SITE.lang}</language>
    <atom:link href="${escapeHtml(`${SITE.url}/rss.xml`)}" rel="self" type="application/rss+xml" />
${items}
  </channel>
</rss>
`;
}

// sitemap：告诉搜索引擎有哪些页面、最后更新时间
export function sitemap({ posts, extraPaths = [] }) {
  const urls = [
    `  <url><loc>${escapeHtml(`${SITE.url}/`)}</loc></url>`,
    ...extraPaths.map((p) => `  <url><loc>${escapeHtml(`${SITE.url}${p}`)}</loc></url>`),
    ...posts.map((post) => {
      const loc = `${SITE.url}/posts/${post.slug}/`;
      return `  <url><loc>${escapeHtml(loc)}</loc><lastmod>${formatDate(post.date)}</lastmod></url>`;
    }),
  ].join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;
}
