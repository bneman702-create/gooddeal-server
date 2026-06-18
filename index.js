const express = require("express");
const fetch = require("node-fetch");
const app = express();

app.use(express.json({ limit: "10kb" }));
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});

const SERP_KEY = process.env.SERP_KEY;
const CLAUDE_KEY = process.env.CLAUDE_KEY;

// In-memory cache with 15-min TTL
const cache = new Map();
const CACHE_TTL = 15 * 60 * 1000;
function getCache(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL) { cache.delete(key); return null; }
  return entry.data;
}
function setCache(key, data) {
  if (cache.size > 500) cache.clear();
  cache.set(key, { data, ts: Date.now() });
}

app.get("/", (req, res) => {
  res.json({ status: "GoodDeal server is running", serp: !!SERP_KEY, claude: !!CLAUDE_KEY });
});

app.get("/prices", async (req, res) => {
  const { q } = req.query;
  if (!q || typeof q !== "string" || q.length > 200) return res.status(400).json([]);

  const cacheKey = "prices:" + q.toLowerCase().trim();
  const cached = getCache(cacheKey);
  if (cached) return res.json(cached);

  try {
    const [shopRes, amzRes, ebayRes] = await Promise.allSettled([
      fetch(`https://serpapi.com/search.json?engine=google_shopping&q=${encodeURIComponent(q)}&api_key=${SERP_KEY}&num=10&gl=us&hl=en`),
      fetch(`https://serpapi.com/search.json?engine=amazon&k=${encodeURIComponent(q)}&api_key=${SERP_KEY}`),
      fetch(`https://serpapi.com/search.json?engine=ebay&_nkw=${encodeURIComponent(q)}&api_key=${SERP_KEY}`),
    ]);

    const results = [];

    if (shopRes.status === "fulfilled") {
      const shopData = await shopRes.value.json();
      const shopItems = (shopData.shopping_results || []).filter(r => r.price).slice(0, 6).map(item => ({
        title: item.title || "",
        price: item.price || "",
        source: item.source || "",
        link: item.link || null,
      }));
      results.push(...shopItems);
    }

    if (amzRes.status === "fulfilled") {
      const amzData = await amzRes.value.json();
      const amzResult = (amzData.organic_results || [])[0];
      if (amzResult) {
        results.unshift({
          title: amzResult.title || "",
          price: amzResult.price?.current_price ? `$${amzResult.price.current_price}` : amzResult.price_string || "",
          source: "Amazon",
          link: amzResult.url ? `https://www.amazon.com${amzResult.url}` : "https://www.amazon.com/s?k=" + encodeURIComponent(q),
        });
      }
    }

    if (ebayRes.status === "fulfilled") {
      const ebayData = await ebayRes.value.json();
      const ebayResult = (ebayData.organic_results || []).find(r => r.price?.current?.raw);
      if (ebayResult) {
        results.push({
          title: ebayResult.title || "",
          price: ebayResult.price?.current?.raw || "",
          source: "eBay",
          link: ebayResult.link || "https://www.ebay.com/sch/i.html?_nkw=" + encodeURIComponent(q),
        });
      }
    }

    const final = results.filter(r => r.price);
    setCache(cacheKey, final);
    res.json(final);
  } catch (e) {
    console.error("/prices error:", e.message);
    res.status(500).json([]);
  }
});

app.post("/analyze", async (req, res) => {
  const { prompt } = req.body;
  if (!prompt || typeof prompt !== "string" || prompt.length > 4000) {
    return res.status(400).json({ text: "" });
  }

  const cacheKey = "analyze:" + prompt.slice(0, 300);
  const cached = getCache(cacheKey);
  if (cached) return res.json(cached);

  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": CLAUDE_KEY,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1200,
        system: "You are a brutally honest, data-driven shopping advisor. Give direct, actionable advice. Be specific with numbers. Never hedge excessively.",
        messages: [{ role: "user", content: prompt }]
      })
    });
    if (!r.ok) {
      console.error("/analyze API error:", r.status);
      return res.status(502).json({ text: "" });
    }
    const data = await r.json();
    const result = { text: data.content?.[0]?.text || "" };
    setCache(cacheKey, result);
    res.json(result);
  } catch (e) {
    console.error("/analyze error:", e.message);
    res.status(500).json({ text: "" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`GoodDeal server running on port ${PORT}`));
