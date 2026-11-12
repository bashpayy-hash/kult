import "server-only";
import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { sessionSecret } from "./env";

// Link previews and crawlers. Instagram's in-app browser is a real person
// (its UA says "Instagram"), so it is NOT here; Instagram's preview fetcher is
// facebookexternalhit.
const BOT_RE =
  /bot\b|bot\/|crawl|spider|slurp|facebookexternalhit|facebookcatalog|meta-externalagent|telegrambot|whatsapp|twitterbot|linkedinbot|discordbot|slackbot|applebot|vkshare|viber|skypeuripreview|bingpreview|yandex|googleother|headlesschrome|lighthouse|python-requests|python-urllib|curl\/|wget\/|go-http-client|okhttp|node-fetch|axios|preview/i;

export type Visitor = {
  hash: string;
  userAgent: string;
  referrer: string | null;
  isBot: boolean;
  isPrefetch: boolean;
};

export async function getVisitor(): Promise<Visitor> {
  const h = await headers();
  const ip = (h.get("x-forwarded-for") || "").split(",")[0].trim() || h.get("x-real-ip") || "0.0.0.0";
  const userAgent = (h.get("user-agent") || "").slice(0, 400);
  const purpose = `${h.get("purpose") || ""} ${h.get("sec-purpose") || ""} ${h.get("next-router-prefetch") ? "prefetch" : ""}`;
  return {
    hash: createHash("sha256").update(`${ip}|${userAgent}|${sessionSecret()}`).digest("hex").slice(0, 32),
    userAgent,
    referrer: (h.get("referer") || "").slice(0, 400) || null,
    isBot: !userAgent || BOT_RE.test(userAgent),
    isPrefetch: /prefetch/i.test(purpose),
  };
}
