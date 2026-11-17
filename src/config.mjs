// 站点配置：只有这个文件需要你手动改
export const SITE = {
  title: '冬月的博客',
  description: '分享一些东西，也方便我查看',
  author: 'dy',
  lang: 'zh-CN',
  // 部署后改成你的真实地址（结尾不要带斜杠），RSS / sitemap 里要用绝对链接
  url: 'https://example.com',
  postsPerPage: 10, // 首页每页显示几篇，超出的分到 /page/2/ 等

  // 评论：Giscus（基于 GitHub Discussions，数据在你自己的仓库里）
  // 不想用就整块设成 null，文章页会自动不渲染评论区
  giscus: {
    repo: 'dongyue12/giscus',
    repoId: 'R_kgDOSakHjA',
    category: 'Announcements',
    categoryId: 'DIC_kwDOSakHjM4C8zJM',
    mapping: 'pathname', // 按页面路径对应讨论串：/posts/011/ 就是一条
    strict: '0',
    reactionsEnabled: '1',
    emitMetadata: '0',
    inputPosition: 'bottom',
    lang: 'zh-CN',
    loading: 'lazy',
  },
};
