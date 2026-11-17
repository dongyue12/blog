// 读图片的像素尺寸：只为了给 <img> 补上 width/height，避免加载时页面跳动（CLS）
// 只支持我们真会用到的三种：JPEG / PNG / WebP
import fs from 'node:fs/promises'; // 读文件
import path from 'node:path'; // 拼路径

function sizeOfJpeg(buf) {
  let i = 2; // 跳过 SOI
  while (i < buf.length) {
    if (buf[i] !== 0xff) return null;
    const marker = buf[i + 1];
    const len = buf.readUInt16BE(i + 2);
    // SOF0~SOF15 里除了 DHT(C4) / JPG(C8) / DAC(CC) 之外都带尺寸
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
    }
    i += 2 + len;
  }
  return null;
}

function sizeOfPng(buf) {
  // IHDR 紧跟在 8 字节签名 + 4 字节长度 + 4 字节 "IHDR" 之后
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

function sizeOfWebp(buf) {
  const fourcc = buf.toString('ascii', 12, 16);
  if (fourcc === 'VP8 ') {
    // 有损：帧头里以 14 位存宽高
    return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
  }
  if (fourcc === 'VP8L') {
    // 无损：位打包的 14+14 位
    const bits = buf.readUInt32LE(21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  if (fourcc === 'VP8X') {
    // 扩展格式：24 位宽高各减 1
    return {
      width: buf.readUIntLE(24, 3) + 1,
      height: buf.readUIntLE(27, 3) + 1,
    };
  }
  return null;
}

// 读单张图；读不出来就返回 null，让调用方跳过（绝不因为一张图挂掉构建）
export async function imageSize(file) {
  let buf;
  try {
    buf = await fs.readFile(file);
  } catch {
    return null;
  }

  if (buf[0] === 0xff && buf[1] === 0xd8) return sizeOfJpeg(buf);
  if (buf[0] === 0x89 && buf.toString('ascii', 1, 4) === 'PNG') return sizeOfPng(buf);
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return sizeOfWebp(buf);
  return null;
}

// 扫一个目录，建「/img/x.webp → {width, height}」的映射，供渲染时查表
// （markdown-it 的渲染规则是同步的，所以尺寸必须提前读好）
export async function collectImageSizes(publicDir) {
  const map = new Map();
  let entries = [];
  try {
    entries = await fs.readdir(path.join(publicDir, 'img'));
  } catch {
    return map; // 没有 img 目录就算了
  }

  for (const name of entries) {
    const size = await imageSize(path.join(publicDir, 'img', name));
    if (size) map.set(`/img/${name}`, size);
  }
  return map;
}
