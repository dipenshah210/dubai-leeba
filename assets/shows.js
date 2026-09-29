/* ==================================================================
   LEEBA - dubai.leeba.co
   Exhibition catalogue for the Watch & Jewellery Middle East Show,
   Expo Centre Sharjah.

   Selling prices are public. Cost, margin and the pricing build-up stay
   encrypted (AES-GCM, key derived from a passcode with PBKDF2-SHA256 in
   the browser) so a customer at the screen never sees them.
================================================================== */
(function () {
"use strict";

var CFG = window.LEEBA_CONFIG || {};
var IMG_BASE  = CFG.IMAGE_BASE || "images/";
var PAGE_SIZE = CFG.PAGE_SIZE || 120;
var SHOW_NAME = CFG.SHOW_NAME || "LEEBA Show";
var TAG       = CFG.EXPORT_TAG || "SHOW";
var KEY       = "leeba.shj.";          // this show's own browser storage

var THUMBS = null;              // optional {file: dataURI} map (preview builds)

/* Live stock. With STOCK.URL set, AVAILABLE / HOLD / SOLD / MEMO OUT lives on
   the server and every device shows the same thing. With it empty the page
   falls back to remembering status in this browser only. */
var STOCK_URL  = (CFG.STOCK && CFG.STOCK.URL) || "";
var STOCK_ON   = !!STOCK_URL;
var POLL_MS    = ((CFG.STOCK && CFG.STOCK.POLL_SECONDS) || 25) * 1000;
var remote     = {};            // SKU -> {s, by, t} straight from the server
var staff      = null;          // {code, who} once unlocked - never in the page source
var online     = true;

var $  = function (s, r) { return (r || document).querySelector(s); };
var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

/* ------------------------------------------------------------- state */
var ALL = [], VIEW = [], shown = 0;
var sel = new Set();
var avail = {};
var cost = null;                // decrypted internal payload, memory only
var activeColl = -1;
var HAS_LOC = false;             // set from the data: true once any piece has a display tray
var OFF_TRAY = "NOT ON DISPLAY";
function trayOf(p) { return p.TRAY || OFF_TRAY; }

/* Every list filter holds a SET, so several values can be on at once:
   RING + BRACELET together, D + I together, and so on. An empty set means
   "no restriction on this field" - which is what the ALL chip switches
   back to. Different fields still AND together. */
function blank() {
  return {
    cats: new Set(), locs: new Set(), tones: new Set(),
    purities: new Set(), shapes: new Set(),
    q: "", avail: "", sort: "sku",
    ctMin: null, ctMax: null, prMin: null, prMax: null, gwMin: null, gwMax: null,
    offer: false
  };
}
var filt = blank();

/* Location is shown to clients as the bare letter only, by design - the full
   Dubai/India/Sharjah meaning is for internal use and never surfaced here. */

/* ----------------------------------------------------------- helpers */
function money(n) {
  if (n === null || n === undefined || isNaN(n)) return "";
  return "$" + Number(n).toLocaleString("en-US", { maximumFractionDigits: 0 });
}
function shortMoney(n) {
  if (n >= 1000) {
    var k = n / 1000;
    return "$" + (k % 1 === 0 ? k : k.toFixed(1)) + "K";
  }
  return "$" + n;
}
function num(n, d) {
  if (n === null || n === undefined || n === "" || isNaN(n)) return "";
  return Number(n).toFixed(d === undefined ? 2 : d);
}
function esc(s) {
  return String(s === null || s === undefined ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
/* Supplier photos arrive with spaces and brackets in the name ("DJ - 223 (2).jpeg"),
   so the file name is escaped before it goes into a URL. */
function srcFor(file) {
  if (THUMBS && THUMBS[file]) return THUMBS[file];
  return IMG_BASE + encodeURIComponent(file);
}
function imgs(p) {
  return p.IMAGES_ALL ? p.IMAGES_ALL.split(",").map(function (s) { return s.trim(); })
                      : (p.IMAGE ? [p.IMAGE] : []);
}
/* sellOf is the price a client pays today: the SALE / PROMO price when the piece
   has one, otherwise the normal selling price. wasOf is the normal price, only
   for pieces on offer - it is what gets crossed out. */
function sellOf(p) {
  if (p.SALE_PRICE_USD) return p.SALE_PRICE_USD;
  return p.SELLING_PRICE_USD === undefined ? null : p.SELLING_PRICE_USD;
}
function wasOf(p) { return p.SALE_PRICE_USD ? p.SELLING_PRICE_USD : null; }
function offerOf(p) { return p.SALE_PRICE_USD ? (p.SALE_TYPE || "SALE") : ""; }
/* Prices are shown in dirhams, with dollars small alongside. The catalogue is priced
   in USD; AED is the fixed peg. Filters, collections and totals all work in AED. */
var RATE = CFG.AED_PER_USD || 3.6725;
function aedOf(p) { var u = sellOf(p); return u ? Math.round(u * RATE) : null; }
function wasAED(p) { var u = wasOf(p); return u ? Math.round(u * RATE) : null; }
function aed(n) {
  if (n === null || n === undefined || isNaN(n)) return "";
  return "AED " + Number(n).toLocaleString("en-US", { maximumFractionDigits: 0 });
}
function kAED(n) { return n >= 1000 ? (n / 1000) + "K" : String(n); }
function costOf(p) { return cost && cost[p.SKU] ? cost[p.SKU] : null; }
/* What this piece's status is right now. A change made here that the server has
   not confirmed yet wins, so the button responds instantly; then the server's
   answer; then whatever the stock list was built with. */
function availOf(p) {
  if (STOCK_ON) {
    var pend = pendingOf(p.SKU);
    if (pend) return pend;
    if (remote[p.SKU] && remote[p.SKU].s) return remote[p.SKU].s;
    return p.AVAILABILITY || "AVAILABLE";
  }
  return avail[p.SKU] || p.AVAILABILITY || "AVAILABLE";
}
function canEdit() { return STOCK_ON ? !!staff : true; }
/* who last changed it, for the line under the buttons in the detail view */
function stampOf(sku) {
  var r = remote[sku];
  if (!r || !r.t) return "";
  var d = new Date(r.t);
  return (r.by ? r.by + " · " : "") +
    d.toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}
function shapesOf(p) {
  return (p.SHAPES || "").split(",").map(function (s) { return s.trim(); }).filter(Boolean);
}
// Full diamond detail exists even when the source cost lines never carried a
// piece count (Dubai priced those by weight, not by pcs) - fall back to the
// number of stone-group lines so pieces is never blank when detail exists.
function pcsOf(p) {
  if (p.TOTAL_PCS) return p.TOTAL_PCS;
  var d = p.DIAMONDS || [];
  if (!d.length) return null;
  var brk = d.filter(function (x) { return x.DETAIL_SET === "STONE BREAKDOWN"; });
  var use = brk.length ? brk : d;
  var n = use.reduce(function (t, x) { return t + (x.PCS || 0); }, 0);
  return n || use.length || null;
}

function loadAvail() {
  try { avail = JSON.parse(localStorage.getItem(KEY + "avail") || "{}"); } catch (e) { avail = {}; }
}
function saveAvail() {
  try { localStorage.setItem(KEY + "avail", JSON.stringify(avail)); } catch (e) {}
}

/* ------------------------------------------------------- live stock sync */
/* Everything a staff member does goes into an ordered outbox first - a status
   change, a sale, a cancelled sale - so the screen responds at once and nothing
   is lost if the hall wifi drops. The outbox is sent in order. Two different
   failures are kept apart: no connection (keep it, try again) and the server
   saying no - "already sold by Karan", say - which is shown to the person and
   not retried. */
var outbox = [];                 // [{t:"status"|"sale"|"cancel", ...}]
var refused = [];                // what the server turned down, kept until seen
var sales = [];                  // staff only, memory only - never stored on the device
var salesAt = 0;

function loadOutbox() {
  try { outbox = JSON.parse(localStorage.getItem(KEY + "outbox") || "[]"); } catch (e) { outbox = []; }
  try { refused = JSON.parse(localStorage.getItem(KEY + "refused") || "[]"); } catch (e) { refused = []; }
  // the earlier build kept a plain {sku: status} queue - carry anything in it over
  try {
    var old = JSON.parse(localStorage.getItem(KEY + "queue") || "{}");
    Object.keys(old).forEach(function (k) {
      if (old[k] !== "SOLD") outbox.push({ t: "status", sku: k, status: old[k] });
    });
    localStorage.removeItem(KEY + "queue");
  } catch (e) {}
}
function saveOutbox() {
  try {
    localStorage.setItem(KEY + "outbox", JSON.stringify(outbox));
    localStorage.setItem(KEY + "refused", JSON.stringify(refused));
  } catch (e) {}
}
/* the status this device is waiting to send for a piece, if any */
function pendingOf(sku) {
  var st = null;
  outbox.forEach(function (o) {
    var k = o.t === "sale" ? o.sale.sku : o.sku;
    if (k !== sku) return;
    st = o.t === "sale" ? "SOLD" : o.t === "cancel" ? "AVAILABLE" : o.status;
  });
  return st;
}
function loadStaff() {
  var raw = null;
  try { raw = localStorage.getItem(KEY + "staff") || sessionStorage.getItem(KEY + "staff"); } catch (e) {}
  if (raw) { try { staff = JSON.parse(raw); } catch (e) { staff = null; } }
}
function saveStaff(keep) {
  try {
    var raw = JSON.stringify(staff);
    (keep ? localStorage : sessionStorage).setItem(KEY + "staff", raw);
  } catch (e) {}
}
function clearStaff() {
  staff = null;
  sales = []; salesAt = 0;
  try { localStorage.removeItem(KEY + "staff"); sessionStorage.removeItem(KEY + "staff"); } catch (e) {}
  staffButtons();
}
/* This device has been signed out - someone used the same code on another device,
   or the code was removed. Anything not yet sent stays here and goes out if the
   same person signs in again on this device. */
function kicked(why) {
  if (!staff) return;
  var who = staff.who;
  clearStaff();
  $("#salesPanel").hidden = true; $("#sale").hidden = true;
  if (detailSku && !$("#detail").hidden) openDetail(detailSku);
  syncPill();
  window.alert(why === "signed in elsewhere"
    ? "Signed out: the code for " + who + " was just used on another device.\n\nEach code works on one device at a time."
    : "Signed out: this staff code is no longer valid.");
}
function staffButtons() {
  $("#staffBtn").hidden = !STOCK_ON || !!staff;
  $("#salesBtn").hidden = !STOCK_ON || !staff;
}

function syncPill() {
  var el = $("#syncPill");
  if (!STOCK_ON) { el.hidden = true; return; }
  el.hidden = false;
  var n = outbox.length;
  if (!online || n) {
    el.className = "sync is-off";
    el.textContent = n ? "SAVING " + n : "OFFLINE";
  } else if (staff) {
    el.className = "sync is-live";
    el.textContent = "LIVE · " + (staff.who || "STAFF").split(" ")[0];
  } else {
    el.className = "sync";
    el.textContent = "LIVE";
  }
  var b = $("#salesBtn b");
  if (b) { b.textContent = refused.length || ""; b.hidden = !refused.length; }
}

/* Repaint only the pieces whose status actually moved, so someone else's change
   appearing does not throw away your scroll position. */
function mergeRemote(next) {
  var changed = [];
  next = next || {};
  ALL.forEach(function (p) {
    var was = (remote[p.SKU] && remote[p.SKU].s) || p.AVAILABILITY || "AVAILABLE";
    var now = (next[p.SKU] && next[p.SKU].s) || p.AVAILABILITY || "AVAILABLE";
    if (was !== now) changed.push(p.SKU);
  });
  remote = next;
  changed.forEach(refreshCard);
  if (changed.length && filt.avail) apply();
  else if (changed.length) stats();
  if (detailSku && !$("#detail").hidden && changed.indexOf(detailSku) !== -1) openDetail(detailSku);
  if (changed.length && !$("#salesPanel").hidden) renderSales();
  syncPill();
}

function pollStock() {
  if (!STOCK_ON) return Promise.resolve();
  return fetch(STOCK_URL + "?action=status&t=" + Date.now())
    .then(function (r) { return r.json(); })
    .then(function (j) {
      if (!j || !j.ok) throw new Error("bad reply");
      online = true;
      mergeRemote(j.stock);
      if (outbox.length) return flushOutbox();
    })
    .then(function () { if (staff) return loadSales(); })
    .catch(function () { online = false; syncPill(); });
}

function loadSales() {
  if (!STOCK_ON || !staff) return Promise.resolve();
  return fetch(STOCK_URL + "?action=sales&code=" + encodeURIComponent(staff.code) +
               "&token=" + encodeURIComponent(staff.token || "") + "&t=" + Date.now())
    .then(function (r) { return r.json(); })
    .then(function (j) {
      if (!j) return;
      if (!j.ok) { if (j.error === "bad code" || j.error === "signed in elsewhere") kicked(j.error); return; }
      sales = j.sales || []; salesAt = j.at || Date.now();
      if (!$("#salesPanel").hidden) renderSales();
      if (detailSku && !$("#detail").hidden) openDetail(detailSku);
    })
    .catch(function () {});
}

/* One request. Resolves {ok} | {ok:false, net:true} (no connection - keep it)
   | {ok:false, error} (the server said no - do not retry). The body is plain
   text on purpose: that keeps it a "simple" request, so the browser sends it
   straight to Apps Script without an OPTIONS call Apps Script cannot answer. */
function send(payload) {
  payload.code = staff ? staff.code : "";
  payload.token = staff ? staff.token : "";
  return fetch(STOCK_URL, { method: "POST", body: JSON.stringify(payload) })
    .then(function (r) { return r.json(); })
    .then(function (j) {
      online = true;
      if (j && j.stock) mergeRemote(j.stock);
      if (!j || !j.ok) {
        if (j && (j.error === "bad code" || j.error === "signed in elsewhere")) { kicked(j.error); return { ok: false, net: true }; }
        return { ok: false, error: (j && j.error) || "refused", soldBy: j && j.soldBy };
      }
      return { ok: true };
    })
    .catch(function () { online = false; syncPill(); return { ok: false, net: true }; });
}

var flushing = null;
function flushOutbox() {
  if (flushing) return flushing;
  if (!outbox.length || !staff) return Promise.resolve();
  flushing = (function next() {
    if (!outbox.length) return Promise.resolve();
    var o = outbox[0];
    var payload = o.t === "sale" ? { sale: o.sale }
                : o.t === "cancel" ? { cancel: { sku: o.sku, reason: o.reason || "" } }
                : { changes: [{ sku: o.sku, status: o.status }] };
    return send(payload).then(function (res) {
      if (res.net) return;                             // still offline: stop, keep the rest
      outbox.shift();
      if (!res.ok) {
        var sku = o.t === "sale" ? o.sale.sku : o.sku;
        var what = o.t === "sale" ? "Sale of " + sku + " to " + o.sale.client
                 : o.t === "cancel" ? "Cancelling the sale of " + sku : sku + " → " + o.status;
        var why = res.error === "already sold" ? "already sold" + (res.soldBy ? " by " + res.soldBy : "") : res.error;
        refused.push({ what: what, why: why, at: Date.now() });
        toast(what + " NOT saved: " + why);
        refreshCard(sku);
      } else {
        var k = o.t === "sale" ? o.sale.sku : o.sku;
        toast(o.t === "sale" ? k + " sold to " + o.sale.client
            : o.t === "cancel" ? "Sale of " + k + " cancelled" : k + " - " + o.status);
      }
      saveOutbox(); syncPill();
      return next();
    });
  })().then(function () {
    flushing = null;
    saveOutbox(); syncPill();
    if (detailSku && !$("#detail").hidden) openDetail(detailSku);
    return loadSales();
  });
  return flushing;
}

function queueOp(op) {
  outbox.push(op); saveOutbox();
  var sku = op.t === "sale" ? op.sale.sku : op.sku;
  refreshCard(sku);
  if (filt.avail) apply(); else stats();
  syncPill();
  if (!$("#salesPanel").hidden) renderSales();
  flushOutbox();
}

/* Plain status changes: AVAILABLE / HOLD / MEMO OUT. SOLD never comes through
   here with a backend - it is always a sale. */
function setStatus(sku, status) {
  if (!STOCK_ON) {                       // no backend configured: this device only
    avail[sku] = status; saveAvail();
    refreshCard(sku);
    if (filt.avail) apply();
    toast(sku + " - " + status);
    return;
  }
  if (!staff) { openStaff(); return; }
  queueOp({ t: "status", sku: sku, status: status });
}

/* the live sale behind a SOLD piece, if this device knows it */
function saleOf(sku) {
  for (var i = outbox.length - 1; i >= 0; i--) {
    if (outbox[i].t === "sale" && outbox[i].sale.sku === sku) return Object.assign({ pending: true }, outbox[i].sale);
  }
  for (var j = sales.length - 1; j >= 0; j--) {
    if (sales[j].sku === sku && sales[j].status === "ACTIVE") return sales[j];
  }
  return null;
}
function dubaiToday() {
  try { return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Dubai" }); }
  catch (e) { return new Date().toISOString().slice(0, 10); }
}
function prettyDay(d) {
  if (!d) return "";
  var t = new Date(d + "T12:00:00Z");
  return t.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
}
function curMoney(n, cur) {
  if (n === null || n === undefined || isNaN(n)) return "";
  var v = Number(n).toLocaleString("en-US", { maximumFractionDigits: 0 });
  return cur === "AED" ? "AED " + v : "$" + v;
}

var toastT;
function toast(msg) {
  var t = $("#toast");
  t.textContent = msg; t.hidden = false;
  clearTimeout(toastT);
  toastT = setTimeout(function () { t.hidden = true; }, 1800);
}

/* ============================================================== BOOT */
function boot() {
  loadAvail();
  loadOutbox();
  loadStaff();
  staffButtons();
  syncPill();

  var logo = $("#logo");
  if (CFG.LOGO) {
    logo.onload = function () { logo.hidden = false; $("#brandText").hidden = true; };
    logo.onerror = function () { logo.hidden = true; $("#brandText").hidden = false; };
    logo.src = CFG.LOGO;
  }
  if (CFG.SHOW_STRAP) $("#brandSub").innerHTML = CFG.SHOW_STRAP;

  if (CFG.THUMBS) {
    fetch(CFG.THUMBS).then(function (r) { return r.json(); })
      .then(function (m) { THUMBS = m; if (ALL.length) apply(); }).catch(function () {});
  }

  /* The offline build ships the catalogue as a plain script that sets
     window.LEEBA_CATALOG, because a page opened straight off a disk is not
     allowed to fetch its own data files. Hosted, it is fetched as normal. */
  (window.LEEBA_CATALOG
      ? Promise.resolve(window.LEEBA_CATALOG)
      : fetch(CFG.CATALOG || "data/catalog.json", { cache: "no-cache" })
          .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }))
    .then(function (j) {
      ALL = j.products || [];
      buildFilters();
      buildCollections();
      apply();
      if (STOCK_ON) {
        pollStock();
        setInterval(pollStock, POLL_MS);
        // coming back to the page after it was in the background: catch up at once
        document.addEventListener("visibilitychange", function () {
          if (!document.hidden) pollStock();
        });
        window.addEventListener("online", pollStock);
      }
    })
    .catch(function (e) {
      $("#grid").innerHTML = '<div class="empty">Could not load the catalogue (' + esc(e.message) +
        '). This site must be served over http(s), not opened as a file.</div>';
    });

  wire();
}

/* --------------------------------------------------- filter controls */
/* Each group is registered once and then kept in step with its Set, so the
   header row and the filter panel can show the same filter twice without
   either going stale. */
var GROUPS = [];

function chipsHTML(items, attr, showCount) {
  return '<button class="chip" data-' + attr + '="">ALL</button>' +
    items.map(function (it) {
      return '<button class="chip" data-' + attr + '="' + esc(it.value) + '">' + esc(it.label) +
        (showCount ? ' <b>' + it.n + '</b>' : "") + '</button>';
    }).join("");
}

function registerGroup(rootSel, attr, key) {
  var root = $(rootSel);
  if (!root) return;
  GROUPS.push({ root: root, attr: attr, key: key });
  root.addEventListener("click", function (e) {
    var b = e.target.closest(".chip"); if (!b) return;
    var v = b.dataset[attr];
    var s = filt[key];
    if (v === "") s.clear();
    else if (s.has(v)) s.delete(v);
    else s.add(v);
    activeColl = -1;
    syncChips(); apply();
  });
}

function syncChips() {
  GROUPS.forEach(function (g) {
    var s = filt[g.key];
    $$(".chip", g.root).forEach(function (c) {
      var v = c.dataset[g.attr];
      c.classList.toggle("is-on", v === "" ? s.size === 0 : s.has(v));
    });
  });
  $$("#availChips .chip").forEach(function (c) {
    c.classList.toggle("is-on", (c.dataset.avail || "") === filt.avail);
  });
  syncPriceBands();
  syncColl();
}

function tally(fn) {
  var m = {};
  ALL.forEach(function (p) {
    var v = fn(p);
    (Array.isArray(v) ? v : [v]).forEach(function (x) {
      if (x === null || x === undefined || x === "") return;
      x = String(x);
      m[x] = (m[x] || 0) + 1;
    });
  });
  return m;
}
function items(map, sorter) {
  return Object.keys(map).sort(sorter).map(function (k) {
    return { value: k, label: k, n: map[k] };
  });
}

function buildFilters() {
  var cats     = tally(function (p) { return p.CATEGORY; });
  // Display trays: which tray at the stand a piece sits in. Filterable in the
  // FILTERS panel, searchable by name, badged on the card and in the detail.
  var locs     = tally(trayOf);
  HAS_LOC = ALL.some(function (p) { return p.TRAY; });
  $("#locChips").hidden = true;
  $("#fLoc").closest(".f").hidden = !HAS_LOC;
  var tones    = tally(function (p) { return p.METAL_COLOR; });
  var purities = tally(function (p) { return p.METAL_KT; });
  var shapes   = tally(shapesOf);

  var catItems   = items(cats);
  var locItems   = items(locs, function (a, b) {
    return (a === OFF_TRAY) - (b === OFF_TRAY) || (a < b ? -1 : a > b ? 1 : 0);
  });
  var toneItems  = items(tones);
  var shapeItems = items(shapes).sort(function (a, b) { return b.n - a.n; });
  var purItems   = items(purities, function (a, b) { return b - a; }).map(function (it) {
    return { value: it.value, label: it.value + "K", n: it.n };
  });

  $("#catChips").innerHTML = chipsHTML(catItems, "cat", true);
  $("#locChips").innerHTML =
    '<button class="chip" data-loc="">ALL <b>' + ALL.length + '</b></button>' +
    locItems.map(function (it) {
      return '<button class="chip" data-loc="' + esc(it.value) + '">' + esc(it.label) +
             ' <b>' + it.n + '</b></button>';
    }).join("");

  $("#fCat").innerHTML    = chipsHTML(catItems, "cat", true);
  $("#fLoc").innerHTML    = chipsHTML(locItems, "loc", true);
  $("#fTone").innerHTML   = chipsHTML(toneItems, "tone", true);
  $("#fPurity").innerHTML = chipsHTML(purItems, "purity", true);
  $("#fShape").innerHTML  = chipsHTML(shapeItems, "shape", true);

  registerGroup("#catChips", "cat",    "cats");
  registerGroup("#fCat",     "cat",    "cats");
  registerGroup("#locChips", "loc",    "locs");
  registerGroup("#fLoc",     "loc",    "locs");
  registerGroup("#fTone",    "tone",   "tones");
  registerGroup("#fPurity",  "purity", "purities");
  registerGroup("#fShape",   "shape",  "shapes");

  buildPriceBands();
  syncChips();
}

/* price shortcut chips, built to sit sensibly inside the real price range */
var BANDS = [];
function buildPriceBands() {
  var prices = ALL.map(aedOf).filter(function (v) { return v !== null && !isNaN(v); });
  if (!prices.length) return;
  var max = Math.max.apply(null, prices);
  var steps = [2000, 5000, 10000, 20000, 50000, 100000, 200000];
  BANDS = [];
  var prev = null;
  steps.forEach(function (s) {
    if (prev !== null && prev >= max) return;
    BANDS.push({ min: prev, max: s, label: prev === null ? "under AED " + kAED(s)
                                                         : "AED " + kAED(prev) + "-" + kAED(s) });
    prev = s;
  });
  if (prev !== null && max > prev) BANDS.push({ min: prev, max: null, label: "AED " + kAED(prev) + "+" });

  $("#fPrice").innerHTML = BANDS.map(function (b, i) {
    var n = ALL.filter(function (p) {
      var v = aedOf(p);
      return v !== null && (b.min === null || v >= b.min) && (b.max === null || v < b.max);
    }).length;
    return '<button class="chip" data-band="' + i + '">' + esc(b.label) + ' <b>' + n + '</b></button>';
  }).join("");

  $("#fPrice").addEventListener("click", function (e) {
    var b = e.target.closest(".chip"); if (!b) return;
    var band = BANDS[+b.dataset.band];
    var on = filt.prMin === band.min && filt.prMax === band.max;
    filt.prMin = on ? null : band.min;
    filt.prMax = on ? null : band.max;
    $("#prMin").value = filt.prMin === null ? "" : filt.prMin;
    $("#prMax").value = filt.prMax === null ? "" : filt.prMax;
    activeColl = -1;
    syncChips(); apply();
  });
}
function syncPriceBands() {
  $$("#fPrice .chip").forEach(function (c) {
    var b = BANDS[+c.dataset.band];
    c.classList.toggle("is-on", !!b && filt.prMin === b.min && filt.prMax === b.max);
  });
}

/* ------------------------------------------------------- collections */
var COLL = [];
function buildCollections() {
  var defs = CFG.COLLECTIONS || [];
  COLL = defs.map(function (d) {
    var n = ALL.filter(function (p) { return matchesColl(p, d); }).length;
    return { def: d, n: n };
  }).filter(function (c) { return c.n > 0; });   // a collection with nothing in it is not shown

  if (!COLL.length) { $("#collBar").hidden = true; return; }
  $("#collBar").hidden = false;
  $("#collScroll").innerHTML = COLL.map(function (c, i) {
    return '<button class="coll" data-coll="' + i + '">' + esc(c.def.label) +
           ' <b>' + c.n + '</b></button>';
  }).join("");

  wireCollScroll();
  $("#collScroll").addEventListener("click", function (e) {
    var b = e.target.closest(".coll"); if (!b) return;
    var i = +b.dataset.coll;
    if (activeColl === i) { clearAll(); return; }
    var d = COLL[i].def;
    // offer / tray collections keep the categories already picked; budget ones start clean
    var keep = (d.sale || d.tray) && !d.cat ? new Set(filt.cats) : null;
    filt = blank();
    if (keep) filt.cats = keep;
    if (d.cat) filt.cats.add(d.cat);
    if (d.tray) filt.locs.add(d.tray);
    if (d.sale) filt.offer = true;
    if (d.min !== undefined) filt.prMin = d.min;
    if (d.max !== undefined) filt.prMax = d.max;
    syncInputs();
    activeColl = i;
    syncChips(); apply();
    $("#side").classList.remove("is-open");
  });
}
function matchesColl(p, d) {
  var v = aedOf(p);
  if (d.cat && p.CATEGORY !== d.cat) return false;
  if (d.tray && p.TRAY !== d.tray) return false;
  if (d.sale && !offerOf(p)) return false;
  if (d.min !== undefined && !(v >= d.min)) return false;
  if (d.max !== undefined && !(v <= d.max)) return false;
  return true;
}
function syncColl() {
  // With categories picked, only those categories' collections show (plus the
  // one in use); with ALL, every collection shows.
  var any = 0;
  $$("#collScroll .coll").forEach(function (c) {
    var i = +c.dataset.coll, d = COLL[i].def;
    var show = i === activeColl || !filt.cats.size || (d.cat ? filt.cats.has(d.cat) : !!(d.sale || d.tray));
    c.hidden = !show;
    if (show) any++;
    c.classList.toggle("is-on", i === activeColl);
  });
  if (COLL.length) $("#collBar").hidden = !any;
  collArrows();
}
function collArrows() {
  var s = $("#collScroll"), l = $("#collL"), r = $("#collR");
  if (!s || !l) return;
  var max = s.scrollWidth - s.clientWidth;
  l.hidden = s.scrollLeft <= 2;
  r.hidden = s.scrollLeft >= max - 2;
}
function wireCollScroll() {
  var s = $("#collScroll");
  // desktop mice scroll vertically - turn that into sideways movement here
  s.addEventListener("wheel", function (e) {
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX) && s.scrollWidth > s.clientWidth) {
      s.scrollLeft += e.deltaY; e.preventDefault();
    }
  }, { passive: false });
  s.addEventListener("scroll", collArrows, { passive: true });
  window.addEventListener("resize", collArrows);
  window.addEventListener("load", collArrows);
  setTimeout(collArrows, 60); setTimeout(collArrows, 600);
  $("#collL").addEventListener("click", function () { s.scrollBy({ left: -s.clientWidth * 0.8, behavior: "smooth" }); });
  $("#collR").addEventListener("click", function () { s.scrollBy({ left:  s.clientWidth * 0.8, behavior: "smooth" }); });
}

/* --------------------------------------------------------- active bar */
function activeCount() {
  var n = filt.cats.size + filt.locs.size + filt.tones.size + filt.purities.size + filt.shapes.size;
  if (filt.q) n++;
  if (filt.avail) n++;
  if (filt.offer) n++;
  ["ctMin", "ctMax", "prMin", "prMax", "gwMin", "gwMax"].forEach(function (k) {
    if (filt[k] !== null) n++;
  });
  return n;
}

function activeBar() {
  var bits = [];
  function push(kind, val, label) {
    bits.push('<button class="apill" data-kind="' + kind + '" data-val="' + esc(val) + '">' +
              esc(label) + ' <span>&times;</span></button>');
  }
  filt.cats.forEach(function (v) { push("cats", v, v); });
  filt.locs.forEach(function (v) { push("locs", v, v); });
  filt.tones.forEach(function (v) { push("tones", v, v); });
  filt.purities.forEach(function (v) { push("purities", v, v + "K"); });
  filt.shapes.forEach(function (v) { push("shapes", v, v); });
  if (filt.prMin !== null || filt.prMax !== null) {
    push("price", "", (filt.prMin !== null ? aed(filt.prMin) : "AED 0") + " - " +
                      (filt.prMax !== null ? aed(filt.prMax) : "any"));
  }
  if (filt.ctMin !== null || filt.ctMax !== null) {
    push("ct", "", (filt.ctMin !== null ? filt.ctMin : 0) + " - " +
                   (filt.ctMax !== null ? filt.ctMax : "any") + " ct");
  }
  if (filt.gwMin !== null || filt.gwMax !== null) {
    push("gw", "", (filt.gwMin !== null ? filt.gwMin : 0) + " - " +
                   (filt.gwMax !== null ? filt.gwMax : "any") + " gm");
  }
  if (filt.avail) push("avail", "", filt.avail);
  if (filt.offer) push("offer", "", "ON SALE");
  if (filt.q) push("q", "", '"' + filt.q + '"');

  var bar = $("#activeBar");
  if (!bits.length) { bar.hidden = true; bar.innerHTML = ""; return; }
  bar.hidden = false;
  bar.innerHTML = bits.join("") + '<button class="apill apill-clear" data-kind="all">CLEAR ALL</button>';
}

function clearAll() {
  filt = blank();
  activeColl = -1;
  syncInputs();
  syncChips();
  apply();
}
function syncInputs() {
  $("#q").value = filt.q;
  $("#qClear").hidden = !filt.q;
  [["#ctMin", "ctMin"], ["#ctMax", "ctMax"], ["#prMin", "prMin"],
   ["#prMax", "prMax"], ["#gwMin", "gwMin"], ["#gwMax", "gwMax"]].forEach(function (pr) {
    $(pr[0]).value = filt[pr[1]] === null ? "" : filt[pr[1]];
  });
  $("#sort").value = filt.sort;
}

/* ---------------------------------------------------- filter + sort */
function apply() {
  var q = filt.q.toLowerCase().trim();

  VIEW = ALL.filter(function (p) {
    if (filt.locs.size && !filt.locs.has(trayOf(p))) return false;
    if (filt.cats.size && !filt.cats.has(p.CATEGORY)) return false;
    if (filt.tones.size && !filt.tones.has(p.METAL_COLOR)) return false;
    if (filt.purities.size && !filt.purities.has(String(p.METAL_KT))) return false;
    if (filt.shapes.size) {
      var sh = shapesOf(p), hit = false;
      for (var i = 0; i < sh.length; i++) if (filt.shapes.has(sh[i])) { hit = true; break; }
      if (!hit) return false;
    }
    if (filt.avail && availOf(p) !== filt.avail) return false;
    if (filt.offer && !offerOf(p)) return false;
    if (filt.ctMin !== null && !(p.TOTAL_CT >= filt.ctMin)) return false;
    if (filt.ctMax !== null && !(p.TOTAL_CT <= filt.ctMax)) return false;
    if (filt.gwMin !== null && !(p.GROSS_WT_GM >= filt.gwMin)) return false;
    if (filt.gwMax !== null && !(p.GROSS_WT_GM <= filt.gwMax)) return false;
    if (filt.prMin !== null && !(aedOf(p) >= filt.prMin)) return false;
    if (filt.prMax !== null && !(aedOf(p) <= filt.prMax)) return false;
    if (q) {
      var hay = [p.SKU, p.TRAY, p.DESCRIPTION, p.CATEGORY, p.SHAPES, p.CENTER_SHAPE, p.QUALITY,
                 p.METAL_RAW, p.CERT, p.CENTER_CERT].join(" ").toLowerCase();
      if (hay.indexOf(q) === -1) return false;
    }
    return true;
  });

  var s = filt.sort;
  VIEW.sort(function (a, b) {
    if (s === "ct-desc")    return (b.TOTAL_CT || 0) - (a.TOTAL_CT || 0);
    if (s === "ct-asc")     return (a.TOTAL_CT || 0) - (b.TOTAL_CT || 0);
    if (s === "price-desc") return (sellOf(b) || 0) - (sellOf(a) || 0);
    if (s === "price-asc")  return (sellOf(a) || 0) - (sellOf(b) || 0);
    if (s === "cat")        return (a.CATEGORY || "").localeCompare(b.CATEGORY || "") ||
                                   a.SKU.localeCompare(b.SKU);
    return a.SKU.localeCompare(b.SKU);
  });

  shown = 0;
  $("#grid").innerHTML = "";
  $("#main").scrollTop = 0;
  renderMore();
  stats();
  activeBar();

  var n = activeCount(), fb = $("#filtN");
  fb.textContent = n; fb.hidden = n === 0;
  $("#sideN").textContent = VIEW.length;
}

function stats() {
  var ct = 0, val = 0;
  VIEW.forEach(function (p) { ct += p.TOTAL_CT || 0; val += aedOf(p) || 0; });
  $("#stats").innerHTML =
    "<b>" + VIEW.length + "</b> " + (VIEW.length === 1 ? "PIECE" : "PIECES") +
    " &nbsp;&middot;&nbsp; <b>" + ct.toFixed(2) + "</b> CT" +
    " &nbsp;&middot;&nbsp; <span class='gold'><b>" + aed(val) + "</b></span>";
  $("#empty").hidden = VIEW.length > 0;
}

/* ---------------------------------------------------------- rendering */
function specCell(label, value) {
  var v = (value === "" || value === null || value === undefined) ? "&mdash;" : value;
  return "<div><span>" + label + "</span><b>" + v + "</b></div>";
}

function cardHTML(p) {
  var im = imgs(p)[0];
  var st = availOf(p);
  var sv = sellOf(p);
  var c = costOf(p);

  return '<article class="card' + (sel.has(p.SKU) ? " is-sel" : "") +
    (st !== "AVAILABLE" ? " row-" + esc(st.replace(/\s/g, "")) : "") +
    '" data-sku="' + esc(p.SKU) + '">' +
    '<div class="card-img">' +
      (im ? '<img loading="lazy" decoding="async" src="' + esc(srcFor(im)) + '" alt="' + esc(p.SKU) + '">'
          : '<span class="noimg">NO PHOTO</span>') +
      (p.TRAY && offerOf(p) !== "PROMO" ? '<span class="card-loc loc-tray" title="' + esc(p.TRAY) + '">' + esc(p.TRAY) + '</span>' : "") +
      (offerOf(p) ? '<span class="card-offer off-' + esc(offerOf(p)) + (p.TRAY && offerOf(p) !== "PROMO" ? " below" : "") + '">' + esc(offerOf(p)) + '</span>' : "") +
      (st !== "AVAILABLE" ? '<span class="status st-' + esc(st.replace(/\s/g, "")) + '">' + esc(st) + '</span>' : "") +
    '</div>' +
    '<button class="card-pick" data-pick="1" title="Select">&#10003;</button>' +
    '<div class="card-body">' +
      '<div class="card-head">' +
        '<div class="card-top"><span class="card-sku">' + esc(p.SKU) + '</span>' +
          (st !== "AVAILABLE" ? '<span class="stchip st-' + esc(st.replace(/\s/g, "")) + '">' +
            esc(st) + '</span>' : "") +
          '<span class="card-cat">' + esc(p.CATEGORY) + '</span></div>' +
        '<span class="card-desc">' + esc(p.DESCRIPTION || "") + '</span>' +
      '</div>' +
      '<div class="specs">' +
        specCell("CARAT", num(p.TOTAL_CT)) +
        specCell("PCS", pcsOf(p) || "") +
        specCell("PURITY", p.METAL_KT ? p.METAL_KT + "K" : "") +
        specCell("GW gm", num(p.GROSS_WT_GM, 2)) +
        specCell("NW gm", num(p.NET_GOLD_WT_GM, 2)) +
        specCell("TONE", p.METAL_COLOR || "") +
      '</div>' +
      '<div class="card-price">' +
        '<span class="amt">' + (sv ? (wasOf(p) ? '<s class="was">' + aed(wasAED(p)) + '</s>' : "") +
                                     aed(aedOf(p)) + ' <small class="usd">' + money(sv) + '</small>'
                                   : '<em class="por">PRICE ON REQUEST</em>') + '</span>' +
        (p.SELL_PER_CT_USD ? '<span class="perct">' + aed(Math.round(p.SELL_PER_CT_USD * RATE)) + '/CT</span>' : "") +
      '</div>' +
      (c ? '<div class="card-cost">COST ' + money(c.cost) +
           (c.markup ? ' &middot; ' + Number(c.markup).toFixed(2) + 'x' : "") + '</div>' : "") +
    '</div></article>';
}

function renderMore() {
  var slice = VIEW.slice(shown, shown + PAGE_SIZE);
  var frag = document.createElement("div");
  frag.innerHTML = slice.map(cardHTML).join("");
  var g = $("#grid");
  while (frag.firstChild) g.appendChild(frag.firstChild);
  shown += slice.length;
  $("#more").hidden = shown >= VIEW.length;
}

function refreshCard(sku) {
  var p = ALL.find(function (x) { return x.SKU === sku; });
  var el = $('.card[data-sku="' + (window.CSS && CSS.escape ? CSS.escape(sku) : sku) + '"]');
  if (!p || !el) return;
  var tmp = document.createElement("div");
  tmp.innerHTML = cardHTML(p);
  el.replaceWith(tmp.firstChild);
}

/* ------------------------------------------------------------ detail */
var detailSku = null;

function openDetail(sku) {
  var p = ALL.find(function (x) { return x.SKU === sku; });
  if (!p) return;
  detailSku = sku;
  var list = imgs(p);

  $("#dSku").textContent = p.SKU;
  var loc = $("#dLoc");
  loc.hidden = !p.TRAY;
  loc.textContent = p.TRAY || "";
  loc.className = "badge loc-tray";
  $("#dCat").textContent = p.CATEGORY || "";
  $("#dDesc").textContent = p.DESCRIPTION || "";

  var big = $("#dImg");
  if (list.length) { big.src = srcFor(list[0]); big.hidden = false; } else { big.hidden = true; }
  $("#dThumbs").innerHTML = list.length > 1 ? list.map(function (f, i) {
    return '<img src="' + esc(srcFor(f)) + '" data-full="' + esc(srcFor(f)) + '"' +
           (i === 0 ? ' class="is-on"' : "") + ' alt="">';
  }).join("") : "";

  // price band - dirhams first, dollars small alongside
  var band = [];
  var off = offerOf(p);
  band.push('<div class="big"><span>' + (off ? off + " PRICE" : "SELLING PRICE") + '</span><b>' +
            (sellOf(p) ? aed(aedOf(p)) : "ON REQUEST") + '</b>' +
            (sellOf(p) ? '<em class="usd">' + money(sellOf(p)) + '</em>' : "") + '</div>');
  if (off) band.push('<div class="d-offer"><span>NORMAL PRICE</span><b><s>' + aed(wasAED(p)) + '</s></b></div>');
  if (p.SELL_PER_CT_USD) band.push('<div><span>PER CARAT</span><b>' +
            aed(Math.round(p.SELL_PER_CT_USD * RATE)) + '</b></div>');
  var pb = $("#dPrice");
  pb.innerHTML = band.join("");
  pb.className = "d-price";

  // One consolidated spec grid - no fact appears more than once anywhere on the
  // page: category/location already sit in the bar above, price already sits in
  // the price band above, so neither repeats down here.
  var core = [
    ["CARAT", num(p.TOTAL_CT)],
    ["PIECES", pcsOf(p) || ""],
    ["PURITY", p.METAL_KT ? p.METAL_KT + "K" : ""],
    ["TONE", p.METAL_COLOR || ""],
    ["GROSS WT", p.GROSS_WT_GM ? num(p.GROSS_WT_GM, 2) + " gm" : ""],
    ["NET GOLD", p.NET_GOLD_WT_GM ? num(p.NET_GOLD_WT_GM, 2) + " gm" : ""],
    ["SIZE", p.SIZE || ""]
  ];
  var extra = [
    ["CENTRE / SIDE", (p.CENTER_CT || p.SIDE_CT) ?
        (p.CENTER_CT ? num(p.CENTER_CT) + "ct" : "&mdash;") + " / " +
        (p.SIDE_CT ? num(p.SIDE_CT) + "ct" : "&mdash;") : ""],
    ["CENTRE STONE", p.CENTER_STONE_CT ?
        [num(p.CENTER_STONE_CT) + " ct", p.CENTER_SHAPE, p.CENTER_COLOR, p.CENTER_CLARITY]
          .filter(Boolean).join(" &middot; ") : ""],
    ["QUALITY", p.QUALITY || ""],
    ["SHAPES", p.SHAPES || ""],
    ["CERTIFICATE", p.CENTER_CERT || p.CERT || ""]
  ].filter(function (r) { return r[1] !== ""; });
  $("#dKeys").innerHTML =
    core.map(function (r) { return specCell(r[0], r[1]); }).join("") +
    extra.map(function (r) { return specCell(r[0], r[1]); }).join("");

  // diamond lines - the India breakdown is the customer-facing set; Dubai purchase
  // lines describe the same stones from the buying side, so never show both at once.
  var d = p.DIAMONDS || [];
  var brk = d.filter(function (x) { return x.DETAIL_SET === "STONE BREAKDOWN"; });
  if (brk.length) d = brk;
  if (!d.length) {
    $("#dDna").innerHTML = '<tr><td class="none">No stone-by-stone breakdown on file for this piece &mdash; ' +
      'total weight ' + num(p.TOTAL_CT) + ' ct.</td></tr>';
  } else {
    $("#dDna").innerHTML =
      "<tr><th>ROLE</th><th>SHAPE</th><th>PCS</th><th>CARAT</th><th>MM / SIEVE</th>" +
      "<th>COLOUR</th><th>CLARITY</th><th>PACKET</th><th>CERT</th><th>NOTE</th></tr>" +
      d.map(function (x) {
        return "<tr><td>" + esc(x.STONE_ROLE || "") + "</td><td>" + esc(x.SHAPE || "") + "</td><td>" +
          esc(x.PCS || "") + "</td><td>" + num(x.CARAT, 3) + "</td><td>" + esc(x.MM_SIEVE || "") +
          "</td><td>" + esc(x.COLOR || "") + "</td><td>" + esc(x.CLARITY || "") + "</td><td>" +
          esc(x.PACKET_NO || "") + "</td><td>" + esc(x.CERT_NO || "") + "</td><td>" +
          esc(x.NOTE || "") + "</td></tr>";
      }).join("") +
      "<tr><td colspan='3'>TOTAL</td><td>" +
      num(d.reduce(function (t, x) { return t + (x.CARAT || 0); }, 0), 2) +
      "</td><td colspan='6'></td></tr>";
  }

  var cur = availOf(p);
  var locked = !canEdit();
  $$("#dAvail .chip").forEach(function (b) {
    b.classList.toggle("is-on", b.dataset.set === cur);
    b.classList.toggle("is-locked", locked && b.dataset.set !== cur);
  });
  $("#dAvail").classList.toggle("is-locked", locked);
  $("#dStamp").textContent = locked ? "— unlock to change"
                                    : (STOCK_ON ? (pendingOf(sku) ? "saving…" : stampOf(sku)) : "this device only");
  // the sale behind a SOLD piece - client, price, payment, seller. Only a staff
  // device ever has this; a customer's page never fetches sales at all.
  var sl = (!locked && STOCK_ON && cur === "SOLD") ? saleOf(sku) : null;
  var box = $("#dSale");
  box.hidden = !sl;
  if (sl) {
    box.innerHTML = "<b>SOLD TO " + esc(sl.client) + "</b> &middot; " + esc(curMoney(sl.price, sl.currency)) +
      " &middot; " + esc(sl.payment) + (sl.pending ? " &middot; <i>saving…</i>"
        : " &middot; " + esc(sl.by) + " &middot; " + esc(prettyDay(sl.date)) + " " + esc(sl.time)) +
      (sl.remark ? "<br><span>" + esc(sl.remark) + "</span>" : "");
  }
  $("#dPick").textContent = sel.has(sku) ? "REMOVE FROM SELECTION" : "ADD TO SELECTION";

  var i = VIEW.findIndex(function (x) { return x.SKU === sku; });
  $("#dPrev").disabled = i <= 0;
  $("#dNext").disabled = i === -1 || i >= VIEW.length - 1;

  $("#detail").hidden = false;
  $(".d-scroll").scrollTop = 0;
}

function stepDetail(dir) {
  var i = -1;
  for (var k = 0; k < VIEW.length; k++) if (VIEW[k].SKU === detailSku) { i = k; break; }
  if (i === -1) return;
  var j = i + dir;
  if (j < 0 || j >= VIEW.length) return;
  while (j >= shown) renderMore();
  openDetail(VIEW[j].SKU);
}

/* ------------------------------------------------------------ export */
function exportRows(picked, label) {
  if (!picked.length) { toast("Nothing selected"); return; }
  if (typeof ExcelJS === "undefined") { exportCsv(picked); return; }

  var wb = new ExcelJS.Workbook();
  wb.creator = "LEEBA Jewels";

  var head = ["SR", "SKU", "CATEGORY", "DESCRIPTION", "PURITY", "TONE", "SIZE",
              "GROSS WT (gm)", "NET GOLD (gm)", "CENTRE CT", "SIDE CT", "TOTAL CT", "PCS",
              "CENTRE STONE", "QUALITY", "SHAPES", "CERT", "AVAILABILITY",
              "SELLING PRICE (AED)", "SELLING PRICE (USD)", "PER CARAT (AED)", "OFFER", "NORMAL PRICE (AED)"];
  if (HAS_LOC) head.splice(2, 0, "TRAY");
  if (cost) head = head.concat(["COST (USD)", "MARKUP"]);

  var s1 = wb.addWorksheet("COLLECTION");
  s1.addRow([SHOW_NAME]);
  s1.addRow([picked.length + " pieces - exported " + new Date().toLocaleString("en-GB")]);
  s1.addRow([]);
  s1.addRow(head);
  picked.forEach(function (p, i) {
    var row = [i + 1, p.SKU, p.CATEGORY, p.DESCRIPTION || "",
      p.METAL_KT ? p.METAL_KT + "K" : "", p.METAL_COLOR || "", p.SIZE || "",
      p.GROSS_WT_GM || "", p.NET_GOLD_WT_GM || "", p.CENTER_CT || "", p.SIDE_CT || "",
      p.TOTAL_CT || "", pcsOf(p) || "",
      p.CENTER_STONE_CT ? [num(p.CENTER_STONE_CT) + " ct", p.CENTER_SHAPE, p.CENTER_COLOR, p.CENTER_CLARITY]
        .filter(Boolean).join(" ") : "",
      p.QUALITY || "", p.SHAPES || "", p.CENTER_CERT || p.CERT || "", availOf(p),
      aedOf(p) || "ON REQUEST", sellOf(p) || "", p.SELL_PER_CT_USD ? Math.round(p.SELL_PER_CT_USD * RATE) : "",
      offerOf(p), wasAED(p) || ""];
    if (HAS_LOC) row.splice(2, 0, p.TRAY || "");
    if (cost) {
      var c = cost[p.SKU] || {};
      row = row.concat([c.cost || "", c.markup || ""]);
    }
    s1.addRow(row);
  });

  var s2 = wb.addWorksheet("DIAMOND DETAILS");
  s2.addRow(["SKU", "ROLE", "SHAPE", "PCS", "CARAT", "MM / SIEVE", "COLOUR", "CLARITY", "PACKET", "CERT", "NOTE"]);
  picked.forEach(function (p) {
    var lines = p.DIAMONDS || [];
    var brk = lines.filter(function (x) { return x.DETAIL_SET === "STONE BREAKDOWN"; });
    (brk.length ? brk : lines).forEach(function (d) {
      s2.addRow([p.SKU, d.STONE_ROLE || "", d.SHAPE || "", d.PCS || "", d.CARAT || "",
                 d.MM_SIEVE || "", d.COLOR || "", d.CLARITY || "", d.PACKET_NO || "",
                 d.CERT_NO || "", d.NOTE || ""]);
    });
  });

  [[s1, 4], [s2, 1]].forEach(function (pair) {
    var ws = pair[0], hr = pair[1];
    ws.getRow(hr).eachCell(function (c) {
      c.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10, name: "Arial" };
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F4040" } };
      c.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    });
    ws.views = [{ state: "frozen", ySplit: hr }];
    ws.columns.forEach(function (col) {
      var w = 10;
      col.eachCell({ includeEmpty: false }, function (c) {
        w = Math.max(w, Math.min(38, String(c.value === null || c.value === undefined ? "" : c.value).length + 3));
      });
      col.width = w;
      col.font = { name: "Arial", size: 10 };
    });
  });
  s1.getCell("A1").font = { bold: true, size: 13, name: "Arial", color: { argb: "FF0F4040" } };

  wb.xlsx.writeBuffer().then(function (buf) {
    download(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
             "LEEBA-" + TAG + "-" + label + "-" + new Date().toISOString().slice(0, 10) + ".xlsx");
    toast("Exported " + picked.length + " pieces");
  });
}

