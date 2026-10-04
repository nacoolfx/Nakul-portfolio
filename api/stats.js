// Likes and views for NK Project case studies.
// Storage: Upstash Redis, connected from the Vercel dashboard (Storage tab).
// Works with either env naming: KV_REST_API_URL/KV_REST_API_TOKEN or UPSTASH_REDIS_REST_URL/UPSTASH_REDIS_REST_TOKEN.

const SLUGS = new Set(["salam-kisan-app", "salam-kisan-website"]);

function creds() {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url, token } : null;
}

async function pipeline(c, commands) {
  const r = await fetch(c.url.replace(/\/$/, "") + "/pipeline", {
    method: "POST",
    headers: { Authorization: "Bearer " + c.token, "Content-Type": "application/json" },
    body: JSON.stringify(commands)
  });
  if (!r.ok) throw new Error("redis " + r.status);
  return r.json();
}

function toObj(arr) {
  const o = { views: 0, likes: 0 };
  if (Array.isArray(arr)) for (let i = 0; i < arr.length; i += 2) o[arr[i]] = Math.max(0, parseInt(arr[i + 1], 10) || 0);
  return { views: o.views || 0, likes: o.likes || 0 };
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const c = creds();
  if (!c) return res.status(503).json({ error: "storage not connected" });
  try {
    if (req.method === "GET") {
      const slugs = String(req.query.slugs || "").split(",").filter(s => SLUGS.has(s));
      if (!slugs.length) return res.status(200).json({});
      const out = await pipeline(c, slugs.map(s => ["HGETALL", "stats:" + s]));
      const data = {};
      slugs.forEach((s, i) => { data[s] = toObj(out[i] && out[i].result); });
      return res.status(200).json(data);
    }
    if (req.method === "POST") {
      const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
      const slug = body.slug, type = body.type;
      if (!SLUGS.has(slug)) return res.status(400).json({ error: "unknown project" });
      let field, by;
      if (type === "view") { field = "views"; by = 1; }
      else if (type === "like") { field = "likes"; by = 1; }
      else if (type === "unlike") { field = "likes"; by = -1; }
      else return res.status(400).json({ error: "unknown type" });
      const out = await pipeline(c, [["HINCRBY", "stats:" + slug, field, by], ["HGETALL", "stats:" + slug]]);
      return res.status(200).json({ [slug]: toObj(out[1] && out[1].result) });
    }
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "method not allowed" });
  } catch (e) {
    return res.status(500).json({ error: "stats unavailable" });
  }
};
