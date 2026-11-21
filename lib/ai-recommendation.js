(function (root) {
  function toNumber(value) {
    if (value == null || value === '') return null;
    if (typeof value === 'number' && Number.isFinite(value)) return value;

    const raw = String(value).trim();
    let cleaned = raw.replace(/\s/g, '');
    cleaned = cleaned.replace(/[^\d.,-]/g, '');

    if (cleaned.includes('.') && cleaned.includes(',')) {
      cleaned = cleaned.replace(/,/g, '');
    } else if (cleaned.includes(',') && !cleaned.includes('.')) {
      cleaned = cleaned.replace(/,/g, '.');
    } else {
      cleaned = cleaned.replace(/,/g, '');
    }

    const match = cleaned.match(/-?\d+\.?\d*/);
    if (!match) return null;

    const num = parseFloat(match[0]);
    return Number.isFinite(num) ? num : null;
  }

  function linearRegression(values) {
    const n = values.length;
    if (n < 2) {
      return {
        slope: 0,
        intercept: n === 1 ? values[0] : 0,
        r2: 0,
      };
    }

    let sumX = 0;
    let sumY = 0;
    let sumXY = 0;
    let sumXX = 0;

    for (let i = 0; i < n; i += 1) {
      const x = i;
      const y = values[i];
      sumX += x;
      sumY += y;
      sumXY += x * y;
      sumXX += x * x;
    }

    const denominator = n * sumXX - sumX * sumX;
    const slope = denominator === 0 ? 0 : (n * sumXY - sumX * sumY) / denominator;
    const intercept = (sumY - slope * sumX) / n;

    const meanY = sumY / n;
    let ssTotal = 0;
    let ssResidual = 0;

    for (let i = 0; i < n; i += 1) {
      const pred = intercept + slope * i;
      const actual = values[i];
      ssTotal += (actual - meanY) * (actual - meanY);
      ssResidual += (actual - pred) * (actual - pred);
    }

    const r2 = ssTotal === 0 ? 0 : 1 - ssResidual / ssTotal;

    return {
      slope,
      intercept,
      r2: Number.isFinite(r2) ? Math.max(0, Math.min(1, r2)) : 0,
    };
  }

  function median(values) {
    if (!values.length) return null;
    const arr = [...values].sort((a, b) => a - b);
    const mid = Math.floor(arr.length / 2);
    if (arr.length % 2 === 0) {
      return (arr[mid - 1] + arr[mid]) / 2;
    }
    return arr[mid];
  }

  function computeRecommendation(pricePoints, options) {
    const opts = options || {};
    const horizonDays = Number.isFinite(opts.horizonDays) ? Math.max(3, Math.floor(opts.horizonDays)) : 7;
    const buyNowBufferPct = Number.isFinite(opts.buyNowBufferPct) ? Math.max(0, opts.buyNowBufferPct) : 0.02;

    const validPoints = (pricePoints || [])
      .map((point) => ({
        checked_at: point.checked_at || point.x || null,
        price: toNumber(point.price != null ? point.price : point.y),
      }))
      .filter((point) => point.price != null);

    if (!validPoints.length) {
      return {
        status: 'insufficient_data',
        message: 'No price history yet.',
        confidence: 0,
      };
    }

    const values = validPoints.map((point) => point.price);
    const currentPrice = values[values.length - 1];
    const lowestHistorical = Math.min(...values);
    const highestHistorical = Math.max(...values);
    const medianPrice = median(values);

    if (values.length < 3) {
      const nearLow = currentPrice <= lowestHistorical * (1 + buyNowBufferPct);
      return {
        status: nearLow ? 'buy_now' : 'watch',
        message: nearLow ? 'Current price is at a tracked low. Good time to buy.' : 'Need a bit more history for a stronger recommendation.',
        confidence: values.length === 2 ? 0.35 : 0.25,
        currentPrice,
        lowestHistorical,
        highestHistorical,
        predictedLowNext7d: currentPrice,
        predictedHighNext7d: currentPrice,
      };
    }

    const recentWindow = values.slice(-Math.min(values.length, 30));
    const regression = linearRegression(recentWindow);

    const predictions = [];
    const startX = recentWindow.length;
    for (let i = 0; i < horizonDays; i += 1) {
      const raw = regression.intercept + regression.slope * (startX + i);
      const safe = Math.max(0.01, raw);
      predictions.push(safe);
    }

    const predictedLow = Math.min(...predictions);
    const predictedHigh = Math.max(...predictions);

    const nearHistoricalLow = currentPrice <= lowestHistorical * (1 + buyNowBufferPct);
    const trendUp = regression.slope >= 0;
    const expectedToRiseSoon = predictedLow >= currentPrice * 0.995;
    const belowMedian = medianPrice != null ? currentPrice <= medianPrice * 0.95 : false;

    const shouldBuyNow = nearHistoricalLow && (trendUp || expectedToRiseSoon || belowMedian);

    const sampleFactor = Math.min(1, values.length / 20);
    const confidence = Math.max(0.2, Math.min(0.95, 0.3 + regression.r2 * 0.45 + sampleFactor * 0.25));

    let message;
    if (shouldBuyNow) {
      message = 'Buy now: this is near your historical low and the model does not expect a better price soon.';
    } else if (predictedLow < currentPrice * 0.98) {
      message = 'Wait: model expects a lower price soon.';
    } else {
      message = 'Watch: price is fair, but not at the strongest buy signal yet.';
    }

    return {
      status: shouldBuyNow ? 'buy_now' : 'wait',
      message,
      confidence,
      currentPrice,
      lowestHistorical,
      highestHistorical,
      medianPrice,
      predictedLowNext7d: predictedLow,
      predictedHighNext7d: predictedHigh,
      trendSlope: regression.slope,
      sampleSize: values.length,
    };
  }

  root.PriceWatchAI = {
    toNumber,
    computeRecommendation,
  };
})(typeof self !== 'undefined' ? self : window);
