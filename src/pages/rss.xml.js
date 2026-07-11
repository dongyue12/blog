import rss from "@astrojs/rss";
import { getCollection } from "astro:content";

export async function GET(context) {
  const posts = await getCollection("posts");
  posts.sort((a, b) => b.data.pubDatetime.getTime() - a.data.pubDatetime.getTime());

  return rss({
    title: "冬月的Blog",
    description: "我是冬月欢迎来到我的博客，这里记录一些我的笔记和想法。",
    site: context.site,
    items: posts.map((post) => ({
      title: post.data.title,
      pubDate: post.data.pubDatetime,
      description: post.data.description,
      link: `/posts/${post.slug}/`,
    })),
  });
}
