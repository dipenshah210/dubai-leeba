/* ============================================================
   LEEBA — Collection Page Logic

   HOW DATA LOADING WORKS
   ══════════════════════
   • First time you open the page → setup screen appears.
     Pick your Excel file once. Data is saved in browser storage.

   • Every subsequent open / refresh → data loads instantly
     from browser storage. No file picking needed.

   • When your Excel changes → click "Update Data" in the header,
     pick the updated file, table refreshes automatically.

   No web server required. Works by double-clicking the HTML file.
   ============================================================ */

/* ─────────────────────────────────────────────────
   CONFIG
───────────────────────────────────────────────── */
var DNA_PAGE   = 'leeba-product.html';
var WA_NUM     = '919979460555';
var CAT_ORDER  = ['RING','BRACELET','EARRING','EARING','NECKLACE','PENDANT','BANGLE'];
var TONE_LABEL = { W:'White', Y:'Yellow', YW:'Yel/Wht', R:'Rose', RW:'Rose/Wht', D:'Dual' };
var LS_KEY     = 'leeba_products_v2';   /* localStorage key */
var LS_DATE    = 'leeba_loaded_date';

/* ─────────────────────────────────────────────────
   STATE
───────────────────────────────────────────────── */
var PRODUCTS       = [];
var sortCol        = 'idx';
var sortDir        = 1;
var activeCats     = new Set();
var activePurities = new Set();
var activeTones    = new Set();
var activeStatuses = new Set();

/* Maps filter IDs to their active-selection Sets */
var MS_STATE = { fp: activePurities, ft: activeTones, fst: activeStatuses };

/* Display labels for each filter's values */
var MS_LABELS = {
  fp:  { '10KT':'10 KT', '14KT':'14 KT', '18KT':'18 KT', '22KT':'22 KT' },
  ft:  { W:'White', Y:'Yellow', YW:'Yel/Wht', R:'Rose', RW:'Rose/Wht', D:'Dual' },
  fst: {}
};

/* ─────────────────────────────────────────────────
   UI HELPERS
───────────────────────────────────────────────── */
function showSetupScreen()  {
  document.getElementById('setup-screen').style.display   = 'flex';
  document.getElementById('collection-ui').style.display  = 'none';
}

function showCollection()   {
  document.getElementById('setup-screen').style.display   = 'none';
  /* Use flex so shell layout (header / scroll-area / footer) works correctly */
  document.getElementById('collection-ui').style.display  = 'flex';
}

function setSetupStatus(msg, isError) {
  var el = document.getElementById('ss-status');
  el.textContent   = msg;
  el.style.display = msg ? '' : 'none';
  el.style.color   = isError ? '#b91c1c' : '#1a6b6b';
  el.style.background    = isError ? '#fff3f3' : '#e8f8f7';
  el.style.borderColor   = isError ? '#f5c6c6' : '#c0dede';
}

function updateHeaderInfo(count, dateStr) {
  var el = document.getElementById('loaded-info');
  if (el) el.textContent = count + ' products  ·  Updated: ' + dateStr;
}

/* ─────────────────────────────────────────────────
   EXCEL PARSING
───────────────────────────────────────────────── */

/* Find the data sheet — tries several name variants */
function findDataSheet(wb) {
  var keywords = ['dubai jewellery', 'dubai jewelry', 'jewellery', 'jewelry', 'dubai'];
  for (var i = 0; i < wb.SheetNames.length; i++) {
    var lower = wb.SheetNames[i].toLowerCase();
    for (var k = 0; k < keywords.length; k++) {
      if (lower.indexOf(keywords[k]) !== -1) return wb.Sheets[wb.SheetNames[i]];
    }
  }
  return wb.Sheets[wb.SheetNames[0]];  /* fallback: first sheet */
}

