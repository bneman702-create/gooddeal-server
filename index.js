const express = require("express");
const fetch = require("node-fetch");
const app = express();

app.use(express.json());
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Content-Type");
  next();
});

const SERP_KEY = process.env.SERP_KEY;
const CLAUDE_KEY = process.env.CLAUDE_KEY;

app.get("/prices", async (req, res) => {
  const { q } = req.query;
  try {
    const url = `https://serpapi.com/search.json?engine=google_shopping&q=${encodeURIComponent(q)}&api_key=${SERP_KEY}&num=10&gl=us`;
    const r = await fetch(url);
    const data = await r.json();
    res.json(data.shopping_results || []);
  } catch (e) {
    res.json([]);
  }
});

app.post("/analyze", async (req, res) => {
  const { prompt } = req.body;
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": CLAUDE_KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 700, messages: [{ role: "user", content: prompt }] })
    });
    const data = await r.json();
    res.json({ text: data.content?.[0]?.text || "" });
  } catch (e) {
    res.json({ text: "" });
  }
});

app.listen(process.env.PORT || 3000);
