---
title: "Astro 添加访问统计"
pubDatetime: 2026-05-18
description: "不蒜子数据统计服务"
tags: [Astro, 博客, 不蒜子]
featured: true
---

## 前端显示访问人数的方法
- [不蒜子](https://www.busuanzi.cc/)

### 1. 添加统计代码
在`<head>`标签中添加
```html
<script src="//cdn.busuanzi.cc/busuanzi/3.6.9/busuanzi.min.js" defer></script>
```
### 2.访问数据显示
```html
今日总访问量: <span id="busuanzi_today_pv">加载中...</span> 
今日总访客数: <span id="busuanzi_today_uv">加载中...</span> 

本页总阅读量: <span id="busuanzi_page_pv">加载中...</span> 
本页总访客数: <span id="busuanzi_page_uv">加载中...</span> 

本站总访问量: <span id="busuanzi_site_pv">加载中...</span> 
本站总访客数: <span id="busuanzi_site_uv">加载中...</span> 
```
通过添加这些代码，你可以在你的网站上显示对应的访问信息。

## 详细统计访问量
- [Google Analytics](https://analytics.google.com/)
- [百度统计](https://tongji.baidu.com/)
- [微软clarity](https://clarity.microsoft.com/)
- [Cloudflare Analytics](https://www.cloudflare.com/zh-cn/analytics/) 


