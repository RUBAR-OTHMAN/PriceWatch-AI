// PriceWatch AI - Background Service Worker

// Load Supabase client and shared config (URL, anon key)
importScripts('lib/supabase.js', 'lib/ai-recommendation.js', 'config.js');

const { createClient } = supabase;
const DEFAULT_CURRENCY = 'USD';
let supabaseClient = null;

function logBackground(message, details) {
  if (details) {
    console.info(`[PriceWatch] ${message}`, details);
    return;
  }
  console.info(`[PriceWatch] ${message}`);
}

function getSupabaseAuthStorageKey(url) {
  try {
    const projectRef = new URL(url).hostname.split('.')[0];
    return `sb-${projectRef}-auth-token`;
  } catch {
    return 'pricewatch-auth-token';
  }
}

function createChromeAuthStorage() {
  if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) return null;

  return {
    getItem(key) {
      return new Promise((resolve) => {
        chrome.storage.local.get([key], (result) => {
          resolve(Object.prototype.hasOwnProperty.call(result || {}, key) ? result[key] : null);
        });
      });
    },
    setItem(key, value) {
      return new Promise((resolve) => {
        chrome.storage.local.set({ [key]: value }, resolve);
      });
    },
    removeItem(key) {
      return new Promise((resolve) => {
        chrome.storage.local.remove([key], resolve);
      });
    },
  };
}

function getSupabaseClient() {
  if (supabaseClient) return supabaseClient;

  const url = self.SUPABASE_URL;
  const anonKey = self.SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;

  const authStorage = createChromeAuthStorage();
  const authOptions = {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
    storageKey: getSupabaseAuthStorageKey(url),
  };

  if (authStorage) {
    authOptions.storage = authStorage;
  }

  supabaseClient = createClient(url, anonKey, {
    auth: authOptions,
  });
  return supabaseClient;
}

async function getAuthenticatedContext() {
  const client = getSupabaseClient();
  if (!client) {
    logBackground('Supabase is not configured; skipping background check.');
    return null;
  }

  try {
    const { data, error } = await client.auth.getSession();
    if (error) {
      logBackground('Could not read Supabase session; skipping background check.', error.message);
      return null;
    }

    const session = data && data.session ? data.session : null;
    if (!session || !session.user) {
      logBackground('No authenticated Supabase session; skipping background check.');
      return null;
    }

    return {
      client,
      session,
      user: session.user,
    };
  } catch (err) {
    logBackground('Unexpected auth/session error; skipping background check.', err && err.message ? err.message : err);
    return null;
  }
}

function normalizePrice(value) {
  let parsed = null;

  if (self.PriceWatchAI && typeof self.PriceWatchAI.toNumber === 'function') {
    parsed = self.PriceWatchAI.toNumber(value);
  } else if (typeof value === 'number' && Number.isFinite(value)) {
    parsed = value;
  } else if (value != null && value !== '') {
    const match = String(value).replace(/[^\d.,-]/g, '').match(/-?\d+\.?\d*/);
    parsed = match ? parseFloat(match[0].replace(/,/g, '')) : null;
  }

  if (parsed == null || !Number.isFinite(parsed) || parsed <= 0) return null;
  return Number(parsed.toFixed(2));
}

chrome.runtime.onInstalled.addListener(() => {
  // Create or reset a daily alarm to refresh prices every 24 hours.
  // Background checks are client-side and depend on Chrome, the extension
  // service worker, and a signed-in session being available.
  chrome.alarms.create('pricewatch_daily_check', {
    periodInMinutes: 60 * 24,
  });
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'pricewatch_daily_check') {
    runDailyPriceCheck().catch((err) => {
      logBackground('Daily price check failed.', err && err.message ? err.message : err);
    });
  }
});

