// Extracts product name, price, and direct cart/product URL from shopping pages

function extractProductInfo() {
  const host = location.hostname;
  let title = "", price = "", cartUrl = null;

  if (host.includes("amazon.com")) {
    title = document.getElementById("productTitle")?.innerText?.trim()
      || document.querySelector("h1.a-size-large")?.innerText?.trim() || "";
    price = document.querySelector(".a-price .a-offscreen")?.innerText?.trim()
      || document.querySelector("#price_inside_buybox")?.innerText?.trim()
      || document.querySelector("#priceblock_ourprice")?.innerText?.trim() || "";
    const asin = document.querySelector("#ASIN")?.value
      || location.pathname.match(/\/dp\/([A-Z0-9]{10})/)?.[1];
    cartUrl = asin ? `https://www.amazon.com/dp/${asin}` : null;
  }

  else if (host.includes("ebay.com")) {
    title = document.querySelector("h1.x-item-title__mainTitle")?.innerText?.trim()
      || document.querySelector("#itemTitle")?.innerText?.replace("Details about", "").trim() || "";
    price = document.querySelector(".x-price-primary .ux-textspans")?.innerText?.trim()
      || document.querySelector("#prcIsum")?.innerText?.trim() || "";
    cartUrl = location.href;
  }

  else if (host.includes("walmart.com")) {
    title = document.querySelector('[itemprop="name"]')?.innerText?.trim()
      || document.querySelector("h1.f3")?.innerText?.trim() || "";
    price = document.querySelector('[itemprop="price"]')?.getAttribute("content")
      ? "$" + document.querySelector('[itemprop="price"]').getAttribute("content")
      : document.querySelector(".price-characteristic")?.innerText?.trim() || "";
    cartUrl = location.href;
  }

  else if (host.includes("target.com")) {
    title = document.querySelector("h1[data-test='product-title']")?.innerText?.trim()
      || document.querySelector("h1.Heading__StyledHeading")?.innerText?.trim() || "";
    price = document.querySelector("[data-test='product-price']")?.innerText?.trim() || "";
    cartUrl = location.href;
  }

  else if (host.includes("bestbuy.com")) {
    title = document.querySelector(".sku-title h1")?.innerText?.trim()
      || document.querySelector("h1.heading-5")?.innerText?.trim() || "";
    price = document.querySelector(".priceView-hero-price span")?.innerText?.trim()
      || document.querySelector(".sr-only")?.innerText?.trim() || "";
    cartUrl = location.href;
  }

  else if (host.includes("etsy.com")) {
    title = document.querySelector("h1[data-buy-box-listing-title]")?.innerText?.trim()
      || document.querySelector(".wt-text-body-03")?.innerText?.trim() || "";
    price = document.querySelector(".wt-text-title-largest")?.innerText?.trim() || "";
    cartUrl = location.href;
  }

  else {
    title = document.querySelector("h1")?.innerText?.trim() || "";
    price = "";
    cartUrl = location.href;
  }

  return { title: title.slice(0, 200), price, cartUrl, store: host.replace("www.", "") };
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "GET_PRODUCT") {
    sendResponse(extractProductInfo());
  }
});
