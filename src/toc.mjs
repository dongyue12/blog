// 给标题加 id，并顺手抽出「本页目录」
// markdown-it 的 render 是一次性出 HTML，拿不到中间结构，
// 所以这里先 parse 成 token，改完 id 再 render —— 文章页和文档页共用这一份

// 只取纯文本：`**粗体**`、链接之类的记号不进 id
function headingText(inlineToken) {
  return inlineToken.children
    .filter((c) => c.type === 'text' || c.type === 'code_inline')
    .map((c) => c.content)
    .join('')
    .trim();
}

// 标题 → 锚点：中文原样保留（#css-简介 这种），空白换连字符，特殊字符去掉
function headingId(text) {
  return (
    text
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[/\\:*?"<>|#%`~!@$^&=+.,;'()[\]{}]/g, '') || 'section'
  );
}

// 返回 { html, toc }：toc 形如 [{ level, id, text }]，只收 h2 / h3
export function renderWithToc(md, body) {
  const tokens = md.parse(body, {});
  const toc = [];
  const used = new Map(); // id → 用过几次，同名标题加 -2、-3

  for (const [i, token] of tokens.entries()) {
    if (token.type !== 'heading_open') continue;

    const level = Number(token.tag.slice(1));
    if (level < 2 || level > 3) continue; // 一级标题已经是页面标题了

    const text = headingText(tokens[i + 1]);
    if (!text) continue;

    const base = headingId(text);
    const seen = used.get(base) ?? 0;
    used.set(base, seen + 1);
    const id = seen === 0 ? base : `${base}-${seen + 1}`;

    token.attrSet('id', id);
    toc.push({ level, id, text });
  }

  return { html: md.renderer.render(tokens, md.options, {}), toc };
}