/*
  Parse METAL column: "18K WG" → { purity:"18KT", metalTone:"W" }
  Returns null for blank values or values with special characters.
*/
function parseMetal(raw) {
  if (!raw) return null;
  var s = String(raw).trim();
  if (!s) return null;
  if (/[^a-zA-Z0-9\s]/.test(s)) return null;  /* reject special chars */

  var u  = s.toUpperCase();
  var kt = u.match(/(\d{2,3})\s*K(?:T)?/);
  if (!kt) return null;

  var purity = kt[1] + 'KT';
  var tone   = '';
  if      (u.indexOf('RWG') !== -1) tone = 'RW';
  else if (u.indexOf('WG')  !== -1) tone = 'W';
  else if (u.indexOf('YG')  !== -1) tone = 'Y';
  else if (u.indexOf('RG')  !== -1) tone = 'R';
  else if (u.indexOf('MG')  !== -1) tone = 'D';

  return { purity: purity, metalTone: tone };
}

function fmtNum(v, d) {
  if (v === '' || v == null) return '';
  var n = Number(v);
  return isNaN(n) ? '' : n.toFixed(d != null ? d : 2);
}

/* Main parse function — called after FileReader loads an ArrayBuffer */
function parseExcelData(buffer, onSuccess, onError) {
  try {
    var wb    = XLSX.read(new Uint8Array(buffer), { type: 'array' });
    var sheet = findDataSheet(wb);
    if (!sheet) { onError('Sheet "DUBAI JEWELLERY" not found.'); return; }

    var rows     = XLSX.utils.sheet_to_json(sheet, { defval: '' });
    var products = [];

    rows.forEach(function(row) {
      var stockId = String(row['STOCK ID'] || '').trim();
      if (!stockId) return;                        /* skip sub-rows */

      var status = String(row['STATUS'] || '').trim().toUpperCase();
      if (status === 'SOLD') return;               /* hide SOLD rows; show everything else */

      var metal = parseMetal(row['METAL']);
      if (!metal) return;                          /* skip invalid metal */

      products.push({
        idx:         products.length + 1,
        sku:         stockId,
        category:    String(row['ITEM'] || '').trim().toUpperCase(),
        purity:      metal.purity,
        metalTone:   metal.metalTone,
        grossWt:     fmtNum(row['GW'],        2),
        netWt:       fmtNum(row['NGW'],       2),
        diaWgt:      fmtNum(row['TOTAL CRT'], 2),
        diaPcs:      row['Total PCS'] !== '' ? String(row['Total PCS']) : '',
        description: String(row['JEWELERY DETAILS'] || '').trim(),
        status:      status
      });
    });

    if (products.length === 0) {
      onError('No rows with STATUS = "STOCK" were found. Check the sheet name is "DUBAI JEWELLERY" and STATUS column contains "STOCK".');
      return;
    }

    onSuccess(products);

  } catch (err) {
    onError('Error reading file: ' + err.message);
  }
}

/* ─────────────────────────────────────────────────
   SAVE & LOAD  (localStorage)
───────────────────────────────────────────────── */
function saveToStorage(products) {
  var dateStr = new Date().toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
  try {
    localStorage.setItem(LS_KEY,  JSON.stringify(products));
    localStorage.setItem(LS_DATE, dateStr);
  } catch(e) {
    /* localStorage might be full — that's OK, data still works in-session */
  }
  return dateStr;
}

function loadFromStorage() {
  try {
    var raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    var data = JSON.parse(raw);
    return Array.isArray(data) && data.length > 0 ? data : null;
  } catch(e) { return null; }
}

/* ─────────────────────────────────────────────────
   APPLY LOADED DATA  — build pills, render table
───────────────────────────────────────────────── */
function applyProducts(products, dateStr) {
  PRODUCTS   = products;
  sortCol    = 'idx';
  sortDir    = 1;
  activeCats = new Set();
  resetAllMs();          /* clear purity / tone / status multi-selects */

  updateHeaderInfo(products.length, dateStr);
  showCollection();
  buildPills();
  buildStatusFilter();
  applyFilters();
}

/* ─────────────────────────────────────────────────
   MULTI-SELECT DROPDOWN FUNCTIONS
───────────────────────────────────────────────── */

