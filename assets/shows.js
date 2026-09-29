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
var queue      = {};            // SKU -> status written here but not yet accepted
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

/* Every list filter holds a SET, so several values can be on at once:
   RING + BRACELET together, D + I together, and so on. An empty set means
   "no restriction on this field" - which is what the ALL chip switches
   back to. Different fields still AND together. */
function blank() {
  return {
    cats: new Set(), locs: new Set(), tones: new Set(),
    purities: new Set(), shapes: new Set(),
    q: "", avail: "", sort: "sku",
    ctMin: null, ctMax: null, prMin: null, prMax: null, gwMin: null, gwMax: null
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
function srcFor(file) { return (THUMBS && THUMBS[file]) || (IMG_BASE + file); }
function imgs(p) {
  return p.IMAGES_ALL ? p.IMAGES_ALL.split(",").map(function (s) { return s.trim(); })
                      : (p.IMAGE ? [p.IMAGE] : []);
}
function sellOf(p) { return p.SELLING_PRICE_USD === undefined ? null : p.SELLING_PRICE_USD; }
function costOf(p) { return cost && cost[p.SKU] ? cost[p.SKU] : null; }
/* What this piece's status is right now. A change made here that the server has
   not confirmed yet wins, so the button responds instantly; then the server's
   answer; then whatever the stock list was built with. */
function availOf(p) {
  if (STOCK_ON) {
    if (queue[p.SKU]) return queue[p.SKU];
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
function loadQueue() {
  try { queue = JSON.parse(localStorage.getItem(KEY + "queue") || "{}"); } catch (e) { queue = {}; }
}
function saveQueue() {
  try { localStorage.setItem(KEY + "queue", JSON.stringify(queue)); } catch (e) {}
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
  try { localStorage.removeItem(KEY + "staff"); sessionStorage.removeItem(KEY + "staff"); } catch (e) {}
}

function syncPill() {
  var el = $("#syncPill");
  if (!STOCK_ON) { el.hidden = true; return; }
  el.hidden = false;
  var n = Object.keys(queue).length;
  if (!online || n) {
    el.className = "sync is-off";
    el.textContent = n ? "SAVING " + n : "OFFLINE";
  } else if (staff) {
    el.className = "sync is-live";
    el.textContent = "LIVE · " + (staff.who || "STAFF");
  } else {
    el.className = "sync";
    el.textContent = "LIVE";
  }
}

/* Repaint only the pieces whose status actually moved, so someone else's change
   appearing does not throw away your scroll position. */
function mergeRemote(next) {
  var changed = [];
  ALL.forEach(function (p) {
    var was = (remote[p.SKU] && remote[p.SKU].s) || p.AVAILABILITY || "AVAILABLE";
    var now = (next[p.SKU] && next[p.SKU].s) || p.AVAILABILITY || "AVAILABLE";
    if (was !== now) changed.push(p.SKU);
  });
  remote = next || {};
  changed.forEach(refreshCard);
  if (changed.length && filt.avail) apply();
  else if (changed.length) stats();
  if (detailSku && !$("#detail").hidden && changed.indexOf(detailSku) !== -1) openDetail(detailSku);
  syncPill();
}

function pollStock() {
  if (!STOCK_ON) return Promise.resolve();
  return fetch(STOCK_URL + "?action=status&t=" + Date.now())
    .then(function (r) { return r.json(); })
    .then(function (j) {
      if (!j || !j.ok) throw new Error("bad reply");
      online = true;
      mergeRemote(j.stock || {});
      if (Object.keys(queue).length) flushQueue();
    })
    .catch(function () { online = false; syncPill(); });
}

/* Anything typed while the wifi was down is kept and sent on the next poll. */
function flushQueue() {
  var skus = Object.keys(queue);
  if (!skus.length || !staff) return Promise.resolve();
  var changes = skus.map(function (s) { return { sku: s, status: queue[s] }; });
  return postStock(changes).then(function (ok) {
    if (ok) { skus.forEach(function (s) { delete queue[s]; }); saveQueue(); syncPill(); }
  });
}

function postStock(changes) {
  /* plain-text body on purpose: it keeps this a "simple" request, so the
     browser sends it straight to Apps Script instead of asking permission
     first with an OPTIONS call, which Apps Script cannot answer */
  return fetch(STOCK_URL, {
    method: "POST",
    body: JSON.stringify({ code: staff ? staff.code : "", changes: changes })
  })
    .then(function (r) { return r.json(); })
    .then(function (j) {
      if (!j || !j.ok) {
        if (j && j.error === "bad code") { clearStaff(); toast("Staff code no longer valid"); }
        return false;
      }
      online = true;
      mergeRemote(j.stock || {});
      return true;
    })
    .catch(function () { online = false; syncPill(); return false; });
}

/* The one way status changes anywhere in the app. */
function setStatus(sku, status) {
  if (!STOCK_ON) {                       // no backend configured: this device only
    avail[sku] = status; saveAvail();
    refreshCard(sku);
    if (filt.avail) apply();
    toast(sku + " - " + status);
    return;
  }
  if (!staff) { openStaff(); return; }

  queue[sku] = status; saveQueue();      // show it immediately
  refreshCard(sku);
  if (filt.avail) apply(); else stats();
  syncPill();

  postStock([{ sku: sku, status: status }]).then(function (ok) {
    if (ok) {
      delete queue[sku]; saveQueue();
      toast(sku + " - " + status);
    } else {
      toast("Saved here - will sync when back online");
    }
    syncPill();
    if (detailSku === sku && !$("#detail").hidden) openDetail(sku);
  });
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
  loadQueue();
  loadStaff();
  $("#staffBtn").hidden = !STOCK_ON;
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

  fetch(CFG.CATALOG || "data/catalog.json")
    .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(function (j) {
      ALL = j.products || [];
      buildFilters();
      buildCollections();
      restoreSession();
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
  var locs     = tally(function (p) { return p.LOC; });
  var tones    = tally(function (p) { return p.METAL_COLOR; });
  var purities = tally(function (p) { return p.METAL_KT; });
  var shapes   = tally(shapesOf);

  var catItems   = items(cats);
  var locItems   = items(locs);
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
  var prices = ALL.map(sellOf).filter(function (v) { return v !== null && !isNaN(v); });
  if (!prices.length) return;
  var max = Math.max.apply(null, prices);
  var steps = [1000, 2000, 3000, 5000, 10000, 20000, 50000];
  BANDS = [];
  var prev = null;
  steps.forEach(function (s) {
    if (prev !== null && prev >= max) return;
    BANDS.push({ min: prev, max: s, label: prev === null ? "under " + shortMoney(s)
                                                         : shortMoney(prev) + "-" + shortMoney(s) });
    prev = s;
  });
  if (prev !== null && max > prev) BANDS.push({ min: prev, max: null, label: shortMoney(prev) + "+" });

  $("#fPrice").innerHTML = BANDS.map(function (b, i) {
    var n = ALL.filter(function (p) {
      var v = sellOf(p);
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

  $("#collScroll").addEventListener("click", function (e) {
    var b = e.target.closest(".coll"); if (!b) return;
    var i = +b.dataset.coll;
    if (activeColl === i) { clearAll(); return; }
    var d = COLL[i].def;
    filt = blank();
    if (d.cat) filt.cats.add(d.cat);
    if (d.min !== undefined) filt.prMin = d.min;
    if (d.max !== undefined) filt.prMax = d.max;
    syncInputs();
    activeColl = i;
    syncChips(); apply();
    $("#side").classList.remove("is-open");
  });
}
function matchesColl(p, d) {
  var v = sellOf(p);
  if (d.cat && p.CATEGORY !== d.cat) return false;
  if (d.min !== undefined && !(v >= d.min)) return false;
  if (d.max !== undefined && !(v <= d.max)) return false;
  return true;
}
function syncColl() {
  $$("#collScroll .coll").forEach(function (c) {
    c.classList.toggle("is-on", +c.dataset.coll === activeColl);
  });
}

/* --------------------------------------------------------- active bar */
function activeCount() {
  var n = filt.cats.size + filt.locs.size + filt.tones.size + filt.purities.size + filt.shapes.size;
  if (filt.q) n++;
  if (filt.avail) n++;
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
    push("price", "", (filt.prMin !== null ? money(filt.prMin) : "$0") + " - " +
                      (filt.prMax !== null ? money(filt.prMax) : "any"));
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
    if (filt.locs.size && !filt.locs.has(p.LOC)) return false;
    if (filt.cats.size && !filt.cats.has(p.CATEGORY)) return false;
    if (filt.tones.size && !filt.tones.has(p.METAL_COLOR)) return false;
    if (filt.purities.size && !filt.purities.has(String(p.METAL_KT))) return false;
    if (filt.shapes.size) {
      var sh = shapesOf(p), hit = false;
      for (var i = 0; i < sh.length; i++) if (filt.shapes.has(sh[i])) { hit = true; break; }
      if (!hit) return false;
    }
    if (filt.avail && availOf(p) !== filt.avail) return false;
    if (filt.ctMin !== null && !(p.TOTAL_CT >= filt.ctMin)) return false;
    if (filt.ctMax !== null && !(p.TOTAL_CT <= filt.ctMax)) return false;
    if (filt.gwMin !== null && !(p.GROSS_WT_GM >= filt.gwMin)) return false;
    if (filt.gwMax !== null && !(p.GROSS_WT_GM <= filt.gwMax)) return false;
    if (filt.prMin !== null && !(sellOf(p) >= filt.prMin)) return false;
    if (filt.prMax !== null && !(sellOf(p) <= filt.prMax)) return false;
    if (q) {
      var hay = [p.SKU, p.DESCRIPTION, p.CATEGORY, p.SHAPES, p.CENTER_SHAPE, p.QUALITY,
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
  VIEW.forEach(function (p) { ct += p.TOTAL_CT || 0; val += sellOf(p) || 0; });
  $("#stats").innerHTML =
    "<b>" + VIEW.length + "</b> " + (VIEW.length === 1 ? "PIECE" : "PIECES") +
    " &nbsp;&middot;&nbsp; <b>" + ct.toFixed(2) + "</b> CT" +
    " &nbsp;&middot;&nbsp; <span class='gold'><b>" + money(val) + "</b></span>";
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
      '<span class="card-loc loc-' + esc(p.LOC) + '">' + esc(p.LOC) + '</span>' +
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
        '<span class="amt">' + (sv !== null ? money(sv) : "&mdash;") + '</span>' +
        (p.SELL_PER_CT_USD ? '<span class="perct">' + money(p.SELL_PER_CT_USD) + '/CT</span>' : "") +
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
  loc.textContent = p.LOC;
  loc.className = "badge loc-" + p.LOC;
  $("#dCat").textContent = p.CATEGORY || "";
  $("#dDesc").textContent = p.DESCRIPTION || "";

  var big = $("#dImg");
  if (list.length) { big.src = srcFor(list[0]); big.hidden = false; } else { big.hidden = true; }
  $("#dThumbs").innerHTML = list.length > 1 ? list.map(function (f, i) {
    return '<img src="' + esc(srcFor(f)) + '" data-full="' + esc(srcFor(f)) + '"' +
           (i === 0 ? ' class="is-on"' : "") + ' alt="">';
  }).join("") : "";

  // price band - selling price always, cost only when the internal view is open
  var c = costOf(p), band = [];
  band.push('<div class="big"><span>SELLING PRICE</span><b>' +
            (sellOf(p) !== null ? money(sellOf(p)) : "&mdash;") + '</b></div>');
  if (p.SELL_PER_CT_USD) band.push('<div><span>PER CARAT</span><b>' + money(p.SELL_PER_CT_USD) + '</b></div>');
  if (c) {
    band.push('<div><span>COST</span><b>' + money(c.cost) + '</b></div>');
    if (c.markup) band.push('<div><span>MARKUP</span><b>' + Number(c.markup).toFixed(2) + 'x</b></div>');
    if (c.dia) band.push('<div><span>DIAMOND</span><b>' + money(c.dia) + '</b></div>');
    if (c.gold) band.push('<div><span>GOLD' + (c.making ? "" : " + MAKING") + '</span><b>' + money(c.gold) + '</b></div>');
    if (c.making) band.push('<div><span>MAKING</span><b>' + money(c.making) + '</b></div>');
  }
  var pb = $("#dPrice");
  pb.innerHTML = band.join("");
  pb.className = "d-price" + (c ? " cost-on" : "");

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
                                    : (STOCK_ON ? stampOf(sku) : "this device only");
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

/* ------------------------------------------------------- cost unlock */
function b64(s) {
  var bin = atob(s), a = new Uint8Array(bin.length);
  for (var i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
  return a;
}
function decryptCost(pass) {
  return fetch(CFG.PRICES_COST || "data/prices.cost.enc.json")
    .then(function (r) { if (!r.ok) throw new Error("missing"); return r.json(); })
    .then(function (box) {
      var enc = new TextEncoder();
      return crypto.subtle.importKey("raw", enc.encode(pass), "PBKDF2", false, ["deriveKey"])
        .then(function (base) {
          return crypto.subtle.deriveKey(
            { name: "PBKDF2", salt: b64(box.salt), iterations: box.iter, hash: "SHA-256" },
            base, { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
        })
        .then(function (key) {
          return crypto.subtle.decrypt({ name: "AES-GCM", iv: b64(box.iv) }, key, b64(box.data));
        });
    })
    .then(function (buf) { return JSON.parse(new TextDecoder().decode(buf)); });
}

function afterCost() {
  var on = !!cost;
  $("#costBtn").classList.toggle("is-open", on);
  $("#relock").hidden = !on;
  apply();
  if (detailSku && !$("#detail").hidden) openDetail(detailSku);
}
function restoreSession() {
  var p;
  try { p = sessionStorage.getItem(KEY + "cost"); } catch (e) { p = null; }
  if (p) decryptCost(p).then(function (payload) { cost = payload; afterCost(); })
                       .catch(function () { try { sessionStorage.removeItem(KEY + "cost"); } catch (e) {} });
}

/* ------------------------------------------------------------ export */
function exportRows(picked, label) {
  if (!picked.length) { toast("Nothing selected"); return; }
  if (typeof ExcelJS === "undefined") { exportCsv(picked); return; }

  var wb = new ExcelJS.Workbook();
  wb.creator = "LEEBA Jewels";

  var head = ["SR", "SKU", "LOCATION", "CATEGORY", "DESCRIPTION", "PURITY", "TONE", "SIZE",
              "GROSS WT (gm)", "NET GOLD (gm)", "CENTRE CT", "SIDE CT", "TOTAL CT", "PCS",
              "CENTRE STONE", "QUALITY", "SHAPES", "CERT", "AVAILABILITY",
              "SELLING PRICE (USD)", "PER CARAT (USD)"];
  if (cost) head = head.concat(["COST (USD)", "MARKUP"]);

  var s1 = wb.addWorksheet("COLLECTION");
  s1.addRow([SHOW_NAME]);
  s1.addRow([picked.length + " pieces - exported " + new Date().toLocaleString("en-GB")]);
  s1.addRow([]);
  s1.addRow(head);
  picked.forEach(function (p, i) {
    var row = [i + 1, p.SKU, p.LOC, p.CATEGORY, p.DESCRIPTION || "",
      p.METAL_KT ? p.METAL_KT + "K" : "", p.METAL_COLOR || "", p.SIZE || "",
      p.GROSS_WT_GM || "", p.NET_GOLD_WT_GM || "", p.CENTER_CT || "", p.SIDE_CT || "",
      p.TOTAL_CT || "", pcsOf(p) || "",
      p.CENTER_STONE_CT ? [num(p.CENTER_STONE_CT) + " ct", p.CENTER_SHAPE, p.CENTER_COLOR, p.CENTER_CLARITY]
        .filter(Boolean).join(" ") : "",
      p.QUALITY || "", p.SHAPES || "", p.CENTER_CERT || p.CERT || "", availOf(p),
      sellOf(p) || "", p.SELL_PER_CT_USD || ""];
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
  var head = ["SR", "SKU", "LOCATION", "CATEGORY", "DESCRIPTION", "PURITY", "TONE",
              "GROSS WT", "NET GOLD", "TOTAL CT", "PCS", "QUALITY", "CERT",
              "AVAILABILITY", "SELLING PRICE"];
  if (cost) head.push("COST", "MARKUP");
  var lines = [head.join(",")];
  picked.forEach(function (p, i) {
    var r = [i + 1, p.SKU, p.LOC, p.CATEGORY, p.DESCRIPTION || "",
             p.METAL_KT ? p.METAL_KT + "K" : "", p.METAL_COLOR || "", p.GROSS_WT_GM || "",
             p.NET_GOLD_WT_GM || "", p.TOTAL_CT || "", pcsOf(p) || "", p.QUALITY || "",
             p.CENTER_CERT || p.CERT || "", availOf(p), sellOf(p) || ""];
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
  ALL.forEach(function (p) { if (sel.has(p.SKU)) v += sellOf(p) || 0; });
  $("#selVal").textContent = money(v);
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
    $$("#dAvail .chip").forEach(function (x) { x.classList.remove("is-on"); });
    b.classList.add("is-on");
    setStatus(detailSku, b.dataset.set);
    $("#dStamp").textContent = STOCK_ON ? "saving…" : "this device only";
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
        staff = { code: code, who: j.who };
        saveStaff($("#staffKeep").checked);
        $("#staff").hidden = true;
        $("#staffCode").value = "";
        syncPill();
        toast("Stock control open - " + j.who);
        if (detailSku && !$("#detail").hidden) openDetail(detailSku);
        flushQueue();
      })
      .catch(function () { $("#sErr").hidden = false; })
      .then(function () { btn.disabled = false; btn.textContent = "UNLOCK STOCK CONTROL"; });
  });

  $("#staffOut").addEventListener("click", function () {
    clearStaff();
    $("#staff").hidden = true;
    syncPill();
    if (detailSku && !$("#detail").hidden) openDetail(detailSku);
    toast("Stock control locked");
  });

  // internal cost view. The button is hidden on phones and tablets, so #cost in
  // the address bar is the way in on a handset - nothing a customer would ever
  // stumble into.
  function openCost() {
    $("#relock").hidden = !cost;
    $("#uErr").hidden = true; $("#pass").value = "";
    $("#unlock").hidden = false;
    setTimeout(function () { $("#pass").focus(); }, 30);
  }
  if (location.hash === "#cost") openCost();
  window.addEventListener("hashchange", function () { if (location.hash === "#cost") openCost(); });
  $("#costBtn").addEventListener("click", openCost);
  $("#unlockForm").addEventListener("submit", function (e) {
    e.preventDefault();
    var btn = $("#uGo"); btn.disabled = true; btn.textContent = "CHECKING...";
    decryptCost($("#pass").value)
      .then(function (payload) {
        cost = payload;
        if ($("#keep").checked) { try { sessionStorage.setItem(KEY + "cost", $("#pass").value); } catch (e) {} }
        $("#unlock").hidden = true;
        afterCost(); toast("Cost view open");
      })
      .catch(function () { $("#uErr").hidden = false; })
      .then(function () { btn.disabled = false; btn.textContent = "OPEN COST VIEW"; });
  });
  $("#relock").addEventListener("click", function () {
    cost = null;
    try { sessionStorage.removeItem(KEY + "cost"); } catch (e) {}
    $("#unlock").hidden = true;
    afterCost(); toast("Cost view closed");
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
