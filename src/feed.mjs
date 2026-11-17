import { escapeHtml, formatDate } from './utils.mjs'; // 转义 + 日期格式化
import { SITE } from './config.mjs'; // 站点信息

// 把 markdown 正文粗略压成一段纯文本，当 RSS 的摘要用
function excerpt(body, max = 120) {
  const text = body
    .replace(/```[\s\S]*?```/g, ' ') // 去掉代码块
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ') // 去掉图片
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1') // 链接只留文字
    .replace(/[#>*_`~|-]/g, ' ') // 去掉 markdown 记号
    .replace(/\s+/g, ' ') // 合并空白
    .trim();
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

// RSS 2.0：订阅器靠它抓文章，博客上线后必备
export function rssFeed({ posts }) {
  const items = posts
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
export function sitemap({ posts }) {
  const urls = [
    `  <url><loc>${escapeHtml(`${SITE.url}/`)}</loc></url>`,
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