function toggleMsDropdown(id) {
  var panel  = document.getElementById(id + '-panel');
  var btn    = document.getElementById(id + '-btn');
  var isOpen = panel.classList.contains('open');
  /* Close all dropdowns first */
  ['fp', 'ft', 'fst'].forEach(function(fid) {
    document.getElementById(fid + '-panel').classList.remove('open');
    document.getElementById(fid + '-btn').classList.remove('open');
  });
  /* Toggle the clicked one */
  if (!isOpen) {
    panel.classList.add('open');
    btn.classList.add('open');
  }
}

function closeMsDropdown(id) {
  document.getElementById(id + '-panel').classList.remove('open');
  document.getElementById(id + '-btn').classList.remove('open');
}

/* Called on every checkbox change — live filtering */
function onMsChange(id) {
  var panel = document.getElementById(id + '-panel');
  var set   = MS_STATE[id];
  set.clear();
  panel.querySelectorAll('input[type=checkbox]:checked').forEach(function(cb) {
    set.add(cb.value);
  });
  updateMsLabel(id);
  applyFilters();
}

/* Clear all selections, close panel, re-filter */
function clearMs(id) {
  var panel = document.getElementById(id + '-panel');
  panel.querySelectorAll('input[type=checkbox]').forEach(function(cb) {
    cb.checked = false;
  });
  MS_STATE[id].clear();
  updateMsLabel(id);
  closeMsDropdown(id);
  applyFilters();
}

/* Update the button label text based on current selection */
function updateMsLabel(id) {
  var set = MS_STATE[id];
  var lbl = document.getElementById(id + '-lbl');
  if (!lbl) return;
  if (set.size === 0) {
    lbl.textContent = 'All';
    lbl.classList.remove('has-val');
  } else if (set.size === 1) {
    var val  = Array.from(set)[0];
    var disp = (MS_LABELS[id] && MS_LABELS[id][val]) ? MS_LABELS[id][val] : val;
    lbl.textContent = disp;
    lbl.classList.add('has-val');
  } else {
    lbl.textContent = set.size + ' selected';
    lbl.classList.add('has-val');
  }
}

/* Reset a single multi-select back to "All" */
function resetMs(id) {
  var panel = document.getElementById(id + '-panel');
  if (panel) {
    panel.querySelectorAll('input[type=checkbox]').forEach(function(cb) {
      cb.checked = false;
    });
    panel.classList.remove('open');
  }
  var btn = document.getElementById(id + '-btn');
  if (btn) btn.classList.remove('open');
  MS_STATE[id].clear();
  updateMsLabel(id);
}

/* Reset all multi-selects */
function resetAllMs() {
  ['fp', 'ft', 'fst'].forEach(resetMs);
}

/* ─────────────────────────────────────────────────
   FILE HANDLER  — shared by setup picker and update picker
───────────────────────────────────────────────── */
function handleFile(file, statusCallback, errorCallback) {
  if (!file) return;
  if (!/\.xlsx?$/i.test(file.name)) {
    (errorCallback || statusCallback)('Please select an Excel file (.xlsx or .xls).');
    return;
  }
  if (statusCallback) statusCallback('Reading ' + file.name + '…', false);

  var reader = new FileReader();

  reader.onload = function(e) {
    parseExcelData(
      e.target.result,
      /* success */
      function(products) {
        var dateStr = saveToStorage(products);
        applyProducts(products, dateStr);
      },
      /* error */
      function(msg) {
        if (errorCallback) errorCallback(msg);
        else if (statusCallback) statusCallback(msg, true);
      }
    );
  };

  reader.onerror = function() {
    var msg = 'Could not read the file. Please try again.';
    if (errorCallback) errorCallback(msg);
    else if (statusCallback) statusCallback(msg, true);
  };

  reader.readAsArrayBuffer(file);
}

