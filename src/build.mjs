import path from 'node:path'; // 拼路径的扩展（相对路径显示更好看）
import fs from 'node:fs/promises'; // 建目录、写文件
import MarkdownIt from 'markdown-it'; // markdown → HTML
import { loadPosts, BlogError } from './posts.mjs'; // 引入解析函数和错误类型
import { layout, listPage, notFoundPage } from './templates.mjs'; // 页面模板
import { rssFeed, sitemap } from './feed.mjs'; // RSS 和 sitemap
import { SITE } from './config.mjs'; // 站点配置

const DIST = 'dist'; // 产物目录

// html:false = md 里写原始 HTML 会被转义（安全默认）
const md = new MarkdownIt({ html: false, linkify: true });

// 给所有图片加上懒加载，避免首屏外的图一股脑下载
const defaultImage = md.renderer.rules.image;
md.renderer.rules.image = (tokens, idx, options, env, self) => {
  tokens[idx].attrSet('loading', 'lazy'); // 滚到附近才下载
  tokens[idx].attrSet('decoding', 'async'); // 解码不阻塞渲染
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

// 写文件的小工具：自动建父目录
async function write(relativePath, content) {
  const target = path.join(DIST, relativePath);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, content, 'utf8');
  return target;
}

try {
  const posts = await loadPosts('content/posts'); // 读 content/posts 下所有文章

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
    const html = md.render(post.body); // 正文 → HTML（这段 HTML 不再转义）
    const page = layout({ title: post.title, date: post.date, html }); // 套模板
    const out = await write(path.join('posts', post.slug, 'index.html'), page); // 目录形式 = 干净 URL
    console.log(`  ${post.slug} | ${post.title.slice(0, 24)} | → ${out}`);
  }

  // 404 / RSS / sitemap
  console.log(`  ${await write('404.html', notFoundPage({ posts }))}`);
  console.log(`  ${await write('rss.xml', rssFeed({ posts }))}`);
  console.log(`  ${await write('sitemap.xml', sitemap({ posts }))}`);
} catch (err) {
  if (err instanceof BlogError) {
    printProblems(err.problems); // 文章的问题：排成清单，退出码 1
    process.exitCode = 1;
  } else {
    throw err; // 不是文章的问题（比如磁盘错、代码 bug）→ 原样抛出，别掩盖
  }
}
