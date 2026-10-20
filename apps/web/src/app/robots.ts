import type { MetadataRoute } from "next";
import { SITE } from "@/components/marketing/content";

/**
 * Only the public marketing pages are crawlable. Everything behind sign-in is
 * disallowed — not as a security measure (the middleware does that) but so a
 * crawler does not spend its budget on routes that only ever redirect.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/dashboard",
          "/detailed",
          "/payroll-periods",
          "/annual-salaries",
          "/integrations",
          "/settings",
          "/api/",
          "/sign-in",
          "/sign-up",
          "/waitlist",
        ],
      },
    ],
    sitemap: `${SITE.url}/sitemap.xml`,
    host: SITE.url,
  };
}
