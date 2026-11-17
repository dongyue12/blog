// 压缩工具：自己写，不引依赖（引一个 minifier 就多 200KB node_modules）
// 原则：只做「确定安全」的替换，拿不准的地方宁可留着

// ---------- HTML ----------

// 这些标签内部的空白/换行是有意义的，必须原样保留（尤其是 <pre> 里的代码缩进）
const PROTECTED = /<(pre|textarea|script|style)\b[\s\S]*?<\/\1>/gi;

// 块级标签之间去掉空白是安全的；行内标签之间不能动（否则 "a <b>b</b> <i>c</i>" 会粘成一串）
const BLOCK = 'div|section|header|footer|main|nav|ul|ol|li|article|table|thead|tbody|tr|th|td|p|h[1-6]|dialog|figure|blockquote|form';

export function minifyHtml(html) {
  // ① 把受保护的块换成占位符，避免被后续正则误伤
  const stash = [];
  let out = html.replace(PROTECTED, (m) => {
    stash.push(m);
    return `\u0000${stash.length - 1}\u0000`;
  });

  // ② 删注释（模板里没写条件注释，安全）
  out = out.replace(/<!--[\s\S]*?-->/g, '');

  // ③ 连续空白压成一个空格
  out = out.replace(/\s+/g, ' ');

  // ④ 只在块级标签之间删掉那个空格
  const open = new RegExp(`>\\s+<(${BLOCK})\\b`, 'gi');
  const close = new RegExp(`(<\\/(?:${BLOCK})>)\\s+<`, 'gi');
  out = out.replace(open, '><$1').replace(close, '$1<');

  // ⑤ 还原受保护的块
  out = out.replace(/\u0000(\d+)\u0000/g, (_, i) => stash[Number(i)]);

  return out.trim();
}

// ---------- CSS ----------

export function minifyCss(css) {
  return css
    .replace(/\/\*[\s\S]*?\*\//g, '') // 注释
    .replace(/\s+/g, ' ') // 连续空白
    .replace(/\s*([{}:;,>])\s*/g, '$1') // 结构性符号两侧的空格
    .replace(/;}/g, '}') // 最后一条声明的分号
    .replace(/\s*\n\s*/g, '')
    .trim();
}