async function runDailyPriceCheck() {
  const auth = await getAuthenticatedContext();
  if (!auth) return;

  try {
    const { data: items, error } = await auth.client
      .from('tracked_items')
      .select('id, url, title, current_price, target_price, currency, last_checked_at')
      .eq('user_id', auth.user.id)
      .order('created_at', { ascending: false });

    if (error) {
      logBackground('Could not load tracked items for background check.', error.message);
      return;
    }

    if (!items || items.length === 0) {
      logBackground('No tracked items found for current user.');
      return;
    }

    for (const item of items) {
      try {
        await checkPriceForItem(item, auth);
      } catch (err) {
        logBackground('Skipping item after price check failure.', {
          id: item && item.id,
          error: err && err.message ? err.message : String(err),
        });
      }
    }
  } catch (err) {
    logBackground('Unexpected daily price check error.', err && err.message ? err.message : err);
  }
}

async function shouldSendBuyNowNotification(itemId, currentPrice) {
  if (!itemId || currentPrice == null) return true;
  const key = `buy_now_alert_${itemId}`;

  return new Promise((resolve) => {
    chrome.storage.local.get([key], (result) => {
      const previous = result && result[key];
      const now = Date.now();
      const twelveHours = 1000 * 60 * 60 * 12;

      if (!previous) {
        chrome.storage.local.set({
          [key]: {
            price: currentPrice,
            sentAt: now,
          },
        }, () => resolve(true));
        return;
      }

      const recentlySent = now - Number(previous.sentAt || 0) < twelveHours;
      const samePrice = Math.abs(Number(previous.price || 0) - currentPrice) < 0.01;

      if (recentlySent && samePrice) {
        resolve(false);
        return;
      }

      chrome.storage.local.set({
        [key]: {
          price: currentPrice,
          sentAt: now,
        },
      }, () => resolve(true));
    });
  });
}

async function shouldSendTargetPriceNotification(itemId, currentPrice, targetPrice) {
  if (!itemId || currentPrice == null || targetPrice == null) return false;
  const key = `target_price_alert_${itemId}`;

  return new Promise((resolve) => {
    chrome.storage.local.get([key], (result) => {
      const previous = result && result[key];
      const now = Date.now();
      const twelveHours = 1000 * 60 * 60 * 12;

      if (previous) {
        const recentlySent = now - Number(previous.sentAt || 0) < twelveHours;
        const sameTarget = Math.abs(Number(previous.targetPrice || 0) - targetPrice) < 0.01;

        if (recentlySent && sameTarget) {
          resolve(false);
          return;
        }
      }

      chrome.storage.local.set({
        [key]: {
          price: currentPrice,
          targetPrice,
          sentAt: now,
        },
      }, () => resolve(true));
    });
  });
}

function formatMoney(value, currency) {
  if (!Number.isFinite(value)) return '--';
  if (currency && currency !== DEFAULT_CURRENCY) return `${currency} ${value.toFixed(2)}`;
  return `$${value.toFixed(2)}`;
}

async function maybeSendTargetPriceNotification(item, currentPrice) {
  const targetPrice = normalizePrice(item && item.target_price);
  if (targetPrice == null || currentPrice == null || currentPrice > targetPrice) return;

  const allowNotification = await shouldSendTargetPriceNotification(item.id, currentPrice, targetPrice);
  if (!allowNotification) return;

  const title = item.title || 'Tracked product';
  const currency = item.currency || DEFAULT_CURRENCY;
  const message = `${title}\nNow: ${formatMoney(currentPrice, currency)} | Target: ${formatMoney(targetPrice, currency)}`;

  chrome.notifications.create(`target-price-${item.id}-${Date.now()}`, {
    type: 'basic',
    title: 'PriceWatch AI: Target price reached',
    message,
    priority: 2,
  });
}

