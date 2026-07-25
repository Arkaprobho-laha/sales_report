(function () {
  'use strict';

  // =====================================================================
  // CONFIG
  // =====================================================================

  const API_BASE = '/api/v1/dashboard-bff';
  const LAST_UPLOAD_DATES_PATH = '/sales/last-upload-dates';
  const SALES_TOTALS_PATH = '/sales-details-totals';

  const PLATFORMS = [
    { key: 'Amazon', label: 'Amazon' },
    { key: 'Flipkart', label: 'Flipkart' },
    { key: 'Meesho', label: 'Meesho' },
    { key: 'Zepto', label: 'Zepto' },
    { key: 'Blinkit', label: 'Blinkit' },
    { key: 'Amazon_DF', label: 'Amazon Direct' },
    { key: 'Daluci_Website', label: 'DALUCI Website' }
  ];

  // Excluded from Ads Spend table
  const ADS_EXCLUDED_KEYS = ['Amazon_DF', 'Daluci_Website'];

  // For these platforms All Brands ads === DALUCI Brands ads
  const ADS_ALL_SAME_AS_DALUCI = ['Zepto', 'Blinkit'];

  const BRAND_FILTER = 'Daluci';

  function readTotals(data, brandFiltered) {
    data = data || {};
    return {
      order: numOrZero(data.unitsSold),
      gmv: numOrZero(data.totalSales),
      ads: brandFiltered
        ? numOrZero(data.totalAdsSpend)
        : numOrZero(data.totalAdsSpendAll != null ? data.totalAdsSpendAll : data.totalAdsSpend)
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
    debugPage: 0   // 0-based index of the currently displayed page
  };

  const els = {};

  document.addEventListener('DOMContentLoaded', function () {
    cacheEls();
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
    els.runrateTableBody = document.getElementById('runrateTableBody');
    els.adsTableBody = document.getElementById('adsTableBody');
    els.uploadDatesTableBody = document.getElementById('uploadDatesTableBody');
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
  // WIRE EVENTS
  // =====================================================================

  function wireEvents() {
    els.connectBtn.addEventListener('click', onConnectClick);
    els.disconnectBtn.addEventListener('click', onDisconnect);
    els.refreshBtn.addEventListener('click', function () { loadDashboard(false); });
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
        loadDashboard(true);
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
    loadDashboard(true);
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
    loadDashboard(true);
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

  function apiGet(path, params) {
    const qs = params
      ? '?' + Object.keys(params)
        .filter(function (k) { return params[k] !== undefined && params[k] !== null; })
        .map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]); })
        .join('&')
      : '';
    const url = API_BASE + path + qs;
    const startedAt = Date.now();

    return fetch(url, {
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
        (uploadResp && uploadResp.data ? uploadResp.data : []).forEach(function (row) {
          uploadMap[row.platform] = parseAPIDate(row.lastUploadDate);
        });

        const dashboardDate = new Date();
        const headerDate = addDays(dashboardDate, -1);
        
        // Daluci Website data is real-time; force it to use the dashboard header date
        uploadMap['Daluci_Website'] = headerDate;

        // ── LAZY LOAD: show shell + Table 4 + skeletons for Tables 1–3 NOW ──
        els.reportTitleCell.textContent =
          'DALUCI  |  SALES AND ADS REPORT (' + formatDMY(headerDate) + ')';

        // Table 4 renders immediately (upload dates are already in hand)
        renderUploadDatesTable({ uploadMap: uploadMap, dashboardDate: dashboardDate });

        // Tables 1–3 show shimmer skeletons until platform data arrives
        showTableSkeletons();

        if (isFirstLoad) {
          els.loadState.hidden = true;
          els.reportRoot.hidden = false;
        }

        return Promise.all([
          fetchAllPlatformData(uploadMap, dashboardDate),
          apiGet('/category-runrate', { month: dashboardDate.getMonth() + 1, year: dashboardDate.getFullYear() }).catch(function (err) {
            console.warn('Failed to fetch overall category-runrate:', err);
            return null;
          }),
          apiGet('/category-runrate', { month: dashboardDate.getMonth() + 1, year: dashboardDate.getFullYear(), brand: 'Daluci' }).catch(function (err) {
            console.warn('Failed to fetch Daluci category-runrate:', err);
            return null;
          })
        ]).then(function (results) {
          return {
            uploadMap: uploadMap,
            dashboardDate: dashboardDate,
            perPlatform: results[0],
            categoryRunrateOverall: results[1],
            categoryRunrateDaluci: results[2]
          };
        });
      })
      .then(function (ctx) {
        // All platform data ready → replace skeletons with real rows
        renderChannelTable(ctx);
        renderRunrateTable(ctx);
        renderAdsTable(ctx);

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

  function fetchAllPlatformData(uploadMap, dashboardDate) {
    const monthStart = toISODate(firstOfMonth(dashboardDate));

    const calls = PLATFORMS.map(function (p) {
      const lastUpload = uploadMap[p.key];
      const yDate = lastUpload ? toISODate(lastUpload) : null;

      if (!yDate) {
        return Promise.resolve({
          platform: p,
          lastUpload: null,
          yesterday: { all: zeroTotals(), daluci: zeroTotals() },
          monthToDate: { all: zeroTotals(), daluci: zeroTotals() },
          daysElapsed: 0
        });
      }

      const yesterdayAll = apiGet(SALES_TOTALS_PATH,
        { startDate: yDate, endDate: yDate, platform: p.key })
        .then(function (r) { return readTotals(r && r.data, false); });

      const yesterdayDaluci = apiGet(SALES_TOTALS_PATH,
        { startDate: yDate, endDate: yDate, platform: p.key, brand: BRAND_FILTER })
        .then(function (r) { return readTotals(r && r.data, true); });

      const mtdAll = apiGet(SALES_TOTALS_PATH,
        { startDate: monthStart, endDate: yDate, platform: p.key })
        .then(function (r) { return readTotals(r && r.data, false); });

      const mtdDaluci = apiGet(SALES_TOTALS_PATH,
        { startDate: monthStart, endDate: yDate, platform: p.key, brand: BRAND_FILTER })
        .then(function (r) { return readTotals(r && r.data, true); });

      return Promise.all([yesterdayAll, yesterdayDaluci, mtdAll, mtdDaluci])
        .then(function (res) {
          return {
            platform: p,
            lastUpload: lastUpload,
            yesterday: { all: res[0], daluci: res[1] },
            monthToDate: { all: res[2], daluci: res[3] },
            daysElapsed: lastUpload.getDate()
          };
        });
    });

    return Promise.all(calls);
  }

  function zeroTotals() { return { order: 0, gmv: 0, ads: 0 }; }

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
    renderUploadDatesTable(ctx);
  }

  function renderChannelTable(ctx) {
    const rows = [];
    let totalAllOrder = 0, totalAllGmv = 0, totalDaluciOrder = 0, totalDaluciGmv = 0;

    ctx.perPlatform.forEach(function (p) {
      const all = p.yesterday.all; const dal = p.yesterday.daluci;
      totalAllOrder += all.order; totalAllGmv += all.gmv;
      totalDaluciOrder += dal.order; totalDaluciGmv += dal.gmv;
    });

    ctx.perPlatform.forEach(function (p) {
      const all = p.yesterday.all; const daluci = p.yesterday.daluci;
      const contribution = totalDaluciGmv > 0
        ? (daluci.gmv / totalDaluciGmv * 100) : 0;

      let label = p.platform.label;
      const headerDate = addDays(ctx.dashboardDate, -1);
      const isStale = p.lastUpload && !sameDay(p.lastUpload, headerDate);
      if (p.lastUpload && isStale) {
        label += ' - (' + formatDMY(p.lastUpload) + ')';
      }

      rows.push(
        '<tr>' +
        '<td>' + escapeHtml(label) + '</td>' +
        '<td>' + fmtInt(all.order) + '</td>' +
        '<td>' + fmtInt(all.gmv) + '</td>' +
        '<td>' + fmtInt(daluci.order) + '</td>' +
        '<td>' + fmtInt(daluci.gmv) + '</td>' +
        '<td>' + contribution.toFixed(2) + '%</td>' +
        '</tr>'
      );
    });

    rows.push(
      '<tr class="total-row">' +
      '<td>Total</td>' +
      '<td>' + fmtInt(totalAllOrder) + '</td>' +
      '<td>' + fmtInt(totalAllGmv) + '</td>' +
      '<td>' + fmtInt(totalDaluciOrder) + '</td>' +
      '<td>' + fmtInt(totalDaluciGmv) + '</td>' +
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

      const yAll = p.yesterday.all.ads;
      const mAll = p.monthToDate.all.ads;

      // Zepto & Blinkit: DALUCI Brand column mirrors All Brands
      let yDaluci, mDaluci;
      if (ADS_ALL_SAME_AS_DALUCI.indexOf(p.platform.key) !== -1) {
        yDaluci = yAll;
        mDaluci = mAll;
      } else {
        yDaluci = p.yesterday.daluci.ads;
        mDaluci = p.monthToDate.daluci.ads;
      }

      totalYAll += yAll; totalMAll += mAll;
      totalYDaluci += yDaluci; totalMDaluci += mDaluci;

      rows.push(
        '<tr>' +
        '<td>' + escapeHtml(p.platform.label) + '</td>' +
        '<td>' + fmtAds(yAll) + '</td>' +
        '<td>' + fmtAds(mAll) + '</td>' +
        '<td>' + fmtAds(yDaluci) + '</td>' +
        '<td>' + fmtAds(mDaluci) + '</td>' +
        '</tr>'
      );
    });

    rows.push(
      '<tr class="total-row">' +
      '<td>Total</td>' +
      '<td>' + fmtAds(totalYAll) + '</td>' +
      '<td>' + fmtAds(totalMAll) + '</td>' +
      '<td>' + fmtAds(totalYDaluci) + '</td>' +
      '<td>' + fmtAds(totalMDaluci) + '</td>' +
      '</tr>'
    );

    setEditableRows(els.adsTableBody, rows.join(''));
  }

  function renderUploadDatesTable(ctx) {
    const rows = [];
    PLATFORMS.forEach(function (p) {
      const d = ctx.uploadMap[p.key];
      rows.push(
        '<tr>' +
        '<td>' + escapeHtml(p.label) + '</td>' +
        '<td>' + (d ? formatDMY(d) : '<span class="na-cell">—</span>') + '</td>' +
        '</tr>'
      );
    });
    setEditableRows(els.uploadDatesTableBody, rows.join(''));
  }

  // =====================================================================
  // FORMATTERS / UTILITIES
  // =====================================================================

  function sameDay(a, b) {
    return a.getFullYear() === b.getFullYear() &&
      a.getMonth() === b.getMonth() &&
      a.getDate() === b.getDate();
  }

  function fmtInt(n) { return Math.round(n).toString(); }

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
    els.adsTableBody.innerHTML = Array(5).fill(SR).join('');
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

    var savedBg  = target.style.background;
    var savedPad = target.style.padding;
    var savedWidth = target.style.width;
    var savedMinWidth = target.style.minWidth;
    
    target.style.background = '#f0ece4';         // warm cream — matches page body
    target.style.padding    = '20px 28px 36px';  // top / left+right / bottom
    // Force a desktop-like width so mobile snapshots aren't squished
    target.style.width      = '1024px';
    target.style.minWidth   = '1024px';

    function restore() {
      outers.forEach(function (el, i) { el.style.overflow = savedOverflow[i]; });
      target.style.background = savedBg;
      target.style.padding    = savedPad;
      target.style.width      = savedWidth;
      target.style.minWidth   = savedMinWidth;
      document.body.classList.remove('capture-mode');
      if (styleEl.parentNode) styleEl.parentNode.removeChild(styleEl);
    }

    var opts = {
      pixelRatio:      2,
      skipFonts:       true,       // avoid the Google Fonts CORS fetch hanging the promise
      backgroundColor: '#f0ece4',  // cream fill for any transparent gaps
      width:           1024,
      height:          target.scrollHeight + 56,
      filter: function (node) {
        return !(node.classList && node.classList.contains('inline-edit-input'));
      }
    };

    var capture = mode === 'blob'
      ? htmlToImage.toBlob(target, opts)
      : htmlToImage.toPng(target, opts);

    return capture
      .then(function (result) { restore(); return result; })
      .catch(function (err)   { restore(); throw err; });
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

    // Get the report's date string for the email subject/body.
    // IMPORTANT: this must match the dashboard's own header date, which is
    // always "today - 1" (see loadDashboard: headerDate = addDays(dashboardDate, -1)),
    // because the report reflects the latest *uploaded* data, not today.
    // Using plain "today" here made the email subject/body show one day
    // ahead of what the attached snapshot actually says. Reuse the same
    // addDays(new Date(), -1) so this always agrees with the on-screen title.
    var reportDate = addDays(new Date(), -1);
    var dateStr = pad2(reportDate.getDate()) + '/' + pad2(reportDate.getMonth() + 1) + '/' + reportDate.getFullYear();

    captureSnapshot('png')
      .then(function (dataUrl) {
        // POST the base64 image to our serverless endpoint
        return fetch('/api/send-snapshot', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            imageBase64: dataUrl,
            dashboardDate: dateStr,
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
