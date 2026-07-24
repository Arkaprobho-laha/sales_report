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

  const state = {
    token: '',
    debugLog: []
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
    els.emailBtn.addEventListener('click', emailSnapshot);
    els.debugBtn.addEventListener('click', function () { els.debugDrawer.hidden = false; });
    els.closeDebugBtn.addEventListener('click', function () { els.debugDrawer.hidden = true; });
  }

  // =====================================================================
  // SESSION MANAGEMENT
  //
  // KEY FIX: We no longer pre-check JWT expiry locally. The token is
  // reused as long as it's stored. Only an actual 401/403 from the API
  // triggers handleAuthFailure() which clears the token and asks again.
  // =====================================================================

  // ── Token-only clear: NEVER wipes cell overrides (daluci_edit_*) ───────
  // Cell edits use separate keys and must survive token changes.
  function clearTokenOnly() {
    window.localStorage.removeItem('daluci_dash_token');
    // ⚠️  Do NOT call localStorage.clear() — that would destroy cell edits.
  }

  function tryResumeSession() {
    const saved = window.localStorage.getItem('daluci_dash_token');
    if (saved) {
      state.token = saved;
      enterConnectedState();
      loadDashboard(true); // auto-connect silently
    }
    // If nothing saved: authForm is already visible (default HTML state)
  }

  function onConnectClick() {
    const raw = (els.tokenInput.value || '').trim();
    if (!raw) {
      showLoginError('Paste a token first.');
      return;
    }
    state.token = normalizeToken(raw);
    window.localStorage.setItem('daluci_dash_token', state.token);
    hideLoginError();
    enterConnectedState();
    loadDashboard(true);
  }

  function onDisconnect() {
    state.token = '';
    clearTokenOnly();          // only token removed — cell edits stay safe
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
    window.localStorage.setItem('daluci_dash_token', state.token);
    els.newTokenError.hidden = true;
    els.changeTokenModal.hidden = true;
    updateTokenPreview();
    loadDashboard(true);
  }

  // Called when the API returns 401/403 — clears saved token and goes back
  // to the form so the user can paste a fresh one.
  // Cell edit overrides (daluci_edit_*) are intentionally preserved.
  function handleAuthFailure(msg) {
    state.token = '';
    clearTokenOnly();          // only token removed — cell edits stay safe
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
  // SNAPSHOT  (html2canvas, first 3 tables only via #snapshotArea)
  // =====================================================================

  function takeSnapshot() {
    if (!window.html2canvas) {
      alert('html2canvas not loaded yet — try again in a moment.');
      return;
    }
    // Brief white flash as tactile feedback
    els.snapshotFlash.classList.add('active');
    setTimeout(function () { els.snapshotFlash.classList.remove('active'); }, 250);

    window.html2canvas(els.snapshotArea, {
      backgroundColor: '#070b14',
      scale: 2,
      useCORS: true,
      logging: false
    }).then(function (canvas) {
      const link = document.createElement('a');
      const ts = new Date();
      const stamp = ts.getFullYear() + '-' +
        pad2(ts.getMonth() + 1) + '-' + pad2(ts.getDate()) +
        '_' + pad2(ts.getHours()) + pad2(ts.getMinutes());
      link.download = 'DALUCI_Dashboard_' + stamp + '.png';
      link.href = canvas.toDataURL('image/png');
      link.click();
    }).catch(function (err) {
      console.error('Snapshot failed:', err);
    });
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

  function renderDebugEntry(entry) {
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
    els.debugLog.scrollTop = els.debugLog.scrollHeight;
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
  function daysInMonth(d) {
    return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
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
    els.debugLog.innerHTML = '';
    state.debugLog = [];
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

        let dashboardDate = null;
        PLATFORMS.forEach(function (p) {
          const d = uploadMap[p.key];
          if (d && (!dashboardDate || d > dashboardDate)) dashboardDate = d;
        });
        if (!dashboardDate) dashboardDate = new Date();

        // ── LAZY LOAD: show shell + Table 4 + skeletons for Tables 1–3 NOW ──
        const headerDate = addDays(dashboardDate, -1);
        els.reportTitleCell.textContent =
          'DALUCI  |  SALES DASHBOARD (' + formatDMY(headerDate) + ')';

        // Table 4 renders immediately (upload dates are already in hand)
        renderUploadDatesTable({ uploadMap: uploadMap, dashboardDate: dashboardDate });

        // Tables 1–3 show shimmer skeletons until platform data arrives
        showTableSkeletons();

        if (isFirstLoad) {
          els.loadState.hidden = true;
          els.reportRoot.hidden = false;
        }

        return fetchAllPlatformData(uploadMap, dashboardDate).then(function (perPlatform) {
          return {
            uploadMap: uploadMap,
            dashboardDate: dashboardDate,
            perPlatform: perPlatform
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
      'DALUCI  |  SALES DASHBOARD (' + formatDMY(headerDate) + ')';

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
      const isStale = p.lastUpload &&
        !sameDay(p.lastUpload, addDays(ctx.dashboardDate, -1)) &&
        !sameDay(p.lastUpload, ctx.dashboardDate);
      if (p.lastUpload && isStale) {
        label += ' (' + formatDMY(p.lastUpload) + ')';
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

    ctx.perPlatform.forEach(function (p) {
      const dim = daysInMonth(ctx.dashboardDate);
      const elapsed = p.daysElapsed || 0;
      if (!elapsed) return;
      const factor = dim / elapsed;

      overallOrder += p.monthToDate.all.order * factor;
      overallGmv += p.monthToDate.all.gmv * factor;
      daluciOrder += p.monthToDate.daluci.order * factor;
      daluciGmv += p.monthToDate.daluci.gmv * factor;
    });

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

  function takeSnapshot() {
    var target = els.snapshotArea;
    if (!target) { alert('Snapshot area not found.'); return; }

    if (target.querySelector('.skel-row')) {
      alert('Dashboard is still loading. Please wait a moment.');
      return;
    }

    var btn = els.snapshotBtn;
    var origHTML = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '⏳ Capturing…';

    // Flash effect
    els.snapshotFlash.classList.add('active');
    setTimeout(function () { els.snapshotFlash.classList.remove('active'); }, 350);

    // Temporarily expose full scroll containers so full table width is captured
    var outers = Array.from(target.querySelectorAll('.tbl-outer'));
    var savedOverflow = outers.map(function (el) { return el.style.overflow; });
    outers.forEach(function (el) { el.style.overflow = 'visible'; });

    function restore() {
      outers.forEach(function (el, i) { el.style.overflow = savedOverflow[i]; });
      btn.disabled = false;
      btn.innerHTML = origHTML;
    }

    // Safety net: restore button if htmlToImage stalls (e.g. CORS timeout)
    var timeoutId = setTimeout(function () {
      restore();
      console.warn('Snapshot timed out — check CORS or network.');
    }, 15000);

    htmlToImage.toBlob(target, {
      pixelRatio: 2,
      // KEY FIX: html-to-image fetches Google Fonts to embed them.
      // That CORS request hangs the Promise forever. skipFonts:true
      // skips inlining — fonts still render from browser cache.
      skipFonts: true,
      filter: function (node) {
        return !(node.classList && node.classList.contains('inline-edit-input'));
      }
    })
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

  function emailSnapshot() {
    var target = els.snapshotArea;
    if (!target) { alert('Snapshot area not found.'); return; }

    if (target.querySelector('.skel-row')) {
      alert('Dashboard is still loading. Please wait a moment.');
      return;
    }

    var btn = els.emailBtn;
    var origHTML = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '📧 Sending…';

    // Expose full scroll content for capture
    var outers = Array.from(target.querySelectorAll('.tbl-outer'));
    var savedOverflow = outers.map(function (el) { return el.style.overflow; });
    outers.forEach(function (el) { el.style.overflow = 'visible'; });

    function restore() {
      outers.forEach(function (el, i) { el.style.overflow = savedOverflow[i]; });
      btn.disabled = false;
      btn.innerHTML = origHTML;
    }

    // Get today's date string for the email subject
    var now = new Date();
    var dateStr = String(now.getDate()).padStart(2, '0') + '/' +
      String(now.getMonth() + 1).padStart(2, '0') + '/' + now.getFullYear();

    htmlToImage.toPng(target, {
      pixelRatio: 2,
      skipFonts: true,
      filter: function (node) {
        return !(node.classList && node.classList.contains('inline-edit-input'));
      }
    })
    .then(function (dataUrl) {
      // POST the base64 image to our serverless endpoint
      return fetch('/api/send-snapshot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: dataUrl,
          dashboardDate: dateStr
        })
      });
    })
    .then(function (resp) {
      return resp.json().then(function (data) {
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
    toast.classList.add('visible');
    setTimeout(function () { toast.classList.remove('visible'); }, 4000);
  }

})();
