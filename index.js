const express = require("express");
const fetch = require("node-fetch");
const app = express();

app.use(express.json());
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});

const SERP_KEY = process.env.SERP_KEY;
const CLAUDE_KEY = process.env.CLAUDE_KEY;

app.get("/", (req, res) => {
  res.json({ status: "GoodDeal server is running", serp: !!SERP_KEY, claude: !!CLAUDE_KEY });
});

app.get("/prices", async (req, res) => {
  const { q } = req.query;
  if (!q) return res.json([]);
  try {
    const url = `https://serpapi.com/search.json?engine=google_shopping&q=${encodeURIComponent(q)}&api_key=${SERP_KEY}&num=10&gl=us&hl=en`;
    const r = await fetch(url);
    const data = await r.json();
    const results = await Promise.all(
      (data.shopping_results || []).slice(0, 8).map(async (item) => {
        let directLink = null;
        if (item.product_link) {
          try {
            const pd = await fetch(`https://serpapi.com/search.json?engine=google_product&product_id=${encodeURIComponent(item.product_link)}&api_key=${SERP_KEY}`);
            const pdData = await pd.json();
            const sellers = pdData.sellers_results?.online_sellers || [];
            if (sellers.length > 0) directLink = sellers[0].link;
          } catch (e) {}
        }
        return {
          title: item.title || "",
          price: item.price || "",
          source: item.source || "",
          link: directLink || item.link || null,
        };
      })
    );
    res.json(results.filter(r => r.price));
  } catch (e) {
    res.json([]);
  }
});

app.post("/analyze", async (req, res) => {
  const { prompt } = req.body;
  if (!prompt) return res.json({ text: "" });
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
        max_tokens: 800,
        messages: [{ role: "user", content: prompt }]
      })
    });
    const data = await r.json();
    res.json({ text: data.content?.[0]?.text || "" });
  } catch (e) {
    res.json({ text: "" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`GoodDeal server running on port ${PORT}`));
