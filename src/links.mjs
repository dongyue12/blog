import { loadPosts, BlogError } from './posts.mjs'; // 解析文章

// 友链数据：一个普通的 JSON 文件，改它不需要碰代码
export async function loadLinks(file) {
  let raw;
  try {
    raw = await import('node:fs/promises').then((fs) => fs.readFile(file, 'utf8'));
  } catch {
    return []; // 文件不存在就当作没有友链，不阻断构建
  }

  let data;
  try {
    data = JSON.parse(raw); // 手写 JSON 很容易多一个逗号，报错要能看懂
  } catch (err) {
    throw new Error(`${file} 不是合法 JSON：${err.message}`);
  }

  if (!Array.isArray(data)) throw new Error(`${file} 最外层必须是数组`);

  return data.map((item, i) => {
    if (!item.name || !item.url) {
      throw new Error(`${file} 第 ${i + 1} 项缺少 name 或 url`);
    }
    return { name: String(item.name), url: String(item.url), desc: item.desc ? String(item.desc) : '' };
  });
}
