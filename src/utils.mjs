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