/* ─────────────────────────────────────────────────
   CATEGORY PILLS
───────────────────────────────────────────────── */
function buildPills() {
  var cats = {};
  PRODUCTS.forEach(function(p) {
    if (p.category) cats[p.category] = (cats[p.category] || 0) + 1;
  });

  var ordered   = CAT_ORDER.filter(function(c) { return cats[c]; });
  var remaining = Object.keys(cats).filter(function(c) { return ordered.indexOf(c) === -1; }).sort();

  document.getElementById('cat-pills').innerHTML =
    ordered.concat(remaining).map(function(c) {
      return '<button class="cat-pill" data-cat="' + c + '" onclick="toggleCat(\'' + c + '\')">'
           + c.charAt(0) + c.slice(1).toLowerCase()
           + ' <span class="pill-ct">' + cats[c] + '</span></button>';
    }).join('');
}

function toggleCat(cat) {
  if (activeCats.has(cat)) activeCats.delete(cat); else activeCats.add(cat);
  document.querySelectorAll('.cat-pill').forEach(function(b) {
    b.classList.toggle('active', activeCats.has(b.dataset.cat));
  });
  applyFilters();
}

/* ─────────────────────────────────────────────────
   STATUS FILTER — populated dynamically from data
───────────────────────────────────────────────── */
function buildStatusFilter() {
  var seen = {};
  PRODUCTS.forEach(function(p) { if (p.status) seen[p.status] = true; });

  var panel  = document.getElementById('fst-panel');
  if (!panel) return;

  /* Keep the footer; remove old checkboxes */
  var footer = panel.querySelector('.ms-footer');
  panel.querySelectorAll('.ms-item').forEach(function(el) { el.remove(); });

  /* Reset labels map for status */
  MS_LABELS.fst = {};

  Object.keys(seen).sort().forEach(function(s) {
    var dispName = s.charAt(0) + s.slice(1).toLowerCase();
    MS_LABELS.fst[s] = dispName;

    var label = document.createElement('label');
    label.className = 'ms-item';

    var cb = document.createElement('input');
    cb.type  = 'checkbox';
    cb.value = s;
    if (activeStatuses.has(s)) cb.checked = true;
    cb.addEventListener('change', function() { onMsChange('fst'); });

    label.appendChild(cb);
    label.appendChild(document.createTextNode('\u00a0' + dispName));
    panel.insertBefore(label, footer);
  });
}

/* ─────────────────────────────────────────────────
   FILTERS
───────────────────────────────────────────────── */
function applyFilters() {
  var q = document.getElementById('fs').value.toLowerCase().trim();

  var filtered = PRODUCTS.filter(function(p) {
    if (activeCats.size     > 0 && !activeCats.has(p.category))     return false;
    if (activePurities.size > 0 && !activePurities.has(p.purity))   return false;
    if (activeTones.size    > 0 && !activeTones.has(p.metalTone))   return false;
    if (activeStatuses.size > 0 && !activeStatuses.has(p.status))   return false;
    if (q) {
      var hay = (p.sku + ' ' + p.description).toLowerCase();
      if (hay.indexOf(q) === -1) return false;
    }
    return true;
  });

  document.getElementById('rc').innerHTML =
    'Showing <strong>' + filtered.length + '</strong> of <strong>' + PRODUCTS.length + '</strong>';

  renderTable(filtered);
  renderCards(filtered);
  updateSummary(filtered);
}

/* ─────────────────────────────────────────────────
   SUMMARY BAR
───────────────────────────────────────────────── */
function updateSummary(data) {
  var count = data.length;
  var gw = 0, nw = 0, dw = 0, dp = 0;
  data.forEach(function(p) {
    gw += parseFloat(p.grossWt)   || 0;
    nw += parseFloat(p.netWt)     || 0;
    dw += parseFloat(p.diaWgt)    || 0;
    dp += parseInt(p.diaPcs, 10)  || 0;
  });
  document.getElementById('sum-count').textContent = count;
  document.getElementById('sum-gw').textContent    = gw.toFixed(2) + ' g';
  document.getElementById('sum-nw').textContent    = nw.toFixed(2) + ' g';
  document.getElementById('sum-dw').textContent    = dw.toFixed(2) + ' ct';
  document.getElementById('sum-dp').textContent    = dp;
}

