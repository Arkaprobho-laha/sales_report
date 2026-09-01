(function () {
  'use strict';

  // =====================================================================
  // CONFIG
  // =====================================================================

  const API_BASE = '/api/v1/dashboard-bff';
  const LAST_UPLOAD_DATES_PATH = '/sales/last-upload-dates';
  const SALES_TOTALS_PATH = '/sales-details-totals';
  const RETURN_TOTALS_PATH = '/return-details-totals';

  const PLATFORMS = [
    { key: 'Amazon', label: 'Amazon' },
    { key: 'Flipkart', label: 'Flipkart' },
    { key: 'Meesho', label: 'Meesho' },
    { key: 'Zepto', label: 'Zepto' },
    { key: 'Blinkit', label: 'Blinkit' },
    { key: 'Amazon_DF', label: 'Amazon Direct' },
    { key: 'Daluci_Website', label: 'DALUCI Website' },
    { key: 'Amazon_Daluci', label: 'Amazon Daluci' },
    { key: 'Flipkart_Daluci', label: 'Flipkart Daluci' }
  ];

  // For these platforms All Brands sales === DALUCI Brands sales (single API call needed)
  const SALES_ALL_SAME_AS_DALUCI = ['Blinkit', 'Daluci_Website', 'Amazon_Daluci', 'Flipkart_Daluci'];

  // Excluded from Ads Spend table
  const ADS_EXCLUDED_KEYS = ['Amazon_DF', 'Daluci_Website', 'Amazon_Daluci', 'Flipkart_Daluci'];

  // For these platforms All Brands ads === DALUCI Brands ads
  const ADS_ALL_SAME_AS_DALUCI = ['Zepto', 'Blinkit'];

  // For these platforms DALUCI Brand ads is not available (show blank)
  const ADS_DALUCI_BLANK_KEYS = ['Meesho'];

  const BRAND_FILTER = 'Daluci';

  function readTotals(data, brandFiltered) {
    data = data || {};

    // Fallbacks for various possible key names that the backend might return
    const adsVal = brandFiltered
      ? numOrZero(data.totalAdsSpend ?? data.totalAdSpend ?? data.adSpend ?? data.adsSpend ?? 0)
      : numOrZero(data.totalAdsSpendAll ?? data.totalAdSpendAll ?? data.totalAdsSpend ?? data.totalAdSpend ?? data.adSpend ?? data.adsSpend ?? 0);

    return {
      order: numOrZero(data.unitsSold),
      gmv: numOrZero(data.totalSales),
      ads: adsVal,
      returnedUnits: numOrZero(data.returnedUnits),
      returnRate: numOrZero(data.returnRate)
    };
  }

  function numOrZero(v) {
    const n = Number(v);
    return isNaN(n) ? 0 : n;
  }

  // =====================================================================
  // STATE
  // =====================================================================

  const DEBUG_PAGE_SIZE = 20;

  const state = {
    token: '',
    debugLog: [],
    debugPage: 0,   // 0-based index of the currently displayed page
    viewMode: 'daily'
  };

  const els = {};

  document.addEventListener('DOMContentLoaded', function () {
    cacheEls();
    initializePickers();
    wireEvents();
    tryResumeSession();
  });

  // =====================================================================
  // CACHE ELEMENTS
  // =====================================================================

  function cacheEls() {
    // Auth section wrapper
    els.authSection = document.getElementById('authSection');
    // Disconnected form
    els.authForm = document.getElementById('authForm');
    els.tokenInput = document.getElementById('tokenInput');
    els.loginError = document.getElementById('loginError');
    els.connectBtn = document.getElementById('connectBtn');
    // Connected bar
    els.connBar = document.getElementById('connBar');
    els.cbToken = document.getElementById('cbToken');
    els.lastRefreshed = document.getElementById('lastRefreshed');
    els.refreshIndicator = document.getElementById('refreshIndicator');
    els.snapshotBtn = document.getElementById('snapshotBtn');
    els.emailBtn = document.getElementById('emailBtn');
    els.refreshBtn = document.getElementById('refreshBtn');
    els.dateFilter = document.getElementById('dateFilter');
    els.weekFilter = document.getElementById('weekFilter');
    els.monthFilter = document.getElementById('monthFilter');
    els.quarterFilter = document.getElementById('quarterFilter');
    els.viewModeGroup = document.getElementById('viewModeGroup');
    els.changeTokenBtn = document.getElementById('changeTokenBtn');
    els.debugBtn = document.getElementById('debugBtn');
    els.disconnectBtn = document.getElementById('disconnectBtn');
    // Change token modal
    els.changeTokenModal = document.getElementById('changeTokenModal');
    els.ctmBackdrop = document.getElementById('ctmBackdrop');
    els.newTokenInput = document.getElementById('newTokenInput');
    els.newTokenError = document.getElementById('newTokenError');
    els.applyTokenBtn = document.getElementById('applyTokenBtn');
    els.cancelChangeBtn = document.getElementById('cancelChangeBtn');
    // Email modal
    els.emailModal = document.getElementById('emailModal');
    els.emailBackdrop = document.getElementById('emailBackdrop');
    els.additionalEmailsInput = document.getElementById('additionalEmailsInput');
    els.sendEmailConfirmBtn = document.getElementById('sendEmailConfirmBtn');
    els.cancelEmailBtn = document.getElementById('cancelEmailBtn');
    // Dashboard content
    els.dashContent = document.getElementById('dashContent');
    els.authToast = document.getElementById('authToast');
    els.snapshotFlash = document.getElementById('snapshotFlash');
    els.loadState = document.getElementById('loadState');
    els.loadStateText = document.getElementById('loadStateText');
    els.errorBanner = document.getElementById('errorBanner');
    els.reportRoot = document.getElementById('reportRoot');
    els.reportTitleCell = document.getElementById('reportTitleCell');
    els.channelTableBody = document.getElementById('channelTableBody');
    els.runrateTableOuter = document.getElementById('runrateTableOuter');
    els.runrateTableBody = document.getElementById('runrateTableBody');
    els.adsTableBody = document.getElementById('adsTableBody');
    els.adsMainHeader = document.getElementById('adsMainHeader');
    els.adsBrandAll = document.getElementById('adsBrandAll');
    els.adsBrandDal = document.getElementById('adsBrandDal');
    els.adsTableCol1 = document.getElementById('adsTableCol1');
    els.adsTableCol2 = document.getElementById('adsTableCol2');
    els.adsTableCol3 = document.getElementById('adsTableCol3');
    els.adsTableCol4 = document.getElementById('adsTableCol4');
    els.uploadDatesTableBody = document.getElementById('uploadDatesTableBody');
    els.uploadDatesTableContainer = document.getElementById('uploadDatesTableContainer');
    els.returnTableOuter = document.getElementById('returnTableOuter');
    els.returnTableBody = document.getElementById('returnTableBody');
    els.generateBtn = document.getElementById('generateBtn');
    els.generatePrompt = document.getElementById('generatePrompt');
    els.snapshotArea = document.getElementById('snapshotArea');
    // Debug
    els.debugDrawer = document.getElementById('debugDrawer');
    els.debugLog = document.getElementById('debugLog');
    els.closeDebugBtn = document.getElementById('closeDebugBtn');
    els.debugPagination = document.getElementById('debugPagination');
    els.debugPrevBtn = document.getElementById('debugPrevBtn');
    els.debugNextBtn = document.getElementById('debugNextBtn');
    els.debugPageInfo = document.getElementById('debugPageInfo');
  }

  // =====================================================================
  // INITIALIZE PICKERS & WIRE EVENTS
  // =====================================================================

  const EPOCH_DATE = new Date(2026, 3, 1); // April 1, 2026

  function initializePickers() {
    const now = new Date();

    // Weeks
    els.weekFilter.innerHTML = '';
    let weekStart = new Date(EPOCH_DATE);
    let weekIndex = 1;
    let lastWeekValue = null;
    while (weekStart <= now) {
      let weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 6);

      const option = document.createElement('option');
      const val = weekStart.getTime();
      option.value = val;
      lastWeekValue = val;
      option.textContent = 'Week ' + weekIndex + ' (' + formatShortDate(weekStart) + ' - ' + formatShortDate(weekEnd) + ')';
      els.weekFilter.appendChild(option);

      weekStart.setDate(weekStart.getDate() + 7);
      weekIndex++;
    }
    if (lastWeekValue) els.weekFilter.value = lastWeekValue; // default to latest

    // Months
    els.monthFilter.innerHTML = '';
    let monthStart = new Date(EPOCH_DATE);
    let lastMonthValue = null;
    while (monthStart <= now) {
      const option = document.createElement('option');
      const val = monthStart.getFullYear() + '-' + pad2(monthStart.getMonth() + 1);
      option.value = val;
      lastMonthValue = val;
      option.textContent = monthStart.toLocaleString('default', { month: 'long', year: 'numeric' });
      els.monthFilter.appendChild(option);

      monthStart.setMonth(monthStart.getMonth() + 1);
    }
    if (lastMonthValue) els.monthFilter.value = lastMonthValue;

    // Quarters
    els.quarterFilter.innerHTML = '';
    let qStart = new Date(2026, 3, 1); // April 1, 2026
    let lastQuarterValue = null;
    while (qStart <= now) {
      let qMonth = qStart.getMonth();
      let qYear = qStart.getFullYear();
      let fyStartYear = qMonth < 3 ? qYear - 1 : qYear;
      let fyEndYear = (fyStartYear + 1).toString().slice(-2);

      let qNum;
      if (qMonth === 3) qNum = 1;
      else if (qMonth === 6) qNum = 2;
      else if (qMonth === 9) qNum = 3;
      else qNum = 4;

      const option = document.createElement('option');
      const val = qYear + '-' + pad2(qMonth + 1); // "2026-04"
      option.value = val;
      lastQuarterValue = val;

      let qEnd = new Date(qYear, qMonth + 3, 0);
      option.textContent = 'Q' + qNum + ' FY' + fyStartYear.toString().slice(-2) + '-' + fyEndYear + ' (' + formatShortDate(qStart) + ' - ' + formatShortDate(qEnd) + ')';
      els.quarterFilter.appendChild(option);

      qStart.setMonth(qStart.getMonth() + 3);
    }
    if (lastQuarterValue) els.quarterFilter.value = lastQuarterValue;
  }

  function formatShortDate(d) {
    return d.toLocaleString('default', { month: 'short', day: 'numeric' });
  }

  function updateFiltersVisibility() {
    els.dateFilter.hidden = state.viewMode !== 'daily';
    els.weekFilter.hidden = state.viewMode !== 'weekly';
    els.monthFilter.hidden = state.viewMode !== 'monthly';
    els.quarterFilter.hidden = state.viewMode !== 'quarterly';
  }

  function wireEvents() {
    els.connectBtn.addEventListener('click', onConnectClick);
    els.disconnectBtn.addEventListener('click', onDisconnect);
    els.refreshBtn.addEventListener('click', function () {
      els.generatePrompt.hidden = true;
      loadDashboard(false);
    });
    // Filters are now passive — no auto-fetch on change
    // (user must click Generate)

    els.generateBtn.addEventListener('click', function () {
      els.generatePrompt.hidden = true;
      // First load if report hasn't been shown yet, refresh otherwise
      loadDashboard(els.reportRoot.hidden);
    });

    els.viewModeGroup.querySelectorAll('[data-view]').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        els.viewModeGroup.querySelectorAll('[data-view]').forEach(function (b) { b.classList.remove('active'); });
        e.currentTarget.classList.add('active');
        state.viewMode = e.currentTarget.getAttribute('data-view');
        updateFiltersVisibility();
        // No auto-fetch — user clicks Generate
      });
    });

    els.changeTokenBtn.addEventListener('click', onChangeToken);
    els.applyTokenBtn.addEventListener('click', onApplyToken);
    els.cancelChangeBtn.addEventListener('click', onCancelChange);
    els.ctmBackdrop.addEventListener('click', onCancelChange);
    els.snapshotBtn.addEventListener('click', takeSnapshot);
    els.emailBtn.addEventListener('click', function () {
      els.additionalEmailsInput.value = '';
      els.emailModal.hidden = false;
    });
    els.cancelEmailBtn.addEventListener('click', function () { els.emailModal.hidden = true; });
    els.emailBackdrop.addEventListener('click', function () { els.emailModal.hidden = true; });
    els.sendEmailConfirmBtn.addEventListener('click', function () {
      var additionalEmails = els.additionalEmailsInput.value.trim();
      els.emailModal.hidden = true;
      emailSnapshot(additionalEmails);
    });
    els.debugBtn.addEventListener('click', function () { els.debugDrawer.hidden = false; renderDebugPage(); });
    els.closeDebugBtn.addEventListener('click', function () { els.debugDrawer.hidden = true; });
    els.debugPrevBtn.addEventListener('click', function () { goToDebugPage(state.debugPage - 1); });
    els.debugNextBtn.addEventListener('click', function () { goToDebugPage(state.debugPage + 1); });

    // Auto-refresh once a day if left open 24/7
    var lastCheckedDay = new Date().getDate();
    setInterval(function () {
      var currentDay = new Date().getDate();
      if (currentDay !== lastCheckedDay) {
        lastCheckedDay = currentDay;
        // Trigger a click on the refresh button if report is visible
        if (!els.refreshBtn.disabled && !els.reportRoot.hidden) {
          els.refreshBtn.click();
        }
      }
    }, 60 * 60 * 1000); // Check every hour
  }

  // =====================================================================
  // SESSION MANAGEMENT
  //
  // KEY FIX: We no longer pre-check JWT expiry locally. The token is
  // reused as long as it's stored. Only an actual 401/403 from the API
  // triggers handleAuthFailure() which clears the token and asks again.
  // =====================================================================

  // ── Global token store (server-side, shared across every device) ──────
  // Falls back silently to local-only behavior if the store is
  // unreachable or not configured — never blocks the UI.
  function fetchGlobalToken() {
    return fetch('/api/token')
      .then(function (r) { return r.json(); })
      .then(function (data) { return data.token || null; })
      .catch(function (err) {
        console.warn('Could not reach shared token store:', err);
        return null;
      });
  }

  function pushGlobalToken(token) {
    fetch('/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: token })
    }).catch(function (err) {
      console.warn('Could not save token to shared store:', err);
    });
  }

  function clearGlobalToken() {
    fetch('/api/token', { method: 'DELETE' }).catch(function (err) {
      console.warn('Could not clear shared token store:', err);
    });
  }

  function tryResumeSession() {
    fetchGlobalToken().then(function (globalToken) {
      if (globalToken) {
        // Use only the shared global token
        state.token = globalToken;
        enterConnectedState();
        // ⬇ No auto-load — user must click Generate
      }
      // else: nothing in global store — authForm is already visible
    });
  }

  function onConnectClick() {
    const raw = (els.tokenInput.value || '').trim();
    if (!raw) {
      showLoginError('Paste a token first.');
      return;
    }
    state.token = normalizeToken(raw);
    pushGlobalToken(state.token);   // save globally
    hideLoginError();
    enterConnectedState();
    // ⬇ No auto-load — user must click Generate
  }

  // Local-only disconnect: this device stops using the token and goes back
  // to the login form, but the shared global token is left untouched —
  // every other device stays connected. The global session only changes
  // when a NEW token is actually submitted (onConnectClick / onApplyToken)
  // or when the API rejects the token as truly expired (handleAuthFailure).
  function onDisconnect() {
    state.token = '';
    els.reportRoot.hidden = true;
    els.tokenInput.value = '';
    // Show the generate prompt again for next session
    els.generatePrompt.hidden = false;
    enterDisconnectedState();
  }

  function onChangeToken() {
    els.changeTokenModal.hidden = false;
    els.newTokenInput.value = '';
    els.newTokenError.hidden = true;
    setTimeout(function () { els.newTokenInput.focus(); }, 80);
  }

  function onCancelChange() {
    els.changeTokenModal.hidden = true;
  }

  function onApplyToken() {
    const raw = (els.newTokenInput.value || '').trim();
    if (!raw) {
      els.newTokenError.textContent = 'Paste a new token first.';
      els.newTokenError.hidden = false;
      return;
    }
    state.token = normalizeToken(raw);
    pushGlobalToken(state.token);   // update globally
    els.newTokenError.hidden = true;
    els.changeTokenModal.hidden = true;
    updateTokenPreview();
    // ⬇ No auto-load — user must click Generate
  }

  // Called when the API returns 401/403 — clears saved token and goes back
  // to the form so the user can paste a fresh one. This is a REAL expiry,
  // so it clears the shared store too — every device should re-auth.
  function handleAuthFailure(msg) {
    state.token = '';
    clearGlobalToken();        // real expiry — every device needs a new token
    enterDisconnectedState();
    showLoginError(msg || 'Session expired or token rejected. Please paste a new token.');
  }

  // ── UI state helpers ──────────────────────────────────────────────────

  function enterConnectedState() {
    els.authSection.classList.add('auth-section--bar');
    els.authSection.classList.remove('auth-section--open');
    els.authForm.hidden = true;
    els.connBar.hidden = false;
    els.changeTokenModal.hidden = true;
    els.dashContent.hidden = false;
    // Show the prompt if no report has been generated yet
    els.generatePrompt.hidden = !els.reportRoot.hidden;
    updateTokenPreview();
  }

  function enterDisconnectedState() {
    els.authSection.classList.remove('auth-section--bar');
    els.authSection.classList.add('auth-section--open');
    els.authForm.hidden = false;
    els.connBar.hidden = true;
    els.changeTokenModal.hidden = true;
    els.dashContent.hidden = true;
  }

  function updateTokenPreview() {
    const raw = state.token.replace(/^Bearer\s+/i, '').trim();
    els.cbToken.textContent = raw.length > 14
      ? raw.slice(0, 8) + '…' + raw.slice(-4)
      : raw;
  }

  function normalizeToken(raw) {
    return /^Bearer\s+/i.test(raw) ? raw.trim() : 'Bearer ' + raw.trim();
  }

  function showLoginError(msg) {
    els.loginError.textContent = msg;
    els.loginError.hidden = false;
  }
  function hideLoginError() {
    els.loginError.hidden = true;
  }

  // =====================================================================
  // AUTH TOAST
  // =====================================================================

  function showAuthToast() {
    els.authToast.classList.add('show');
    setTimeout(function () {
      els.authToast.classList.remove('show');
    }, 3000);
  }

  // =====================================================================
  // API
  // =====================================================================

  const inFlightRequests = new Map();

  function apiGet(path, params) {
    const qs = params
      ? '?' + Object.keys(params)
        .filter(function (k) { return params[k] !== undefined && params[k] !== null; })
        .map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]); })
        .join('&')
      : '';
    const url = API_BASE + path + qs;
    const startedAt = Date.now();

    if (inFlightRequests.has(url)) {
      // Deduplicate! Deep clone to prevent unintended reference sharing.
      return inFlightRequests.get(url).then(function (json) {
        if (json == null) return json;
        // Mark as cached in debug log if needed (for debug panel)
        const entry = { url: url, status: '(Cached)', latency: 0, body: json };
        state.debugLog.push(entry);
        renderDebugEntry(entry);
        return JSON.parse(JSON.stringify(json));
      });
    }

    const reqPromise = fetch(url, {
      method: 'GET',
      headers: { 'Accept': '*/*', 'Authorization': state.token }
    }).then(function (res) {
      return res.text().then(function (text) {
        let json = null;
        try { json = JSON.parse(text); } catch (e) { /* non-JSON */ }
        const entry = {
          url: url, status: res.status,
          latency: Date.now() - startedAt,
          body: json !== null ? json : text
        };
        state.debugLog.push(entry);
        renderDebugEntry(entry);

        if (res.status === 401 || res.status === 403) {
          throw new AuthError('Unauthorized (' + res.status + ').');
        }
        if (!res.ok) {
          throw new Error('Request failed (' + res.status + ') for ' + path);
        }
        return json;
      });
    }).finally(function () {
      inFlightRequests.delete(url);
    });

    inFlightRequests.set(url, reqPromise);

    return reqPromise.then(function (json) {
      if (json == null) return json;
      return JSON.parse(JSON.stringify(json));
    });
  }

  function AuthError(msg) {
    this.name = 'AuthError';
    this.message = msg;
  }
  AuthError.prototype = Object.create(Error.prototype);

  // New requests always jump the view to the LAST page (most recent
  // entries) so live traffic is visible while the drawer is open, unless
  // the user has manually paged backward to look at older calls — in that
  // case we leave them where they are and just update the page count.
  function renderDebugEntry(entry) {
    const wasOnLastPage = state.debugPage >= totalDebugPages() - 1;
    if (wasOnLastPage) {
      state.debugPage = totalDebugPages() - 1; // recompute after push, land on new last page
    }
    if (!els.debugDrawer.hidden) {
      renderDebugPage();
    }
  }

  function totalDebugPages() {
    return Math.max(1, Math.ceil(state.debugLog.length / DEBUG_PAGE_SIZE));
  }

  function goToDebugPage(page) {
    const total = totalDebugPages();
    state.debugPage = Math.min(Math.max(page, 0), total - 1);
    renderDebugPage();
  }

  function renderDebugPage() {
    const total = totalDebugPages();
    state.debugPage = Math.min(Math.max(state.debugPage, 0), total - 1);

    els.debugLog.innerHTML = '';

    if (state.debugLog.length === 0) {
      els.debugPagination.hidden = true;
      return;
    }

    const start = state.debugPage * DEBUG_PAGE_SIZE;
    const pageEntries = state.debugLog.slice(start, start + DEBUG_PAGE_SIZE);

    pageEntries.forEach(function (entry) {
      const div = document.createElement('div');
      div.className = 'debug-entry';
      const bodyStr = typeof entry.body === 'string'
        ? entry.body : JSON.stringify(entry.body, null, 2);
      div.innerHTML =
        '<div class="debug-entry-title' +
        (entry.status >= 400 ? ' debug-entry-error' : '') + '">' +
        escapeHtml(entry.status + '  ' + entry.url) +
        '  (' + entry.latency + 'ms)</div>' +
        '<pre>' + escapeHtml((bodyStr || '').slice(0, 4000)) + '</pre>';
      els.debugLog.appendChild(div);
    });

    els.debugPagination.hidden = total <= 1;
    els.debugPageInfo.textContent =
      'Page ' + (state.debugPage + 1) + ' of ' + total +
      ' (' + state.debugLog.length + ' calls)';
    els.debugPrevBtn.disabled = state.debugPage === 0;
    els.debugNextBtn.disabled = state.debugPage === total - 1;
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // =====================================================================
  // DATE HELPERS
  // =====================================================================

  function toISODate(d) {
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }
  function pad2(n) { return n < 10 ? '0' + n : '' + n; }
  function parseAPIDate(s) { return new Date(s); }
  function formatDMY(d) {
    return pad2(d.getDate()) + '-' + pad2(d.getMonth() + 1) + '-' + d.getFullYear();
  }
  function addDays(d, n) {
    const c = new Date(d); c.setDate(c.getDate() + n); return c;
  }
  function firstOfMonth(d) {
    return new Date(d.getFullYear(), d.getMonth(), 1);
  }

  // =====================================================================
  // LOAD + COMPUTE
  //
  // fromConnect = true  → first load after clicking Connect / auto-resume
  //                        Shows full-page spinner; toast fires immediately
  //                        after the first API call succeeds.
  // fromConnect = false → refresh button pressed while data already visible
  //                        Shows only the mini spinner in the bar; existing
  //                        data stays on screen.
  // =====================================================================

  function loadDashboard(fromConnect) {
    // Clear the ads search cache so that refresh fetches the actual latest data
    adsDateSearchCache = {};

    const isFirstLoad = els.reportRoot.hidden;
    hideErrorBanner();
    state.debugLog = [];
    state.debugPage = 0;
    if (!els.debugDrawer.hidden) renderDebugPage(); else els.debugLog.innerHTML = '';
    els.refreshBtn.disabled = true;

    if (isFirstLoad) {
      els.loadState.hidden = false;
      els.loadStateText.textContent = 'Connecting to Database…';
    } else {
      // Refresh: keep existing data, show skeleton shimmer + mini spinner
      els.refreshIndicator.hidden = false;
      showTableSkeletons();
    }

    apiGet(LAST_UPLOAD_DATES_PATH)
      .then(function (uploadResp) {
        // ✅ First API call succeeded → auth confirmed → show toast NOW
        if (fromConnect) showAuthToast();

        const uploadMap = {};
        const originalUploadMap = {};
        const meeshoAdsUploadDate = {};
        (uploadResp && uploadResp.data ? uploadResp.data : []).forEach(function (row) {
          const d = parseAPIDate(row.lastUploadDate);
          uploadMap[row.platform] = d;
          originalUploadMap[row.platform] = d;

          // Read the actual ads upload date natively provided by the API
          if (row.ads && row.ads.actualLastUpload) {
            meeshoAdsUploadDate[row.platform] = parseAPIDate(row.ads.actualLastUpload);
          } else if (row.adsUploadDate) { // Fallback just in case the API uses a flat field
            meeshoAdsUploadDate[row.platform] = parseAPIDate(row.adsUploadDate);
          }
        });
        originalUploadMap['Daluci_Website'] = addDays(new Date(), -1);

        let dashboardDate = new Date();
        let headerDate = addDays(dashboardDate, -1);
        let isDateFiltered = false;

        let fetchStartDate = null;
        let fetchEndDate = null;

        let reportTitle = '';

        if (state.viewMode === 'daily') {
          if (els.dateFilter && els.dateFilter.value) {
            const parts = els.dateFilter.value.split('-');
            headerDate = new Date(parts[0], parts[1] - 1, parts[2]);
            dashboardDate = headerDate; // So that firstOfMonth(dashboardDate) is correct
            isDateFiltered = true;
          }
          fetchStartDate = headerDate;
          fetchEndDate = headerDate;
          reportTitle = 'DALUCI  |  SALES AND ADS REPORT (' + formatDMY(headerDate) + ')';
          els.adsTableCol1.textContent = 'Yesterday Ads (₹)';
          els.adsTableCol3.textContent = 'Yesterday Ads (₹)';
        } else if (state.viewMode === 'weekly') {
          const selectedMs = parseInt(els.weekFilter.value, 10);
          const wStart = new Date(selectedMs);
          const wEnd = new Date(wStart);
          wEnd.setDate(wEnd.getDate() + 6);

          fetchStartDate = wStart;
          fetchEndDate = wEnd;
          headerDate = wEnd;
          dashboardDate = wEnd;

          const msDiff = selectedMs - EPOCH_DATE.getTime();
          const weekNum = Math.floor(msDiff / (7 * 24 * 60 * 60 * 1000)) + 1;
          reportTitle = 'DALUCI  |  SALES AND ADS REPORT (Week - ' + weekNum + ' (' + formatDMY(wStart) + ' to ' + formatDMY(wEnd) + '))';
          els.adsTableCol1.textContent = 'Weekly Ads (₹)';
          els.adsTableCol3.textContent = 'Weekly Ads (₹)';
        } else if (state.viewMode === 'monthly') {
          const parts = els.monthFilter.value.split('-');
          const mYear = parseInt(parts[0], 10);
          const mMonth = parseInt(parts[1], 10) - 1;
          const mStart = new Date(mYear, mMonth, 1);
          const mEnd = new Date(mYear, mMonth + 1, 0);

          fetchStartDate = mStart;
          fetchEndDate = mEnd;
          headerDate = mEnd;
          dashboardDate = mEnd;

          reportTitle = 'DALUCI  |  SALES AND ADS REPORT (Month - ' + mStart.toLocaleString('default', { month: 'long', year: 'numeric' }) + ')';
          els.adsTableCol1.textContent = 'Monthly Ads (₹)';
          els.adsTableCol3.textContent = 'Monthly Ads (₹)';
        } else if (state.viewMode === 'quarterly') {
          const parts = els.quarterFilter.value.split('-');
          const qYear = parseInt(parts[0], 10);
          const qMonth = parseInt(parts[1], 10) - 1; // 2, 5, 8, 11 (Actually 3, 6, 9, 0 from val, so 2, 5, 8, -1? No, val is 04, 07, 10, 01 so qMonth is 3, 6, 9, 0)
          const qStart = new Date(qYear, qMonth, 1);
          const qEnd = new Date(qYear, qMonth + 3, 0);

          let fyStartYear = qMonth < 3 ? qYear - 1 : qYear;
          let fyEndYear = (fyStartYear + 1).toString().slice(-2);
          let qNum;
          if (qMonth === 3) qNum = 1;
          else if (qMonth === 6) qNum = 2;
          else if (qMonth === 9) qNum = 3;
          else qNum = 4;

          fetchStartDate = qStart;
          fetchEndDate = qEnd;
          headerDate = qEnd;
          dashboardDate = qEnd;

          reportTitle = 'DALUCI  |  SALES AND ADS REPORT (Quarter - Q' + qNum + ' FY' + fyStartYear.toString().slice(-2) + '-' + fyEndYear + ')';
          els.adsTableCol1.textContent = 'Quarterly Ads (₹)';
          els.adsTableCol3.textContent = 'Quarterly Ads (₹)';
        }

        els.reportTitleCell.textContent = reportTitle;

        if (isDateFiltered || state.viewMode !== 'daily') {
          PLATFORMS.forEach(function (p) {
            const actualLastUpload = uploadMap[p.key];
            if (state.viewMode === 'daily') {
              if (actualLastUpload && fetchEndDate > actualLastUpload) {
                uploadMap[p.key] = actualLastUpload;
              } else {
                uploadMap[p.key] = headerDate;
              }
            } else {
              uploadMap[p.key] = fetchEndDate;
            }
          });
        } else {
          // Daluci Website data is real-time; force it to use the dashboard header date
          uploadMap['Daluci_Website'] = headerDate;
        }

        els.runrateTableOuter.hidden = (state.viewMode === 'quarterly');
        // Return under Sales table: only show in monthly and quarterly views
        els.returnTableOuter.hidden = (state.viewMode !== 'monthly' && state.viewMode !== 'quarterly');

        const hideMonthAds = (state.viewMode === 'monthly' || state.viewMode === 'quarterly');
        els.adsTableCol2.hidden = hideMonthAds;
        els.adsTableCol4.hidden = hideMonthAds;
        els.adsBrandAll.colSpan = hideMonthAds ? 1 : 2;
        els.adsBrandDal.colSpan = hideMonthAds ? 1 : 2;
        els.adsMainHeader.colSpan = hideMonthAds ? 3 : 5;

        // ── LAZY LOAD: show shell + Table 4 + skeletons for Tables 1–3 NOW ──
        // (Title is already set correctly above)

        // Table 4 renders immediately (upload dates are already in hand)
        // Table 4 always shows the ALL-TIME latest dates, ignoring the date filter.
        renderUploadDatesTable({ uploadMap: originalUploadMap, dashboardDate: dashboardDate, meeshoAdsUploadDate: meeshoAdsUploadDate });

        // Tables 1–3 show shimmer skeletons until platform data arrives
        showTableSkeletons();

        if (isFirstLoad) {
          els.loadState.hidden = true;
          els.reportRoot.hidden = false;
        }

        // Fetch return data only for monthly and quarterly views
        var returnDataPromise = Promise.resolve(null);
        if (state.viewMode === 'monthly' || state.viewMode === 'quarterly') {
          var rStart = toISODate(fetchStartDate);
          var rEnd = toISODate(fetchEndDate);
          // Amazon = Amazon + Amazon_Flex summed
          returnDataPromise = Promise.all([
            fetchChunkedReturns(rStart, rEnd, 'Amazon'),
            fetchChunkedReturns(rStart, rEnd, 'Amazon_Flex'),
            fetchChunkedReturns(rStart, rEnd, 'Flipkart'),
            fetchChunkedReturns(rStart, rEnd, 'Meesho'),
            fetchChunkedReturns(rStart, rEnd, 'Amazon', 'Daluci'),
            fetchChunkedReturns(rStart, rEnd, 'Amazon_Flex', 'Daluci'),
            fetchChunkedReturns(rStart, rEnd, 'Flipkart', 'Daluci'),
            fetchChunkedReturns(rStart, rEnd, 'Meesho', 'Daluci')
          ]).then(function (res) {
            return {
              all: res.slice(0, 4),
              daluci: res.slice(4, 8)
            };
          });
        }

        var runrateOverallPromise = Promise.resolve(null);
        var runrateDaluciPromise = Promise.resolve(null);
        if (state.viewMode !== 'quarterly') {
          runrateOverallPromise = apiGet('/category-runrate', { month: fetchEndDate.getMonth() + 1, year: fetchEndDate.getFullYear() }).catch(function (err) {
            console.warn('Failed to fetch overall category-runrate:', err);
            return null;
          });
          runrateDaluciPromise = apiGet('/category-runrate', { month: fetchEndDate.getMonth() + 1, year: fetchEndDate.getFullYear(), brand: 'Daluci' }).catch(function (err) {
            console.warn('Failed to fetch Daluci category-runrate:', err);
            return null;
          });
        }

        return Promise.all([
          fetchAllPlatformData(uploadMap, fetchStartDate, fetchEndDate, state.viewMode, originalUploadMap, meeshoAdsUploadDate),
          runrateOverallPromise,
          runrateDaluciPromise,
          returnDataPromise
        ]).then(function (results) {
          return {
            uploadMap: uploadMap,
            originalUploadMap: originalUploadMap,
            meeshoAdsUploadDate: meeshoAdsUploadDate,
            dashboardDate: dashboardDate,
            perPlatform: results[0],
            categoryRunrateOverall: results[1],
            categoryRunrateDaluci: results[2],
            returnData: results[3]  // [amazonResp, amazonFlexResp, flipkartResp, meeshoResp] or null
          };
        });
      })
      .then(function (ctx) {
        // All platform data ready → replace skeletons with real rows
        renderChannelTable(ctx);
        renderRunrateTable(ctx);
        renderAdsTable(ctx);
        renderReturnTable(ctx);
        renderUploadDatesTable(ctx);

        els.loadState.hidden = true;
        els.refreshIndicator.hidden = true;
        els.refreshBtn.disabled = false;
        els.reportRoot.hidden = false;
        els.lastRefreshed.textContent = 'Last refreshed ' + new Date().toLocaleTimeString();

        if (fromConnect && isFirstLoad) {
          setTimeout(function () {
            els.reportRoot.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }, 300);
        }
      })
      .catch(function (err) {
        els.loadState.hidden = true;
        els.refreshIndicator.hidden = true;
        els.refreshBtn.disabled = false;
        if (err.name === 'AuthError') {
          handleAuthFailure('Session expired or token rejected. Please paste a new token.');
        } else {
          showErrorBanner('Could not load the dashboard: ' + err.message);
        }
      });
  }

  // =====================================================================
  // FETCH ALL PLATFORM DATA
  // =====================================================================

  // Global queue to synchronize chunked API calls so they don't hit the server simultaneously
  var chunkedApiQueue = Promise.resolve();

  function queuedApiGet(path, params) {
    var p = chunkedApiQueue.then(function () {
      return apiGet(path, params);
    });
    chunkedApiQueue = p.catch(function () { });
    return p;
  }

  function fetchChunkedSales(startDateStr, endDateStr, platform, brand) {
    // Only use 15-day chunking for the Amazon platform; for others, fetch directly
    if (platform !== 'Amazon') {
      var query = { startDate: startDateStr, endDate: endDateStr, platform: platform };
      if (brand) query.brand = brand;
      return apiGet(SALES_TOTALS_PATH, query).then(function (r) { return readTotals(r && r.data, !!brand); });
    }

    var partsStart = startDateStr.split('-');
    var currentStartLocal = new Date(partsStart[0], partsStart[1] - 1, partsStart[2]);
    var partsEnd = endDateStr.split('-');
    var endLocal = new Date(partsEnd[0], partsEnd[1] - 1, partsEnd[2]);

    var queries = [];
    while (currentStartLocal <= endLocal) {
      var y = currentStartLocal.getFullYear();
      var m = currentStartLocal.getMonth();
      var d = currentStartLocal.getDate();

      var chunkEndLocal;
      // 15-day chunks: 1st to 15th, and 16th to end of month
      if (d <= 15) {
        chunkEndLocal = new Date(y, m, 15);
      } else {
        chunkEndLocal = new Date(y, m + 1, 0);
      }

      if (chunkEndLocal > endLocal) {
        chunkEndLocal = endLocal;
      }

      var q = { startDate: toISODate(currentStartLocal), endDate: toISODate(chunkEndLocal), platform: platform };
      if (brand) q.brand = brand;
      queries.push(q);

      currentStartLocal = new Date(chunkEndLocal.getFullYear(), chunkEndLocal.getMonth(), chunkEndLocal.getDate() + 1);
    }

    var promises = queries.map(function (q) {
      return queuedApiGet(SALES_TOTALS_PATH, q).then(function (r) { return readTotals(r && r.data, !!brand); });
    });

    return Promise.all(promises).then(function (results) {
      var acc = zeroTotals();
      for (var i = 0; i < results.length; i++) {
        acc.order += results[i].order;
        acc.gmv += results[i].gmv;
        acc.ads += results[i].ads;
        acc.returnedUnits += results[i].returnedUnits;
      }
      return acc;
    });
  }

  function fetchChunkedReturns(startDateStr, endDateStr, platform, brand) {
    // As per request, Returns no longer need chunking for any platform
    var params = { startDate: startDateStr, endDate: endDateStr, platform: platform };
    if (brand) params.brand = brand;
    return apiGet(RETURN_TOTALS_PATH, params).catch(function () { return null; });
  }

  function fetchAllPlatformData(uploadMap, fetchStartDate, fetchEndDate, viewMode, originalUploadMap, meeshoAdsUploadDate) {
    const monthStart = toISODate(firstOfMonth(fetchEndDate));
    const pStart = toISODate(fetchStartDate);

    const calls = PLATFORMS.map(function (p) {
      const lastUpload = uploadMap[p.key];
      const pEndDate = lastUpload ? toISODate(lastUpload) : null;
      const pActualStart = (viewMode === 'daily') ? pEndDate : pStart;

      if (!pEndDate) {
        return Promise.resolve({
          platform: p,
          lastUpload: null,
          adsDate: null,
          yesterday: { all: zeroTotals(), daluci: zeroTotals() },
          monthToDate: { all: zeroTotals(), daluci: zeroTotals() },
          previous: { all: zeroTotals(), daluci: zeroTotals() },
          daysElapsed: 0
        });
      }

      // --- Calculate Previous Period Boundaries ---
      let prStart = null, prEnd = null;
      const actualLastUpload = originalUploadMap[p.key] || new Date();

      if (viewMode === 'daily') {
        let currentDay = new Date(pActualStart);
        let prevDay = addDays(currentDay, -1);
        prStart = toISODate(prevDay);
        prEnd = toISODate(prevDay);
      } else if (viewMode === 'weekly') {
        let currentStart = new Date(pStart);
        let currentEnd = new Date(pEndDate);
        prStart = toISODate(addDays(currentStart, -7));
        if (actualLastUpload < currentEnd && actualLastUpload >= currentStart) {
          let daysElapsed = Math.floor((actualLastUpload - currentStart) / (1000 * 60 * 60 * 24));
          prEnd = toISODate(addDays(new Date(prStart), daysElapsed));
        } else {
          prEnd = toISODate(addDays(currentEnd, -7));
        }
      } else if (viewMode === 'monthly') {
        let currentStart = new Date(pStart);
        let currentEnd = new Date(pEndDate);
        let pmYear = currentStart.getFullYear();
        let pmMonth = currentStart.getMonth() - 1;
        prStart = toISODate(new Date(pmYear, pmMonth, 1));

        if (actualLastUpload < currentEnd && actualLastUpload >= currentStart) {
          let elapsedDay = actualLastUpload.getDate();
          let prevMonthMaxDays = new Date(pmYear, pmMonth + 1, 0).getDate();
          let endDay = Math.min(elapsedDay, prevMonthMaxDays);
          prEnd = toISODate(new Date(pmYear, pmMonth, endDay));
        } else {
          prEnd = toISODate(new Date(pmYear, pmMonth + 1, 0));
        }
      } else if (viewMode === 'quarterly') {
        let currentStart = new Date(pStart);
        let currentEnd = new Date(pEndDate);
        let pqYear = currentStart.getFullYear();
        let pqMonth = currentStart.getMonth() - 3;
        prStart = toISODate(new Date(pqYear, pqMonth, 1));

        if (actualLastUpload < currentEnd && actualLastUpload >= currentStart) {
          let endQDate = new Date(pqYear, pqMonth + actualLastUpload.getMonth() - currentStart.getMonth(), actualLastUpload.getDate());
          prEnd = toISODate(endQDate);
        } else {
          prEnd = toISODate(new Date(pqYear, pqMonth + 3, 0));
        }
      }

      let pSales;
      if (viewMode === 'monthly' || viewMode === 'quarterly') {
        let pActualAll = fetchChunkedSales(pActualStart, pEndDate, p.key);
        let pActualDal = SALES_ALL_SAME_AS_DALUCI.indexOf(p.key) !== -1 ? pActualAll : fetchChunkedSales(pActualStart, pEndDate, p.key, BRAND_FILTER);
        let pPrevAll = fetchChunkedSales(prStart, prEnd, p.key);
        let pPrevDal = SALES_ALL_SAME_AS_DALUCI.indexOf(p.key) !== -1 ? pPrevAll : fetchChunkedSales(prStart, prEnd, p.key, BRAND_FILTER);

        pSales = Promise.all([pActualAll, pActualDal, pPrevAll, pPrevDal]).then(function (res) {
          return { yAll: res[0], yDal: res[1], mAll: res[0], mDal: res[1], pAll: res[2], pDal: res[3] };
        });
      } else {
        let pActualAll = fetchChunkedSales(pActualStart, pEndDate, p.key);
        let pActualDal = SALES_ALL_SAME_AS_DALUCI.indexOf(p.key) !== -1 ? pActualAll : fetchChunkedSales(pActualStart, pEndDate, p.key, BRAND_FILTER);
        let pMonthAll = fetchChunkedSales(monthStart, pEndDate, p.key);
        let pMonthDal = SALES_ALL_SAME_AS_DALUCI.indexOf(p.key) !== -1 ? pMonthAll : fetchChunkedSales(monthStart, pEndDate, p.key, BRAND_FILTER);
        let pPrevAll = fetchChunkedSales(prStart, prEnd, p.key);
        let pPrevDal = SALES_ALL_SAME_AS_DALUCI.indexOf(p.key) !== -1 ? pPrevAll : fetchChunkedSales(prStart, prEnd, p.key, BRAND_FILTER);

        pSales = Promise.all([pActualAll, pActualDal, pMonthAll, pMonthDal, pPrevAll, pPrevDal]).then(function (res) {
          return { yAll: res[0], yDal: res[1], mAll: res[2], mDal: res[3], pAll: res[4], pDal: res[5] };
        });
      }

      function searchAdsSingle(dateObj, attempts, isDaluci) {
        if (attempts <= 0) return Promise.resolve({ date: null, yAds: 0, mAds: 0 });
        const dStr = toISODate(dateObj);
        return apiGet(SALES_TOTALS_PATH, { startDate: dStr, endDate: dStr, platform: p.key, brand: isDaluci ? BRAND_FILTER : undefined })
          .then(function (r) {
            const totals = readTotals(r && r.data, isDaluci);

            if (totals.ads > 0) {
              const adsMonthStart = toISODate(firstOfMonth(dateObj));
              return apiGet(SALES_TOTALS_PATH, { startDate: adsMonthStart, endDate: dStr, platform: p.key, brand: isDaluci ? BRAND_FILTER : undefined })
                .then(function (mr) {
                  const mTotals = readTotals(mr && mr.data, isDaluci);
                  return { date: dateObj, yAds: totals.ads, mAds: mTotals.ads };
                });
            }
            return searchAdsSingle(addDays(dateObj, -1), attempts - 1, isDaluci);
          });
      }

      let realAdsDatePromise;
      if (ADS_EXCLUDED_KEYS.indexOf(p.key) !== -1 || (meeshoAdsUploadDate && meeshoAdsUploadDate[p.key])) {
        // We already have the date natively, or ads are excluded — no need to search
        realAdsDatePromise = Promise.resolve(null);
      } else if (viewMode !== 'daily') {
        // Do not spam daily API calls just to find the ads upload date for non-daily reports
        realAdsDatePromise = Promise.resolve(null);
      } else {
        let searchStartDate = originalUploadMap[p.key] || new Date();
        realAdsDatePromise = searchAdsSingle(searchStartDate, 7, false).then(function (r) { return r.date; });
      }

      let pAds;
      if (ADS_EXCLUDED_KEYS.indexOf(p.key) !== -1) {
        pAds = Promise.resolve({ date: null, yAllAds: 0, yDalAds: 0, mAllAds: 0, mDalAds: 0 });
      } else {
        if (viewMode === 'daily') {
          pAds = Promise.all([
            searchAdsSingle(lastUpload, 5, false),
            searchAdsSingle(lastUpload, 5, true)
          ]).then(function (ab) {
            const all = ab[0];
            const dal = ab[1];
            let finalDate = all.date || dal.date || null;
            if (all.date && dal.date && all.date > dal.date) finalDate = all.date;
            if (all.date && dal.date && dal.date > all.date) finalDate = dal.date;

            let yAllAdsToDisplay = all.yAds;
            let yDalAdsToDisplay = dal.yAds;
            let mAllAdsToDisplay = all.mAds;
            let mDalAdsToDisplay = dal.mAds;

            if (all.date && finalDate && all.date.getTime() !== finalDate.getTime()) {
              yAllAdsToDisplay = 0;
              mAllAdsToDisplay = 0;
            }
            if (dal.date && finalDate && dal.date.getTime() !== finalDate.getTime()) {
              yDalAdsToDisplay = 0;
              mDalAdsToDisplay = 0;
            }

            return {
              date: finalDate,
              yAllAds: yAllAdsToDisplay,
              yDalAds: yDalAdsToDisplay,
              mAllAds: mAllAdsToDisplay,
              mDalAds: mDalAdsToDisplay
            };
          });
        } else {
          pAds = pSales.then(function (salesRes) {
            return {
              date: null,
              yAllAds: salesRes.yAll.ads,
              yDalAds: salesRes.yDal.ads,
              mAllAds: salesRes.mAll.ads,
              mDalAds: salesRes.mDal.ads
            };
          });
        }
      }

      return Promise.all([pSales, pAds, realAdsDatePromise]).then(function (res) {
        const sales = res[0];
        const ads = res[1];
        let realAdsDate = res[2];


        // Use the native ads date if available (more accurate than heuristic search)
        var effectiveAdsDateRaw = viewMode === 'daily' ? ads.date : realAdsDate;
        if (meeshoAdsUploadDate && meeshoAdsUploadDate[p.key]) {
          effectiveAdsDateRaw = meeshoAdsUploadDate[p.key];
        }

        return {
          platform: p,
          lastUpload: lastUpload,
          adsDate: viewMode === 'daily' ? (ads.date || lastUpload) : (effectiveAdsDateRaw || lastUpload),
          adsDateRaw: effectiveAdsDateRaw,
          yesterday: {
            all: { order: sales.yAll.order, gmv: sales.yAll.gmv, ads: ads.yAllAds, returnedUnits: sales.yAll.returnedUnits, returnRate: sales.yAll.returnRate },
            daluci: { order: sales.yDal.order, gmv: sales.yDal.gmv, ads: ads.yDalAds, returnedUnits: sales.yDal.returnedUnits, returnRate: sales.yDal.returnRate }
          },
          monthToDate: {
            all: { order: sales.mAll.order, gmv: sales.mAll.gmv, ads: ads.mAllAds, returnedUnits: sales.mAll.returnedUnits, returnRate: sales.mAll.returnRate },
            daluci: { order: sales.mDal.order, gmv: sales.mDal.gmv, ads: ads.mDalAds, returnedUnits: sales.mDal.returnedUnits, returnRate: sales.mDal.returnRate }
          },
          previous: {
            all: { order: sales.pAll.order, gmv: sales.pAll.gmv, ads: 0, returnedUnits: 0, returnRate: 0 },
            daluci: { order: sales.pDal.order, gmv: sales.pDal.gmv, ads: 0, returnedUnits: 0, returnRate: 0 }
          },
          daysElapsed: lastUpload.getDate()
        };
      });
    });

    return Promise.all(calls);
  }

  function zeroTotals() { return { order: 0, gmv: 0, ads: 0, returnedUnits: 0, returnRate: 0 }; }

  // =====================================================================
  // EDITABLE CELL HELPER
  // =====================================================================

  // Cell override storage key: unique per tbody + row + col
  function cellKey(tbodyId, rowIdx, colIdx) {
    return 'daluci_edit_' + tbodyId + '_r' + rowIdx + '_c' + colIdx;
  }

  function makeEditable(td, storageKey) {
    td.title = 'Double-click to edit';

    // ── Restore saved override ───────────────────────────────
    if (storageKey) {
      var saved = localStorage.getItem(storageKey);
      if (saved !== null) td.textContent = saved;
    }

    // ── Attach handler once ──────────────────────────────────
    td.addEventListener('dblclick', function handleEdit() {
      if (td.querySelector('input')) return;       // already editing
      var original = td.textContent;

      var input = document.createElement('input');
      input.type = 'text';
      input.value = original;
      input.className = 'inline-edit-input';
      td.textContent = '';
      td.appendChild(input);
      input.focus();
      input.select();

      var committed = false;

      function commit() {
        if (committed) return;
        committed = true;
        var val = input.value.trim();
        var finalVal = val !== '' ? val : original;
        td.textContent = finalVal;
        // ── Persist to localStorage so everyone sees it ──────
        if (storageKey) {
          localStorage.setItem(storageKey, finalVal);
        }
      }

      function cancel() {
        if (committed) return;
        committed = true;
        td.textContent = original;   // revert, don't save
      }

      input.addEventListener('blur', commit);
      input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { input.blur(); }
        if (e.key === 'Escape') { input.removeEventListener('blur', commit); cancel(); }
      });
    });
  }

  function setEditableRows(tbody, html) {
    tbody.innerHTML = html;
    tbody.querySelectorAll('td').forEach(function (td) {
      var row = td.closest('tr');
      if (row.classList.contains('total-row') || row.classList.contains('share-row')) return;

      // Build a stable storage key from position in this tbody
      var rowIdx = Array.from(tbody.rows).indexOf(row);
      var colIdx = Array.from(row.cells).indexOf(td);
      var key = cellKey(tbody.id, rowIdx, colIdx);

      makeEditable(td, key);
    });
  }


  // =====================================================================
  // RENDER
  // =====================================================================

  function renderReport(ctx) {
    // Header date = one day PRIOR to the dashboard date
    const headerDate = addDays(ctx.dashboardDate, -1);
    els.reportTitleCell.textContent =
      'DALUCI  |  SALES AND ADS REPORT (' + formatDMY(headerDate) + ')';

    renderChannelTable(ctx);
    renderRunrateTable(ctx);
    renderAdsTable(ctx);
    renderReturnTable(ctx);
    renderUploadDatesTable(ctx);
  }

  // =====================================================================
  // RENDER RETURN UNDER SALES TABLE  (monthly view only)
  // =====================================================================

  function readReturnData(resp) {
    var d = (resp && resp.data) ? resp.data : {};
    return {
      totalReturns: numOrZero(d.totalReturns),
      totalQuantity: numOrZero(d.totalQuantity),
      returnQuantity: numOrZero(d.returnQuantity),
      rtoQuantity: numOrZero(d.rtoQuantity)
    };
  }

  function addReturnData(a, b) {
    return {
      totalReturns: a.totalReturns + b.totalReturns,
      totalQuantity: a.totalQuantity + b.totalQuantity,
      returnQuantity: a.returnQuantity + b.returnQuantity,
      rtoQuantity: a.rtoQuantity + b.rtoQuantity
    };
  }

  function zeroReturn() {
    return { totalReturns: 0, totalQuantity: 0, returnQuantity: 0, rtoQuantity: 0 };
  }

  function renderReturnTable(ctx) {
    // Only render in monthly and quarterly mode
    if ((state.viewMode !== 'monthly' && state.viewMode !== 'quarterly') || !ctx.returnData) {
      return;
    }

    // Helper: get monthly ALL BRANDS orders for a platform key from perPlatform
    function getSalesOrders(key, isDaluci) {
      if (key === 'Amazon') {
        var amz = ctx.perPlatform.find(function (x) { return x.platform.key === 'Amazon'; });
        var flex = ctx.perPlatform.find(function (x) { return x.platform.key === 'Amazon_Flex'; });
        var s1 = amz ? (isDaluci ? amz.monthToDate.daluci.order : amz.monthToDate.all.order) : 0;
        var s2 = flex ? (isDaluci ? flex.monthToDate.daluci.order : flex.monthToDate.all.order) : 0;
        return s1 + s2;
      }
      var pData = ctx.perPlatform.find(function (x) { return x.platform.key === key; });
      if (pData) {
        return isDaluci ? pData.monthToDate.daluci.order : pData.monthToDate.all.order;
      }
      return 0;
    }

    // returnData = { all: [...], daluci: [...] }
    var rdAll = ctx.returnData.all;
    var rdDal = ctx.returnData.daluci;

    var amazonAll = addReturnData(readReturnData(rdAll[0]), readReturnData(rdAll[1])); // Amazon + Amazon_Flex
    var flipkartAll = readReturnData(rdAll[2]);
    var meeshoAll = readReturnData(rdAll[3]);

    var amazonDal = addReturnData(readReturnData(rdDal[0]), readReturnData(rdDal[1]));
    var flipkartDal = readReturnData(rdDal[2]);
    var meeshoDal = readReturnData(rdDal[3]);

    // Sales orders per channel (denominator for Return %)
    var amazonSales = getSalesOrders('Amazon', false);
    var flipkartSales = getSalesOrders('Flipkart', false);
    var meeshoSales = getSalesOrders('Meesho', false);

    var amazonDalSales = getSalesOrders('Amazon', true);
    var flipkartDalSales = getSalesOrders('Flipkart', true);
    var meeshoDalSales = getSalesOrders('Meesho', true);

    function fmtReturnPct(returns, sales) {
      if (!sales || sales === 0) return '<span class="na-cell">-</span>';
      return (returns / sales * 100).toFixed(2) + '%';
    }

    var channels = [
      { label: 'Amazon', dataAll: amazonAll, dataDal: amazonDal, salesAll: amazonSales, salesDal: amazonDalSales },
      { label: 'Flipkart', dataAll: flipkartAll, dataDal: flipkartDal, salesAll: flipkartSales, salesDal: flipkartDalSales },
      { label: 'Meesho', dataAll: meeshoAll, dataDal: meeshoDal, salesAll: meeshoSales, salesDal: meeshoDalSales }
    ];

    var totalsAll = channels.reduce(function (acc, ch) {
      return addReturnData(acc, ch.dataAll);
    }, zeroReturn());

    var totalsDal = channels.reduce(function (acc, ch) {
      return addReturnData(acc, ch.dataDal);
    }, zeroReturn());

    var totalSalesAll = amazonSales + flipkartSales + meeshoSales;
    var totalSalesDal = amazonDalSales + flipkartDalSales + meeshoDalSales;

    var rows = [];
    channels.forEach(function (ch) {
      var dAll = ch.dataAll;
      var dDal = ch.dataDal;
      rows.push(
        '<tr>' +
        '<td>' + escapeHtml(ch.label) + '</td>' +
        // All Brands
        '<td>' + fmtInt(dAll.totalReturns) + '</td>' +
        '<td>' + fmtReturnPct(dAll.totalReturns, ch.salesAll) + '</td>' +
        '<td>' + fmtInt(dAll.returnQuantity) + '</td>' +
        '<td>' + fmtInt(dAll.rtoQuantity) + '</td>' +
        // DALUCI Brand
        '<td>' + fmtInt(dDal.totalReturns) + '</td>' +
        '<td>' + fmtReturnPct(dDal.totalReturns, ch.salesDal) + '</td>' +
        '<td>' + fmtInt(dDal.returnQuantity) + '</td>' +
        '<td>' + fmtInt(dDal.rtoQuantity) + '</td>' +
        '</tr>'
      );
    });

    rows.push(
      '<tr class="total-row">' +
      '<td>Total</td>' +
      // All Brands Total
      '<td>' + fmtInt(totalsAll.totalReturns) + '</td>' +
      '<td>' + fmtReturnPct(totalsAll.totalReturns, totalSalesAll) + '</td>' +
      '<td>' + fmtInt(totalsAll.returnQuantity) + '</td>' +
      '<td>' + fmtInt(totalsAll.rtoQuantity) + '</td>' +
      // DALUCI Brand Total
      '<td>' + fmtInt(totalsDal.totalReturns) + '</td>' +
      '<td>' + fmtReturnPct(totalsDal.totalReturns, totalSalesDal) + '</td>' +
      '<td>' + fmtInt(totalsDal.returnQuantity) + '</td>' +
      '<td>' + fmtInt(totalsDal.rtoQuantity) + '</td>' +
      '</tr>'
    );

    setEditableRows(els.returnTableBody, rows.join(''));
  }

  function fmtGrowth(g) {
    if (g === null || isNaN(g) || !isFinite(g)) return '<span class="na-cell">-</span>';
    var text = Math.abs(g).toFixed(2) + '%';
    if (g > 0) return '<span class="text-green">+' + text + '</span>';
    if (g < 0) return '<span class="text-red">-' + text + '</span>';
    return text;
  }

  function renderChannelTable(ctx) {
    const rows = [];
    let totalAllOrder = 0, totalAllGmv = 0, totalDaluciOrder = 0, totalDaluciGmv = 0;
    let totalPrevAllGmv = 0, totalPrevDaluciGmv = 0;

    ctx.perPlatform.forEach(function (p) {
      const all = p.yesterday.all; const dal = p.yesterday.daluci;
      const pAll = p.previous.all; const pDal = p.previous.daluci;
      totalAllOrder += all.order; totalAllGmv += all.gmv;
      totalDaluciOrder += dal.order; totalDaluciGmv += dal.gmv;
      totalPrevAllGmv += pAll.gmv; totalPrevDaluciGmv += pDal.gmv;
    });

    ctx.perPlatform.forEach(function (p) {
      const all = p.yesterday.all; const daluci = p.yesterday.daluci;
      const pAll = p.previous.all; const pDal = p.previous.daluci;
      const contribution = totalDaluciGmv > 0
        ? (daluci.gmv / totalDaluciGmv * 100) : 0;

      let label = p.platform.label;
      if (state.viewMode === 'daily' && p.lastUpload) {
        label += ' - (' + formatDMY(p.lastUpload) + ')';
      }

      const allGrowth = pAll.gmv > 0 ? ((all.gmv - pAll.gmv) / pAll.gmv) * 100 : (all.gmv > 0 ? 100 : null);
      const daluciGrowth = pDal.gmv > 0 ? ((daluci.gmv - pDal.gmv) / pDal.gmv) * 100 : (daluci.gmv > 0 ? 100 : null);

      rows.push(
        '<tr>' +
        '<td>' + escapeHtml(label) + '</td>' +
        '<td>' + fmtInt(all.order) + '</td>' +
        '<td>' + fmtInt(all.gmv) + '</td>' +
        '<td>' + fmtGrowth(allGrowth) + '</td>' +
        '<td>' + fmtInt(daluci.order) + '</td>' +
        '<td>' + fmtInt(daluci.gmv) + '</td>' +
        '<td>' + fmtGrowth(daluciGrowth) + '</td>' +
        '<td>' + contribution.toFixed(2) + '%</td>' +
        '</tr>'
      );
    });

    const totalAllGrowth = totalPrevAllGmv > 0 ? ((totalAllGmv - totalPrevAllGmv) / totalPrevAllGmv) * 100 : (totalAllGmv > 0 ? 100 : null);
    const totalDaluciGrowth = totalPrevDaluciGmv > 0 ? ((totalDaluciGmv - totalPrevDaluciGmv) / totalPrevDaluciGmv) * 100 : (totalDaluciGmv > 0 ? 100 : null);

    rows.push(
      '<tr class="total-row">' +
      '<td>Total</td>' +
      '<td>' + fmtInt(totalAllOrder) + '</td>' +
      '<td>' + fmtInt(totalAllGmv) + '</td>' +
      '<td>' + fmtGrowth(totalAllGrowth) + '</td>' +
      '<td>' + fmtInt(totalDaluciOrder) + '</td>' +
      '<td>' + fmtInt(totalDaluciGmv) + '</td>' +
      '<td>' + fmtGrowth(totalDaluciGrowth) + '</td>' +
      '<td>100%</td>' +
      '</tr>'
    );

    setEditableRows(els.channelTableBody, rows.join(''));
  }

  function renderRunrateTable(ctx) {
    let overallOrder = 0, overallGmv = 0, daluciOrder = 0, daluciGmv = 0;

    if (ctx.categoryRunrateOverall && ctx.categoryRunrateOverall.data && ctx.categoryRunrateDaluci && ctx.categoryRunrateDaluci.data) {
      const overallData = ctx.categoryRunrateOverall.data;
      const daluciData = ctx.categoryRunrateDaluci.data;

      if (overallData.final_summary && daluciData.final_summary) {
        overallOrder = numOrZero(overallData.final_summary.total_order_runrate);
        overallGmv = numOrZero(overallData.final_summary.total_gmv_runrate);

        daluciOrder = numOrZero(daluciData.final_summary.total_order_runrate);
        daluciGmv = numOrZero(daluciData.final_summary.total_gmv_runrate);
      }
    }

    const share = overallGmv > 0 ? (daluciGmv / overallGmv * 100) : 0;

    setEditableRows(els.runrateTableBody,
      '<tr><td>Overall Runrate</td><td>' + fmtInt(overallOrder) + '</td><td>' + fmtInt(overallGmv) + '</td></tr>' +
      '<tr><td>DALUCI Runrate</td><td>' + fmtInt(daluciOrder) + '</td><td>' + fmtInt(daluciGmv) + '</td></tr>' +
      '<tr class="share-row"><td>DALUCI Share of Overall</td><td colspan="2">' + share.toFixed(0) + '%</td></tr>'
    );
  }

  function renderAdsTable(ctx) {
    const rows = [];
    let totalYAll = 0, totalMAll = 0, totalYDaluci = 0, totalMDaluci = 0;

    ctx.perPlatform.forEach(function (p) {
      // Skip Amazon Direct & DALUCI Website
      if (ADS_EXCLUDED_KEYS.indexOf(p.platform.key) !== -1) return;

      let yAll = p.yesterday.all.ads;
      let mAll = p.monthToDate.all.ads;

      // Zepto & Blinkit: DALUCI Brand column mirrors All Brands
      let yDaluci, mDaluci;
      if (ADS_ALL_SAME_AS_DALUCI.indexOf(p.platform.key) !== -1) {
        yAll = Math.max(yAll, p.yesterday.daluci.ads);
        mAll = Math.max(mAll, p.monthToDate.daluci.ads);
        yDaluci = yAll;
        mDaluci = mAll;
      } else if (ADS_DALUCI_BLANK_KEYS.indexOf(p.platform.key) !== -1) {
        // Meesho: DALUCI Brand ads not available, show blank
        yDaluci = 0;
        mDaluci = 0;
      } else {
        yDaluci = p.yesterday.daluci.ads;
        mDaluci = p.monthToDate.daluci.ads;
      }

      totalYAll += yAll; totalMAll += mAll;
      totalYDaluci += yDaluci; totalMDaluci += mDaluci;

      const isAdsBlank = (yAll === 0 && mAll === 0 && yDaluci === 0 && mDaluci === 0);

      let label = p.platform.label;
      if (state.viewMode === 'daily' && !isAdsBlank) {
        if (p.adsDate) {
          label += ' - (' + formatDMY(p.adsDate) + ')';
        } else if (p.lastUpload) {
          label += ' - (' + formatDMY(p.lastUpload) + ')';
        }
      }

      const hideMonthAds = (state.viewMode === 'monthly' || state.viewMode === 'quarterly');

      rows.push(
        '<tr>' +
        '<td>' + escapeHtml(label) + '</td>' +
        '<td>' + fmtAds(yAll) + '</td>' +
        (hideMonthAds ? '' : '<td>' + fmtAds(mAll) + '</td>') +
        '<td>' + fmtAds(yDaluci) + '</td>' +
        (hideMonthAds ? '' : '<td>' + fmtAds(mDaluci) + '</td>') +
        '</tr>'
      );
    });

    const hideMonthAds = (state.viewMode === 'monthly' || state.viewMode === 'quarterly');

    rows.push(
      '<tr class="total-row">' +
      '<td>Total</td>' +
      '<td>' + fmtAds(totalYAll) + '</td>' +
      (hideMonthAds ? '' : '<td>' + fmtAds(totalMAll) + '</td>') +
      '<td>' + fmtAds(totalYDaluci) + '</td>' +
      (hideMonthAds ? '' : '<td>' + fmtAds(totalMDaluci) + '</td>') +
      '</tr>'
    );

    setEditableRows(els.adsTableBody, rows.join(''));
  }

  function renderUploadDatesTable(ctx) {
    const mapToUse = ctx.originalUploadMap || ctx.uploadMap;

    // Find the absolute latest upload date across all platforms
    let maxUploadDate = 0;
    PLATFORMS.forEach(function (p) {
      if (mapToUse[p.key]) {
        let dTime = new Date(mapToUse[p.key]).getTime();
        if (dTime > maxUploadDate) maxUploadDate = dTime;
      }
    });

    // If the selected period completely ended before the latest data upload date,
    // it means we are viewing a past period and the data is 100% complete.
    // So we hide the "Latest Upload Dates" table entirely.
    if (maxUploadDate > 0) {
      let endOfFetch = new Date(ctx.dashboardDate);
      endOfFetch.setHours(23, 59, 59, 999);
      let refDate = new Date(maxUploadDate);
      refDate.setHours(0, 0, 0, 0);

      if (endOfFetch < refDate) {
        els.uploadDatesTableContainer.hidden = true;
        return;
      }
    }

    els.uploadDatesTableContainer.hidden = false;
    const rows = [];

    PLATFORMS.forEach(function (p) {
      const d = mapToUse[p.key];
      let adsCell = '<div class="skel-bar" style="width:60px"></div>';

      let fetchedAdsDate = null;
      if (ctx.tableData) {
        for (var i = 0; i < ctx.tableData.length; i++) {
          var r = ctx.tableData[i];
          if (r.platform && r.platform.key === p.key) {
            if (r.adsDateRaw) {
              fetchedAdsDate = r.adsDateRaw;
            } else if (r.adsDate && (!r.lastUpload || r.adsDate.getTime() !== r.lastUpload.getTime())) {
              fetchedAdsDate = r.adsDate;
            }
            break;
          }
        }
      }

      if (ADS_EXCLUDED_KEYS.indexOf(p.key) !== -1) {
        adsCell = '<span class="na-cell">N/A</span>';
      } else if (ctx.meeshoAdsUploadDate && ctx.meeshoAdsUploadDate[p.key]) {
        adsCell = formatDMY(ctx.meeshoAdsUploadDate[p.key]);
      } else if (fetchedAdsDate) {
        adsCell = formatDMY(fetchedAdsDate);
      } else if (adsDateSearchCache[p.key]) {
        adsCell = adsDateSearchCache[p.key] === 'none' ? '<span class="na-cell">—</span>' : formatDMY(adsDateSearchCache[p.key]);
      } else {
        let isSearching = adsDateSearchInProgress[p.key];
        adsCell = '<div class="skel-bar ads-date-spinner" id="ads-date-' + p.key + (isSearching ? '-searching' : '') + '" style="width:60px"></div>';

        if (d && !isSearching) {
          setTimeout(function () {
            findLatestAdsDateBackground(p.key, d);
          }, 100);
        }
      }

      rows.push(
        '<tr>' +
        '<td>' + escapeHtml(p.label) + '</td>' +
        '<td>' + (d ? formatDMY(d) : '<span class="na-cell">—</span>') + '</td>' +
        '<td>' + adsCell + '</td>' +
        '</tr>'
      );
    });
    setEditableRows(els.uploadDatesTableBody, rows.join(''));
  }

  // Cache to prevent duplicate searches
  var adsDateSearchCache = {};
  var adsDateSearchInProgress = {};

  function findLatestAdsDateBackground(platform, maxSalesDate) {
    if (adsDateSearchCache[platform]) {
      var el = document.getElementById('ads-date-' + platform + '-searching') || document.getElementById('ads-date-' + platform);
      if (el) {
        el.outerHTML = adsDateSearchCache[platform] === 'none' ? '<span class="na-cell">—</span>' : formatDMY(adsDateSearchCache[platform]);
      }
      return;
    }

    if (adsDateSearchInProgress[platform]) return;
    adsDateSearchInProgress[platform] = true;

    // Mark as searching so we don't trigger it again
    var el = document.getElementById('ads-date-' + platform);
    if (el) el.id = 'ads-date-' + platform + '-searching';

    var daysToCheck = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]; // Check up to 10 days back
    var currentIdx = 0;

    function checkNextDay() {
      if (currentIdx >= daysToCheck.length) {
        adsDateSearchCache[platform] = 'none';
        adsDateSearchInProgress[platform] = false;
        var tEl = document.getElementById('ads-date-' + platform + '-searching');
        if (tEl) tEl.outerHTML = '<span class="na-cell">—</span>';
        return;
      }

      var d = addDays(maxSalesDate, -daysToCheck[currentIdx]);
      var dStr = toISODate(d);

      queuedApiGet(SALES_TOTALS_PATH, { startDate: dStr, endDate: dStr, platform: platform })
        .then(function (res) {
          // Use the central readTotals function to ensure we read exactly what the table reads
          var totals = readTotals(res && res.data, false);
          var adsVal = totals.ads;

          if (adsVal > 0) {
            adsDateSearchCache[platform] = d;
            adsDateSearchInProgress[platform] = false;
            var tEl = document.getElementById('ads-date-' + platform + '-searching');
            if (tEl) tEl.outerHTML = formatDMY(d);
          } else {
            currentIdx++;
            checkNextDay();
          }
        })
        .catch(function () {
          currentIdx++;
          checkNextDay();
        });
    }

    checkNextDay();
  }

  // =====================================================================
  // FORMATTERS / UTILITIES
  // =====================================================================

  function sameDay(a, b) {
    return a.getFullYear() === b.getFullYear() &&
      a.getMonth() === b.getMonth() &&
      a.getDate() === b.getDate();
  }

  function fmtInt(n) {
    return Math.round(n) === 0 ? '<span class="na-cell">-</span>' : Math.round(n).toString();
  }

  function fmtAds(n) {
    return n > 0
      ? Math.round(n).toString()
      : '<span class="na-cell">-</span>';
  }

  function showErrorBanner(msg) {
    els.errorBanner.textContent = msg;
    els.errorBanner.hidden = false;
  }
  function hideErrorBanner() {
    els.errorBanner.hidden = true;
  }

  // =====================================================================
  // SKELETON LOADER  (shimmer rows while platform data is in-flight)
  // =====================================================================

  function showTableSkeletons() {
    var SR = '<tr class="skel-row"><td colspan="99"><div class="skel-bar"></div></td></tr>';
    els.channelTableBody.innerHTML = Array(7).fill(SR).join('');
    els.runrateTableBody.innerHTML = Array(3).fill(SR).join('');

    // Skeleton rows for Ads Table must match the dynamic colspan
    els.adsTableBody.innerHTML = Array(5).fill(SR).join('');
    // Return table skeleton (only shown in monthly mode)
    if (!els.returnTableOuter.hidden) {
      els.returnTableBody.innerHTML = Array(4).fill(SR).join('');
    }
    // Upload dates is NOT skeletonised — it renders lazily from first API call
  }

  // =====================================================================
  // SNAPSHOT  (tables 1–3 captured as a PNG using html-to-image)
  // =====================================================================

  function snapDateStr() {
    var d = new Date();
    return d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0') + '_' +
      String(d.getHours()).padStart(2, '0') +
      String(d.getMinutes()).padStart(2, '0');
  }

  // =====================================================================
  // CAPTURE HELPER  (shared by Snapshot button and Email button)
  // =====================================================================
  //
  // Returns a Promise that resolves to a PNG data URL (mode 'png') or a
  // Blob (mode 'blob'). Fixes applied here:
  //   1. backgroundColor + inline background fill the gaps between the
  //      dark tables with the same warm cream as the page body, instead
  //      of leaving a transparent PNG (which email/photo apps render as
  //      plain white).
  //   2. Padding shorthand "top sides bottom" gives breathing room on
  //      every edge, with extra room below the last table.
  //   3. .tbl-outer overflow is temporarily set to visible so the full
  //      table width is captured, not just what's scrolled into view.
  //   4. height: scrollHeight ensures the full Ads Spend table is
  //      captured even when it extends past the current viewport.
  function captureSnapshot(mode) {
    var target = els.snapshotArea;
    if (!target) return Promise.reject(new Error('Snapshot area not found.'));
    if (target.querySelector('.skel-row')) {
      return Promise.reject(new Error('Dashboard is still loading. Please wait a moment.'));
    }

    // Inject temporary style to force desktop layout on mobile
    var styleEl = document.createElement('style');
    styleEl.innerHTML =
      '.capture-mode .snapshot-area { gap: 28px !important; }' +
      '.capture-mode .tbl-outer--narrow { max-width: 460px !important; }' +
      '.capture-mode .tbl-outer--medium { max-width: 640px !important; }' +
      '.capture-mode .mis-table { font-size: 13px !important; min-width: auto !important; }' +
      '.capture-mode .mis-table th, .capture-mode .mis-table td { padding: 9px 14px !important; }' +
      '.capture-mode .mis-table .title-row th { font-size: 14px !important; padding: 14px 16px !important; }' +
      '.capture-mode .mis-table .section-row th { font-size: 11px !important; padding: 10px 14px !important; }' +
      '.capture-mode .mis-table .group-row th { font-size: 11px !important; }' +
      '.capture-mode .mis-table .col-row th { font-size: 10.5px !important; }';
    document.head.appendChild(styleEl);
    document.body.classList.add('capture-mode');

    var outers = Array.from(target.querySelectorAll('.tbl-outer'));
    var savedOverflow = outers.map(function (el) { return el.style.overflow; });
    outers.forEach(function (el) { el.style.overflow = 'visible'; });

    var savedBg = target.style.background;
    var savedPad = target.style.padding;
    var savedWidth = target.style.width;
    var savedMinWidth = target.style.minWidth;

    target.style.background = '#f0ece4';         // warm cream — matches page body
    target.style.padding = '20px 28px 36px';  // top / left+right / bottom
    // Force a desktop-like width so mobile snapshots aren't squished
    target.style.width = '1024px';
    target.style.minWidth = '1024px';

    function restore() {
      outers.forEach(function (el, i) { el.style.overflow = savedOverflow[i]; });
      target.style.background = savedBg;
      target.style.padding = savedPad;
      target.style.width = savedWidth;
      target.style.minWidth = savedMinWidth;
      document.body.classList.remove('capture-mode');
      if (styleEl.parentNode) styleEl.parentNode.removeChild(styleEl);
    }

    var opts = {
      pixelRatio: 2,
      skipFonts: true,       // avoid the Google Fonts CORS fetch hanging the promise
      backgroundColor: '#f0ece4',  // cream fill for any transparent gaps
      width: 1024,
      height: target.scrollHeight + 56,
      filter: function (node) {
        return !(node.classList && node.classList.contains('inline-edit-input'));
      }
    };

    var capture = mode === 'blob'
      ? htmlToImage.toBlob(target, opts)
      : htmlToImage.toPng(target, opts);

    return capture
      .then(function (result) { restore(); return result; })
      .catch(function (err) { restore(); throw err; });
  }

  // =====================================================================
  // SNAPSHOT  (download as PNG)
  // =====================================================================

  function takeSnapshot() {
    var btn = els.snapshotBtn;
    var origHTML = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '⏳ Capturing…';

    // Flash effect
    els.snapshotFlash.classList.add('active');
    setTimeout(function () { els.snapshotFlash.classList.remove('active'); }, 350);

    function restore() {
      btn.disabled = false;
      btn.innerHTML = origHTML;
    }

    // Safety net: restore button if htmlToImage stalls (e.g. CORS timeout)
    var timeoutId = setTimeout(function () {
      restore();
      console.warn('Snapshot timed out — check CORS or network.');
    }, 15000);

    captureSnapshot('blob')
      .then(function (blob) {
        clearTimeout(timeoutId);
        if (!blob) { throw new Error('html-to-image returned no data.'); }

        // Use blob URL — Chrome blocks data: URL anchor clicks (security policy)
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = 'daluci-dashboard-' + snapDateStr() + '.png';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(function () { URL.revokeObjectURL(url); }, 10000);
      })
      .catch(function (err) {
        clearTimeout(timeoutId);
        console.error('Snapshot error:', err);
        alert('Snapshot failed: ' + (err.message || String(err)));
      })
      .then(restore);  // runs after .then OR .catch — like .finally
  }

  // =====================================================================
  // EMAIL SNAPSHOT  (capture → base64 → POST to /api/send-snapshot)
  // =====================================================================

  function emailSnapshot(additionalEmails) {
    var btn = els.emailBtn;
    var origHTML = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '📧 Sending…';

    function restore() {
      btn.disabled = false;
      btn.innerHTML = origHTML;
    }

    // Extract the exact period string from the report title (e.g. "05/08/2026" or "Month - August 2026")
    var fullTitle = els.reportTitleCell.textContent;
    var periodString = fullTitle.replace('DALUCI  |  SALES, ADS & RETURNS REPORT (', '').replace('DALUCI  |  SALES AND ADS REPORT (', '').slice(0, -1);
    // Remove invisible characters or extra spaces just in case
    periodString = periodString.replace('DALUCI&nbsp;&nbsp;|&nbsp;&nbsp;SALES, ADS & RETURNS REPORT (', '').replace('DALUCI&nbsp;&nbsp;|&nbsp;&nbsp;SALES AND ADS REPORT (', '').trim();
    if (periodString === '—' || periodString === '') {

      var d = addDays(new Date(), -1);
      periodString = pad2(d.getDate()) + '/' + pad2(d.getMonth() + 1) + '/' + d.getFullYear();
    }

    captureSnapshot('png')
      .then(function (dataUrl) {
        // POST the base64 image to our serverless endpoint
        return fetch('/api/send-snapshot', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            imageBase64: dataUrl,
            periodString: periodString,
            additionalEmails: additionalEmails
          })
        });
      })
      .then(function (resp) {
        return resp.json()
          .catch(function () {
            // Happens if something upstream (e.g. a misrouted rewrite) returns HTML/plain text
            throw new Error('Server returned an unexpected response (status ' + resp.status + ').');
          })
          .then(function (data) {
            if (!resp.ok) throw new Error(data.error || data.detail || 'Server error');
            return data;
          });
      })
      .then(function (data) {
        // Show success toast
        showEmailToast('✓ Dashboard emailed to ' + (data.recipients || []).join(', '));
      })
      .catch(function (err) {
        console.error('Email snapshot error:', err);
        alert('Email failed: ' + (err.message || String(err)));
      })
      .then(restore);
  }

  function showEmailToast(msg) {
    var toast = els.authToast; // reuse the auth toast element
    toast.textContent = msg;
    toast.classList.add('show');
    setTimeout(function () { toast.classList.remove('show'); }, 4000);
  }

})();
