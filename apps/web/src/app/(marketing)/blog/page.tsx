import type { Metadata } from "next";
import Link from "next/link";
import { SITE } from "@/components/marketing/content";
import { POSTS } from "@/components/marketing/posts";

export const metadata: Metadata = {
  title: `Writing on payroll checking | ${SITE.name}`,
  description:
    "How to check a payroll register before you approve it: comparing two periods, reading a variance report, and the payroll numbers worth tracking.",
  alternates: { canonical: `${SITE.url}/blog` },
};

/**
 * The listing page.
 *
 * It exists from the first post rather than from the third, because every post
 * links back to it in its dateline and a link to a 404 is worse than a short
 * list. It takes titles, dates and summaries from `POSTS`, so adding a post is
 * one entry in that file plus its route — the listing, the metadata and the
 * sitemap all follow.
 */
export default function BlogIndex() {
  const posts = [...POSTS].sort((a, b) => b.published.localeCompare(a.published));

  return (
    <div className="mx-auto max-w-2xl px-4 py-16 sm:px-6 lg:py-24">
      <h1 className="text-3xl font-semibold leading-tight tracking-[-0.025em] text-cv-ink sm:text-4xl">
        Writing
      </h1>
      <p className="mt-5 text-lg leading-relaxed text-cv-ink-muted">
        How to check a payroll register before you approve it. Written for the person who exports
        the file.
      </p>

      <ul className="mt-12 flex flex-col gap-10">
        {posts.map((post) => (
          <li key={post.slug}>
            <h2 className="text-xl font-semibold leading-snug tracking-[-0.01em] text-cv-ink">
              <Link
                href={`/blog/${post.slug}`}
                className="rounded underline-offset-2 hover:text-cv-accent hover:underline focus-visible:outline-none focus-visible:shadow-cv-focus-ring"
              >
                {post.title}
              </Link>
            </h2>
            <p className="mt-1 font-cv-mono text-[13px] text-cv-ink-subtle">
              <time dateTime={post.published}>
                {new Date(`${post.published}T00:00:00Z`).toLocaleDateString("en-GB", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                  timeZone: "UTC",
                })}
              </time>
              <span aria-hidden="true"> · </span>
              {post.readingMinutes} min read
            </p>
            <p className="mt-3 text-base leading-relaxed text-cv-ink-muted">{post.description}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
