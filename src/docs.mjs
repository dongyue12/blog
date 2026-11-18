// 文档：content/document 下「一个文件夹 = 一个分类」
// 和 content/posts 的区别：
//   文章有编号、有日期、按编号倒序（新的在前）
//   文档没有时间概念，按文件夹组织、按文件名里的编号正序（从头读）
// 文件可以带 frontmatter（title/description），也可以直接以一行的 # 标题 开头
import fs from 'node:fs/promises'; // 递归读目录
import path from 'node:path'; // 拼路径
import matter from 'gray-matter'; // 可选的 frontmatter
import { tagSlug } from './utils.mjs'; // 文件名 → URL 片段

const SKIP_RE = /^[._]/; // 以 . 或 _ 开头的文件/文件夹跳过；_index.md 例外，它是文件夹自己的介绍
const INDEX_FILE = '_index.md';

// 文件名里的编号：`01.vue介绍` → 1；没编号 → Infinity（排在最后）
const ORDER_RE = /^(\d+)\s*[.\-_、\s]\s*/;

function orderOf(name) {
  const m = name.match(ORDER_RE);
  return m ? Number(m[1]) : Number.POSITIVE_INFINITY;
}

// 去掉编号前缀：`001.css是什么` → `css是什么`
function stripOrder(name) {
  return name.replace(ORDER_RE, '').trim();
}

// 显示用名字：去掉编号前缀和 .md 后缀（URL 里保留编号，方便和磁盘文件名对应）
function displayName(name) {
  return stripOrder(name.replace(/\.md$/i, ''));
}

// 排序：先比编号，再比名字（中文按拼音，数字按数值，`10` 排在 `9` 后面）
// 没编号的（Infinity）自然地排在所有编号后面；两个都没编号才比名字
function compareName(a, b) {
  const orderA = orderOf(a);
  const orderB = orderOf(b);
  if (orderA !== orderB) return orderA < orderB ? -1 : 1;
  return a.localeCompare(b, 'zh', { numeric: true });
}

// 文件夹自己的介绍：content/document/前端/_index.md
// 正文会作为分类页的说明文字，description 用在一句话摘要的位置
async function readFolderMeta(dir) {
  const raw = await fs.readFile(path.join(dir, INDEX_FILE), 'utf8').catch(() => null);
  if (raw === null) return { title: '', description: '', body: '' };

  const { data, content } = matter(raw);
  return {
    title: data.title ? String(data.title) : '',
    description: data.description ? String(data.description) : '',
    body: content.trim(),
  };
}

// 拆出标题：优先 frontmatter，其次正文开头的一级标题，最后退回文件名
// 一级标题只在「正文开头就是它」时才认，避免把代码块里的 # 当成标题
function splitTitle(content, frontTitle, fileName) {
  const m = content.match(/^#[ \t]+(.+?)[ \t]*$/m);
  let body = content;
  let heading = '';

  if (m && content.slice(0, m.index).trim() === '') {
    heading = m[1].trim();
    body = content.slice(m.index + m[0].length);
  }

  // 文件名里的编号只是排的，不该跟着标题一起显示：
  // 如果一级标题就是文件名（`001.css是什么.md` → `# 1.css是什么`），用去掉编号的名字
  // （编号位数不统一也算「就是文件名」，两边都去掉编号再比）
  const bare = displayName(fileName);
  if (heading && stripOrder(heading) === bare) heading = bare;

  return {
    title: String(frontTitle || heading || displayName(fileName)).trim(),
    body: body.replace(/^\s*\n/, ''),
  };
}

// 递归读一个文件夹 → 节点数组（目录节点 + 文档节点），已按编号排好
// urlPath 是这一层在 URL 里的前缀，crumbs 是它在分类里的位置（面包屑）
async function walk(dir, urlPath, crumbs) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const nodes = [];

  for (const entry of entries) {
    const name = entry.name;
    if (name === INDEX_FILE || SKIP_RE.test(name)) continue;

    if (entry.isDirectory()) {
      const slug = tagSlug(name) || 'dir';
      nodes.push({
        type: 'dir',
        name,
        title: displayName(name),
        slug,
        url: `${urlPath}/${slug}/`,
        crumbs: [...crumbs, displayName(name)],
        children: await walk(path.join(dir, name), `${urlPath}/${slug}`, [...crumbs, displayName(name)]),
      });
      continue;
    }

    if (!/\.md$/i.test(name)) continue; // 图片、附件等一律不参与
    // Obsidian 的 Excalidraw 插件会把整份绘图数据存成 .excalidraw.md，
    // 渲染出来是一堆坐标和文本，不是给人读的笔记，直接跳过
    if (/\.excalidraw\.md$/i.test(name)) continue;

    const file = path.join(dir, name);
    const raw = await fs.readFile(file, 'utf8'); // utf8 别漏，否则拿到 Buffer

    // 文档可以没有 frontmatter；写了但写错时报清楚是哪个文件
    let data, content;
    try {
      ({ data, content } = matter(raw));
    } catch (err) {
      throw new Error(`${file} 的 frontmatter 不是合法 YAML：${err.reason ?? err.message}`);
    }
    const { title, body } = splitTitle(content, data.title, name);

    // URL 用完整文件名（含编号）：同一文件夹里不会撞，也方便回头找源文件
    const slug = tagSlug(name.replace(/\.md$/i, '')) || 'index';

    nodes.push({
      type: 'doc',
      name,
      file,
      title,
      slug,
      url: `${urlPath}/${slug}/`,
      crumbs,
      body,
      description: data.description ? String(data.description) : '',
    });
  }

  return nodes.sort((a, b) => compareName(a.name, b.name));
}

// 把树按阅读顺序摊平（先自己，再进子文件夹），用来做上一页 / 下一页
function flatten(nodes, out = []) {
  for (const node of nodes) {
    if (node.type === 'doc') out.push(node);
    else flatten(node.children, out);
  }
  return out;
}

// 读全部文档分类。一个分类 = content/document 下的一个文件夹
export async function loadDocs(root = 'content/document') {
  let entries;
  try {
    entries = await fs.readdir(root, { withFileTypes: true });
  } catch {
    return []; // 没有这个目录就当作没有文档，不阻断构建
  }

  const categories = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || SKIP_RE.test(entry.name)) continue;

    const dir = path.join(root, entry.name);
    const slug = tagSlug(entry.name) || 'docs';
    const meta = await readFolderMeta(dir);
    const children = await walk(dir, `/docs/${slug}`, []);
    const docs = flatten(children);

    if (docs.length === 0 && !meta.body) continue; // 空文件夹不出页面

    categories.push({
      type: 'category',
      dir,
      name: entry.name,
      slug,
      url: `/docs/${slug}/`,
      title: meta.title || displayName(entry.name),
      description: meta.description,
      intro: meta.body, // 没渲染的 markdown，交给 build
      children,
      docs,
    });
  }

  // 分类之间：没编号的按名字排（中文按拼音），有编号的按编号
  return categories.sort((a, b) => compareName(a.name, b.name));
}
