// 体积预算检查：`npm run size`
// 用途：每次改完都跑一次，超预算就退出码 1（可以挂到 CI 里当守门员）
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

// 预算：超了就构建失败
const LIMITS = {
  // 单个 HTML 的 gzip 上限。CSS 已内联，所以基准比纯 HTML 高；
  // 长文章的正文本身会撑大页面，这部分是内容不是开销，上限按"最长文章"留余量。
  pageGzip: 8 * 1024,
  totalBrotli: 70 * 1024, // 整站（不含图片）brotli 合计上限
  images: 60 * 1024, // 图片合计上限
};

function walk(dir) {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((d) => (d.isDirectory() ? walk(path.join(dir, d.name)) : [path.join(dir, d.name)]));
}

const kb = (n) => `${(n / 1024).toFixed(1)}K`;
const files = walk('dist').sort();

const rows = files.map((file) => {
  const buf = fs.readFileSync(file);
  return {
    file,
    raw: buf.length,
    gzip: zlib.gzipSync(buf, { level: 9 }).length,
    brotli: zlib.brotliCompressSync(buf, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11 } }).length,
  };
});

console.log('文件'.padEnd(32), 'raw'.padStart(8), 'gzip'.padStart(8), 'brotli'.padStart(8));
console.log('-'.repeat(58));
for (const r of rows) {
  console.log(r.file.padEnd(32), String(r.raw).padStart(8), String(r.gzip).padStart(8), String(r.brotli).padStart(8));
}

const html = rows.filter((r) => r.file.endsWith('.html'));
const img = rows.filter((r) => /\.(webp|png|jpe?g|gif|avif)$/.test(r.file));
const other = rows.filter((r) => !html.includes(r) && !img.includes(r));

const sum = (list, key) => list.reduce((n, r) => n + r[key], 0);

const totalBrotli = sum(other, 'brotli') + sum(html, 'brotli');

console.log('-'.repeat(58));
console.log(`HTML ${html.length} 个`.padEnd(24), 'gzip', kb(sum(html, 'gzip')), ' brotli', kb(sum(html, 'brotli')));
console.log(`其它 ${other.length} 个`.padEnd(23), 'gzip', kb(sum(other, 'gzip')), ' brotli', kb(sum(other, 'brotli')));
console.log(`图片 ${img.length} 个`.padEnd(23), 'raw ', kb(sum(img, 'raw')));

// ---- 预算检查 ----
const fails = [];
const biggest = html.reduce((a, b) => (a.gzip > b.gzip ? a : b), html[0]);
if (biggest.gzip > LIMITS.pageGzip) {
  fails.push(`最大页面 ${biggest.file} gzip ${kb(biggest.gzip)} > ${kb(LIMITS.pageGzip)}`);
}
if (totalBrotli > LIMITS.totalBrotli) {
  fails.push(`整站 brotli ${kb(totalBrotli)} > ${kb(LIMITS.totalBrotli)}`);
}
if (sum(img, 'raw') > LIMITS.images) {
  fails.push(`图片合计 ${kb(sum(img, 'raw'))} > ${kb(LIMITS.images)}`);
}

console.log('');
if (fails.length) {
  for (const f of fails) console.error('✗ 超预算：' + f);
  process.exitCode = 1;
} else {
  console.log(`✓ 全部在预算内（最大页面 ${biggest.file} ${kb(biggest.gzip)} gzip）`);
}
