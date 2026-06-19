const SERVER = "https://gooddeal-server-production.up.railway.app";

const RETAIL_PRICES = {"jordan":150,"yeezy":220,"air force":110,"dunk":110,"louis vuitton":800,"gucci":500,"chanel":1000,"rolex":5000,"iphone":799,"airpods pro":189,"ps5":499};
function checkScam(item, price) {
  const il = item.toLowerCase();
  const pN = parseFloat(String(price).replace(/[^0-9.]/g, "")) || 0;
  for (const [k, r] of Object.entries(RETAIL_PRICES)) {
    if (il.includes(k) && pN > 0 && pN < r * 0.4) return `⚠️ Red flag: ${item} retails ~$${r}. This price is suspiciously low.`;
  }
  return null;
}

const VERDICT = {
  great: {emoji:"🔥", label:"Great Deal", color:"#22C55E", bg:"#021508", border:"#14532D"},
  good:  {emoji:"✅", label:"Good Deal",  color:"#4ADE80", bg:"#031209", border:"#166534"},
  okay:  {emoji:"⚠️", label:"It's Okay",  color:"#FACC15", bg:"#141000", border:"#854D0E"},
  bad:   {emoji:"❌", label:"Overpriced",  color:"#F87171", bg:"#130404", border:"#991B1B"},
};
function scoreToVerdict(s) { return s>=78?"great":s>=55?"good":s>=33?"okay":"bad"; }
function pick(t, l) {
  if (!t) return null;
  const m = t.match(new RegExp(l + ":\\s*([\\s\\S]+?)(?=\\n[A-Z _]+:|$)", "i"));
  return m ? m[1].trim() : null;
}

let detected = null;

async function runCheck(item, price, store, cartUrl) {
  showLoading("Searching live prices...");

  let priceList = [], lowestPrice = null, lowestSource = null, lowestUrl = null;
  try {
    const res = await fetch(`${SERVER}/prices?q=${encodeURIComponent(item)}`);
    const data = await res.json();
    if (Array.isArray(data) && data.length > 0) {
      priceList = data
        .filter(r => r.price)
        .slice(0, 8)
        .map(r => ({
          price: r.price,
          source: r.source || "Unknown",
          link: r.link || null,
          priceNum: parseFloat(String(r.price).replace(/[^0-9.]/g,"")) || 999999
        }))
        .sort((a,b) => a.priceNum - b.priceNum);
      if (priceList.length > 0) {
        lowestPrice = priceList[0].price;
        lowestSource = priceList[0].source;
        lowestUrl = priceList[0].link;
      }
    }
  } catch(e) {}

  showLoading("Running AI analysis...");

  const uN = parseFloat(String(price).replace(/[^0-9.]/g,"")) || 0;
  const ctx = priceList.length > 0
    ? `LIVE PRICES:\n${priceList.slice(0,6).map(r=>`- ${r.source}: ${r.price}`).join("\n")}\nLowest: ${lowestPrice} at ${lowestSource}`
    : "No live price data available.";

  const prompt = `ITEM: ${item}\nPRICE: ${price}\nSTORE: ${store||"unknown"}\n\n${ctx}\n\nRespond EXACTLY:\n\nSCORE: [0-100]\n\nONE LINE: [one punchy honest sentence, max 12 words]\n\nCOUPON TIPS: [specific coupon codes or cashback apps for this item/store]\n\nWAIT OR BUY: [BUY NOW or WAIT — specific reason]\n\nBOTTOM LINE: [1-2 sentences max]`;

  try {
    const r = await fetch(`${SERVER}/analyze`, {
      method: "POST",
      headers: {"Content-Type":"application/json"},
      body: JSON.stringify({prompt})
    });
    const d = await r.json();
    const text = d.text || "";
    const sm = text.match(/SCORE:\s*(\d+)/i);
    const score = sm ? Math.min(100, Math.max(0, parseInt(sm[1]))) : 50;
    showResult({item, price, store, cartUrl, score, text, priceList, lowestPrice, lowestSource, lowestUrl, uN});
  } catch(e) {
    const lN = priceList[0]?.priceNum || uN;
    const score = Math.max(0, Math.min(100, Math.round(100 - ((uN - lN) / Math.max(uN,1)) * 150)));
    showResult({item, price, store, cartUrl, score, text:"", priceList, lowestPrice, lowestSource, lowestUrl, uN});
  }
}

function showLoading(msg) {
  document.getElementById("body").innerHTML = `<div class="loading"><div class="spin"></div><div class="load-text">${msg}</div></div>`;
}