/* ─────────────────────────────────────────────────
   SORT
───────────────────────────────────────────────── */
function setSort(col) {
  if (!col) return;
  sortDir = (sortCol === col) ? sortDir * -1 : 1;
  sortCol = col;
  document.querySelectorAll('thead th').forEach(function(th) {
    th.classList.remove('asc','desc');
    if (th.dataset.col === col) th.classList.add(sortDir === 1 ? 'asc' : 'desc');
  });
  applyFilters();
}

function sorted(arr) {
  return arr.slice().sort(function(a, b) {
    var av = a[sortCol] != null ? a[sortCol] : '';
    var bv = b[sortCol] != null ? b[sortCol] : '';
    var na = parseFloat(av), nb = parseFloat(bv);
    if (!isNaN(na) && !isNaN(nb)) return (na - nb) * sortDir;
    return String(av).localeCompare(String(bv)) * sortDir;
  });
}

/* ─────────────────────────────────────────────────
   HELPERS
───────────────────────────────────────────────── */
function buildDnaUrl(p, tone) {
  return DNA_PAGE
    + '?sku='    + encodeURIComponent(p.sku)
    + '&cat='    + encodeURIComponent(p.category)
    + '&purity=' + encodeURIComponent(p.purity)
    + '&gw='     + encodeURIComponent(p.grossWt)
    + '&nw='     + encodeURIComponent(p.netWt)
    + '&dw='     + encodeURIComponent(p.diaWgt)
    + '&dp='     + encodeURIComponent(p.diaPcs)
    + '&tone='   + encodeURIComponent(tone)
    + '&desc='   + encodeURIComponent(p.description);
}

function waMsg(p) {
  var tl = TONE_LABEL[p.metalTone] || p.metalTone || '\u2014';
  return encodeURIComponent(
    'Hi LEEBA!\nI\'m interested in:\n'
    + 'SKU: '         + p.sku + '\n'
    + 'Category: '    + p.category + '\n'
    + 'Purity: '      + p.purity + '\n'
    + 'Gross Wt: '    + (p.grossWt  || '\u2014') + 'g | Net Wt: ' + (p.netWt || '\u2014') + 'g\n'
    + 'Diamond: '     + (p.diaWgt   || '\u2014') + 'ct (' + (p.diaPcs || '\u2014') + ' pcs) | Tone: ' + tl + '\n'
    + 'Description: ' + (p.description || '\u2014') + '\n\n'
    + 'Kindly share the price. Thank you!'
  );
}

function waSvg() {
  return '<svg width="13" height="13" fill="currentColor" viewBox="0 0 24 24">'
    + '<path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>'
    + '<path d="M5.339 17.54A9.956 9.956 0 0 1 2 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10a9.956 9.956 0 0 1-5.54-1.661L2 22l2.339-4.46z"/>'
    + '</svg>';
}

