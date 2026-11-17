// 预览服务器：改文件 → 自动重建 → 浏览器自动刷新
// 只用 Node 内置模块，不引依赖
//   npm run dev            自动重建 + 自动刷新
//   npm run serve          只服务已有产物（不重建、不注入刷新），用来看「最终长什么样」
import http from 'node:http'; // 起服务
import fs from 'node:fs'; // 读文件、watch
import fsp from 'node:fs/promises'; // 异步读
import path from 'node:path'; // 拼路径
import { spawn } from 'node:child_process'; // 跑构建

const PORT = Number(process.env.PORT ?? 8000);
const DIST = 'dist';
const WATCH_DIRS = ['content', 'src', 'public']; // 只监听这些，不监听 dist 自己
const RELOAD_PATH = '/__reload'; // 自动刷新用的 SSE 通道
const STATIC = process.argv.includes('--static'); // --static：纯静态预览，不跑构建、不注入脚本

// 扩展名 → Content-Type。少一个 image/webp 图片就会变成下载
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

// 注入到每个 HTML 里的自动刷新脚本（只在这个服务器里注入，产物文件保持干净）
const RELOAD_SCRIPT = `<script>new EventSource('${RELOAD_PATH}').onmessage=function(){location.reload()}</script>`;

const clients = new Set(); // 所有在等的浏览器连接

function broadcastReload() {
  for (const res of clients) res.write('data: reload\n\n');
}

// ---------- 构建 ----------

let building = false;
let pending = false;

function build() {
  if (building) {
    pending = true; // 构建期间又改了文件，等这次跑完再来一次
    return;
  }
  building = true;
  const started = Date.now();
  const child = spawn('node', ['src/build.mjs'], { stdio: 'inherit' });

  child.on('exit', (code) => {
    building = false;
    if (code === 0) {
      console.log(`  ↻ 重建完成 ${Date.now() - started}ms，刷新浏览器`);
      broadcastReload();
    } else {
      console.log('  ✗ 构建失败，浏览器保持上一版（错误见上）');
    }
    if (pending) {
      pending = false;
      build();
    }
  });
}

// ---------- 静态服务 ----------

async function sendFile(res, file, status = 200) {
  const ext = path.extname(file).toLowerCase();
  let body = await fsp.readFile(file);

  if (ext === '.html' && !STATIC) {
    // 只在内存里改成带自动刷新的版本，磁盘上的文件不动
    body = Buffer.from(
      body.toString('utf8').replace('</body>', `${RELOAD_SCRIPT}</body>`),
      'utf8',
    );
  }

  res.writeHead(status, {
    'Content-Type': MIME[ext] ?? 'application/octet-stream',
    'Cache-Control': 'no-store', // 开发时永远不要缓存
  });
  res.end(body);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');

  // 自动刷新通道：SSE 长连接
  if (url.pathname === RELOAD_PATH) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-store',
      Connection: 'keep-alive',
    });
    res.write('retry: 1000\n\n');
    clients.add(res);
    req.on('close', () => clients.delete(res));
    return;
  }

  // 路径 → 文件：/posts/012/ → dist/posts/012/index.html
  let file = path.join(DIST, decodeURIComponent(url.pathname));
  if (!path.extname(file)) file = path.join(file, 'index.html');

  try {
    await sendFile(res, file);
  } catch {
    // 找不到就用自定义 404 页，状态码仍是 404
    try {
      await sendFile(res, path.join(DIST, '404.html'), 404);
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404：dist 里没有这个文件，先跑一次构建');
    }
  }
});

// ---------- 启动 ----------

if (STATIC) {
  console.log('  静态预览模式：只服务 dist/，不重建、不自动刷新');
} else {
  build(); // 先构建一次
}

server.listen(PORT, () => {
  console.log(`\n  预览：http://localhost:${PORT}`);
  if (!STATIC) console.log(`  监听：${WATCH_DIRS.join(' / ')}　（改完自动重建并刷新）`);
  console.log('  Ctrl+C 退出\n');
});

// 监听源文件；Linux 下 fs.watch 的 recursive 需要 Node 20+
let timer = null;
for (const dir of STATIC ? [] : WATCH_DIRS) {
  try {
    fs.watch(dir, { recursive: true }, (event, filename) => {
      if (!filename) return;
      if (filename.includes('node_modules') || filename.endsWith('~')) return;
      clearTimeout(timer); // 防抖：编辑器保存会连着触发好几次
      timer = setTimeout(build, 150);
    });
  } catch (err) {
    console.error(`  监听 ${dir} 失败：${err.message}`);
  }
}