function exportCsv(picked) {
  var head = ["SR", "SKU", "CATEGORY", "DESCRIPTION", "PURITY", "TONE",
              "GROSS WT", "NET GOLD", "TOTAL CT", "PCS", "QUALITY", "CERT",
              "AVAILABILITY", "SELLING PRICE (AED)", "SELLING PRICE (USD)", "OFFER", "NORMAL PRICE (AED)"];
  if (HAS_LOC) head.splice(2, 0, "TRAY");
  if (cost) head.push("COST", "MARKUP");
  var lines = [head.join(",")];
  picked.forEach(function (p, i) {
    var r = [i + 1, p.SKU, p.CATEGORY, p.DESCRIPTION || "",
             p.METAL_KT ? p.METAL_KT + "K" : "", p.METAL_COLOR || "", p.GROSS_WT_GM || "",
             p.NET_GOLD_WT_GM || "", p.TOTAL_CT || "", pcsOf(p) || "", p.QUALITY || "",
             p.CENTER_CERT || p.CERT || "", availOf(p), aedOf(p) || "ON REQUEST", sellOf(p) || "",
             offerOf(p), wasAED(p) || ""];
    if (HAS_LOC) r.splice(2, 0, p.TRAY || "");
    if (cost) { var c = cost[p.SKU] || {}; r.push(c.cost || "", c.markup || ""); }
    lines.push(r.map(function (v) { return '"' + String(v).replace(/"/g, '""') + '"'; }).join(","));
  });
  download(new Blob([lines.join("\n")], { type: "text/csv" }),
           "LEEBA-" + TAG + "-selection-" + new Date().toISOString().slice(0, 10) + ".csv");
  toast("Exported " + picked.length + " pieces (CSV)");
}

function download(blob, name) {
  var a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a); a.click();
  setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}

/* ------------------------------------------------------------ sale form */
var AED_PER_USD = RATE;
var saleSku = null, saleCur = "USD", salePay = "", priceTouched = false;

function openSale(sku) {
  if (!staff) { openStaff(); return; }
  var p = ALL.find(function (x) { return x.SKU === sku; });
  if (!p) return;
  saleSku = sku; saleCur = "AED"; salePay = ""; priceTouched = false;
  var list = sellOf(p);
  $("#saleSku").textContent = sku;
  $("#saleDesc").textContent = [p.CATEGORY, p.DESCRIPTION].filter(Boolean).join(" · ");
  $("#saleList").textContent = list ? (offerOf(p) ? offerOf(p) + " " : "List ") + aed(aedOf(p)) + "  (" + money(list) + ")" +
    (wasOf(p) ? "  -  normal " + aed(wasAED(p)) : "") : "";
  $("#saleClient").value = "";
  $("#salePrice").value = list ? aedOf(p) : "";
  $("#saleRemark").value = "";
  $$("#saleCur .chip").forEach(function (c) { c.classList.toggle("is-on", c.dataset.cur === "AED"); });
  $$("#salePay .chip").forEach(function (c) { c.classList.remove("is-on"); });
  $("#saleWho").textContent = "Recorded as " + staff.who + " · " + prettyDay(dubaiToday()) + ", Dubai time";
  $("#saleErr").hidden = true;
  saleReady();
  $("#sale").hidden = false;
  setTimeout(function () { $("#saleClient").focus(); }, 40);
}
function saleReady() {
  var ok = $("#saleClient").value.trim() && Number($("#salePrice").value) > 0 && salePay;
  $("#saleGo").disabled = !ok;
  return ok;
}
function submitSale() {
  if (!saleReady() || !saleSku) return;
  var p = ALL.find(function (x) { return x.SKU === saleSku; });
  var sale = {
    sku: saleSku,
    client: $("#saleClient").value.trim(),
    price: Math.round(Number($("#salePrice").value) * 100) / 100,
    currency: saleCur,
    payment: salePay,
    remark: $("#saleRemark").value.trim(),
    category: p ? p.CATEGORY : "",
    description: p ? (p.DESCRIPTION || "") : "",
    list: p ? sellOf(p) : null,
    date: dubaiToday(),
    time: new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Dubai" }),
    by: staff.who
  };
  $("#sale").hidden = true;
  queueOp({ t: "sale", sale: sale });
  if (detailSku === saleSku && !$("#detail").hidden) openDetail(saleSku);
}

/* ------------------------------------------------------------ sales view */
var salesDay = null;               // "YYYY-MM-DD", or "" for every day

function openSalesPanel() {
  if (!staff) { openStaff(); return; }
  if (salesDay === null) salesDay = dubaiToday();
  renderSales();
  $("#salesPanel").hidden = false;
  loadSales();
}

/* what this device knows: the server's sales plus anything still waiting to send */
function allSales() {
  var out = sales.slice();
  outbox.forEach(function (o) {
    if (o.t === "sale") out.push(Object.assign({ status: "ACTIVE", pending: true, id: "" }, o.sale));
  });
  return out;
}

function tallyOf(list) {
  var t = { n: 0, usd: 0, aed: 0, pay: {}, by: {} };
  list.forEach(function (x) {
    t.n++;
    if (x.currency === "AED") t.aed += x.price; else t.usd += x.price;
    [["pay", x.payment || "?"], ["by", x.by || "?"]].forEach(function (k) {
      var m = t[k[0]], key = k[1];
      m[key] = m[key] || { n: 0, usd: 0, aed: 0 };
      m[key].n++;
      if (x.currency === "AED") m[key].aed += x.price; else m[key].usd += x.price;
    });
  });
  return t;
}
function amounts(o) {
  var bits = [];
  if (o.usd) bits.push(curMoney(o.usd, "USD"));
  if (o.aed) bits.push(curMoney(o.aed, "AED"));
  return bits.join(" + ") || "—";
}

function stockCounts() {
  var c = { total: ALL.length, AVAILABLE: 0, HOLD: 0, "MEMO OUT": 0, SOLD: 0, value: 0 };
  ALL.forEach(function (p) {
    var st = availOf(p);
    c[st] = (c[st] || 0) + 1;
    if (st === "AVAILABLE") c.value += aedOf(p) || 0;
  });
  return c;
}

function renderSales() {
  var every = allSales();
  var live = every.filter(function (x) { return x.status !== "CANCELLED"; });
  var days = {};
  live.forEach(function (x) { if (x.date) days[x.date] = (days[x.date] || 0) + 1; });
  var today = dubaiToday();
  if (!days[today]) days[today] = 0;

  $("#spDays").innerHTML = Object.keys(days).sort().reverse().map(function (d) {
    return '<button class="chip' + (d === salesDay ? " is-on" : "") + '" data-day="' + d + '">' +
      (d === today ? "TODAY" : prettyDay(d).toUpperCase()) + " <b>" + days[d] + "</b></button>";
  }).join("") + '<button class="chip' + (salesDay === "" ? " is-on" : "") + '" data-day="">ALL DAYS <b>' +
    live.length + "</b></button>";

  var inDay = function (x) { return salesDay === "" || x.date === salesDay; };
  var dayLive = live.filter(inDay);
  var dayCancelled = every.filter(function (x) { return x.status === "CANCELLED" && inDay(x); });
  var t = tallyOf(dayLive);
  var sc = stockCounts();

  var head = salesDay === "" ? "ALL DAYS" : (salesDay === today ? "TODAY" : prettyDay(salesDay).toUpperCase());
  $("#spTiles").innerHTML =
    tile("PIECES SOLD · " + head, t.n) +
    tile("TAKEN", amounts(t)) +
    tile("AVAILABLE NOW", sc.AVAILABLE + " <small>of " + sc.total + "</small>") +
    tile("SOLD · HOLD · MEMO", sc.SOLD + " · " + sc.HOLD + " · " + sc["MEMO OUT"]);

  $("#spBreak").innerHTML =
    breakdown("BY PAYMENT", ["CASH", "CARD", "BANK"].filter(function (k) { return t.pay[k]; })
      .map(function (k) { return [k, t.pay[k]]; })) +
    breakdown("BY PERSON", Object.keys(t.by).sort().map(function (k) { return [k, t.by[k]]; }));

  var ref = $("#spRefused");
  ref.hidden = !refused.length;
  ref.innerHTML = refused.length ? "<b>NOT SAVED — check these</b>" + refused.map(function (r) {
    return "<div>" + esc(r.what) + " — <i>" + esc(r.why) + "</i></div>";
  }).join("") + '<button class="btn btn-ghost" id="spRefusedOk">OK, SEEN</button>' : "";

  var rows = dayLive.slice().sort(function (a, b) {
    return (b.date + b.time).localeCompare(a.date + a.time);
  });
  $("#spTable").innerHTML = rows.length ?
    "<tr><th>" + (salesDay === "" ? "DATE" : "TIME") + "</th><th>PIECE</th><th>CLIENT</th><th>PRICE</th>" +
    "<th>PAID</th><th>BY</th><th>REMARK</th><th></th></tr>" +
    rows.map(function (x) {
      return "<tr" + (x.pending ? ' class="is-pending"' : "") + "><td>" +
        esc(salesDay === "" ? prettyDay(x.date) + " " + x.time : x.time) + "</td><td><b>" + esc(x.sku) +
        "</b><br><span>" + esc([x.category, x.description].filter(Boolean).join(" · ")) + "</span></td><td>" +
        esc(x.client) + "</td><td class='num'>" + esc(curMoney(x.price, x.currency)) +
        (x.list && Math.round(x.currency === "AED" ? x.list * RATE : x.list) !== Math.round(x.price)
          ? "<br><span>list " + esc(curMoney(x.currency === "AED" ? x.list * RATE : x.list, x.currency)) + "</span>" : "") +
        "</td><td>" + esc(x.payment) + "</td><td>" + esc(x.pending ? "saving…" : x.by) + "</td><td>" +
        esc(x.remark || "") + "</td><td>" +
        (x.pending ? "" : '<button class="sp-x" data-cancel="' + esc(x.sku) + '" title="Cancel this sale">CANCEL</button>') +
        "</td></tr>";
    }).join("")
    : '<tr><td class="none">No sales ' + (salesDay === today ? "yet today" : "on this day") + ".</td></tr>";

  $("#spCancelled").innerHTML = dayCancelled.length ?
    "<b>CANCELLED</b>" + dayCancelled.map(function (x) {
      return "<div>" + esc(x.sku) + " — " + esc(x.client) + ", " + esc(curMoney(x.price, x.currency)) +
        " — sold by " + esc(x.by) + ", cancelled by " + esc(x.cancelledBy) +
        (x.cancelledAt ? " " + esc(x.cancelledAt.slice(11)) : "") + "</div>";
    }).join("") : "";

  $("#spWho").textContent = staff ? "Signed in as " + staff.who : "";
  $("#spExport").textContent = salesDay === "" ? "EXPORT ALL DAYS" :
    (salesDay === today ? "EXPORT TODAY" : "EXPORT " + prettyDay(salesDay).toUpperCase());
  $("#spFresh").textContent = salesAt ? "updated " + new Date(salesAt).toLocaleTimeString("en-GB",
    { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Dubai" }) + " Dubai" : "";
}
function tile(label, val) {
  return '<div class="sp-tile"><span>' + label + "</span><b>" + val + "</b></div>";
}
function breakdown(title, rows) {
  if (!rows.length) return "";
  return '<div class="sp-break"><span>' + title + "</span>" + rows.map(function (r) {
    return "<div><b>" + esc(r[0]) + "</b><em>" + r[1].n + " pc" + (r[1].n === 1 ? "" : "s") +
      "</em><i>" + esc(amounts(r[1])) + "</i></div>";
  }).join("") + "</div>";
}

/* Evening tally: the day's sales, the totals, and where every piece stands. */
function exportSales() {
  var every = allSales();
  var inDay = function (x) { return salesDay === "" || x.date === salesDay; };
  var live = every.filter(function (x) { return x.status !== "CANCELLED" && inDay(x); });
  var cancelled = every.filter(function (x) { return x.status === "CANCELLED" && inDay(x); });
  var label = salesDay === "" ? "all-days" : salesDay;
  if (typeof ExcelJS === "undefined") { toast("Excel export needs a connection"); return; }

  var wb = new ExcelJS.Workbook(); wb.creator = "LEEBA Jewels";
  var hdr = function (ws, r) {
    ws.getRow(r).eachCell(function (c) {
      c.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10, name: "Arial" };
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F4040" } };
    });
    ws.views = [{ state: "frozen", ySplit: r }];
  };
  var widths = function (ws) {
    ws.columns.forEach(function (col) {
      var w = 9;
      col.eachCell({ includeEmpty: false }, function (c) {
        w = Math.max(w, Math.min(40, String(c.value === null || c.value === undefined ? "" : c.value).length + 2));
      });
      col.width = w; col.font = { name: "Arial", size: 10 };
    });
  };

  var t = tallyOf(live), sc = stockCounts();
  var s0 = wb.addWorksheet("SUMMARY");
  s0.addRow([SHOW_NAME]);
  s0.addRow(["Sales " + (salesDay === "" ? "- all days" : "- " + prettyDay(salesDay) + " (" + salesDay + ")") +
             " - exported " + new Date().toLocaleString("en-GB") + " by " + (staff ? staff.who : "")]);
  s0.addRow([]);
  s0.addRow(["", "PIECES", "USD", "AED"]); hdr(s0, 4);
  s0.addRow(["SOLD", t.n, t.usd, t.aed]);
  ["CASH", "CARD", "BANK"].forEach(function (k) {
    var v = t.pay[k] || { n: 0, usd: 0, aed: 0 }; s0.addRow(["  " + k, v.n, v.usd, v.aed]);
  });
  s0.addRow([]);
  s0.addRow(["BY PERSON", "PIECES", "USD", "AED"]); hdr(s0, s0.rowCount);
  Object.keys(t.by).sort().forEach(function (k) { var v = t.by[k]; s0.addRow([k, v.n, v.usd, v.aed]); });
  s0.addRow([]);
  s0.addRow(["STOCK NOW", "PIECES", "", ""]); hdr(s0, s0.rowCount);
  [["AVAILABLE", sc.AVAILABLE], ["HOLD", sc.HOLD], ["MEMO OUT", sc["MEMO OUT"]], ["SOLD", sc.SOLD],
   ["TOTAL", sc.total]].forEach(function (r) { s0.addRow(r); });
  s0.addRow(["Available stock at list price (AED)", "", "", sc.value]);
  s0.views = [];
  s0.getCell("A1").font = { bold: true, size: 13, name: "Arial", color: { argb: "FF0F4040" } };
  widths(s0);

  var s1 = wb.addWorksheet("SALES");
  s1.addRow(["DATE", "TIME", "SKU", "CATEGORY", "DESCRIPTION", "CLIENT", "PRICE", "CURRENCY",
             "PAYMENT", "REMARK", "SOLD BY", "LIST PRICE (USD)", "SALE ID"]); hdr(s1, 1);
  live.slice().sort(function (a, b) { return (a.date + a.time).localeCompare(b.date + b.time); })
    .forEach(function (x) {
      s1.addRow([x.date, x.time, x.sku, x.category, x.description, x.client, x.price, x.currency,
                 x.payment, x.remark, x.pending ? "(not yet saved)" : x.by, x.list || "", x.id || ""]);
    });
  widths(s1);

  if (cancelled.length) {
    var s2 = wb.addWorksheet("CANCELLED");
    s2.addRow(["DATE", "TIME", "SKU", "CLIENT", "PRICE", "CURRENCY", "PAYMENT", "SOLD BY",
               "CANCELLED BY", "CANCELLED AT", "SALE ID"]); hdr(s2, 1);
    cancelled.forEach(function (x) {
      s2.addRow([x.date, x.time, x.sku, x.client, x.price, x.currency, x.payment, x.by,
                 x.cancelledBy, x.cancelledAt, x.id]);
    });
    widths(s2);
  }

  var s3 = wb.addWorksheet("STOCK");
  s3.addRow(["SKU", "CATEGORY", "DESCRIPTION", "STATUS", "LIST PRICE (AED)", "LIST PRICE (USD)", "SOLD TO", "SOLD FOR", "SOLD BY"]);
  hdr(s3, 1);
  ALL.slice().sort(function (a, b) { return a.SKU.localeCompare(b.SKU); }).forEach(function (p) {
    var st = availOf(p), sl = st === "SOLD" ? saleOf(p.SKU) : null;
    s3.addRow([p.SKU, p.CATEGORY, p.DESCRIPTION || "", st, aedOf(p) || "ON REQUEST", sellOf(p) || "",
               sl ? sl.client : "", sl ? curMoney(sl.price, sl.currency) : "", sl ? (sl.by || "") : ""]);
  });
  widths(s3);

  wb.xlsx.writeBuffer().then(function (buf) {
    download(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
             "LEEBA-" + TAG + "-SALES-" + label + ".xlsx");
    toast("Sales exported");
  });
}

/* ------------------------------------------------------------ wiring */
function openStaff() {
  if (!STOCK_ON) { toast("Live stock is not switched on"); return; }
  $("#sErr").hidden = true;
  $("#staffForm").hidden = !!staff;
  $("#staffOut").hidden = !staff;
  var who = $("#staffWho");
  who.hidden = !staff;
  if (staff) who.textContent = "Unlocked as " + (staff.who || "staff") + ".";
  $("#staff").hidden = false;
  if (!staff) setTimeout(function () { $("#staffCode").focus(); }, 30);
}

function selbar() {
  $("#selN").textContent = sel.size;
  var v = 0;
  ALL.forEach(function (p) { if (sel.has(p.SKU)) v += aedOf(p) || 0; });
  $("#selVal").textContent = aed(v);
  $("#selbar").hidden = sel.size === 0;
}

function wire() {
  // availability stays single-choice: a piece is in exactly one state
  $("#availChips").addEventListener("click", function (e) {
    var b = e.target.closest(".chip"); if (!b) return;
    filt.avail = b.dataset.avail || "";
    activeColl = -1;
    syncChips(); apply();
  });

  $("#sort").addEventListener("change", function () { filt.sort = this.value; apply(); });

  var t;
  $("#q").addEventListener("input", function () {
    var v = this.value;
    $("#qClear").hidden = !v;
    clearTimeout(t); t = setTimeout(function () { filt.q = v; activeColl = -1; syncColl(); apply(); }, 130);
  });
  $("#qClear").addEventListener("click", function () {
    $("#q").value = ""; filt.q = ""; this.hidden = true; apply(); $("#q").focus();
  });

  [["#ctMin", "ctMin"], ["#ctMax", "ctMax"], ["#prMin", "prMin"], ["#prMax", "prMax"],
   ["#gwMin", "gwMin"], ["#gwMax", "gwMax"]].forEach(function (pair) {
    $(pair[0]).addEventListener("input", function () {
      filt[pair[1]] = this.value === "" ? null : parseFloat(this.value);
      activeColl = -1;
      clearTimeout(t); t = setTimeout(function () { syncChips(); apply(); }, 180);
    });
  });

  $("#reset").addEventListener("click", clearAll);

  // remove one filter straight from the active bar
  $("#activeBar").addEventListener("click", function (e) {
    var b = e.target.closest(".apill"); if (!b) return;
    var kind = b.dataset.kind;
    if (kind === "all") { clearAll(); return; }
    if (filt[kind] instanceof Set) filt[kind].delete(b.dataset.val);
    else if (kind === "price") { filt.prMin = filt.prMax = null; }
    else if (kind === "ct")    { filt.ctMin = filt.ctMax = null; }
    else if (kind === "gw")    { filt.gwMin = filt.gwMax = null; }
    else if (kind === "avail") { filt.avail = ""; }
    else if (kind === "offer") { filt.offer = false; }
    else if (kind === "q")     { filt.q = ""; }
    activeColl = -1;
    syncInputs(); syncChips(); apply();
  });

  // view toggle
  function setView(list) {
    $("#grid").classList.toggle("is-list", list);
    $("#vList").classList.toggle("is-on", list);
    $("#vGrid").classList.toggle("is-on", !list);
    try { localStorage.setItem(KEY + "view", list ? "list" : "grid"); } catch (e) {}
  }
  $("#vGrid").addEventListener("click", function () { setView(false); });
  $("#vList").addEventListener("click", function () { setView(true); });
  try { if (localStorage.getItem(KEY + "view") === "list") setView(true); } catch (e) {}

  // paging
  $("#moreBtn").addEventListener("click", renderMore);
  $("#main").addEventListener("scroll", function () {
    if (this.scrollTop + this.clientHeight > this.scrollHeight - 700 && shown < VIEW.length) renderMore();
  });

  // cards
  $("#grid").addEventListener("click", function (e) {
    var card = e.target.closest(".card"); if (!card) return;
    var sku = card.dataset.sku;
    if (e.target.closest("[data-pick]")) {
      if (sel.has(sku)) sel.delete(sku); else sel.add(sku);
      card.classList.toggle("is-sel");
      selbar();
      return;
    }
    openDetail(sku);
  });

  // selection
  $("#selClear").addEventListener("click", function () {
    sel.clear();
    $$(".card.is-sel").forEach(function (c) { c.classList.remove("is-sel"); });
    selbar();
  });
  $("#selExport").addEventListener("click", function () {
    exportRows(ALL.filter(function (p) { return sel.has(p.SKU); }), "selection");
  });
  $("#selAll").addEventListener("click", function () {
    VIEW.forEach(function (p) { sel.add(p.SKU); });
    $$(".card").forEach(function (c) { c.classList.add("is-sel"); });
    selbar(); toast(sel.size + " selected");
  });
  $("#expAll").addEventListener("click", function () { exportRows(VIEW.slice(), "list"); });

  // detail
  $("#dImg").addEventListener("click", function () {
    if (!this.src) return;
    $("#lbImg").src = this.src; $("#lightbox").hidden = false;
  });
  $("#dThumbs").addEventListener("click", function (e) {
    var im = e.target.closest("img"); if (!im) return;
    $("#dImg").src = im.dataset.full;
    $$("#dThumbs img").forEach(function (x) { x.classList.remove("is-on"); });
    im.classList.add("is-on");
  });
  $("#dAvail").addEventListener("click", function (e) {
    var b = e.target.closest(".chip"); if (!b || !detailSku) return;
    if (!canEdit()) { openStaff(); return; }
    var sku = detailSku, want = b.dataset.set;
    var p = ALL.find(function (x) { return x.SKU === sku; });
    var now = availOf(p);
    if (want === now) return;
    if (!STOCK_ON) {                                   // device-only mode, no sales
      setStatus(sku, want); openDetail(sku); return;
    }
    if (want === "SOLD") { openSale(sku); return; }    // selling = recording a sale
    if (now === "SOLD") {                              // un-selling = cancelling it
      var sl = saleOf(sku);
      var msg = "Cancel the sale of " + sku +
        (sl ? " to " + sl.client + " (" + curMoney(sl.price, sl.currency) + ")" : "") +
        "?\n\nThe sale stays in the record, marked cancelled, and the piece becomes " +
        want + ".";
      if (!window.confirm(msg)) return;
      queueOp({ t: "cancel", sku: sku, reason: "changed to " + want });
      if (want !== "AVAILABLE") queueOp({ t: "status", sku: sku, status: want });
      openDetail(sku);
      return;
    }
    setStatus(sku, want);
    openDetail(sku);
  });
  $("#dPick").addEventListener("click", function () {
    if (!detailSku) return;
    if (sel.has(detailSku)) sel.delete(detailSku); else sel.add(detailSku);
    this.textContent = sel.has(detailSku) ? "REMOVE FROM SELECTION" : "ADD TO SELECTION";
    refreshCard(detailSku); selbar();
  });
  $("#dPrev").addEventListener("click", function (e) { e.stopPropagation(); stepDetail(-1); });
  $("#dNext").addEventListener("click", function (e) { e.stopPropagation(); stepDetail(1); });

  // stock control. Unlike the cost view this one IS meant to be reachable from a
  // phone - marking a piece sold happens at the stand, not at a desk.
  $("#staffBtn").addEventListener("click", openStaff);
  $("#syncPill").addEventListener("click", function () { if (STOCK_ON) (staff ? openSalesPanel : openStaff)(); });
  $("#salesBtn").addEventListener("click", openSalesPanel);

  // sale form
  $("#saleClient").addEventListener("input", saleReady);
  $("#salePrice").addEventListener("input", function () { priceTouched = true; saleReady(); });
  $("#salePay").addEventListener("click", function (e) {
    var c = e.target.closest(".chip"); if (!c) return;
    salePay = c.dataset.pay;
    $$("#salePay .chip").forEach(function (x) { x.classList.toggle("is-on", x === c); });
    saleReady();
  });
  $("#saleCur").addEventListener("click", function (e) {
    var c = e.target.closest(".chip"); if (!c || c.dataset.cur === saleCur) return;
    var p = ALL.find(function (x) { return x.SKU === saleSku; });
    var list = p ? sellOf(p) : null;
    saleCur = c.dataset.cur;
    $$("#saleCur .chip").forEach(function (x) { x.classList.toggle("is-on", x === c); });
    // an untouched price follows the currency; a typed one is left alone
    if (!priceTouched && list) $("#salePrice").value = Math.round(saleCur === "AED" ? list * AED_PER_USD : list);
    saleReady();
  });
  $("#saleForm").addEventListener("submit", function (e) { e.preventDefault(); submitSale(); });

  // sales view
  $("#spDays").addEventListener("click", function (e) {
    var c = e.target.closest(".chip"); if (!c) return;
    salesDay = c.dataset.day; renderSales();
  });
  $("#spExport").addEventListener("click", exportSales);
  $("#spLock").addEventListener("click", function () { $("#staffOut").click(); });
  $("#salesPanel").addEventListener("click", function (e) {
    if (e.target.id === "spRefusedOk") { refused = []; saveOutbox(); syncPill(); renderSales(); return; }
    var x = e.target.closest("[data-cancel]"); if (!x) return;
    var sku = x.dataset.cancel, sl = saleOf(sku);
    if (!window.confirm("Cancel the sale of " + sku + (sl ? " to " + sl.client + " (" +
        curMoney(sl.price, sl.currency) + ")" : "") + "?\n\nIt stays in the record, marked cancelled, " +
        "and the piece goes back to AVAILABLE.")) return;
    queueOp({ t: "cancel", sku: sku, reason: "cancelled from sales list" });
  });
  if (location.hash === "#staff") openStaff();
  window.addEventListener("hashchange", function () { if (location.hash === "#staff") openStaff(); });

  $("#staffForm").addEventListener("submit", function (e) {
    e.preventDefault();
    var code = $("#staffCode").value.trim();
    var btn = $("#sGo"); btn.disabled = true; btn.textContent = "CHECKING...";
    fetch(STOCK_URL + "?action=auth&code=" + encodeURIComponent(code))
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (!j || !j.ok) { $("#sErr").hidden = false; return; }
        staff = { code: code, who: j.who, token: j.token };
        saveStaff($("#staffKeep").checked);
        $("#staff").hidden = true;
        $("#staffCode").value = "";
        staffButtons(); syncPill();
        toast("Unlocked - " + j.who);
        if (detailSku && !$("#detail").hidden) openDetail(detailSku);
        flushOutbox();
        loadSales();
      })
      .catch(function () { $("#sErr").hidden = false; })
      .then(function () { btn.disabled = false; btn.textContent = "UNLOCK STOCK CONTROL"; });
  });

  $("#staffOut").addEventListener("click", function () {
    clearStaff();
    $("#staff").hidden = true;
    $("#salesPanel").hidden = true;
    syncPill();
    if (detailSku && !$("#detail").hidden) openDetail(detailSku);
    toast("Stock control locked");
  });

  // FILTERS - a full-screen sheet on a phone, a collapsible rail on a desktop
  function phone() { return window.matchMedia("(max-width:980px)").matches; }
  function moreLabel() {
    var shut = $("#side").classList.contains("is-shut");
    $("#moreFilt").firstElementChild.textContent = (!phone() && !shut) ? "HIDE FILTERS" : "FILTERS";
  }
  $("#moreFilt").addEventListener("click", function () {
    var side = $("#side");
    if (phone()) side.classList.toggle("is-open");
    else side.classList.toggle("is-shut");
    moreLabel();
  });
  window.addEventListener("resize", moreLabel);
  moreLabel();
  $("#sideClose").addEventListener("click", function () { $("#side").classList.remove("is-open"); });
  $("#sideApply").addEventListener("click", function () { $("#side").classList.remove("is-open"); });

  // modals
  $$(".modal").forEach(function (m) {
    m.addEventListener("click", function (e) {
      if (e.target === m || e.target.closest("[data-close]")) m.hidden = true;
    });
  });

  document.addEventListener("keydown", function (e) {
    var typing = /^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement.tagName);
    if (e.key === "Escape") {
      if (!$("#lightbox").hidden) { $("#lightbox").hidden = true; return; }
      $$(".modal").forEach(function (m) { m.hidden = true; });
      $("#side").classList.remove("is-open");
      return;
    }
    if (typing) return;
    if (e.key === "/") { e.preventDefault(); $("#q").focus(); return; }
    if (!$("#detail").hidden) {
      if (e.key === "ArrowRight") stepDetail(1);
      if (e.key === "ArrowLeft") stepDetail(-1);
    }
  });
}

document.addEventListener("DOMContentLoaded", boot);
})();
