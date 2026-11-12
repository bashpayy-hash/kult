import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  // Only the landing and the privacy page are public. Member links, hostess
  // links and the admin stay out of search.
  return { rules: [{ userAgent: "*", allow: ["/$", "/privacy"], disallow: ["/"] }] };
}
