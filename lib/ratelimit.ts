import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

/**
 * Lazy singleton so we don't construct the Redis client (and crash at import
 * time) when the env vars aren't set — e.g. on a local dev machine without
 * Upstash. If unset, `getLimiters()` returns null and callers should treat
 * the request as unlimited.
 */
let cached: { register: Ratelimit; verifyToken: Ratelimit } | null = null;
let initTried = false;

export function getLimiters() {
  if (cached) return cached;
  if (initTried) return null;
  initTried = true;

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    console.warn(
      "[ratelimit] UPSTASH_REDIS_REST_URL/TOKEN not set — rate limiting disabled.",
    );
    return null;
  }

  const redis = new Redis({ url, token });
  cached = {
    // /api/register is the expensive path (RPC + SuiNS lookup + signature verify)
    register: new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(10, "60 s"),
      prefix: "rl:register",
      analytics: true,
    }),
    // /api/verify-token is cheaper but called from a public page
    verifyToken: new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(30, "60 s"),
      prefix: "rl:verify",
      analytics: true,
    }),
  };
  return cached;
}

export function clientKey(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return req.headers.get("x-real-ip") ?? "anon";
}

export function rateLimitHeaders(r: {
  limit: number;
  remaining: number;
  reset: number;
}): HeadersInit {
  return {
    "X-RateLimit-Limit": String(r.limit),
    "X-RateLimit-Remaining": String(r.remaining),
    "X-RateLimit-Reset": String(r.reset),
  };
}
