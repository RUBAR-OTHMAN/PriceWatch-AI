const { createClient } = supabase;

const authSection = document.getElementById('auth-section');
const authForm = document.getElementById('auth-form');
const authEmail = document.getElementById('auth-email');
const authPassword = document.getElementById('auth-password');
const authSignInBtn = document.getElementById('auth-sign-in');
const authSignUpBtn = document.getElementById('auth-sign-up');
const authSignOutBtn = document.getElementById('auth-sign-out');
const authStatusIndicator = document.getElementById('auth-status-indicator');
const authStatusText = document.getElementById('auth-status-text');
const authUser = document.getElementById('auth-user');
const authUserEmail = document.getElementById('auth-user-email');
const authMessage = document.getElementById('auth-message');
const authTrustNote = document.querySelector('.auth-trust-note');
const mainApp = document.getElementById('main-app');
const trackBtn = document.getElementById('track-price');
const resultEl = document.getElementById('result');
const resultTitle = document.getElementById('result-title');
const resultPrice = document.getElementById('result-price');
const extractionConfidenceEl = document.getElementById('extraction-confidence');
const targetPriceInput = document.getElementById('target-price');
const errorEl = document.getElementById('error');
const errorText = document.getElementById('error-text');
const loadingEl = document.getElementById('loading');
const saveBtn = document.getElementById('save');
const saveSuccessEl = document.getElementById('save-success');
const saveErrorEl = document.getElementById('save-error');
const saveErrorText = document.getElementById('save-error-text');
const viewTrackBtn = document.getElementById('view-track');
const viewDashboardBtn = document.getElementById('view-dashboard');
const trackView = document.getElementById('track-view');
const dashboardView = document.getElementById('dashboard-view');
const dashboardList = document.getElementById('dashboard-list');
const dashboardEmpty = document.getElementById('dashboard-empty');
const dashboardLoading = document.getElementById('dashboard-loading');
const dashboardChartContainer = document.getElementById('dashboard-chart-container');
const chartTitleEl = document.getElementById('chart-title');
const chartCanvas = document.getElementById('price-chart');
const deleteConfirmOverlay = document.getElementById('delete-confirm-overlay');
const deleteErrorText = document.getElementById('delete-error-text');
const deleteConfirmCancel = document.getElementById('delete-confirm-cancel');
const deleteConfirmOk = document.getElementById('delete-confirm-ok');
const aiRecommendationEl = document.getElementById('ai-recommendation');
const aiRecLabelEl = document.getElementById('ai-rec-label');
const aiRecMessageEl = document.getElementById('ai-rec-message');
const aiRecMetaEl = document.getElementById('ai-rec-meta');

let currentProduct = null;
let selectedCard = null;
let priceChart = null;
const dashboardCharts = new Map();
let pendingDeleteItem = null;
let supabaseClient = null;
let currentSession = null;
let authSubscription = null;
const DEFAULT_CURRENCY = 'USD';
const MAX_REASONABLE_PRICE = 1000000;
const AI_RECOMMENDATION_FUNCTION = 'recommend-price';
const SUPPORTED_PRICE_DOMAINS = [
  'amazon.com',
  'bestbuy.com',
  'hm.com',
  'nike.com',
  'target.com',
  'walmart.com',
];

