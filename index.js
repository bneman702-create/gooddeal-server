const express = require("express");
const fetch = require("node-fetch");
const path = require("path");
const app = express();

app.use(express.json({ limit: "10kb" }));
app.use(express.static(path.join(__dirname)));
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});

const SERP_KEY = process.env.SERP_KEY;
const CLAUDE_KEY = process.env.CLAUDE_KEY;

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

// Score how well a result title matches the search query (0-1)
function matchScore(title, query) {
  if (!title || !query) return 0;
  const t = title.toLowerCase();
  const words = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);
  const matches = words.filter(w => t.includes(w)).length;
  return matches / Math.max(words.length, 1);
}

// Extract ASIN from Amazon URL
function extractAsin(url) {
  if (!url) return null;
  const m = url.match(/\/dp\/([A-Z0-9]{10})/i) || url.match(/\/gp\/product\/([A-Z0-9]{10})/i);
  return m ? m[1] : null;
}

// Build Amazon add-to-cart URL from ASIN
function amazonCartUrl(asin) {
  return `https://www.amazon.com/gp/aws/cart/add.html?ASIN.1=${asin}&Quantity.1=1`;
}

// Build eBay buy-it-now URL
function ebayBuyUrl(itemId) {
  if (!itemId) return null;
  return `https://www.ebay.com/itm/${itemId}`;
}

app.get("/", (req, res) => {
  const acceptsHtml = req.headers.accept && req.headers.accept.includes("text/html");
  if (acceptsHtml) {
    res.sendFile(path.join(__dirname, "index.html"));
  } else {
    res.json({ status: "GoodDeal server is running", serp: !!SERP_KEY, claude: !!CLAUDE_KEY });
  }
});

app.get("/prices", async (req, res) => {
  const { q } = req.query;
  if (!q || typeof q !== "string" || q.length > 200) return res.status(400).json([]);

  const cacheKey = "prices:" + q.toLowerCase().trim();
  const cached = getCache(cacheKey);
  if (cached) return res.json(cached);

  try {
    const [shopRes, amzRes, ebayRes] = await Promise.allSettled([
      fetch(`https://serpapi.com/search.json?engine=google_shopping&q=${encodeURIComponent(q)}&api_key=${SERP_KEY}&num=20&gl=us&hl=en`),
      fetch(`https://serpapi.com/search.json?engine=amazon&k=${encodeURIComponent(q)}&api_key=${SERP_KEY}&amazon_domain=amazon.com`),
      fetch(`https://serpapi.com/search.json?engine=ebay&_nkw=${encodeURIComponent(q)}&api_key=${SERP_KEY}&ebay_domain=ebay.com&LH_BIN=1`),
    ]);

    const results = [];

    // Amazon — pick best matching result, build add-to-cart link
    if (amzRes.status === "fulfilled") {
      const amzData = await amzRes.value.json();
      const amzItems = (amzData.organic_results || [])
        .filter(r => r.title && (r.price?.current_price || r.price_string))
        .map(r => ({ ...r, score: matchScore(r.title, q) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 3);

      for (const item of amzItems) {
        const priceStr = item.price?.current_price ? `$${item.price.current_price}` : item.price_string || "";
        const asin = item.asin || extractAsin(item.url) || extractAsin(item.link);
        const link = asin
          ? amazonCartUrl(asin)
          : item.url ? `https://www.amazon.com${item.url}` : `https://www.amazon.com/s?k=${encodeURIComponent(q)}`;
        if (priceStr) {
          results.push({
            title: item.title || "",
            price: priceStr,
            source: "Amazon",
            link,
            addToCart: !!asin,
          });
        }
      }
    }

    // Google Shopping — filter by relevance, get direct product links
    if (shopRes.status === "fulfilled") {
      const shopData = await shopRes.value.json();
      const shopItems = (shopData.shopping_results || [])
        .filter(r => r.price && r.title)
        .map(r => ({ ...r, score: matchScore(r.title, q) }))
        .filter(r => r.score >= 0.3)
        .sort((a, b) => b.score - a.score)
        .slice(0, 6)
        .map(item => ({
          title: item.title || "",
          price: item.price || "",
          source: item.source || "",
          link: item.link || null,
          addToCart: false,
        }));
      results.push(...shopItems);
    }

    // eBay — Buy It Now only, best match, direct listing link
    if (ebayRes.status === "fulfilled") {
      const ebayData = await ebayRes.value.json();
      const ebayItems = (ebayData.organic_results || [])
        .filter(r => r.price?.current?.raw && r.title)
        .map(r => ({ ...r, score: matchScore(r.title, q) }))
        .filter(r => r.score >= 0.25)
        .sort((a, b) => b.score - a.score)
        .slice(0, 2)
        .map(item => {
          const itemId = item.item_id || item.id;
          const link = ebayBuyUrl(itemId) || item.link || `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(q)}&LH_BIN=1`;
          return {
            title: item.title || "",
            price: item.price?.current?.raw || "",
            source: "eBay",
            link,
            addToCart: false,
          };
        });
      results.push(...ebayItems);
    }

    // Deduplicate by source, keep highest match score per source
    const seen = new Map();
    const deduped = [];
    for (const r of results) {
      const key = r.source.toLowerCase();
      if (!seen.has(key)) {
        seen.set(key, true);
        deduped.push(r);
      }
    }

    const final = deduped.filter(r => r.price);
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
