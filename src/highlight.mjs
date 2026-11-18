// 语法高亮：构建时把代码染成「带 class 的 HTML」，运行时零 JS
// 只注册实际用得到的语言（每个语言都带一份语法定义，多注册一个就多几 KB 构建时间）
import hljs from 'highlight.js/lib/core';
import javascript from 'highlight.js/lib/languages/javascript';
import css from 'highlight.js/lib/languages/css';
import bash from 'highlight.js/lib/languages/bash';
import xml from 'highlight.js/lib/languages/xml'; // html 的别名也在这份里
import json from 'highlight.js/lib/languages/json';
import markdown from 'highlight.js/lib/languages/markdown';
import { escapeHtml } from './utils.mjs';

hljs.registerLanguage('javascript', javascript); // 顺带注册 js / jsx / mjs / cjs 别名
hljs.registerLanguage('css', css);
hljs.registerLanguage('bash', bash); // 顺带 sh / shell / zsh
hljs.registerLanguage('xml', xml); // 顺带 html
hljs.registerLanguage('json', json);
hljs.registerLanguage('markdown', markdown); // 顺带 md

// 用户在 ``` 后面写的语言名 → highlight.js 的规范名
const ALIAS = {
  html: 'xml',
  htm: 'xml',
  vue: 'xml',
  sh: 'bash',
  shell: 'bash',
  zsh: 'bash',
  md: 'markdown',
  js: 'javascript',
  ts: 'javascript',
  text: '',
  txt: '',
};

// markdown-it 的 highlight 回调：返回空字符串表示「不会高亮」，
// 它会自己转义并用默认的 <pre><code> 包起来，所以这里只管认识的
export function highlightCode(code, lang) {
  const key = String(lang || '').toLowerCase();
  const name = key in ALIAS ? ALIAS[key] : key;
  if (!name || !hljs.getLanguage(name)) return '';

  try {
    const { value } = hljs.highlight(code, { language: name, ignoreIllegals: true });
    // 返回以 <pre 开头的字符串时，markdown-it 会原样使用，不再额外包一层
    return `<pre><code class="hljs language-${escapeHtml(name)}">${value}</code></pre>`;
  } catch {
    return ''; // 高亮出错就退回纯文本，别让构建挂掉
  }
}
