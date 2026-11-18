import path from 'node:path'; // 拼路径的扩展（相对路径显示更好看）
import fs from 'node:fs/promises'; // 建目录、写文件
import MarkdownIt from 'markdown-it'; // markdown → HTML
import { loadPosts, BlogError } from './posts.mjs'; // 引入解析函数和错误类型
import { loadDocs } from './docs.mjs'; // 读 content/document（一个文件夹 = 一个分类）
import { loadLinks } from './links.mjs'; // 读友链数据
import {
  layout,
  listPage,
  notFoundPage,
  tagsPage,
  tagPage,
  searchPage,
  linksPage,
  docsPage,
  categoryPage,
  docPage,
} from './templates.mjs'; // 页面模板
import { rssFeed, sitemap } from './feed.mjs'; // RSS 和 sitemap
import { excerpt, tagSlug } from './utils.mjs'; // 摘要 + 标签规范化
import { renderWithToc } from './toc.mjs'; // 标题 id + 本页目录
import { highlightCode } from './highlight.mjs'; // 代码块语法高亮（构建时）
import { SITE } from './config.mjs'; // 站点配置
import { minifyHtml } from './minify.mjs'; // HTML 压缩
import { collectImageSizes } from './image-size.mjs'; // 图片尺寸（补 width/height 防跳动）

const DIST = 'dist'; // 产物目录

// html:false = md 里写原始 HTML 会被转义（安全默认）
// highlight = 代码块在构建时染成带 class 的 HTML，前端不需要任何高亮脚本
const md = new MarkdownIt({ html: false, linkify: true, highlight: highlightCode });

// 图片尺寸表：渲染规则是同步的，所以尺寸必须提前扫好
const imageSizes = await collectImageSizes('public');

// 给所有图片加上懒加载 + 明确的宽高，避免加载完成时页面跳动（CLS）
const defaultImage = md.renderer.rules.image;
md.renderer.rules.image = (tokens, idx, options, env, self) => {
  const token = tokens[idx];
  token.attrSet('loading', 'lazy'); // 滚到附近才下载
  token.attrSet('decoding', 'async'); // 解码不阻塞渲染

  // src 是本站图片才查表；外链图片拿不到尺寸，跳过
  const src = token.attrGet('src') ?? '';
  const size = imageSizes.get(src);
  if (size) {
    token.attrSet('width', String(size.width)); // 浏览器据此提前留出空间
    token.attrSet('height', String(size.height));
  }

  return defaultImage(tokens, idx, options, env, self);
};

// 把错误清单排成给人看的样子（排版归这里管，posts.mjs 只给数据）
function printProblems(problems) {
  console.error('');
  console.error(`✗ 构建中止：${problems.length} 篇文章不符合规格`);
  console.error('');

  for (const [i, p] of problems.entries()) {
    console.error(`  ${i + 1}) ${path.relative(process.cwd(), p.file)}`);
    console.error(`     原因：${p.reason}`);
    console.error(`     改法：${p.hint}`);
    console.error('');
  }
}

// 写文件的小工具：自动建父目录；HTML 顺手压缩（其它文件本来就是紧凑格式）
async function write(relativePath, content) {
  const target = path.join(DIST, relativePath);
  await fs.mkdir(path.dirname(target), { recursive: true });
  const isHtml = target.endsWith('.html');
  await fs.writeFile(target, isHtml ? minifyHtml(content) : content, 'utf8');
  return target;
}

