import Link from "next/link";
import { Button } from "./ui";
import { SITE } from "./content";
import type { Post } from "./posts";

/**
 * The shell every blog post renders inside: the dateline, the prose column, the
 * `Article` structured data and the one call to action at the end.
 *
 * Shared so a second post cannot quietly differ in its schema or its heading
 * scale. The post itself supplies only its body.
 *
 * `prose-*` utility classes are deliberately not used — the repo has no
 * typography plugin, so the spacing comes from the `article` styles below and
 * the design system's own tokens, the same ones `/security` uses.
 */
export function Article({
  post,
  children,
  /**
   * The closing paragraph. Passed in rather than written here: a sentence that
   * names what the post was about reads as a conclusion, and one shared line
   * across every post would be an advertisement bolted to the end.
   */
  closing,
}: {
  post: Post;
  children: React.ReactNode;
  closing: React.ReactNode;
}) {
  const url = `${SITE.url}/blog/${post.slug}`;

  /**
   * `Article`, not `BlogPosting`: both are valid, and `Article` is the type
   * Google documents for this shape. `author` and `publisher` both point at the
   * organisation node the home page already defines, so the entity is one
   * entity across the site rather than a second unconnected mention.
   *
   * No `image`: the posts carry no hero image, and pointing at the social card
   * would claim an illustration that is not in the article.
   */
  const schema = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: post.title,
    description: post.description,
    inLanguage: "en",
    datePublished: post.published,
    dateModified: post.published,
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    author: { "@id": `${SITE.url}/#org` },
    publisher: { "@id": `${SITE.url}/#org` },
  };

  return (
    <article className="mx-auto max-w-2xl px-4 py-16 sm:px-6 lg:py-24">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
      />

      <p className="font-cv-mono text-[13px] font-medium uppercase tracking-wide text-cv-ink-subtle">
        <Link
          href="/blog"
          className="rounded underline-offset-2 hover:text-cv-ink hover:underline focus-visible:outline-none focus-visible:shadow-cv-focus-ring"
        >
          Writing
        </Link>
      </p>

      <h1 className="mt-3 text-3xl font-semibold leading-tight tracking-[-0.025em] text-cv-ink sm:text-4xl">
        {post.title}
      </h1>

      <p className="mt-4 font-cv-mono text-[13px] text-cv-ink-subtle">
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

      <div className="cv-article mt-10">{children}</div>

      <aside className="mt-16 rounded-cv-lg border border-cv-line bg-cv-surface p-6">
        <p className="text-base leading-relaxed text-cv-ink">{closing}</p>
        <Button href="/" variant="secondary" className="mt-5">
          See how Clarivo works
        </Button>
      </aside>
    </article>
  );
}