async function analyzeItemAndNotify(item, client) {
  if (!client || !item || !item.id || !self.PriceWatchAI) return;

  try {
    const { data: history, error } = await client
      .from('price_history')
      .select('price, checked_at')
      .eq('tracked_item_id', item.id)
      .order('checked_at', { ascending: true })
      .limit(120);

    if (error || !history || history.length < 2) return;

    const numericHistory = history
      .map((row) => ({
        checked_at: row.checked_at,
        price: normalizePrice(row.price),
      }))
      .filter((row) => row.price != null);

    if (numericHistory.length < 2) return;

    const rec = self.PriceWatchAI.computeRecommendation(numericHistory, {
      horizonDays: 7,
      buyNowBufferPct: 0.02,
    });

    if (rec.status !== 'buy_now' || !Number.isFinite(rec.currentPrice)) return;

    const allowNotification = await shouldSendBuyNowNotification(item.id, rec.currentPrice);
    if (!allowNotification) return;

    const title = item.title || 'Tracked product';
    const currency = item.currency || DEFAULT_CURRENCY;
    const message = `${title}\nNow: ${formatMoney(rec.currentPrice, currency)} | Low: ${formatMoney(rec.lowestHistorical, currency)}\n${rec.message}`;

    chrome.notifications.create(`buy-now-${item.id}-${Date.now()}`, {
      type: 'basic',
      title: 'PriceWatch AI: Best time to buy',
      message,
      priority: 2,
    });
  } catch (err) {
    logBackground('Recommendation/notification step failed.', err && err.message ? err.message : err);
  }
}

async function checkPriceForItem(item, auth) {
  if (!auth || !auth.client || !auth.user || !item || !item.id || !item.url) return;

  let createdTab = null;
  try {
    createdTab = await chrome.tabs.create({
      url: item.url,
      active: false,
    });
  } catch (err) {
    logBackground('Could not open product page for background check.', {
      id: item.id,
      error: err && err.message ? err.message : String(err),
    });
    return;
  }

  if (!createdTab || !createdTab.id) return;
  const tabId = createdTab.id;

  return new Promise((resolve) => {
    let completed = false;

    const cleanup = async () => {
      if (completed) return;
      completed = true;
      chrome.runtime.onMessage.removeListener(onMessage);
      try {
        await chrome.tabs.remove(tabId);
      } catch {
        // Ignore tab cleanup failures.
      }
      resolve();
    };

    const timeoutId = setTimeout(() => {
      logBackground('Timed out while extracting price.', { id: item.id });
      cleanup();
    }, 15000);

    const onMessage = async (message, sender) => {
      if (message.type !== 'EXTRACT_RESULT' || sender.tab?.id !== tabId) return;
      clearTimeout(timeoutId);
      chrome.runtime.onMessage.removeListener(onMessage);

      const numericPrice = normalizePrice(message.price);
      if (numericPrice == null) {
        logBackground('Skipping item because extracted price was invalid.', { id: item.id });
        await cleanup();
        return;
      }

      try {
        const checkedAt = new Date().toISOString();

        const { error: historyError } = await auth.client.from('price_history').insert({
          tracked_item_id: item.id,
          price: numericPrice,
          checked_at: checkedAt,
        });
        if (historyError) throw historyError;

        const { error: updateError } = await auth.client
          .from('tracked_items')
          .update({
            current_price: numericPrice,
            last_checked_at: checkedAt,
          })
          .eq('id', item.id)
          .eq('user_id', auth.user.id);
        if (updateError) throw updateError;

        const updatedItem = {
          ...item,
          current_price: numericPrice,
          currency: item.currency || DEFAULT_CURRENCY,
        };

        await maybeSendTargetPriceNotification(updatedItem, numericPrice);
        await analyzeItemAndNotify(updatedItem, auth.client);
      } catch (err) {
        logBackground('Could not save background price check result.', {
          id: item.id,
          error: err && err.message ? err.message : String(err),
        });
      }

      await cleanup();
    };

    chrome.runtime.onMessage.addListener(onMessage);

    chrome.scripting
      .executeScript({
        target: { tabId },
        files: ['content.js'],
      })
      .catch(async (err) => {
        clearTimeout(timeoutId);
        logBackground('Could not inject content script for background check.', {
          id: item.id,
          error: err && err.message ? err.message : String(err),
        });
        await cleanup();
      });
  });
}
