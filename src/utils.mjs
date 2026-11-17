// 一类纯工具函数，不认识任何业务概念

// 转义 HTML 特殊字符：只给「纯文本」数据用（标题、日期这类）
// 顺序很重要：& 必须第一个换，否则会把后面换出来的 & 再转一次
export function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// 日期 → YYYY-MM-DD
// 用 UTC 取，避免时区把日期挪到前一天
export function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

// 标签 → 可以直接放进 URL 路径的片段
// 空格变连字符；禁用文件系统/URL 里的特殊字符；中文原样保留（UTF-8 路径是合法的）
export function tagSlug(tag) {
  return String(tag)
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[/\\:*?"<>|#%]/g, '');
}

// 把 markdown 正文粗略压成一段纯文本（RSS 摘要、搜索摘要共用）
export function excerpt(body, max = 120) {
  const text = body
    .replace(/```[\s\S]*?```/g, ' ') // 去掉代码块
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ') // 去掉图片
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1') // 链接只留文字
    .replace(/[#>*_`~|-]/g, ' ') // 去掉 markdown 记号
    .replace(/\s+/g, ' ') // 合并空白
    .trim();
  return text.length > max ? `${text.slice(0, max)}…` : text;
}
