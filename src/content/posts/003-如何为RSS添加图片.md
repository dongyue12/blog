---
pubDatetime: 2026-05-12
title: 如何为 RSS 添加图片
tags: [RSS, Astro, 博客]
featured: true
description: 详解如何为 AstroPaper 博客的 RSS 源添加图标图片，包括 RSS 2.0 image 标签规范、SVG 转 PNG 以及 customData 配置。
---

## 背景

RSS 阅读器在展示订阅源时，通常会显示一个图标来帮助用户快速识别来源。然而，`@astrojs/rss` 默认生成的 RSS XML 并不包含图标信息，导致阅读器只能显示默认图标或无图标。

本文将介绍如何为 AstroPaper 博客的 RSS 源添加图片。

## RSS 2.0 的 `<image>` 标签规范

根据 RSS 2.0 标准，`<image>` 是 `<channel>` 的子元素，包含以下必填字段：

| 字段      | 说明                  | 是否必填 |
| --------- | --------------------- | -------- |
| `<url>`   | 图片的完整 URL        | ✅ 必填  |
| `<title>` | 图片的替代文字（alt） | ✅ 必填  |
| `<link>`  | 点击图片跳转的链接    | ✅ 必填  |

此外还有一些可选字段：

- `<width>` — 图片宽度，默认 88，最大 144
- `<height>` — 图片高度，默认 31，最大 400
- `<description>` — 图片的描述文字

### 图标格式要求

⚠️ **重要**：RSS 2.0 的 `<image>` 标签**不支持 SVG 格式**，仅支持以下格式：

- **GIF** — 最经典的选择
- **JPEG** — 适合照片类图标
- **PNG** — 推荐，支持透明背景

推荐尺寸为 **88×31**（标准）或 **144×400**（最大）。

## 实现步骤

### 第一步：生成 PNG 图标

由于 RSS 不支持 SVG，我们需要将 `favicon.svg` 转换为 PNG 格式。可以使用 `sharp-cli` 工具：

```bash
npx sharp-cli -i public/favicon.svg -o public/favicon.png resize 144 144
```

执行后会在 `public/` 目录下生成 `favicon.png`。

### 第二步：修改 RSS 配置

编辑 `src/pages/rss.xml.ts`，在 `rss()` 函数中添加 `customData` 字段：

```ts
import rss from "@astrojs/rss";
import { getCollection } from "astro:content";
import { getPath } from "@/utils/getPath";
import getSortedPosts from "@/utils/posts/getSortedPosts";
import { SITE } from "@/config";

export async function GET() {
  const posts = await getCollection("blog");
  const sortedPosts = getSortedPosts(posts);
  return rss({
    title: SITE.title,
    description: SITE.desc,
    site: SITE.website,
    items: sortedPosts.map(({ data, id, filePath }) => ({
      link: getPath(id, filePath),
      title: data.title,
      description: data.description,
      pubDate: new Date(data.modDatetime ?? data.pubDatetime),
    })),
    customData: `<image>
      <url>${SITE.website}/favicon.png</url>
      <title>${SITE.title}</title>
      <link>${SITE.website}</link>
    </image>`,
  });
}
```

### 第三步：验证结果

构建项目后访问 `/rss.xml`，应该能在 `<channel>` 中看到：

```xml
<image>
  <url>https://dongyue.org/favicon.png</url>
  <title>冬月的博客</title>
  <link>https://dongyue.org</link>
</image>
```

## 注意事项

1. **图标 URL 必须是绝对路径** — RSS 阅读器需要完整的 URL 才能加载图片
2. **部署后清除 CDN 缓存** — 如果使用了 Cloudflare 等 CDN，需要清除 `favicon.png` 和 `rss.xml` 的缓存
3. **SVG 不能用于 RSS 图标** — 必须转换为 PNG/GIF/JPEG
4. **图片尺寸不宜过大** — 建议不超过 144×400，过大会影响阅读器加载速度

## 总结

通过 `customData` 字段，我们可以在 `@astrojs/rss` 生成的 RSS 源中添加标准的 `<image>` 标签，让 RSS 阅读器正确显示博客图标。关键步骤是：

1. 将 SVG 图标转换为 PNG
2. 在 `rss.xml.ts` 中添加 `customData` 配置
3. 确保 URL 为绝对路径