function escHtml(s) {
  return String(s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

/* ─────────────────────────────────────────────────
   DESKTOP TABLE  (12 columns)
───────────────────────────────────────────────── */
function renderTable(data) {
  var s     = sorted(data);
  var tbody = document.getElementById('tbody');

  if (!s.length) {
    tbody.innerHTML = '<tr><td colspan="12" class="no-res">No products match your filters.</td></tr>';
    return;
  }

  tbody.innerHTML = s.map(function(p, i) {
    var tone     = p.metalTone || '';
    var tl       = TONE_LABEL[tone] || tone || '\u2014';
    var toneHtml = tone
      ? '<span class="tone-wrap tone-' + tone + '"><span class="tgem"></span>' + tl + '</span>'
      : '\u2014';

    /* Status badge: known statuses get a specific class; others get status-OTHER */
    var knownStatus = ['STOCK','HK','HOLD','MEMO'];
    var stCls = (p.status && knownStatus.indexOf(p.status) !== -1)
      ? 'status-' + p.status
      : 'status-OTHER';
    var statusHtml = p.status
      ? '<span class="status-b ' + stCls + '">' + escHtml(p.status) + '</span>'
      : '\u2014';

    /* Non-STOCK rows get a subtle amber row tint */
    var rowCls = (p.status && p.status !== 'STOCK') ? ' class="non-stock"' : '';

    return '<tr' + rowCls + '>'
      + '<td class="rn">' + (i + 1) + '</td>'
      + '<td><span class="sku">' + escHtml(p.sku) + '</span></td>'
      + '<td><a href="' + buildDnaUrl(p, tone) + '" class="dna-btn" target="_blank">\u25C6 DNA</a></td>'
      + '<td><span class="cat-b cat-' + p.category + '">' + p.category.charAt(0) + p.category.slice(1).toLowerCase() + '</span></td>'
      + '<td>' + (p.purity  || '\u2014') + '</td>'
      + '<td>' + toneHtml + '</td>'
      + '<td>' + (p.grossWt || '\u2014') + '</td>'
      + '<td>' + (p.netWt   || '\u2014') + '</td>'
      + '<td>' + (p.diaWgt  || '\u2014') + '</td>'
      + '<td>' + (p.diaPcs  || '\u2014') + '</td>'
      + '<td class="desc-cell">' + escHtml(p.description || '\u2014') + '</td>'
      + '<td>' + statusHtml + '</td>'
      + '<td><a href="https://wa.me/' + WA_NUM + '?text=' + waMsg(p) + '" target="_blank" class="wa-btn">' + waSvg() + ' Price on Request</a></td>'
      + '</tr>';
  }).join('');
}

/* ─────────────────────────────────────────────────
   MOBILE CARDS
───────────────────────────────────────────────── */
function renderCards(data) {
  var s    = sorted(data);
  var wrap = document.getElementById('mobile-cards');

  if (!s.length) { wrap.innerHTML = '<div class="no-res">No products match your filters.</div>'; return; }

  wrap.innerHTML = s.map(function(p) {
    var tone     = p.metalTone || '';
    var tl       = TONE_LABEL[tone] || tone || '\u2014';
    var toneHtml = tone
      ? '<span class="tone-wrap tone-' + tone + '"><span class="tgem"></span>' + tl + '</span>'
      : '\u2014';
    var descHtml = p.description
      ? '<div class="card-desc"><span class="card-desc-label">Description</span>' + escHtml(p.description) + '</div>'
      : '';
    var knownStatus = ['STOCK','HK','HOLD','MEMO'];
    var stCls = (p.status && knownStatus.indexOf(p.status) !== -1)
      ? 'status-' + p.status : 'status-OTHER';
    var statusHtml = p.status
      ? '<span class="status-b ' + stCls + '">' + escHtml(p.status) + '</span>'
      : '';

    return '<div class="prod-card' + (p.status && p.status !== 'STOCK' ? ' non-stock-card' : '') + '">'
      + '<div class="card-top"><span class="card-sku">' + escHtml(p.sku) + '</span>'
      + '<div style="display:flex;gap:.35rem;align-items:center;">'
      + '<span class="cat-b cat-' + p.category + '">' + p.category.charAt(0) + p.category.slice(1).toLowerCase() + '</span>'
      + statusHtml
      + '</div></div>'
      + '<div class="card-grid">'
      + '<div class="card-field"><span class="card-lbl">Purity</span><span class="card-val">' + (p.purity || '\u2014') + '</span></div>'
      + '<div class="card-field"><span class="card-lbl">Metal Tone</span><span class="card-val">' + toneHtml + '</span></div>'
      + '<div class="card-field"><span class="card-lbl">Gross Wt</span><span class="card-val">' + (p.grossWt || '\u2014') + ' g</span></div>'
      + '<div class="card-field"><span class="card-lbl">Net Wt</span><span class="card-val">' + (p.netWt || '\u2014') + ' g</span></div>'
      + '<div class="card-field"><span class="card-lbl">Dia Wgt</span><span class="card-val">' + (p.diaWgt || '\u2014') + ' ct</span></div>'
      + '<div class="card-field"><span class="card-lbl">Dia Pcs</span><span class="card-val">' + (p.diaPcs || '\u2014') + '</span></div>'
      + '</div>'
      + descHtml
      + '<div class="card-actions">'
      + '<a href="' + buildDnaUrl(p, tone) + '" class="card-dna" target="_blank">\u25C6 DNA</a>'
      + '<a href="https://wa.me/' + WA_NUM + '?text=' + waMsg(p) + '" target="_blank" class="card-wa">' + waSvg() + ' Price on Request</a>'
      + '</div></div>';
  }).join('');
}

/* ─────────────────────────────────────────────────
   MODAL
───────────────────────────────────────────────── */
function openModal(type) {
  document.getElementById('modal-title').textContent = type === 'custom' ? 'Bespoke Design Request' : 'Price on Request';
  document.getElementById('modal-sub').textContent   = type === 'custom' ? "Tell us your vision — we'll bring it to life." : "Share your details and we'll send you the price shortly.";
  document.getElementById('sku-grp').style.display   = type === 'custom' ? 'none' : '';
  document.getElementById('modal').classList.add('open');
}
function closeModal()  { document.getElementById('modal').classList.remove('open'); }
function submitModal() { alert('Thank you! We will contact you shortly.'); closeModal(); }

/* ─────────────────────────────────────────────────
   BOOTSTRAP
   ─────────────────────────────────────────────────
   Event wiring happens FIRST — before any data
   loading — so filters/sort work regardless of
   whether data came from storage or a file pick.
───────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', function() {

  /* ── 1. Wire sort headers ── */
  document.querySelectorAll('thead th[data-col]').forEach(function(th) {
    th.addEventListener('click', function() { setSort(th.dataset.col); });
  });

  /* ── 2. Wire filter inputs ── */
  /* fp / ft / fst are now custom multi-select dropdowns — only wire the search box */
  var fsEl = document.getElementById('fs');
  if (fsEl) fsEl.addEventListener('input', applyFilters);

  /* ── 2b. Close multi-select panels on outside click ── */
  document.addEventListener('click', function(e) {
    ['fp', 'ft', 'fst'].forEach(function(id) {
      var wrap = document.getElementById(id + '-wrap');
      if (wrap && !wrap.contains(e.target)) {
        document.getElementById(id + '-panel').classList.remove('open');
        document.getElementById(id + '-btn').classList.remove('open');
      }
    });
  });

  /* ── 3. Wire modal backdrop ── */
  document.getElementById('modal').addEventListener('click', function(e) {
    if (e.target === this) closeModal();
  });

  /* ── 4. Wire SETUP SCREEN file picker ── */
  document.getElementById('setup-file-input').addEventListener('change', function() {
    handleFile(
      this.files[0],
      function(msg, isError) { setSetupStatus(msg, isError); },  /* status updates */
      function(msg)          { setSetupStatus(msg, true);    }   /* errors */
    );
    this.value = '';  /* allow re-selecting same file */
  });

  /* ── 5. Wire UPDATE DATA file picker (in header) ── */
  document.getElementById('update-file-input').addEventListener('change', function() {
    var file = this.files[0];
    this.value = '';  /* reset so same file can be re-picked */
    if (!file) return;

    /* Show brief loading text in header */
    var info = document.getElementById('loaded-info');
    var prev = info ? info.textContent : '';
    if (info) info.textContent = 'Loading…';

    handleFile(
      file,
      null,
      function(msg) {
        if (info) info.textContent = prev;
        alert('Could not read file:\n' + msg);
      }
    );
  });

  /* ── 6. Load data ──
     Try localStorage first. If data is found, show immediately.
     Otherwise show the first-time setup screen. */
  var saved = loadFromStorage();
  if (saved) {
    var dateStr = localStorage.getItem(LS_DATE) || 'previously';
    applyProducts(saved, dateStr);
  } else {
    showSetupScreen();
  }

});
