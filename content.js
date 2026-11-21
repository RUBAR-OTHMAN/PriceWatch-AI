/**
 * PriceWatch AI - Content script: extract product title and price from retail pages.
 * Tries site-specific and generic patterns for modern retail frontends.
 */
(function () {
  function trimText(text) {
    if (typeof text !== 'string') return '';
    return text.replace(/\s+/g, ' ').trim();
  }

  function extractFirstPriceMatch(text) {
    if (!text) return null;

    const normalized = String(text)
      .replace(/\u00A0/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    const match = normalized.match(/\$\s*\d{1,4}(?:,\d{3})*(?:\.\d{2})?|\d{1,4}(?:,\d{3})*(?:\.\d{2})/);
    if (!match) return null;

    let raw = trimText(match[0]);
    raw = raw.replace(/^\$\s*/, '$');
    const numeric = raw.replace(/[^\d.]/g, '');
    if (!numeric || !Number.isFinite(parseFloat(numeric)) || parseFloat(numeric) <= 0) return null;

    return {
      raw,
      value: numeric,
    };
  }

  function extractPriceFromElement(el) {
    if (!el) return null;

    const candidates = [];
    const dataPrice = el.getAttribute('data-price');
    const content = el.getAttribute('content');
    const text = el.textContent;

    if (dataPrice) candidates.push(dataPrice);
    if (content) candidates.push(content);
    if (text) candidates.push(text);

    for (const raw of candidates) {
      const match = extractFirstPriceMatch(raw);
      if (match) return match;
    }

    return null;
  }

  function extractFromDataPriceAttributes() {
    const elements = document.querySelectorAll('*');

    for (const el of elements) {
      try {
        const attrs = el.getAttributeNames ? el.getAttributeNames() : [];
        for (const attrName of attrs) {
          const lower = String(attrName || '').toLowerCase();
          if (!lower.startsWith('data-') || !lower.includes('price')) continue;

          const raw = el.getAttribute(attrName);
          const byAttr = extractFirstPriceMatch(raw);
          if (byAttr) return byAttr;
        }
      } catch (_) {}
    }

    return null;
  }

  function extractPriceByElementTextPattern() {
    const elements = document.querySelectorAll('span, div, p, strong');
    for (const el of elements) {
      const text = trimText(el.textContent || '');
      if (!text || text.length > 80) continue;

      const matched = extractFirstPriceMatch(text);
      if (matched) return matched;
    }

    return null;
  }

  function extractPrice() {
    const isNike = /(^|\.)nike\.com$/i.test(window.location.hostname);
    const isHM = /(^|\.)hm\.com$/i.test(window.location.hostname);

    // Nike-specific: avoid noisy containers and only use tight selectors/patterns.
    if (isNike) {
      const nikeEl = document.querySelector('.product-price');
      const nikePrice = extractPriceFromElement(nikeEl);
      if (nikePrice) return nikePrice;

      const nikePattern = extractFirstPriceMatch(document.body ? document.body.textContent : '');
      if (nikePattern) return nikePattern;
    }

    // H&M-specific selectors often used in dynamic components.
    if (isHM) {
      const hmSelectors = [
        'span.price__value',
        '[class*="price__value"]',
        '[class*="ispu-price"]',
        '[class*="product-item-price"]',
        '[class*="price-value"]',
        '[class*="ProductPrice"]',
      ];

      for (const sel of hmSelectors) {
        try {
          const el = document.querySelector(sel);
          const hmPrice = extractPriceFromElement(el);
          if (hmPrice) return hmPrice;
        } catch (_) {}
      }
    }

    // Broad selector pass for all sites.
    const priceSelectors = [
      '.a-price .a-offscreen',
      '#priceblock_ourprice',
      '#priceblock_dealprice',
      '#priceblock_saleprice',
      '#corePrice_feature_div .a-offscreen',
      '[data-testid="product-price"]',
      '[data-test="product-price"]',
      '[data-automation="product-price"]',
      '.product-price',
      '.product-price__value',
      '.price__current',
      '.price-current',
      '.pdp-price',
      '#price',
      '.price',
      '[class*="price"]',
      '[id*="price"]',
      '.ProductPrice',
      '.product-price-block__price',
      '.price-block__price',
      '[data-price]',
    ];

    for (const sel of priceSelectors) {
      try {
        const el = document.querySelector(sel);
        if (!el) continue;
        const result = extractPriceFromElement(el);
        if (result) return result;
      } catch (_) {}
    }

    // Any data-* attribute containing "price".
    const byDataAttributes = extractFromDataPriceAttributes();
    if (byDataAttributes) return byDataAttributes;

    // Structured data: JSON-LD.
    try {
      const scripts = document.querySelectorAll('script[type="application/ld+json"]');
      for (const script of scripts) {
        const data = JSON.parse(script.textContent || '{}');
        let objs = Array.isArray(data) ? data : [data];
        if (objs[0] && objs[0]['@graph']) objs = objs[0]['@graph'];

        for (const obj of objs) {
          const offers = obj.offers || obj.Offer;
          const price = (offers && (offers.price ?? (Array.isArray(offers) && offers[0] && offers[0].price))) ?? obj.price;
          if (price != null) {
            const jsonLdPrice = extractFirstPriceMatch(String(price));
            if (jsonLdPrice) return jsonLdPrice;
          }
        }
      }
    } catch (_) {}

    // Meta tags.
    const priceMeta = document.querySelector('meta[property="product:price:amount"], meta[name="product:price:amount"], meta[itemprop="price"]');
    if (priceMeta) {
      const metaPrice = extractFirstPriceMatch(priceMeta.getAttribute('content'));
      if (metaPrice) return metaPrice;
    }

    // Final fallback for any site: scan short text elements for the first price token.
    const byElementText = extractPriceByElementTextPattern();
    if (byElementText) return byElementText;

    return null;
  }

  function extractTitle() {
    const titleSelectors = [
      // Nike / H&M specific
      'h1#pdp_product_title',
      'h1[data-testid="product_title"]',
      'h1[data-testid="product-name"]',
      '[class*="product-name"] h1',
      '[class*="product-title"] h1',

      // Generic
      '#productTitle',
      '#title',
      '[data-testid="product-title"]',
      '[data-test="product-title"]',
      '.product-title',
      '.product-title__text',
      '.product-name',
      '.pdp-product-title',
      '.product-heading',
      'h1[class*="product"]',
      '[class*="product-title"]',
      '[id*="product-title"]',
      '[data-product-name]',
      '[data-automation="product-title"]',
      '.ProductTitle',
      '.product-name__heading',
      '.product-info__title',
      'h1',
    ];

    for (const sel of titleSelectors) {
      try {
        const el = document.querySelector(sel);
        if (!el) continue;
        const text = trimText(el.textContent);
        if (text && text.length > 2 && text.length < 500) return text;
      } catch (_) {}
    }

    const ogTitle = document.querySelector('meta[property="og:title"]');
    if (ogTitle) {
      const t = trimText(ogTitle.getAttribute('content') || '');
      if (t && t.length < 500) return t;
    }

    try {
      const scripts = document.querySelectorAll('script[type="application/ld+json"]');
      for (const script of scripts) {
        const data = JSON.parse(script.textContent || '{}');
        let objs = Array.isArray(data) ? data : [data];
        if (objs[0] && objs[0]['@graph']) objs = objs[0]['@graph'];
        for (const obj of objs) {
          const name = (obj['@type'] === 'Product' && obj.name) || obj.name;
          if (name && typeof name === 'string') {
            const t = trimText(name);
            if (t && t.length < 500) return t;
          }
        }
      }
    } catch (_) {}

    return null;
  }

  // Delay extraction to support dynamic rendering (React/SPA retail pages like Nike/H&M).
  setTimeout(() => {
    let attempts = 0;
    const maxAttempts = 3;

    const tryExtract = () => {
      attempts += 1;
      const title = extractTitle();
      const priceInfo = extractPrice();

      if (priceInfo || attempts >= maxAttempts) {
        const url = window.location.href || null;
        chrome.runtime.sendMessage({
          type: 'EXTRACT_RESULT',
          title: title || null,
          price: priceInfo ? priceInfo.raw : null,
          url: url || null,
        });
        return;
      }

      setTimeout(tryExtract, 700);
    };

    tryExtract();
  }, 1000);
})();