try {
  const posts = await loadPosts('content/posts'); // 读 content/posts 下所有文章
  const docs = await loadDocs('content/document'); // 读 content/document 下所有文档
  const links = await loadLinks('content/links.json'); // 读友链

  // 排序规则：编号倒序（编号最大的排最前，老文章沉到最后）
  // 不参与排序的字段：date（只作展示用）
  posts.sort((a, b) => Number(b.slug) - Number(a.slug));

  // 清空产物：保证「删掉一篇文章，重跑后它真的不见了」
  await fs.rm(DIST, { recursive: true, force: true });
  // 静态资源原样搬过去（style.css、图片、robots.txt 等）
  await fs.cp('public', DIST, { recursive: true });

  console.log(`✓ 共 ${posts.length} 篇`);

  // 首页 + 分页：第 1 页是 index.html，第 N 页是 page/N/index.html
  const perPage = SITE.postsPerPage;
  const totalPages = Math.max(1, Math.ceil(posts.length / perPage));

  for (let page = 1; page <= totalPages; page++) {
    const slice = posts.slice((page - 1) * perPage, page * perPage); // 只取这一页的
    const html = listPage({ posts: slice, page, totalPages });
    const file = page === 1 ? 'index.html' : path.join('page', String(page), 'index.html');
    console.log(`  ${await write(file, html)}`);
  }

  // 每篇文章
  for (const post of posts) {
    const { html, toc } = renderWithToc(md, post.body); // 正文 → HTML，顺手抽出本页目录
    const page = layout({ title: post.title, date: post.date, html, toc, tags: post.tags }); // 套模板
    const out = await write(path.join('posts', post.slug, 'index.html'), page); // 目录形式 = 干净 URL
    console.log(`  ${post.slug} | ${post.title.slice(0, 24)} | → ${out}`);
  }

  // 标签聚合：先用 Map 攒出「标签 → 文章列表」，再统一渲染
  const tagMap = new Map();
  for (const post of posts) {
    for (const tag of post.tags) {
      if (!tagMap.has(tag)) tagMap.set(tag, []);
      tagMap.get(tag).push(post);
    }
  }
  // 标签按文章数从多到少排，一样多时按名字
  const tagStats = [...tagMap.entries()]
    .map(([name, list]) => ({ name, count: list.length }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'zh'));

  console.log(`  ${await write('tags/index.html', tagsPage({ tags: tagStats }))}`);

  for (const [tag, list] of tagMap) {
    const out = await write(path.join('tags', tagSlug(tag), 'index.html'), tagPage({ tag, posts: list }));
    console.log(`  标签 ${tag} (${list.length} 篇) → ${out}`);
  }

  // 文档：总览 → 分类 → 每篇
  // URL 由 docs.mjs 算好（/docs/分类/子文件夹/文件名/），这里只管写文件
  // 分类首页不放列表，直接就是该类第一篇：点进去就开始读
  const docCount = docs.reduce((n, cat) => n + cat.docs.length, 0);
  console.log(`✓ 文档 ${docs.length} 个分类 / ${docCount} 篇`);
  console.log(`  ${await write('docs/index.html', docsPage({ categories: docs }))}`);

  for (const category of docs) {
    const [first] = category.docs;
    const homeUrl = path.join('docs', category.slug, 'index.html');

    // _index.md 的正文（如果有）垫在第一篇前面，当作「先读这里」
    const homeBody = category.intro ? `${category.intro}\n\n${first.body}` : first.body;
    const home = renderWithToc(md, homeBody);
    console.log(
      `  分类 ${category.title} → ${await write(
        homeUrl,
        categoryPage({ category, doc: first, html: home.html, toc: home.toc, next: category.docs[1] ?? null })
      )}`
    );

    for (const [i, doc] of category.docs.entries()) {
      const { html, toc } = renderWithToc(md, doc.body);
      const page = docPage({
        category,
        doc,
        html,
        toc,
        prev: category.docs[i - 1] ?? null,
        next: category.docs[i + 1] ?? null,
      });
      console.log(`  ${doc.url} | ${doc.title.slice(0, 20)} | → ${await write(path.join(doc.url, 'index.html'), page)}`);
    }
  }

  // 搜索索引：只放标题/标签/摘要，正文不进索引（体积可控）
  const index = [
    ...posts.map((p) => ({
      kind: 'post',
      url: `/posts/${p.slug}/`,
      title: p.title,
      tags: p.tags,
      date: p.date.toISOString().slice(0, 10),
      excerpt: excerpt(p.body, 100),
    })),
    // 文档没有日期，用分类名填在右侧
    ...docs.flatMap((cat) =>
      cat.docs.map((d) => ({
        kind: 'doc',
        url: d.url,
        title: d.title,
        tags: [cat.title],
        date: '',
        excerpt: excerpt(d.body, 100),
      }))
    ),
  ];
  console.log(`  ${await write('search.json', JSON.stringify(index))}`);
  console.log(`  ${await write('search/index.html', searchPage())}`);

  // 友链
  console.log(`  ${await write('links/index.html', linksPage({ links }))}`);

  // 404 / RSS / sitemap
  console.log(`  ${await write('404.html', notFoundPage({ posts }))}`);
  console.log(`  ${await write('rss.xml', rssFeed({ posts }))}`);
  console.log(`  ${await write('sitemap.xml', sitemap({ posts, extraPaths: ['/docs/', '/tags/', '/links/'], docUrls: docs.flatMap((c) => [c.url, ...c.docs.map((d) => d.url)]) }))}`);
} catch (err) {
  if (err instanceof BlogError) {
    printProblems(err.problems); // 文章的问题：排成清单，退出码 1
    process.exitCode = 1;
  } else {
    throw err; // 不是文章的问题（比如磁盘错、代码 bug）→ 原样抛出，别掩盖
  }
}
