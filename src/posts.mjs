import fs from 'node:fs/promises'; // 读目录、读文件的扩展
import path from 'node:path'; // 拼路径的扩展（跨系统安全）
import matter from 'gray-matter'; // 读入解析 frontmatter 的扩展
import { tagSlug } from './utils.mjs'; // 标签 → URL 片段

const NAME_RE = /^(\d{3})\.(.+)\.md$/; // 文件名规格：3位编号.标题.md

// 构建错误：装一堆「哪个文件、什么原因、怎么改」
// 注意：这里只负责"收集内容"，不负责排版展示（排版是 build 的事）
export class BlogError extends Error {
  constructor(problems) {
    super(`有 ${problems.length} 篇文章不符合规格`);
    this.name = 'BlogError';
    this.problems = problems; // 形如 [{ file, reason, hint }]
  }
}

export async function loadPosts(postsDir) {
  // ① 读目录（用参数，不写死路径）
  const files = await fs.readdir(postsDir);

  // ② 过滤出 .md（把 .gitkeep 之类的杂项挡掉）
  const mdFiles = files.filter((name) => name.endsWith('.md'));

  const posts = []; // 最终结果集
  const seen = new Map(); // 编号 → 文件名，用来查重并报出冲突双方
  const problems = []; // 错误先全部收集，最后一次性报，不在第一个错处停下

  // ③ 循环每个文件
  for (const fileName of mdFiles) {
    const file = path.join(postsDir, fileName); // 报错时要给完整路径

    // ④ 正则拆文件名 → slug / title
    const matched = fileName.match(NAME_RE); // 匹配失败返回 null
    if (!matched) {
      // 文件名不合规，连编号都定位不到，这一篇只能跳过
      problems.push({
        file,
        reason: '文件名不合规：缺少 3 位编号前缀，或缺少标题',
        hint: `重命名为「3位编号.标题.md」，例如 004.${fileName.replace(/\.md$/, '')}`,
      });
      continue;
    }
    const slug = matched[1]; // 第1个括号：编号
    const title = matched[2]; // 第2个括号：标题

    // ⑥ slug 冲突：冲突双方都写进原因里
    if (seen.has(slug)) {
      problems.push({
        file,
        reason: `编号 ${slug} 已被 ${seen.get(slug)} 占用`,
        hint: '编号是主键，不能复用：换一个没用过的 3 位编号',
      });
      continue;
    }
    seen.set(slug, fileName);

    // ③ 读内容 → matter 拆 data / body
    const raw = await fs.readFile(file, 'utf8'); // utf8 别漏，否则拿到 Buffer
    const { data, content } = matter(raw); // data 是 frontmatter，content 是正文

    // ⑤ date 必填
    if (!data.date) {
      problems.push({
        file,
        reason: '缺少 date 字段（也可能是冒号后没空格，导致整块 frontmatter 根本没被解析）',
        hint: '文件第 1 行写 ---，第 2 行写 date: 2026-11-17，第 3 行写 ---',
      });
      continue;
    }

    // ⑤ tags 可选，但一旦写了必须是数组
    const rawTags = data.tags ?? [];
    if (!Array.isArray(rawTags)) {
      problems.push({
        file,
        reason: 'tags 格式不对：写成了一个字符串',
        hint: '要写成数组形式：tags: [前端, 随笔]，注意方括号和逗号',
      });
      continue;
    }

    const tags = []; // 规范化后的标签（去空格、空格换连字符）
    let tagError = null;
    for (const tag of rawTags) {
      const clean = tagSlug(tag);
      if (!clean) {
        tagError = { bad: tag, reason: '标签内容为空或全是禁用字符' };
        break;
      }
      if (!tags.includes(clean)) tags.push(clean); // 同一篇里重复的标签只留一个
    }
    if (tagError) {
      problems.push({
        file,
        reason: `标签无法转成 URL：${JSON.stringify(tagError.bad)}（${tagError.reason}）`,
        hint: '标签里不能用 / \\ : * ? " < > | # % 这些字符',
      });
      continue;
    }

    posts.push({ slug, title, date: data.date, tags, body: content, file }); // 组装成一篇
  }

  // 有任何一个问题就不往下走，把整张错误清单交出去
  if (problems.length > 0) throw new BlogError(problems);

  // ⑦ 返回数组：顺序 = 文件系统给的顺序，这里不做任何保证
  //    排序（编号倒序）是调用方 build 的职责，不在这里做
  return posts;
}
