/* 零依赖本地静态服务器：只为让浏览器以 http:// 方式加载 pdf.js 的 Worker。
   仅监听 127.0.0.1，不向外网提供服务。 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const net = require('net');

const DEFAULT_PORT = parseInt(process.env.PORT, 10) || 5173;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.pdf': 'application/pdf',
  '.woff2': 'font/woff2',
  '.md': 'text/markdown; charset=utf-8'
};

function portFree(port) {
  return new Promise((resolve) => {
    const probe = net.createServer();
    probe.once('error', () => resolve(false));
    probe.once('listening', () => probe.close(() => resolve(true)));
    probe.listen(port, '127.0.0.1');
  });
}

function createApp(root) {
  return http.createServer((req, res) => {
    let pathname = decodeURIComponent(req.url.split('?')[0]);
    if (pathname === '/') pathname = '/index.html';

    const filePath = path.join(root, path.normalize(pathname));
    if (!filePath.startsWith(root)) {
      res.writeHead(403).end('403 Forbidden');
      return;
    }

    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('404 Not Found: ' + pathname);
        return;
      }
      res.writeHead(200, {
        'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
        'Cache-Control': 'no-store'
      });
      res.end(data);
    });
  });
}

/* 启动本地服务，返回 { server, port }；端口被占用时向上探测 */
async function start(options) {
  const opts = options || {};
  const root = opts.root || __dirname;
  const startPort = Number(opts.port) || DEFAULT_PORT;
  const server = createApp(root);
  let port = startPort;
  while (port <= startPort + 50 && !(await portFree(port))) port += 1;
  if (port > startPort + 50) throw new Error('连续 50 个端口都被占用，无法启动。请关闭多余进程后重试。');
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });
  return { server, port, url: `http://127.0.0.1:${port}/index.html` };
}

async function main() {
  const { port, url } = await start({ port: DEFAULT_PORT });
  console.log('');
  console.log('  纸间 PDF · 本机工具已启动');
  console.log('  界面:      ' + url);
  console.log('  设计规范:  http://127.0.0.1:' + port + '/design-system.html');
  console.log('');
  console.log('  全部在本机运行，关闭窗口或按 Ctrl+C 停止。');
  console.log('');
  if (process.platform === 'win32' && !process.env.NO_OPEN) {
    require('child_process').exec(`start "" "${url}"`);
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}

module.exports = { start, createApp };