function showResult({item, price, store, cartUrl, score, text, priceList, lowestPrice, lowestSource, lowestUrl, uN}) {
  const vKey = scoreToVerdict(score);
  const vd = VERDICT[vKey];
  const oneLine = pick(text, "ONE LINE");
  const coupon = pick(text, "COUPON TIPS");
  const wob = pick(text, "WAIT OR BUY");
  const scamWarn = checkScam(item, price);

  // Deduplicate by source
  const seen = new Set();
  const deduped = priceList.filter(p => {
    const k = p.source.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k); return true;
  }).slice(0, 5);

  const priceDiff = uN && deduped[0]?.priceNum && uN > deduped[0].priceNum
    ? Math.round((uN - deduped[0].priceNum) / uN * 100) : 0;

  // Price rows — lowest links directly to the product
  const priceRows = deduped.map((p, i) => {
    const isLowest = i === 0;
    const sv = uN && p.priceNum && uN > p.priceNum ? `Save $${(uN - p.priceNum).toFixed(0)}` : null;
    const url = p.link || `https://www.google.com/search?q=${encodeURIComponent(p.source + " " + item)}`;
    return `<a class="price-row ${isLowest?"lowest":""}" href="${url}" target="_blank">
      <div>
        <div class="store-name">${isLowest?"🏆 ":""}${p.source}</div>
        <div class="store-badge ${isLowest?"low":""}">${isLowest?"Cheapest found":"Tap to buy →"}</div>
      </div>
      <div style="display:flex;align-items:center">
        ${sv ? `<span class="save-badge">${sv}</span>` : ""}
        <span class="price-val ${isLowest?"low":""}">${p.price}</span>
      </div>
    </a>`;
  }).join("");

  // Current store row
  const currentRow = cartUrl
    ? `<a class="price-row current" href="${cartUrl}" target="_blank">
        <div><div class="store-name">📍 ${store||"Current store"}</div><div class="store-badge cur">Where you're shopping</div></div>
        <span class="price-val cur">${price}</span>
      </a>` : "";

  // Buy cheaper button
  const buyBtn = lowestUrl && priceDiff > 2
    ? `<a href="${lowestUrl}" target="_blank"><button class="buy-btn">🛒 Buy at ${lowestSource} — Save ${priceDiff}%</button></a>`
    : "";

  document.getElementById("body").innerHTML = `
    ${scamWarn ? `<div class="scam">${scamWarn}</div>` : ""}
    <div class="verdict-banner" style="background:${vd.bg};border:1px solid ${vd.border}">
      <span class="verdict-emoji">${vd.emoji}</span>
      <div class="verdict-label" style="color:${vd.color}">${vd.label}</div>
      <div class="verdict-score" style="color:${vd.color}">Score: ${score}/100</div>
      ${oneLine ? `<div class="verdict-line">"${oneLine}"</div>` : ""}
    </div>
    ${deduped.length > 0 ? `<div class="prices-section"><div class="prices-title">Live Prices</div>${currentRow}${priceRows}</div>` : ""}
    ${buyBtn}
    ${coupon ? `<div class="tip"><div class="tip-label">🏷️ Coupon Tips</div>${coupon}</div>` : ""}
    ${wob ? `<div class="tip" style="border-color:#${wob.toLowerCase().startsWith("wait")?"854D0E":"14532D"}"><div class="tip-label">${wob.toLowerCase().startsWith("wait")?"⏳ Wait":"🛒 Buy Now"}</div>${wob}</div>` : ""}
    <a class="open-app" href="https://gooddeal-server-production.up.railway.app" target="_blank">Open full app →</a>
  `;
}

function showManualForm(prefill) {
  document.getElementById("body").innerHTML = `
    ${prefill?.title ? `<div class="detected">
      <div class="det-label">📍 Detected on this page</div>
      <div class="det-title">${prefill.title}</div>
      ${prefill.price ? `<div class="det-price">${prefill.price}</div>` : ""}
      ${prefill.store ? `<div class="det-store">${prefill.store}</div>` : ""}
    </div>` : ""}
    <div class="input-group">
      <label class="lbl">Item name</label>
      <input type="text" id="item" placeholder="e.g. Nike Air Force 1" value="${prefill?.title||""}">
    </div>
    <div class="input-group">
      <label class="lbl">Price you see</label>
      <input type="text" id="price" inputmode="decimal" placeholder="$99" value="${prefill?.price||""}">
    </div>
    <button class="checkbtn" id="checkbtn" onclick="handleCheck()">Check this deal →</button>
    <a class="open-app" href="https://gooddeal-server-production.up.railway.app" target="_blank">Open full app →</a>
  `;
  document.getElementById("item").addEventListener("input", updateBtn);
  document.getElementById("price").addEventListener("input", updateBtn);
  updateBtn();
}

function updateBtn() {
  const btn = document.getElementById("checkbtn");
  if (!btn) return;
  const ok = document.getElementById("item")?.value && document.getElementById("price")?.value;
  btn.disabled = !ok;
  btn.textContent = ok ? "Check this deal →" : "Enter item + price above";
}

function handleCheck() {
  const item = document.getElementById("item")?.value?.trim();
  const price = document.getElementById("price")?.value?.trim();
  if (!item || !price) return;
  const store = detected?.store || "";
  const cartUrl = detected?.cartUrl || null;
  runCheck(item, price, store, cartUrl);
}

// On load: try to detect product from current tab
chrome.tabs.query({active: true, currentWindow: true}, async (tabs) => {
  const tab = tabs[0];
  if (!tab?.id) { showManualForm(null); return; }

  try {
    const results = await chrome.scripting.executeScript({
      target: {tabId: tab.id},
      files: ["content.js"]
    });
  } catch(e) {}

  try {
    chrome.tabs.sendMessage(tab.id, {type: "GET_PRODUCT"}, (res) => {
      if (chrome.runtime.lastError || !res) {
        showManualForm(null);
        return;
      }
      detected = res;
      if (res.title && res.price) {
        // Auto-run check if we got both
        showManualForm(res);
        // Auto-trigger after short delay
        setTimeout(() => {
          if (document.getElementById("item")?.value && document.getElementById("price")?.value) {
            handleCheck();
          }
        }, 400);
      } else {
        showManualForm(res);
      }
    });
  } catch(e) {
    showManualForm(null);
  }
});