function logAiRecommend(message, details) {
  if (details !== undefined) {
    console.info(`[AI recommend] ${message}`, details);
    return;
  }
  console.info(`[AI recommend] ${message}`);
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

  const url = window.SUPABASE_URL;
  const anonKey = window.SUPABASE_ANON_KEY;
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

function isAuthenticated() {
  return Boolean(currentSession && currentSession.user);
}

async function getAuthenticatedContext(messageHandler) {
  const client = getSupabaseClient();
  if (!client) {
    const message = 'PriceWatch is not configured yet. Copy config.example.js to config.js and add your Supabase URL and anon key.';
    if (messageHandler) messageHandler(message);
    else showAuthMessage(message, 'error');
    return null;
  }

  const { data, error } = await client.auth.getSession();
  if (error) {
    const message = error.message || 'Could not verify your sign-in. Please try again.';
    if (messageHandler) messageHandler(message);
    else showAuthMessage(message, 'error');
    return null;
  }

  const session = data && data.session ? data.session : null;
  if (!session || !session.user) {
    setAuthView(null, 'Sign in to continue.', 'error');
    if (messageHandler) messageHandler('Sign in to continue.');
    return null;
  }

  currentSession = session;
  return {
    client,
    session,
    user: session.user,
  };
}

function setAuthButtonsDisabled(disabled) {
  authSignInBtn.disabled = disabled;
  authSignUpBtn.disabled = disabled;
  authSignOutBtn.disabled = disabled;
}

function showAuthMessage(message, type) {
  authMessage.textContent = message || '';
  authMessage.hidden = !message;
  authMessage.classList.toggle('is-error', type === 'error');
  authMessage.classList.toggle('is-success', type === 'success');
}

function setAuthView(session, message, type) {
  currentSession = session || null;
  const signedIn = isAuthenticated();
  const email = signedIn ? currentSession.user.email || '' : '';

  authSection.hidden = false;
  authSection.classList.toggle('is-signed-in', signedIn);
  mainApp.hidden = !signedIn;
  authForm.hidden = signedIn;
  authUser.hidden = !signedIn;
  authUserEmail.textContent = email;
  if (authTrustNote) authTrustNote.hidden = signedIn;
  authStatusIndicator.classList.toggle('is-signed-in', signedIn);
  authStatusText.textContent = signedIn ? 'Authenticated' : 'Not authenticated';

  if (message) {
    showAuthMessage(message, type);
  } else {
    showAuthMessage(signedIn ? '' : 'Signed out. Sign in to continue.', signedIn ? '' : '');
  }

  if (!signedIn) {
    hideAll();
    destroyDashboardCharts();
    dashboardList.innerHTML = '';
    dashboardEmpty.hidden = true;
    dashboardLoading.hidden = true;
    dashboardChartContainer.hidden = true;
    clearRecommendation();
    pendingDeleteItem = null;
    deleteConfirmOverlay.hidden = true;
  }
}

function getAuthCredentials() {
  const email = authEmail.value.trim();
  const password = authPassword.value;

  if (!email || !password) {
    showAuthMessage('Enter an email and password.', 'error');
    return null;
  }

  if (password.length < 6) {
    showAuthMessage('Password must be at least 6 characters.', 'error');
    return null;
  }

  return { email, password };
}

async function signUp(email, password) {
  const client = getSupabaseClient();
  if (!client) {
    showAuthMessage('PriceWatch is not configured yet. Add your Supabase URL and anon key in config.js.', 'error');
    return;
  }

  setAuthButtonsDisabled(true);
  showAuthMessage('Creating account...', '');

  try {
    const redirectTo = typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL
      ? chrome.runtime.getURL('popup.html')
      : undefined;
    const options = redirectTo ? { emailRedirectTo: redirectTo } : undefined;
    let redirectWarning = '';
    let { data, error } = await client.auth.signUp({ email, password, options });
    if (error && redirectTo && String(error.message || '').toLowerCase().includes('redirect')) {
      redirectWarning = ' Add the extension popup URL to Supabase Auth redirect URLs to avoid confirmation-link errors.';
      ({ data, error } = await client.auth.signUp({ email, password }));
    }
    if (error) throw error;

    if (data.session) {
      setAuthView(data.session, 'Sign-up successful. Signed in.', 'success');
      loadDashboard();
      return;
    }

    setAuthView(null, `Account created. Check your email, then return here to sign in.${redirectWarning}`, 'success');
  } catch (err) {
    showAuthMessage(err.message || 'Sign-up failed.', 'error');
  } finally {
    setAuthButtonsDisabled(false);
  }
}

async function signIn(email, password) {
  const client = getSupabaseClient();
  if (!client) {
    showAuthMessage('PriceWatch is not configured yet. Add your Supabase URL and anon key in config.js.', 'error');
    return;
  }

  setAuthButtonsDisabled(true);
  showAuthMessage('Signing in...', '');

  try {
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw error;

    setAuthView(data.session, 'Sign-in successful.', 'success');
    loadDashboard();
  } catch (err) {
    showAuthMessage(err.message || 'Sign-in failed.', 'error');
  } finally {
    setAuthButtonsDisabled(false);
  }
}

async function signOut() {
  const client = getSupabaseClient();
  if (!client) return;

  setAuthButtonsDisabled(true);
  showAuthMessage('Signing out...', '');

  try {
    const { error } = await client.auth.signOut();
    if (error) throw error;
    setAuthView(null, 'Signed out.', 'success');
  } catch (err) {
    showAuthMessage(err.message || 'Sign-out failed.', 'error');
  } finally {
    setAuthButtonsDisabled(false);
  }
}

async function initAuth() {
  const client = getSupabaseClient();
  if (!client) {
    setAuthView(null, 'PriceWatch is not configured yet. Add your Supabase URL and anon key in config.js.', 'error');
    setAuthButtonsDisabled(true);
    return;
  }

  const { data } = client.auth.onAuthStateChange((_event, session) => {
    setAuthView(session);
    if (session) loadDashboard();
  });
  authSubscription = data && data.subscription ? data.subscription : null;

  try {
    const { data: sessionData, error } = await client.auth.getSession();
    if (error) throw error;
    setAuthView(sessionData.session);
    if (sessionData.session) loadDashboard();
  } catch (err) {
    setAuthView(null, err.message || 'Could not load your sign-in session.', 'error');
  }
}

function formatDate(isoString) {
  if (!isoString) return '--';
  const d = new Date(isoString);
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function parsePriceNumber(text) {
  if (window.PriceWatchAI && typeof window.PriceWatchAI.toNumber === 'function') {
    return window.PriceWatchAI.toNumber(text);
  }
  if (text == null || text === '') return null;
  if (typeof text === 'number' && Number.isFinite(text)) return text;
  const match = String(text).replace(/[^\d.,-]/g, '').match(/-?\d+\.?\d*/);
  if (!match) return null;
  const num = parseFloat(match[0].replace(/,/g, ''));
  return Number.isFinite(num) ? num : null;
}

function normalizePrice(value) {
  const parsed = parsePriceNumber(value);
  if (parsed == null || !Number.isFinite(parsed) || parsed <= 0 || parsed > MAX_REASONABLE_PRICE) return null;
  return Number(parsed.toFixed(2));
}

function getHostnameFromUrl(url) {
  try {
    return new URL(url).hostname.replace(/^www\./i, '').toLowerCase();
  } catch {
    return '';
  }
}

function isSupportedPriceDomain(url) {
  const hostname = getHostnameFromUrl(url);
  if (!hostname) return false;
  return SUPPORTED_PRICE_DOMAINS.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`));
}

function getExtractionConfidence(url, price) {
  const numericPrice = normalizePrice(price);
  if (numericPrice == null) {
    return {
      level: 'unsupported',
      label: 'Unsupported',
      message: 'Could not reliably detect price on this page.',
    };
  }

  if (isSupportedPriceDomain(url)) {
    return {
      level: 'supported',
      label: 'Supported',
      message: 'Supported site - price detection is reliable.',
    };
  }

  return {
    level: 'experimental',
    label: 'Experimental',
    message: 'Experimental site - please double-check the detected price.',
  };
}

function readOptionalTargetPrice(rawValue, showError) {
  const value = String(rawValue == null ? '' : rawValue).trim();
  if (!value) return null;

  const targetPrice = normalizePrice(value);
  if (targetPrice == null) {
    if (showError) showError('Target price must be a positive number.');
    return undefined;
  }

  return targetPrice;
}

function formatPrice(value, currency) {
  if (value == null || !Number.isFinite(value)) return '--';
  if (currency && currency !== DEFAULT_CURRENCY) return `${currency} ${value.toFixed(2)}`;
  return '$' + value.toFixed(2);
}

function formatTargetPrice(value, currency) {
  const targetPrice = normalizePrice(value);
  return targetPrice == null ? 'No target price' : formatPrice(targetPrice, currency || DEFAULT_CURRENCY);
}

function truncateText(text, maxLength) {
  if (!text) return '';
  const normalized = String(text).trim();
  if (normalized.length <= maxLength) return normalized;
  return normalized.slice(0, Math.max(0, maxLength - 3)).trimEnd() + '...';
}

function setActiveToggle(isTrack) {
  viewTrackBtn.classList.toggle('active', isTrack);
  viewDashboardBtn.classList.toggle('active', !isTrack);
  viewTrackBtn.setAttribute('aria-selected', isTrack ? 'true' : 'false');
  viewDashboardBtn.setAttribute('aria-selected', isTrack ? 'false' : 'true');
}

function switchView(showEl, hideEl) {
  hideEl.classList.remove('is-active');
  showEl.hidden = false;
  requestAnimationFrame(() => {
    showEl.classList.add('is-active');
  });
  setTimeout(() => {
    hideEl.hidden = true;
  }, 220);
}

function showTrackView() {
  if (!isAuthenticated()) {
    showAuthMessage('Sign in to track products.', 'error');
    return;
  }
  setActiveToggle(true);
  switchView(trackView, dashboardView);
}

function showDashboardView() {
  if (!isAuthenticated()) {
    showAuthMessage('Sign in to view your dashboard.', 'error');
    return;
  }
  setActiveToggle(false);
  switchView(dashboardView, trackView);
  loadDashboard();
}

function clearRecommendation() {
  aiRecommendationEl.hidden = true;
  aiRecommendationEl.classList.remove('buy-now', 'wait', 'watch', 'insufficient');
  aiRecLabelEl.textContent = '';
  aiRecMessageEl.textContent = '';
  aiRecMetaEl.textContent = '';
}

function renderRecommendation(points) {
  if (!window.PriceWatchAI || typeof window.PriceWatchAI.computeRecommendation !== 'function') {
    clearRecommendation();
    return;
  }

  const rec = window.PriceWatchAI.computeRecommendation(points, {
    horizonDays: 7,
    buyNowBufferPct: 0.02,
  });

  if (!rec || rec.status === 'insufficient_data') {
    aiRecommendationEl.hidden = false;
    aiRecommendationEl.classList.add('insufficient');
    aiRecLabelEl.innerHTML = '<span class="ai-rec-icon">i</span><span>AI Recommendation</span>';
    aiRecMessageEl.textContent = rec && rec.message ? rec.message : 'Not enough data yet for recommendation.';
    aiRecMetaEl.textContent = 'Keep tracking this item for more checks.';
    return;
  }

  aiRecommendationEl.hidden = false;
  aiRecommendationEl.classList.remove('buy-now', 'wait', 'watch', 'insufficient');

  const statusClass = rec.status === 'buy_now' ? 'buy-now' : rec.status === 'wait' ? 'wait' : 'watch';
  aiRecommendationEl.classList.add(statusClass);

  const statusLabel = rec.status === 'buy_now' ? 'Buy Now' : rec.status === 'wait' ? 'Wait' : 'Watch';
  const statusIcon = rec.status === 'buy_now' ? 'B' : rec.status === 'wait' ? 'W' : 'I';
  aiRecLabelEl.innerHTML = `<span class="ai-rec-icon">${statusIcon}</span><span>${statusLabel}</span>`;
  aiRecMessageEl.textContent = rec.message || '';

  const confidencePct = Math.round((rec.confidence || 0) * 100);
  aiRecMetaEl.textContent = `Now ${formatPrice(rec.currentPrice)} | Historical low ${formatPrice(rec.lowestHistorical)} | Predicted 7d range ${formatPrice(rec.predictedLowNext7d)}-${formatPrice(rec.predictedHighNext7d)} | Confidence ${confidencePct}%`;
}

function formatRecommendationAction(action) {
  if (action === 'buy_now') return 'Buy Now';
  if (action === 'wait') return 'Wait';
  return 'Watch';
}

function formatRecommendationConfidence(confidence) {
  if (confidence === 'high') return 'High';
  if (confidence === 'medium') return 'Medium';
  return 'Low';
}

function confidenceFromScore(score) {
  const numericScore = typeof score === 'number' && Number.isFinite(score) ? score : 0;
  if (numericScore >= 0.7) return 'high';
  if (numericScore >= 0.4) return 'medium';
  return 'low';
}

function validateAiRecommendation(value) {
  const rec = value && typeof value === 'object' ? value : null;
  if (!rec) return null;
  const action = rec.action;
  const confidence = rec.confidence;
  const reason = typeof rec.reason === 'string' ? rec.reason.trim() : '';
  if (!['buy_now', 'wait', 'watch'].includes(action)) return null;
  if (!['low', 'medium', 'high'].includes(confidence)) return null;
  if (!reason) return null;
  return {
    action,
    reason,
    confidence,
    source: 'ai',
  };
}

function computeLocalCardRecommendation(points) {
  if (!window.PriceWatchAI || typeof window.PriceWatchAI.computeRecommendation !== 'function') return null;

  const rec = window.PriceWatchAI.computeRecommendation(points, {
    horizonDays: 7,
    buyNowBufferPct: 0.02,
  });
  if (!rec) return null;

  if (rec.status === 'insufficient_data') {
    return {
      action: 'watch',
      reason: rec.message || 'Keep tracking this item for more history.',
      confidence: 'low',
      source: 'local',
    };
  }

  const action = rec.status === 'buy_now' ? 'buy_now' : rec.status === 'wait' ? 'wait' : 'watch';
  return {
    action,
    reason: rec.message || 'Recommendation based on saved price history.',
    confidence: confidenceFromScore(rec.confidence),
    source: 'local',
  };
}

function visibleConfidenceForRecommendation(rec, historyPointCount) {
  const confidence = rec && rec.confidence ? rec.confidence : 'low';
  // Temporary debug guard: tiny history samples should never look highly certain.
  if (!Number.isFinite(historyPointCount) || historyPointCount < 2) return 'low';
  return confidence;
}

function setCardRecommendation(el, rec, historyPointCount) {
  if (!el) return;
  const labelEl = el.querySelector('.dashboard-rec-action');
  const reasonEl = el.querySelector('.dashboard-rec-reason');
  const metaEl = el.querySelector('.dashboard-rec-meta');
  const sourceEl = el.querySelector('.dashboard-rec-source');
  const action = rec && rec.action ? rec.action : 'watch';
  const confidence = visibleConfidenceForRecommendation(rec, historyPointCount);
  const sourceLabel = rec && rec.source === 'ai' ? 'AI' : 'Fallback';

  el.classList.remove('is-loading', 'buy-now', 'wait', 'watch', 'insufficient');
  el.classList.add(action === 'buy_now' ? 'buy-now' : action === 'wait' ? 'wait' : 'watch');
  if (labelEl) labelEl.textContent = formatRecommendationAction(action);
  if (reasonEl) reasonEl.textContent = rec && rec.reason ? rec.reason : 'Keep watching this item for more price history.';
  if (metaEl) metaEl.textContent = `Confidence: ${formatRecommendationConfidence(confidence)}`;
  if (sourceEl) sourceEl.textContent = sourceLabel;
}

function setCardRecommendationLoading(el) {
  if (!el) return;
  el.classList.remove('buy-now', 'wait', 'watch', 'insufficient');
  el.classList.add('is-loading');
  const labelEl = el.querySelector('.dashboard-rec-action');
  const reasonEl = el.querySelector('.dashboard-rec-reason');
  const metaEl = el.querySelector('.dashboard-rec-meta');
  const sourceEl = el.querySelector('.dashboard-rec-source');
  if (labelEl) labelEl.textContent = 'Analyzing...';
  if (reasonEl) reasonEl.textContent = 'Checking price history.';
  if (metaEl) metaEl.textContent = '';
  if (sourceEl) sourceEl.textContent = 'AI';
}

function setCardRecommendationUnavailable(el) {
  if (!el) return;
  el.classList.remove('is-loading', 'buy-now', 'wait', 'watch');
  el.classList.add('insufficient');
  const labelEl = el.querySelector('.dashboard-rec-action');
  const reasonEl = el.querySelector('.dashboard-rec-reason');
  const metaEl = el.querySelector('.dashboard-rec-meta');
  const sourceEl = el.querySelector('.dashboard-rec-source');
  if (labelEl) labelEl.textContent = 'Watch';
  if (reasonEl) reasonEl.textContent = 'Not enough price history for a recommendation yet.';
  if (metaEl) metaEl.textContent = 'Confidence: Low';
  if (sourceEl) sourceEl.textContent = 'Fallback';
}

async function requestAiRecommendation(item, points, session) {
  if (!item || !session || !session.access_token || !window.SUPABASE_URL) {
    logAiRecommend('token present: false');
    logAiRecommend('fallback reason: missing token');
    throw new Error('AI fallback reason: missing token');
  }

  const currentPrice = normalizePrice(item.current_price);
  const targetPrice = normalizePrice(item.target_price);
  if (currentPrice == null) {
    logAiRecommend('fallback reason: invalid request payload');
    throw new Error('AI fallback reason: invalid request payload');
  }

  const functionUrl = `${window.SUPABASE_URL.replace(/\/$/, '')}/functions/v1/${AI_RECOMMENDATION_FUNCTION}`;
  logAiRecommend(`function URL: ${functionUrl}`);
  logAiRecommend(`token present: ${Boolean(session.access_token)}`);
  const payload = {
    title: item.title || 'Tracked product',
    url: item.url,
    current_price: currentPrice,
    target_price: targetPrice,
    currency: item.currency || DEFAULT_CURRENCY,
    price_history: (points || []).slice(-60).map((point) => ({
      price: point.price,
      checked_at: point.checked_at,
    })),
  };

  let response;
  try {
    response = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        apikey: window.SUPABASE_ANON_KEY || '',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    logAiRecommend('fallback reason: network error');
    logAiRecommend('network error:', err && err.message ? err.message : String(err));
    throw new Error('AI fallback reason: network error');
  }

  logAiRecommend(`status: ${response.status}`);

  const responseText = await response.text().catch((err) => {
    logAiRecommend('raw response body read failed:', err && err.message ? err.message : String(err));
    return '';
  });
  logAiRecommend('raw response body:', responseText || '(empty)');

  let data = null;
  if (responseText) {
    try {
      data = JSON.parse(responseText);
      logAiRecommend('parsed response:', data);
    } catch {
      logAiRecommend('fallback reason: invalid response shape');
      throw new Error('AI fallback reason: invalid response JSON');
    }
  }

  if (!response.ok) {
    logAiRecommend(`fallback reason: non-200 response (${response.status})`);
    throw new Error(data && data.error && data.error.message ? data.error.message : 'AI fallback reason: non-200 response');
  }

  if (!data) {
    logAiRecommend('fallback reason: invalid response shape');
    throw new Error('AI fallback reason: empty response');
  }

  if (data.fallback_recommended) {
    logAiRecommend('fallback reason: fallback_recommended returned by function');
    throw new Error(data && data.error && data.error.message ? data.error.message : 'AI fallback reason: function recommended fallback');
  }

  if (data.error) {
    logAiRecommend('fallback reason: function returned error');
    throw new Error(data.error.message || 'AI fallback reason: function returned error');
  }

  const recommendation = validateAiRecommendation(data.recommendation);
  if (!recommendation) {
    logAiRecommend('fallback reason: invalid response shape');
    throw new Error('AI fallback reason: invalid response shape');
  }
  return recommendation;
}

async function renderCardRecommendation(item, points, client, recEl) {
  if (!recEl) return;
  setCardRecommendationLoading(recEl);

  let session = currentSession;
  if (!session && client && client.auth) {
    try {
      const { data } = await client.auth.getSession();
      session = data && data.session ? data.session : null;
    } catch {
      session = null;
    }
  }

  try {
    const aiRecommendation = await requestAiRecommendation(item, points, session);
    setCardRecommendation(recEl, aiRecommendation, points.length);
    return;
  } catch (err) {
    logAiRecommend('fallback activated:', err && err.message ? err.message : String(err));
    const localRecommendation = computeLocalCardRecommendation(points);
    if (localRecommendation) {
      console.info('[PriceWatch] AI recommendation unavailable; showing local recommendation.');
      setCardRecommendation(recEl, localRecommendation, points.length);
      return;
    }
    setCardRecommendationUnavailable(recEl);
  }
}

function destroyDashboardCharts() {
  dashboardCharts.forEach((chart) => {
    try {
      chart.destroy();
    } catch {
      // Ignore stale chart cleanup failures.
    }
  });
  dashboardCharts.clear();
}

async function renderDashboardItems(items, client) {
  if (dashboardChartContainer.parentNode === dashboardList) {
    dashboardView.appendChild(dashboardChartContainer);
  }
  if (aiRecommendationEl.parentNode === dashboardList) {
    dashboardView.appendChild(aiRecommendationEl);
  }
  destroyDashboardCharts();
  dashboardList.innerHTML = '';
  dashboardChartContainer.hidden = true;
  selectedCard = null;
  clearRecommendation();

  if (!items || items.length === 0) {
    dashboardEmpty.hidden = false;
    dashboardList.hidden = true;
    return;
  }
  dashboardEmpty.hidden = true;
  dashboardList.hidden = false;

  const trashIcon =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>';

  items.forEach((item) => {
    const currentPrice = normalizePrice(item.current_price);
    const targetPrice = normalizePrice(item.target_price);
    const currency = item.currency || DEFAULT_CURRENCY;
    const confidence = getExtractionConfidence(item.url, currentPrice);
    const card = document.createElement('div');
    card.className = 'dashboard-card';
    card.dataset.id = item.id;
    card.dataset.title = item.title || '';
    card.innerHTML = `
      <button type="button" class="dashboard-card-delete" aria-label="Stop tracking this product">${trashIcon}</button>
      <p class="dashboard-card-title">${escapeHtml(item.title || '--')}</p>
      <p class="dashboard-confidence ${confidence.level}">${escapeHtml(confidence.label)}</p>
      <p class="dashboard-card-price">${escapeHtml(formatPrice(currentPrice, currency))}</p>
      <p class="dashboard-card-target">Target: <strong>${escapeHtml(formatTargetPrice(targetPrice, currency))}</strong></p>
      <div class="dashboard-target-edit">
        <input class="dashboard-target-input" type="number" min="0.01" step="0.01" inputmode="decimal" placeholder="Set target" value="${targetPrice == null ? '' : escapeHtml(targetPrice.toFixed(2))}" aria-label="Target price for ${escapeHtml(item.title || 'product')}">
        <button type="button" class="dashboard-target-save">Update</button>
      </div>
      <p class="dashboard-target-message" hidden></p>
      <div class="dashboard-card-chart">
        <p class="dashboard-card-chart-title">Price history</p>
        <div class="dashboard-card-chart-frame">
          <canvas class="dashboard-card-chart-canvas" height="110"></canvas>
        </div>
        <p class="dashboard-card-chart-empty">Loading history...</p>
      </div>
      <div class="dashboard-card-rec is-loading">
        <div class="dashboard-rec-head">
          <span class="dashboard-rec-icon" aria-hidden="true">i</span>
          <span class="dashboard-rec-action">Analyzing...</span>
          <span class="dashboard-rec-source">AI</span>
        </div>
        <p class="dashboard-rec-reason">Checking price history.</p>
        <p class="dashboard-rec-meta"></p>
      </div>
      <p class="dashboard-card-date">${formatDate(item.created_at)}</p>
    `;
    const deleteBtn = card.querySelector('.dashboard-card-delete');
    const targetInput = card.querySelector('.dashboard-target-input');
    const targetSaveBtn = card.querySelector('.dashboard-target-save');
    const targetDisplay = card.querySelector('.dashboard-card-target strong');
    const targetMessage = card.querySelector('.dashboard-target-message');
    const chartCanvasEl = card.querySelector('.dashboard-card-chart-canvas');
    const chartEmptyEl = card.querySelector('.dashboard-card-chart-empty');
    const recommendationEl = card.querySelector('.dashboard-card-rec');
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      pendingDeleteItem = item;
      deleteErrorText.hidden = true;
      deleteErrorText.textContent = '';
      deleteConfirmOverlay.hidden = false;
    });
    targetInput.addEventListener('click', (e) => e.stopPropagation());
    targetInput.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') {
        e.preventDefault();
        targetSaveBtn.click();
      }
    });
    targetSaveBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      updateTargetPrice(item, targetInput, targetDisplay, targetMessage, targetSaveBtn);
    });
    card.addEventListener('click', (e) => {
      if (e.target.closest('.dashboard-card-delete') || e.target.closest('.dashboard-target-edit')) return;
      if (selectedCard) {
        selectedCard.classList.remove('selected');
      }
      selectedCard = card;
      selectedCard.classList.add('selected');
    });
    dashboardList.appendChild(card);
    loadCardPriceHistory(item, client, chartCanvasEl, chartEmptyEl, recommendationEl);
  });
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function setTargetMessage(el, message, type) {
  if (!el) return;
  el.textContent = message || '';
  el.hidden = !message;
  el.classList.toggle('is-error', type === 'error');
  el.classList.toggle('is-success', type === 'success');
}

function formatTooltipDate(isoString) {
  if (!isoString) return '--';
  const d = new Date(isoString);
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

async function loadCardPriceHistory(item, client, canvasEl, emptyEl, recommendationEl) {
  if (!item || !item.id || !client || !canvasEl) return;

  try {
    const { data, error } = await client
      .from('price_history')
      .select('price, checked_at')
      .eq('tracked_item_id', item.id)
      .order('checked_at', { ascending: false })
      .limit(60);
    if (error) throw error;

    const points = (data || [])
      .map((row) => ({
        checked_at: row.checked_at,
        price: normalizePrice(row.price),
      }))
      .filter((point) => point.price !== null)
      .reverse();

    renderCardRecommendation(item, points, client, recommendationEl);

    if (!points.length) {
      if (emptyEl) {
        emptyEl.textContent = 'No price history yet.';
        emptyEl.hidden = false;
      }
      canvasEl.hidden = true;
      return;
    }

    if (emptyEl) emptyEl.hidden = true;
    canvasEl.hidden = false;

    const ctx = canvasEl.getContext('2d');
    if (!ctx || typeof Chart === 'undefined') {
      canvasEl.hidden = true;
      if (emptyEl) {
        emptyEl.textContent = 'Price chart is unavailable.';
        emptyEl.hidden = false;
      }
      return;
    }

    const chartHeight = canvasEl.offsetHeight || canvasEl.height || 110;
    const gradient = ctx.createLinearGradient(0, 0, 0, chartHeight);
    gradient.addColorStop(0, 'rgba(47, 109, 246, 0.24)');
    gradient.addColorStop(1, 'rgba(47, 109, 246, 0)');

    const currency = item.currency || DEFAULT_CURRENCY;
    const labels = points.map((point) => formatDate(point.checked_at));
    const values = points.map((point) => point.price);

    const existingChart = dashboardCharts.get(item.id);
    if (existingChart) existingChart.destroy();

    const chart = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Price',
            data: values,
            borderColor: '#2f6df6',
            backgroundColor: gradient,
            borderWidth: 2,
            fill: true,
            tension: 0.32,
            pointRadius: 3,
            pointHoverRadius: 5,
            pointBackgroundColor: '#fff',
            pointBorderColor: '#2f6df6',
            pointBorderWidth: 2,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          mode: 'nearest',
          intersect: true,
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            displayColors: false,
            callbacks: {
              title: (items) => {
                const index = items && items[0] ? items[0].dataIndex : 0;
                return formatTooltipDate(points[index] && points[index].checked_at);
              },
              label: (context) => `Price: ${formatPrice(Number(context.parsed.y), currency)}`,
            },
          },
        },
        scales: {
          x: {
            grid: { display: false },
            title: {
              display: true,
              text: 'Time',
              color: '#6b7d95',
              font: { size: 10, weight: '600' },
            },
            ticks: {
              autoSkip: true,
              maxTicksLimit: 2,
              maxRotation: 0,
              color: '#7a8aa0',
              font: { size: 10 },
              callback: (_value, index) => {
                if (points.length <= 1) return '';
                return index === 0 || index === points.length - 1 ? labels[index] : '';
              },
            },
          },
          y: {
            grid: { color: 'rgba(0, 0, 0, 0.06)' },
            title: {
              display: true,
              text: 'Price',
              color: '#6b7d95',
              font: { size: 10, weight: '600' },
            },
            ticks: {
              maxTicksLimit: 4,
              color: '#7a8aa0',
              font: { size: 10 },
              callback: (v) => formatPrice(Number(v), currency),
            },
          },
        },
      },
    });

    dashboardCharts.set(item.id, chart);
  } catch {
    setCardRecommendationUnavailable(recommendationEl);
    if (emptyEl) {
      emptyEl.textContent = 'Could not load price history.';
      emptyEl.hidden = false;
    }
    canvasEl.hidden = true;
  }
}

async function updateTargetPrice(item, inputEl, displayEl, messageEl, buttonEl) {
  if (!item || !item.id) return;

  const targetPrice = readOptionalTargetPrice(inputEl.value, (message) => {
    setTargetMessage(messageEl, message, 'error');
  });
  if (targetPrice === undefined) return;

  const auth = await getAuthenticatedContext((message) => {
    setTargetMessage(messageEl, message, 'error');
  });
  if (!auth) return;

  buttonEl.disabled = true;
  setTargetMessage(messageEl, 'Saving target...', '');

  try {
    const { error } = await auth.client
      .from('tracked_items')
      .update({ target_price: targetPrice })
      .eq('id', item.id)
      .eq('user_id', auth.user.id);
    if (error) throw error;

    item.target_price = targetPrice;
    if (inputEl) inputEl.value = targetPrice == null ? '' : targetPrice.toFixed(2);
    if (displayEl) displayEl.textContent = formatTargetPrice(targetPrice, item.currency || DEFAULT_CURRENCY);
    setTargetMessage(messageEl, targetPrice == null ? 'Target cleared.' : 'Target updated.', 'success');
  } catch (err) {
    setTargetMessage(messageEl, err.message || 'Could not update target price.', 'error');
  } finally {
    buttonEl.disabled = false;
  }
}

async function loadDashboard() {
  const auth = await getAuthenticatedContext();
  if (!auth) return;

  dashboardLoading.hidden = false;
  dashboardList.hidden = true;
  dashboardEmpty.hidden = true;
  dashboardChartContainer.hidden = true;
  clearRecommendation();

  try {
    const { data, error } = await auth.client
      .from('tracked_items')
      .select('id, title, url, current_price, target_price, currency, created_at, updated_at, last_checked_at')
      .eq('user_id', auth.user.id)
      .order('created_at', { ascending: false });
    if (error) throw error;
    renderDashboardItems(data || [], auth.client);
  } catch (err) {
    showAuthMessage(err.message || 'Could not load your tracked products.', 'error');
    renderDashboardItems([], auth.client);
  } finally {
    dashboardLoading.hidden = true;
  }
}

async function loadPriceHistory(trackedItemId, title) {
  const auth = await getAuthenticatedContext();
  if (!auth) return;

  dashboardChartContainer.hidden = false;
  const chartProductTitle = truncateText(title, 40);
  chartTitleEl.textContent = chartProductTitle ? `Price history for "${chartProductTitle}"` : 'Price history';

  try {
    const { data, error } = await auth.client
      .from('price_history')
      .select('price, checked_at')
      .eq('tracked_item_id', trackedItemId)
      .order('checked_at', { ascending: true });
    if (error) throw error;

    const points = (data || [])
      .map((row) => ({
        x: row.checked_at,
        y: normalizePrice(row.price),
      }))
      .filter((p) => p.y !== null);

    renderRecommendation(points);

    const labels = points.map((p) => formatDate(p.x));
    const values = points.map((p) => p.y);

    if (!chartCanvas) return;
    const ctx = chartCanvas.getContext('2d');
    if (!ctx) return;

    const chartHeight = chartCanvas.offsetHeight || chartCanvas.height || 150;
    const gradient = ctx.createLinearGradient(0, 0, 0, chartHeight);
    gradient.addColorStop(0, 'rgba(13, 110, 253, 0.35)');
    gradient.addColorStop(1, 'rgba(13, 110, 253, 0)');

    if (priceChart) {
      priceChart.data.labels = labels;
      priceChart.data.datasets[0].data = values;
      priceChart.data.datasets[0].backgroundColor = gradient;
      priceChart.update();
    } else {
      priceChart = new Chart(ctx, {
        type: 'line',
        data: {
          labels,
          datasets: [
            {
              label: 'Price',
              data: values,
              borderColor: '#0d6efd',
              backgroundColor: gradient,
              borderWidth: 2,
              fill: true,
              tension: 0.4,
              pointRadius: 4,
              pointHoverRadius: 6,
              pointBackgroundColor: '#fff',
              pointBorderColor: '#0d6efd',
              pointBorderWidth: 2,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: true,
          aspectRatio: 2,
          plugins: {
            legend: { display: false },
          },
          scales: {
            x: {
              grid: { color: 'rgba(0, 0, 0, 0.06)' },
              title: { display: true, text: 'Time' },
              ticks: {
                autoSkip: true,
                maxTicksLimit: 2,
                maxRotation: 0,
              },
            },
            y: {
              grid: { color: 'rgba(0, 0, 0, 0.06)' },
              title: { display: true, text: 'Price' },
              ticks: {
                callback: (v) => formatPrice(v),
              },
            },
          },
        },
      });
    }
  } catch {
    dashboardChartContainer.hidden = true;
    clearRecommendation();
  }
}

function hideAll() {
  resultEl.hidden = true;
  errorEl.hidden = true;
  loadingEl.hidden = true;
  saveSuccessEl.hidden = true;
  saveErrorEl.hidden = true;
}

function setExtractionConfidence(confidence) {
  const result = confidence || getExtractionConfidence('', null);
  extractionConfidenceEl.textContent = result.message;
  extractionConfidenceEl.classList.remove('supported', 'experimental', 'unsupported');
  extractionConfidenceEl.classList.add(result.level);
}

function showResult(title, price, url, confidence) {
  hideAll();
  currentProduct = { title: title || '', price: price || '', url: url || '', confidence: confidence || getExtractionConfidence(url, price) };
  resultTitle.textContent = title || '--';
  resultPrice.textContent = price || '--';
  setExtractionConfidence(currentProduct.confidence);
  targetPriceInput.value = '';
  resultEl.hidden = false;
}

function showError(message) {
  hideAll();
  currentProduct = null;
  targetPriceInput.value = '';
  errorText.textContent = message || 'Could not reliably detect price on this page.';
  errorEl.hidden = false;
}

function showLoading() {
  hideAll();
  loadingEl.hidden = false;
}

function showSaveSuccess() {
  saveSuccessEl.hidden = false;
  saveErrorEl.hidden = true;
}

function showSaveError(message) {
  saveErrorText.textContent = message || 'Could not save this product.';
  saveErrorEl.hidden = false;
  saveSuccessEl.hidden = true;
}

function isDuplicateTrackedItemError(err) {
  const message = String(err && err.message ? err.message : '').toLowerCase();
  return err && (
    err.code === '23505' ||
    message.includes('tracked_items_user_id_url_key') ||
    message.includes('duplicate key') ||
    message.includes('unique constraint')
  );
}

authSignInBtn.addEventListener('click', () => {
  const credentials = getAuthCredentials();
  if (!credentials) return;
  signIn(credentials.email, credentials.password);
});

authSignUpBtn.addEventListener('click', () => {
  const credentials = getAuthCredentials();
  if (!credentials) return;
  signUp(credentials.email, credentials.password);
});

authSignOutBtn.addEventListener('click', signOut);

authForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const credentials = getAuthCredentials();
  if (!credentials) return;
  signIn(credentials.email, credentials.password);
});

trackBtn.addEventListener('click', async () => {
  if (!isAuthenticated()) {
    showAuthMessage('Sign in to track products.', 'error');
    return;
  }

  showLoading();
  trackBtn.disabled = true;

  const onResult = (message) => {
    if (message.type !== 'EXTRACT_RESULT') return;
    clearTimeout(timeout);
    chrome.runtime.onMessage.removeListener(onResult);
    trackBtn.disabled = false;
    const confidence = getExtractionConfidence(message.url, message.price);
    if (confidence.level !== 'unsupported') {
      showResult(message.title, message.price, message.url, confidence);
    } else {
      showError(confidence.message);
    }
  };

  const timeout = setTimeout(() => {
    chrome.runtime.onMessage.removeListener(onResult);
    if (!loadingEl.hidden) {
      trackBtn.disabled = false;
      showError('Could not reliably detect price on this page.');
    }
  }, 4000);

  chrome.runtime.onMessage.addListener(onResult);

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) {
      clearTimeout(timeout);
      chrome.runtime.onMessage.removeListener(onResult);
      showError('Could not access the current tab.');
      trackBtn.disabled = false;
      return;
    }
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['content.js'],
    });
  } catch {
    clearTimeout(timeout);
    chrome.runtime.onMessage.removeListener(onResult);
    trackBtn.disabled = false;
    showError('Could not run price detection on this page.');
  }
});

saveBtn.addEventListener('click', async () => {
  const auth = await getAuthenticatedContext(showSaveError);
  if (!auth) return;

  if (!currentProduct || !currentProduct.url) {
    showSaveError('No product to save.');
    return;
  }

  if (!currentProduct.confidence || currentProduct.confidence.level === 'unsupported') {
    showSaveError('Price detection was not reliable enough to save this product.');
    return;
  }

  const numericPrice = normalizePrice(currentProduct.price);
  if (numericPrice == null) {
    showSaveError('We found a price, but could not save it as a valid number.');
    return;
  }

  const targetPrice = readOptionalTargetPrice(targetPriceInput.value, showSaveError);
  if (targetPrice === undefined) return;

  saveBtn.disabled = true;
  saveSuccessEl.hidden = true;
  saveErrorEl.hidden = true;

  try {
    const { data: existingItem, error: existingError } = await auth.client
      .from('tracked_items')
      .select('id')
      .eq('user_id', auth.user.id)
      .eq('url', currentProduct.url)
      .maybeSingle();
    if (existingError) throw existingError;

    if (existingItem) {
      showSaveError('This product is already being tracked.');
      return;
    }

    const { data, error } = await auth.client
      .from('tracked_items')
      .insert({
        user_id: auth.user.id,
        title: currentProduct.title,
        url: currentProduct.url,
        current_price: numericPrice,
        currency: DEFAULT_CURRENCY,
        last_checked_at: new Date().toISOString(),
        target_price: targetPrice,
      })
      .select('id')
      .single();
    if (error) throw error;

    const trackedId = data && data.id;
    if (trackedId) {
      const { error: historyError } = await auth.client.from('price_history').insert({
        tracked_item_id: trackedId,
        price: numericPrice,
      });
      if (historyError) throw historyError;
    }

    showSaveSuccess();
    loadDashboard();
  } catch (err) {
    if (isDuplicateTrackedItemError(err)) {
      showSaveError('This product is already being tracked.');
    } else {
      showSaveError(err.message || 'Could not save this product.');
    }
  } finally {
    saveBtn.disabled = false;
  }
});

viewTrackBtn.addEventListener('click', showTrackView);
viewDashboardBtn.addEventListener('click', showDashboardView);

deleteConfirmCancel.addEventListener('click', () => {
  deleteConfirmOverlay.hidden = true;
  pendingDeleteItem = null;
});

deleteConfirmOk.addEventListener('click', async () => {
  if (!pendingDeleteItem) return;

  const auth = await getAuthenticatedContext((message) => {
    deleteErrorText.textContent = message;
    deleteErrorText.hidden = false;
  });
  if (!auth) return;

  try {
    const { error } = await auth.client.from('tracked_items').delete().eq('id', pendingDeleteItem.id);
    if (error) throw error;
    deleteConfirmOverlay.hidden = true;
    pendingDeleteItem = null;
    loadDashboard();
  } catch (err) {
    const message = err && (err.message || err.error_description || String(err));
    deleteErrorText.textContent = message || 'Could not delete this product.';
    deleteErrorText.hidden = false;
  }
});

window.addEventListener('unload', () => {
  if (authSubscription) authSubscription.unsubscribe();
});

initAuth();
