/* ==================================================================
   LEEBA SHOWS - staff pages for dubai.leeba.co
   Exhibitions: create, import stock, check, publish, close, look back.
   Talks to the LEEBA SHOWS API (Google Apps Script) set in config.js
   as SHOWS_API.  Staff only: every call carries the staff code.
================================================================== */
(function () {
"use strict";

var CFG = window.LEEBA_CONFIG || {};
var KEY = "leeba.admin.";
var API = (function () {
  var q = new URLSearchParams(location.search).get("api");
  try { if (q) localStorage.setItem(KEY + "api", q); return q || localStorage.getItem(KEY + "api") || CFG.SHOWS_API || ""; }
  catch (e) { return q || CFG.SHOWS_API || ""; }
})();
var SITE = location.origin + location.pathname.replace(/admin\/?(index\.html)?$/, "");
var REPO_TREE = "https://api.github.com/repos/dipenshah210/dubai-leeba/git/trees/main?recursive=1";
var RATES = { AED: 1, USD: 3.6725, BHD: 9.7406, SAR: 0.9793, QAR: 1.0089, OMR: 9.5389, KWD: 11.95, EUR: 4.0, GBP: 4.7, INR: 0.0435 };
var ORDER = ["RING", "EARRING", "BRACELET", "ETERNITY BAND", "NECKLACE", "PENDANT", "BANGLE", "CHAIN"];

var me = null, shows = [], cache = {};
try { me = JSON.parse(localStorage.getItem(KEY + "me") || "null"); } catch (e) { me = null; }

/* ------------------------------------------------------------ helpers */
var $ = function (s, r) { return (r || document).querySelector(s); };
var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
function esc(v) { return String(v === null || v === undefined ? "" : v).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
function n0(v) { return Math.round(v || 0).toLocaleString("en-US"); }
function aed(v) { return v || v === 0 ? "AED " + n0(v) : "—"; }
function ct(v) { return v || v === 0 ? Number(v).toFixed(2) : "—"; }
function pct(a, b) { return b ? Math.round(a / b * 100) + "%" : "—"; }
function up(v) { return String(v || "").trim().toUpperCase(); }
function toast(m, ms) { var t = $("#toast"); t.textContent = m; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(function () { t.hidden = true; }, ms || 2600); }
function rateOf(show) { return Number(show && show.aed_per_usd) || 3.6725; }
function toAed(price, cur, show) { cur = up(cur) || "AED"; return (price || 0) * (cur === "USD" ? rateOf(show) : (RATES[cur] || 1)); }
function listAed(p, show) { return p.SELLING_PRICE_USD ? Math.round(p.SELLING_PRICE_USD * rateOf(show)) : 0; }
function prettyDate(d) {
  if (!d) return "";
  var x = new Date(String(d).slice(0, 10) + "T12:00:00");
  return isNaN(x) ? String(d) : x.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}
function dates(s) { return s.start ? prettyDate(s.start) + (s.end ? " – " + prettyDate(s.end) : "") : ""; }
function isAdmin() { return me && me.role === "ADMIN"; }

/* ---------------------------------------------------------------- API */
function get(action, params) {
  var u = API + (API.indexOf("?") < 0 ? "?" : "&") + "action=" + action + "&code=" + encodeURIComponent(me ? me.code : "") +
          "&token=" + encodeURIComponent(me ? me.token : "") + "&t=" + Date.now();
  Object.keys(params || {}).forEach(function (k) { u += "&" + k + "=" + encodeURIComponent(params[k]); });
  return fetch(u).then(function (r) { return r.json(); }).then(guard);
}
function post(body) {
  body.code = me ? me.code : ""; body.token = me ? me.token : "";
  return fetch(API, { method: "POST", body: JSON.stringify(body) }).then(function (r) { return r.json(); }).then(guard);
}
function guard(j) {
  if (j && !j.ok && (j.error === "bad code" || j.error === "signed in elsewhere")) {
    signOut(); throw new Error(j.error === "bad code" ? "Staff code not accepted." : "Signed out: this code was used on another device.");
  }
  if (!j || !j.ok) throw new Error((j && j.error) || "No reply from the server");
  return j;
}
function signOut() { me = null; try { localStorage.removeItem(KEY + "me"); } catch (e) {} cache = {}; route(); }

/* ------------------------------------------------------------- Excel */
/* sheets: [{name, title, head:[...], rows:[[...]], widths:[...], money:[colIndex...]}] */
function excel(fileName, sheets) {
  var wb = new ExcelJS.Workbook(); wb.creator = "LEEBA Jewels";
  sheets.forEach(function (sh) {
    var ws = wb.addWorksheet(sh.name.slice(0, 31));
    var r0 = 1;
    if (sh.title) {
      ws.addRow([sh.title]); ws.getRow(1).font = { bold: true, size: 13, color: { argb: "FF0F4040" } };
      if (sh.sub) { ws.addRow([sh.sub]); ws.getRow(2).font = { italic: true, size: 10, color: { argb: "FF4A5A58" } }; }
      ws.addRow([]); r0 = ws.rowCount + 1;
    }
    ws.addRow(sh.head);
    ws.getRow(r0).eachCell(function (c) {
      c.font = { bold: true, color: { argb: "FFFFFFFF" } };
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2BADA5" } };
      c.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    });
    ws.getRow(r0).height = 30;
    sh.rows.forEach(function (r) { ws.addRow(r); });
    if (sh.total) { var tr = ws.addRow(sh.total); tr.font = { bold: true }; tr.eachCell(function (c) { c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF7EFDC" } }; }); }
    ws.views = [{ state: "frozen", ySplit: r0 }];
    sh.head.forEach(function (h, i) {
      var w = (sh.widths && sh.widths[i]) || Math.min(40, Math.max(10, String(h).length + 2));
      ws.getColumn(i + 1).width = w;
      if (sh.money && sh.money.indexOf(i) >= 0) ws.getColumn(i + 1).numFmt = "#,##0";
      if (sh.dec && sh.dec.indexOf(i) >= 0) ws.getColumn(i + 1).numFmt = "0.00";
    });
    ws.autoFilter = { from: { row: r0, column: 1 }, to: { row: r0, column: sh.head.length } };
  });
  return wb.xlsx.writeBuffer().then(function (buf) {
    var a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
    a.download = fileName.replace(/[^\w.() -]+/g, "-") + ".xlsx";
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 800);
    toast("Downloaded " + a.download);
  });
}

/* -------------------------------------------------------------- router */
window.addEventListener("hashchange", route);
function route() {
  var h = location.hash.replace(/^#\/?/, "").split("/");
  $("#nav").hidden = !me; $("#me").hidden = !me;
  if (me) { $("#meName").innerHTML = esc(me.who) + " · <b>" + esc(me.role) + "</b>"; }
  $$("#nav a").forEach(function (a) { a.classList.toggle("on", a.dataset.nav === (h[0] === "" || h[0] === "show" || h[0] === "new" ? "home" : h[0])); });
  if (!API) return viewNoApi();
  if (!me) return viewLogin();
  if (h[0] === "show" && h[1]) return viewShow(decodeURIComponent(h[1]), h[2] || "overview");
  if (h[0] === "new") return viewNew(h[1] ? decodeURIComponent(h[1]) : null);
  if (h[0] === "clients") return viewClients();
  if (h[0] === "settings") return viewSettings();
  return viewHome();
}
function app(html) { $("#app").innerHTML = html; window.scrollTo(0, 0); }
function fail(e) { app('<div class="err">' + esc(e.message || e) + '</div><p><a href="#/">Back to exhibitions</a></p>'); }

/* --------------------------------------------------------- not set up */
function viewNoApi() {
  app('<div class="login"><div class="card"><h1>Not connected yet</h1>' +
      '<p>The staff pages need the LEEBA SHOWS script. Once it is deployed, put its /exec address in <b>config.js</b> as ' +
      '<code>SHOWS_API</code>, or paste it here to try it on this device:</p>' +
      '<input id="apiIn" placeholder="https://script.google.com/macros/s/…/exec"><p></p>' +
      '<button class="btn dark" id="apiGo">CONNECT</button></div></div>');
  $("#apiGo").onclick = function () { var v = $("#apiIn").value.trim(); if (v) { try { localStorage.setItem(KEY + "api", v); } catch (e) {} location.reload(); } };
}

/* -------------------------------------------------------------- login */
function viewLogin() {
  app('<div class="login"><div class="card"><h1>Staff sign-in</h1><p>Exhibitions, stock imports and sales history. Use your own staff code.</p>' +
      '<form id="lf"><input id="code" type="password" placeholder="Staff code" autocomplete="off"><div class="err" id="lerr" hidden></div><p></p>' +
      '<button class="btn dark" style="width:100%;justify-content:center">SIGN IN</button></form></div></div>');
  $("#code").focus();
  $("#lf").onsubmit = function (e) {
    e.preventDefault();
    var code = $("#code").value.trim(); if (!code) return;
    fetch(API + (API.indexOf("?") < 0 ? "?" : "&") + "action=auth&code=" + encodeURIComponent(code))
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (!j.ok) throw new Error("That code was not accepted.");
        me = { code: code, token: j.token, who: j.who, role: j.role || "SALES" };
        try { localStorage.setItem(KEY + "me", JSON.stringify(me)); } catch (e2) {}
        route();
      })
      .catch(function (err) { $("#lerr").hidden = false; $("#lerr").textContent = err.message === "Failed to fetch" ? "Cannot reach the server." : err.message; });
  };
}
$("#signOut").onclick = signOut;

/* ------------------------------------------------------------- home */
function loadShows() {
  return get("shows").then(function (j) {
    shows = j.shows || [];
    if (j.role && me.role !== j.role) { me.role = j.role; try { localStorage.setItem(KEY + "me", JSON.stringify(me)); } catch (e) {} }
    return shows;
  });
}
function viewHome() {
  app('<div class="loading">Loading exhibitions…</div>');
  loadShows().then(function () {
    var list = shows.slice().sort(function (a, b) {
      var o = { LIVE: 0, DRAFT: 1, ENDED: 2, CLOSED: 3 };
      return (o[a.status] - o[b.status]) || String(b.start).localeCompare(String(a.start));
    });
    var live = list.filter(function (s) { return s.status === "LIVE"; })[0];
    var tot = list.reduce(function (t, s) { t.n += s.sold || 0; t.v += s.sold_value || 0; return t; }, { n: 0, v: 0 });
    app('<div class="head"><div><h1>Exhibitions</h1><div class="sub">' + list.length + ' shows · ' + tot.n + ' pieces sold · ' + aed(tot.v) + ' in sales</div></div>' +
        '<span class="spacer"></span>' + (isAdmin() ? '<a class="btn gold" href="#/new">+ NEW EXHIBITION</a>' : '') + '</div>' +
        (live ? '<div class="note">Live on dubai.leeba.co now: <b>' + esc(live.name) + '</b> · <a href="#/show/' + encodeURIComponent(live.tag) + '">open</a></div>' : '') +
        '<div class="shows">' + (list.map(function (s) {
          return '<a class="show st-' + esc(s.status) + '" href="#/show/' + encodeURIComponent(s.tag) + '">' +
            '<div class="row"><span class="badge ' + esc(s.status) + '">' + esc(s.status) + '</span><span class="spacer"></span><span class="small muted">' + esc(dates(s)) + '</span></div>' +
            '<h2>' + esc(s.name || s.tag) + '</h2><div class="where">' + esc([s.venue, s.city].filter(Boolean).join(" · ")) + '</div>' +
            '<div class="nums"><div class="k"><span>PIECES</span><b>' + esc(s.pieces || "—") + '</b></div>' +
            '<div class="k"><span>SOLD</span><b>' + (s.sold || 0) + '</b></div>' +
            '<div class="k"><span>SALES</span><b>' + (s.sold_value ? n0(s.sold_value / 1000) + "K" : "—") + '</b></div></div></a>';
        }).join("") || '<div class="empty">No exhibitions yet.</div>') + '</div>');
  }).catch(fail);
}

/* ================================================================ SHOW */
function loadShow(tag, force) {
  if (cache[tag] && !force && Date.now() - cache[tag].at < 60000) return Promise.resolve(cache[tag]);
  return Promise.all([get("show", { tag: tag }), get("catalog", { tag: tag }).catch(function () { return { catalog: { products: [] } }; })])
    .then(function (res) {
      var d = res[0], cat = res[1].catalog || { products: [] }, show = d.show;
      var active = {}, all = d.sales || [];
      all.forEach(function (x) { if (x.status === "ACTIVE") active[up(x.sku)] = x; });
      var items = (cat.products || []).map(function (p) {
        var k = up(p.SKU), stt = (d.stock[k] && d.stock[k].s) || "AVAILABLE";
        if (active[k]) stt = "SOLD";
        return { p: p, sku: k, status: stt, stock: d.stock[k] || null, sale: active[k] || null, list: listAed(p, show),
                 owner: p.OWNER || "LEEBA", cost: d.cost ? d.cost[k] : null };
      });
      var inList = {}; items.forEach(function (i) { inList[i.sku] = 1; });
      var stray = Object.keys(active).filter(function (k) { return !inList[k]; });
      var o = { at: Date.now(), show: show, items: items, sales: all, log: d.log || [], catalog: cat, stray: stray, role: d.role };
      cache[tag] = o;
      return o;
    });
}
function statusCounts(items) {
  var c = { AVAILABLE: 0, HOLD: 0, "MEMO OUT": 0, SOLD: 0 };
  items.forEach(function (i) { c[i.status] = (c[i.status] || 0) + 1; });
  return c;
}
function group(items, keyFn) {
  var m = {};
  items.forEach(function (i) {
    var k = keyFn(i) || "—", g = m[k] = m[k] || { key: k, n: 0, list: 0, sold: 0, soldList: 0, soldAed: 0, items: [] };
    g.n++; g.list += i.list; g.items.push(i);
    if (i.sale) { g.sold++; g.soldList += i.list; g.soldAed += i.saleAed; }
  });
  return Object.keys(m).map(function (k) { return m[k]; });
}
function bars(rows, valKey, labelFn) {
  var max = rows.reduce(function (m, r) { return Math.max(m, r[valKey] || 0); }, 0) || 1;
  return '<div class="bars">' + rows.map(function (r) {
    return '<div class="bar"><span class="l" title="' + esc(r.key) + '">' + esc(r.key) + '</span><span class="t"><i style="width:' +
      Math.round((r[valKey] || 0) / max * 100) + '%"></i></span><span class="v">' + labelFn(r) + '</span></div>';
  }).join("") + '</div>';
}

function viewShow(tag, tab) {
  app('<div class="loading">Loading ' + esc(tag) + '…</div>');
  loadShow(tag).then(function (d) {
    var s = d.show;
    d.items.forEach(function (i) { i.saleAed = i.sale ? toAed(i.sale.price, i.sale.currency, s) : 0; });
    var tabs = [["overview", "OVERVIEW"], ["stock", "STOCK"], ["sales", "SALES"], ["owners", "OWNERS & SETTLEMENT"],
                ["check", "PACKING / RETURN CHECK"], ["log", "ACTIVITY"], ["report", "IMPORT REPORT"]];
    var acts = [];
    if (s.status === "LIVE") acts.push('<a class="btn ghost sm" href="' + esc(SITE) + '" target="_blank">OPEN PUBLIC PAGE ↗</a>');
    if (isAdmin() && (s.status === "DRAFT" || s.status === "ENDED")) acts.push('<button class="btn gold sm" data-act="publish">PUBLISH TO WEBSITE</button>');
    if (isAdmin() && s.status === "DRAFT") acts.push('<a class="btn ghost sm" href="#/new/' + encodeURIComponent(s.tag) + '">RE-IMPORT STOCK</a>');
    if (isAdmin() && s.status !== "CLOSED") acts.push('<button class="btn danger sm" data-act="close">CLOSE SHOW</button>');
    if (isAdmin() && s.status === "CLOSED") acts.push('<button class="btn ghost sm" data-act="reopen">REOPEN</button>');
    acts.push('<button class="btn dark sm" data-act="exportAll">EXPORT EVERYTHING</button>');
    if (isAdmin()) acts.push('<button class="btn ghost sm" data-act="unsold">UNSOLD → NEW SHOW LIST</button>');
    acts.push('<button class="btn ghost sm" data-act="refresh">↻</button>');
    var html = '<div class="head"><div><div class="row"><span class="badge ' + esc(s.status) + '">' + esc(s.status) + '</span>' +
      '<span class="small muted">' + esc(s.tag) + '</span></div><h1>' + esc(s.name || s.tag) + '</h1><div class="sub">' +
      esc([s.venue, s.city, dates(s)].filter(Boolean).join(" · ")) + '</div></div><span class="spacer"></span><div class="row">' + acts.join("") + '</div></div>' +
      '<div class="tabs">' + tabs.map(function (t) { return '<a class="' + (t[0] === tab ? "on" : "") + '" href="#/show/' + encodeURIComponent(tag) + '/' + t[0] + '">' + t[1] + '</a>'; }).join("") + '</div>' +
      '<div id="tab"></div>';
    app(html);
    if (!d.items.length) $("#tab").innerHTML = '<div class="note">No stock list saved for this show yet.' + (isAdmin() ? ' <a href="#/new/' + encodeURIComponent(s.tag) + '">Import one</a>.' : '') + '</div>';
    ({ overview: tabOverview, stock: tabStock, sales: tabSales, owners: tabOwners, check: tabCheck, log: tabLog, report: tabReport }[tab] || tabOverview)(d);
    $$("[data-act]").forEach(function (b) { b.onclick = function () { showAction(b.dataset.act, d); }; });
  }).catch(fail);
}

function showAction(act, d) {
  var s = d.show;
  if (act === "refresh") { delete cache[s.tag]; return route(); }
  if (act === "exportAll") return exportShow(d);
  if (act === "unsold") return exportUnsold(d);
  if (act === "publish") {
    var live = shows.filter(function (x) { return x.status === "LIVE" && x.tag !== s.tag; })[0];
    if (!confirm("Publish " + (s.name || s.tag) + " to dubai.leeba.co?\n\nThe public page will show this stock list" +
                 (live ? ", replacing " + live.name + " (it will be marked ENDED; its sales stay saved)" : "") +
                 ".\nSales and HOLD / SOLD from now on go to this show.")) return;
    toast("Publishing… this takes up to a minute", 60000);
    return post({ op: "publish", tag: s.tag }).then(function () { toast("Published. The site updates in about a minute."); delete cache[s.tag]; route(); })
      .catch(function (e) { toast("Not published: " + e.message, 8000); });
  }
  if (act === "close") {
    var c = statusCounts(d.items);
    if (!confirm("Close " + (s.name || s.tag) + "?\n\n" + c.SOLD + " sold · " + (d.items.length - c.SOLD) + " coming back.\n" +
                 "Closed shows are read-only: no more sales or status changes. You can reopen it later.")) return;
    return post({ op: "setStatus", tag: s.tag, status: "CLOSED" }).then(function () { toast("Show closed"); delete cache[s.tag]; route(); }).catch(function (e) { toast(e.message, 6000); });
  }
  if (act === "reopen") return post({ op: "setStatus", tag: s.tag, status: "ENDED" }).then(function () { delete cache[s.tag]; route(); }).catch(function (e) { toast(e.message, 6000); });
}

/* ----------------------------------------------------------- overview */
function tabOverview(d) {
  var s = d.show, it = d.items, c = statusCounts(it), sold = it.filter(function (i) { return i.sale; });
  var listTot = it.reduce(function (t, i) { return t + i.list; }, 0);
  var saleTot = d.sales.filter(function (x) { return x.status === "ACTIVE"; }).reduce(function (t, x) { return t + toAed(x.price, x.currency, s); }, 0);
  var soldList = sold.reduce(function (t, i) { return t + i.list; }, 0), soldAed = sold.reduce(function (t, i) { return t + i.saleAed; }, 0);
  var cancelled = d.sales.filter(function (x) { return x.status === "CANCELLED"; }).length;
  var active = d.sales.filter(function (x) { return x.status === "ACTIVE"; });
  var byDay = {}, byPay = {}, byStaff = {};
  active.forEach(function (x) {
    var v = toAed(x.price, x.currency, s);
    [[byDay, x.date || "?"], [byPay, x.payment || "?"], [byStaff, x.by || "?"]].forEach(function (p) {
      var g = p[0][p[1]] = p[0][p[1]] || { key: p[1], n: 0, v: 0 }; g.n++; g.v += v;
    });
  });
  function rowsOf(m, sortKey) { return Object.keys(m).map(function (k) { return m[k]; }).sort(sortKey || function (a, b) { return b.v - a.v; }); }
  var cats = group(it, function (i) { return i.p.CATEGORY; }).sort(function (a, b) { return (ORDER.indexOf(a.key) + 99) % 99 - (ORDER.indexOf(b.key) + 99) % 99; });
  var owners = group(it, function (i) { return i.owner; }).sort(function (a, b) { return b.list - a.list; });
  var top = sold.slice().sort(function (a, b) { return b.saleAed - a.saleAed; }).slice(0, 10);
  var lab = function (r) { return aed(r.v) + ' <small>· ' + r.n + '</small>'; };
  $("#tab").innerHTML =
    '<div class="tiles">' +
      '<div class="tile hi"><span>SALES</span><b>' + aed(saleTot) + '</b><small>' + active.length + ' pieces sold</small></div>' +
      '<div class="tile"><span>PIECES TAKEN</span><b>' + it.length + '</b><small>list value ' + aed(listTot) + '</small></div>' +
      '<div class="tile"><span>SOLD</span><b>' + c.SOLD + '</b><small>' + pct(c.SOLD, it.length) + ' of pieces</small></div>' +
      '<div class="tile"><span>SOLD AT</span><b>' + pct(soldAed, soldList) + '</b><small>of list price on average</small></div>' +
      '<div class="tile"><span>AVAILABLE</span><b>' + c.AVAILABLE + '</b><small>' + aed(it.filter(function (i) { return i.status === "AVAILABLE"; }).reduce(function (t, i) { return t + i.list; }, 0)) + '</small></div>' +
      '<div class="tile"><span>HOLD · MEMO OUT</span><b>' + c.HOLD + ' · ' + c["MEMO OUT"] + '</b><small>' + cancelled + ' sales cancelled</small></div>' +
    '</div>' +
    (d.stray.length ? '<div class="note">Sold but not on this stock list: ' + esc(d.stray.join(", ")) + '</div>' : '') +
    '<div class="grid2">' +
      '<div class="panel"><div class="ph"><h3>SALES BY DAY</h3></div><div class="pb">' + (active.length ? bars(rowsOf(byDay, function (a, b) { return a.key.localeCompare(b.key); }).map(function (r) { r.key = prettyDate(r.key); return r; }), "v", lab) : '<p class="muted">No sales yet.</p>') + '</div></div>' +
      '<div class="panel"><div class="ph"><h3>BY CATEGORY</h3><span class="spacer"></span><span class="small muted">sold / taken</span></div><div class="pb">' + bars(cats, "soldAed", function (r) { return aed(r.soldAed) + ' <small>· ' + r.sold + '/' + r.n + '</small>'; }) + '</div></div>' +
      '<div class="panel"><div class="ph"><h3>BY OWNER</h3></div><div class="pb">' + bars(owners, "soldAed", function (r) { return aed(r.soldAed) + ' <small>· ' + r.sold + '/' + r.n + '</small>'; }) + '</div></div>' +
      '<div class="panel"><div class="ph"><h3>BY PAYMENT</h3></div><div class="pb">' + (active.length ? bars(rowsOf(byPay), "v", lab) : '<p class="muted">—</p>') + '</div></div>' +
      '<div class="panel"><div class="ph"><h3>BY STAFF</h3></div><div class="pb">' + (active.length ? bars(rowsOf(byStaff), "v", lab) : '<p class="muted">—</p>') + '</div></div>' +
      '<div class="panel"><div class="ph"><h3>TOP SALES</h3></div><div class="pb">' + (top.length ? '<table class="t"><tbody>' + top.map(function (i) {
        return '<tr><td><b>' + esc(i.sku) + '</b><br><span class="small muted">' + esc(i.p.CATEGORY) + ' · ' + esc(i.p.DESCRIPTION || "") + '</span></td><td>' + esc(i.sale.client) + '</td><td class="n">' + aed(i.saleAed) + '</td></tr>';
      }).join("") + '</tbody></table>' : '<p class="muted">—</p>') + '</div></div>' +
    '</div>';
}

/* --------------------------------------------------------------- stock */
function tabStock(d) {
  var it = d.items, owners = {}, cats = {};
  it.forEach(function (i) { owners[i.owner] = 1; cats[i.p.CATEGORY] = 1; });
  $("#tab").innerHTML = '<div class="filters"><input id="fq" placeholder="Search barcode, design, client…">' +
    '<select id="fs"><option value="">All statuses</option><option>AVAILABLE</option><option>HOLD</option><option>MEMO OUT</option><option>SOLD</option><option value="NOT SOLD">Not sold (coming back)</option></select>' +
    '<select id="fo"><option value="">All owners</option>' + Object.keys(owners).sort().map(function (o) { return '<option>' + esc(o) + '</option>'; }).join("") + '</select>' +
    '<select id="fc"><option value="">All categories</option>' + Object.keys(cats).sort().map(function (o) { return '<option>' + esc(o) + '</option>'; }).join("") + '</select>' +
    '<span class="spacer"></span><span class="small muted" id="fn"></span><button class="btn dark sm" id="fx">EXPORT THIS LIST</button></div><div class="tw" id="tt"></div>';
  function pick() {
    var q = $("#fq").value.toLowerCase().trim(), st = $("#fs").value, o = $("#fo").value, c = $("#fc").value;
    return it.filter(function (i) {
      if (st === "NOT SOLD" ? i.status === "SOLD" : st && i.status !== st) return false;
      if (o && i.owner !== o) return false;
      if (c && i.p.CATEGORY !== c) return false;
      if (q && [i.sku, i.p.DESCRIPTION, i.p.CATEGORY, i.p.SHAPES, i.p.QUALITY, i.sale && i.sale.client].join(" ").toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
  }
  function draw() {
    var l = pick(), adm = isAdmin() && l.some(function (i) { return i.cost; });
    $("#fn").textContent = l.length + " pieces · " + aed(l.reduce(function (t, i) { return t + i.list; }, 0));
    $("#tt").innerHTML = '<table class="t"><thead><tr><th>#</th><th>BARCODE</th><th>OWNER</th><th>CATEGORY</th><th>DESCRIPTION</th><th class="n">CT</th><th class="n">GW</th><th>QUALITY</th><th class="n">LIST AED</th>' +
      (adm ? '<th class="n">COST</th>' : '') + '<th>STATUS</th><th>SOLD TO</th><th class="n">SOLD FOR</th></tr></thead><tbody>' +
      l.slice(0, 1500).map(function (i, k) {
        return '<tr><td>' + (k + 1) + '</td><td><b>' + esc(i.sku) + '</b></td><td>' + esc(i.owner) + '</td><td>' + esc(i.p.CATEGORY) + '</td><td>' + esc(i.p.DESCRIPTION || "") +
          '</td><td class="n">' + ct(i.p.TOTAL_CT) + '</td><td class="n">' + ct(i.p.GROSS_WT_GM) + '</td><td>' + esc(i.p.QUALITY || "") + '</td><td class="n">' + n0(i.list) + '</td>' +
          (adm ? '<td class="n">' + (i.cost ? n0(i.cost.cost) + " " + esc(i.cost.cur) : "") + '</td>' : '') +
          '<td><span class="st ' + esc(i.status.replace(/\s/g, "")) + '">' + esc(i.status) + '</span>' + (i.stock && i.stock.by && i.status !== "AVAILABLE" ? '<br><span class="small muted">' + esc(i.stock.by) + '</span>' : '') + '</td>' +
          '<td>' + esc(i.sale ? i.sale.client : "") + '</td><td class="n">' + (i.sale ? n0(i.sale.price) + " " + esc(i.sale.currency) : "") + '</td></tr>';
      }).join("") + '</tbody></table>';
  }
  ["#fq", "#fs", "#fo", "#fc"].forEach(function (k) { $(k).oninput = draw; });
  $("#fx").onclick = function () { stockSheet(d, pick(), d.show.tag + " stock"); };
  draw();
}
function stockRows(d, l) {
  var adm = isAdmin();
  return l.map(function (i, k) {
    var r = [k + 1, i.sku, i.owner, i.p.CATEGORY, i.p.DESCRIPTION || "", i.p.METAL_RAW || "", i.p.TOTAL_CT, i.p.GROSS_WT_GM, i.p.NET_GOLD_WT_GM,
             i.p.QUALITY || "", i.list || "", i.status, i.sale ? i.sale.client : "", i.sale ? i.sale.price : "", i.sale ? i.sale.currency : "",
             i.sale ? Math.round(i.saleAed) : "", i.sale ? i.sale.date : "", i.sale ? i.sale.payment : "", i.sale ? i.sale.by : ""];
    if (adm) r.push(i.cost ? i.cost.cost : "", i.cost ? i.cost.cur : "");
    return r;
  });
}
var STOCK_HEAD = ["#", "BARCODE", "OWNER", "CATEGORY", "DESCRIPTION", "METAL", "TOTAL CT", "GW (g)", "NW (g)", "QUALITY", "LIST PRICE (AED)", "STATUS",
                  "SOLD TO", "SOLD FOR", "CURRENCY", "SOLD FOR (AED)", "SALE DATE", "PAYMENT", "SOLD BY"];
function stockSheet(d, l, name) {
  var head = STOCK_HEAD.concat(isAdmin() ? ["COST", "COST CURRENCY"] : []);
  return excel("LEEBA " + name, [{ name: "STOCK", title: (d.show.name || d.show.tag) + " — stock", sub: l.length + " pieces · exported " + new Date().toLocaleString("en-GB"),
    head: head, rows: stockRows(d, l), widths: [5, 22, 13, 14, 34, 12, 9, 9, 9, 12, 13, 11, 22, 11, 9, 13, 12, 10, 14], money: [10, 13, 15, 19], dec: [6, 7, 8] }]);
}

/* --------------------------------------------------------------- sales */
function tabSales(d) {
  var s = d.show, l = d.sales.slice().reverse(), by = {};
  d.items.forEach(function (i) { by[i.sku] = i; });
  var act = l.filter(function (x) { return x.status === "ACTIVE"; });
  var tot = act.reduce(function (t, x) { return t + toAed(x.price, x.currency, s); }, 0);
  $("#tab").innerHTML = '<div class="filters"><input id="sq" placeholder="Search client, barcode, staff…"><span class="spacer"></span>' +
    '<span class="small muted">' + act.length + ' sales · ' + aed(tot) + '</span><button class="btn dark sm" id="sx">EXPORT SALES</button></div><div class="tw" id="st"></div>';
  function draw() {
    var q = $("#sq").value.toLowerCase().trim();
    var rows = l.filter(function (x) { return !q || [x.client, x.sku, x.by, x.payment, x.remark, x.phone].join(" ").toLowerCase().indexOf(q) >= 0; });
    $("#st").innerHTML = '<table class="t"><thead><tr><th>DATE</th><th>TIME</th><th>BARCODE</th><th>ITEM</th><th>CLIENT</th><th class="n">PRICE</th><th class="n">LIST AED</th><th>PAYMENT</th><th>BY</th><th>REMARK</th><th>STATUS</th></tr></thead><tbody>' +
      rows.map(function (x) {
        var i = by[x.sku];
        return '<tr class="' + (x.status === "CANCELLED" ? "x" : "") + '"><td>' + esc(prettyDate(x.date)) + '</td><td>' + esc(x.time) + '</td><td><b>' + esc(x.sku) + '</b></td><td>' +
          esc([x.category, x.description].filter(Boolean).join(" · ")) + '</td><td>' + esc(x.client) + (x.phone ? '<br><span class="small muted">' + esc(x.phone) + '</span>' : '') + '</td><td class="n">' + n0(x.price) + ' ' + esc(x.currency) +
          '</td><td class="n">' + (i ? n0(i.list) : "") + '</td><td>' + esc(x.payment) + '</td><td>' + esc(x.by) + '</td><td>' + esc(x.remark) + '</td><td>' + esc(x.status) + '</td></tr>';
      }).join("") + '</tbody></table>';
  }
  $("#sq").oninput = draw; draw();
  $("#sx").onclick = function () { excel("LEEBA " + s.tag + " sales", [salesSheet(d)]); };
}
function salesSheet(d) {
  var s = d.show, by = {};
  d.items.forEach(function (i) { by[i.sku] = i; });
  return { name: "SALES", title: (s.name || s.tag) + " — sales", sub: dates(s),
    head: ["DATE", "TIME", "BARCODE", "OWNER", "CATEGORY", "DESCRIPTION", "CLIENT", "PHONE", "PRICE", "CURRENCY", "PRICE (AED)", "LIST PRICE (AED)", "PAYMENT", "SOLD BY", "REMARK", "STATUS", "CANCELLED BY"],
    rows: d.sales.map(function (x) { var i = by[x.sku]; return [x.date, x.time, x.sku, i ? i.owner : "", x.category, x.description, x.client, x.phone || "", x.price, x.currency, Math.round(toAed(x.price, x.currency, s)), i ? i.list : "", x.payment, x.by, x.remark, x.status, x.cancelledBy || ""]; }),
    widths: [11, 7, 22, 13, 13, 30, 24, 14, 11, 9, 12, 13, 10, 14, 22, 11, 14], money: [8, 10, 11] };
}

/* -------------------------------------------------------------- owners */
function tabOwners(d) {
  var s = d.show, gs = group(d.items, function (i) { return i.owner; }).sort(function (a, b) { return (a.key !== "LEEBA") - (b.key !== "LEEBA") || b.list - a.list; });
  $("#tab").innerHTML = '<div class="row" style="margin-bottom:12px"><span class="muted small">Each owner\'s pieces at this show: what sold, at what price, and what goes back.</span><span class="spacer"></span>' +
    '<button class="btn dark sm" id="ox">ALL OWNERS — SETTLEMENT EXCEL</button></div>' +
    '<div class="tw"><table class="t"><thead><tr><th>OWNER</th><th class="n">TAKEN</th><th class="n">LIST VALUE</th><th class="n">SOLD</th><th class="n">SOLD FOR (AED)</th><th class="n">LIST OF SOLD</th>' +
    '<th class="n">SOLD AT</th><th class="n">GOING BACK</th><th class="n">VALUE GOING BACK</th><th></th></tr></thead><tbody>' +
    gs.map(function (g) {
      return '<tr><td><b>' + esc(g.key) + '</b></td><td class="n">' + g.n + '</td><td class="n">' + n0(g.list) + '</td><td class="n">' + g.sold + '</td><td class="n">' + n0(g.soldAed) +
        '</td><td class="n">' + n0(g.soldList) + '</td><td class="n">' + pct(g.soldAed, g.soldList) + '</td><td class="n">' + (g.n - g.sold) + '</td><td class="n">' + n0(g.list - g.soldList) +
        '</td><td><button class="btn ghost sm" data-own="' + esc(g.key) + '">SETTLEMENT</button></td></tr>';
    }).join("") + '</tbody></table></div>';
  $$("[data-own]").forEach(function (b) { b.onclick = function () { settlement(d, [b.dataset.own]); }; });
  $("#ox").onclick = function () { settlement(d, gs.map(function (g) { return g.key; })); };
}
function settlement(d, owners) {
  var s = d.show, adm = isAdmin(), sheets = [], sum = [];
  owners.forEach(function (o) {
    var l = d.items.filter(function (i) { return i.owner === o; }), sold = l.filter(function (i) { return i.sale; }), back = l.filter(function (i) { return !i.sale; });
    var soldAed = sold.reduce(function (t, i) { return t + i.saleAed; }, 0);
    sum.push([o, l.length, l.reduce(function (t, i) { return t + i.list; }, 0), sold.length, Math.round(soldAed), sold.reduce(function (t, i) { return t + i.list; }, 0), back.length,
              back.reduce(function (t, i) { return t + i.list; }, 0)].concat(adm ? [sold.reduce(function (t, i) { return t + (i.cost ? i.cost.cost : 0); }, 0)] : []));
    var sh = ["BARCODE", "CATEGORY", "DESCRIPTION", "TOTAL CT", "GW (g)", "LIST (AED)", "SOLD FOR", "CURRENCY", "SOLD FOR (AED)", "DATE", "CLIENT", "PAYMENT"].concat(adm ? ["COST", "COST CUR"] : []);
    sheets.push({ name: (o + " SOLD").slice(0, 31), title: o + " — sold at " + (s.name || s.tag), sub: sold.length + " pieces · " + aed(soldAed), head: sh,
      rows: sold.map(function (i) { return [i.sku, i.p.CATEGORY, i.p.DESCRIPTION || "", i.p.TOTAL_CT, i.p.GROSS_WT_GM, i.list, i.sale.price, i.sale.currency, Math.round(i.saleAed), i.sale.date, i.sale.client, i.sale.payment]
        .concat(adm ? [i.cost ? i.cost.cost : "", i.cost ? i.cost.cur : ""] : []); }),
      widths: [22, 13, 30, 9, 9, 12, 11, 9, 13, 11, 22, 10], money: [5, 6, 8], dec: [3, 4] });
    sheets.push({ name: (o + " BACK").slice(0, 31), title: o + " — going back from " + (s.name || s.tag), sub: back.length + " pieces", head: ["BARCODE", "CATEGORY", "DESCRIPTION", "TOTAL CT", "GW (g)", "NW (g)", "LIST (AED)", "STATUS"],
      rows: back.map(function (i) { return [i.sku, i.p.CATEGORY, i.p.DESCRIPTION || "", i.p.TOTAL_CT, i.p.GROSS_WT_GM, i.p.NET_GOLD_WT_GM, i.list, i.status]; }),
      widths: [22, 13, 30, 9, 9, 9, 12, 11], money: [6], dec: [3, 4, 5] });
  });
  sheets.unshift({ name: "SUMMARY", title: "Owner settlement — " + (s.name || s.tag), sub: dates(s) + " · exported " + new Date().toLocaleString("en-GB"),
    head: ["OWNER", "TAKEN", "LIST VALUE (AED)", "SOLD", "SOLD FOR (AED)", "LIST OF SOLD (AED)", "GOING BACK", "VALUE GOING BACK (AED)"].concat(adm ? ["COST OF SOLD"] : []),
    rows: sum, widths: [16, 9, 16, 8, 15, 16, 12, 18, 14], money: [2, 4, 5, 7, 8] });
  return excel("LEEBA " + s.tag + " settlement" + (owners.length === 1 ? " " + owners[0] : ""), sheets);
}

/* ---------------------------------------------------------- packing check */
function tabCheck(d) {
  $("#tab").innerHTML = '<div class="panel"><div class="pb"><div class="row" style="margin-bottom:10px">' +
    '<label class="row small"><input type="radio" name="ck" value="PACKING" checked style="width:auto"> <b>Packing</b> — compare with the full stock list</label>' +
    '<label class="row small"><input type="radio" name="ck" value="RETURN" style="width:auto"> <b>Return</b> — compare with what did not sell</label></div>' +
    '<textarea id="ckIn" placeholder="Scan or paste barcodes here, one per line (or copy a column from Excel)"></textarea>' +
    '<div class="row" style="margin-top:10px"><button class="btn dark" id="ckGo">CHECK</button><span class="spacer"></span><span class="small muted">Barcode scanners that type into a box work here too.</span></div>' +
    '<div id="ckOut"></div></div></div>';
  $("#ckGo").onclick = function () {
    var mode = $("input[name=ck]:checked").value;
    var got = {}, order = [];
    $("#ckIn").value.split(/[\s,;]+/).map(up).filter(Boolean).forEach(function (b) { if (!got[b]) { got[b] = 1; order.push(b); } });
    var want = d.items.filter(function (i) { return mode === "PACKING" || !i.sale; }), wantK = {};
    want.forEach(function (i) { wantK[i.sku] = i; });
    var byB = {}; d.items.forEach(function (i) { byB[i.sku] = i; byB[up(i.p.BARCODE)] = i; });
    var found = order.filter(function (b) { return wantK[b] || (byB[b] && wantK[byB[b].sku]); });
    var missing = want.filter(function (i) { return !got[i.sku] && !got[up(i.p.BARCODE)]; });
    var extra = order.filter(function (b) { return !byB[b]; });
    var soldScanned = mode === "RETURN" ? order.filter(function (b) { return byB[b] && byB[b].sale; }) : [];
    function li(i) { return '<li><b>' + esc(i.sku) + '</b> · ' + esc(i.p.CATEGORY) + ' · ' + esc(i.p.DESCRIPTION || "") + ' · ' + esc(i.owner) + '</li>'; }
    $("#ckOut").innerHTML = '<div class="tiles" style="margin-top:14px"><div class="tile"><span>EXPECTED</span><b>' + want.length + '</b></div>' +
      '<div class="tile"><span>COUNTED</span><b>' + found.length + '</b></div><div class="tile' + (missing.length ? " hi" : "") + '"><span>MISSING</span><b>' + missing.length + '</b></div>' +
      '<div class="tile"><span>NOT ON THE LIST</span><b>' + extra.length + '</b></div>' + (mode === "RETURN" ? '<div class="tile"><span>SCANNED BUT SOLD</span><b>' + soldScanned.length + '</b></div>' : '') + '</div>' +
      '<div class="check-out"><div class="card"><h3>MISSING (' + missing.length + ')</h3><ul>' + missing.map(li).join("") + '</ul></div>' +
      '<div class="card"><h3>NOT ON THE LIST (' + extra.length + ')</h3><ul>' + extra.map(function (b) { return '<li>' + esc(b) + '</li>'; }).join("") + '</ul></div>' +
      (soldScanned.length ? '<div class="card"><h3>SCANNED BUT MARKED SOLD</h3><ul>' + soldScanned.map(function (b) { return li(byB[b]); }).join("") + '</ul></div>' : '') + '</div>' +
      '<div class="row" style="margin-top:12px"><button class="btn gold" id="ckSave">SAVE THIS CHECK TO THE LOG</button><button class="btn ghost" id="ckX">DOWNLOAD RESULT</button></div>';
    $("#ckSave").onclick = function () {
      post({ op: "check", tag: d.show.tag, kind: mode, found: found.length, missing: missing.map(function (i) { return i.sku; }), extra: extra })
        .then(function () { toast("Saved to the activity log"); delete cache[d.show.tag]; }).catch(function (e) { toast(e.message, 6000); });
    };
    $("#ckX").onclick = function () {
      excel("LEEBA " + d.show.tag + " " + mode.toLowerCase() + " check", [
        { name: "MISSING", title: mode + " check — missing", sub: new Date().toLocaleString("en-GB"), head: ["BARCODE", "OWNER", "CATEGORY", "DESCRIPTION", "TOTAL CT", "LIST (AED)", "STATUS"],
          rows: missing.map(function (i) { return [i.sku, i.owner, i.p.CATEGORY, i.p.DESCRIPTION || "", i.p.TOTAL_CT, i.list, i.status]; }), widths: [22, 13, 13, 30, 9, 12, 11], money: [5] },
        { name: "NOT ON LIST", head: ["BARCODE"], rows: extra.map(function (b) { return [b]; }), widths: [24] },
        { name: "COUNTED", head: ["BARCODE"], rows: found.map(function (b) { return [b]; }), widths: [24] }]);
    };
  };
}

/* ----------------------------------------------------------------- log */
function tabLog(d) {
  var l = d.log.slice().reverse();
  $("#tab").innerHTML = '<p class="small muted">The last ' + l.length + ' changes: HOLD / SOLD / MEMO OUT, cancelled sales, packing and return checks.</p><div class="tw"><table class="t"><thead><tr><th>WHEN</th><th>BARCODE</th><th>FROM</th><th>TO</th><th>BY</th><th>NOTE</th></tr></thead><tbody>' +
    l.map(function (x) { return '<tr><td>' + esc(x.when) + '</td><td><b>' + esc(x.sku) + '</b></td><td>' + esc(x.from) + '</td><td>' + esc(x.to) + '</td><td>' + esc(x.by) + '</td><td>' + esc(x.note) + '</td></tr>'; }).join("") +
    '</tbody></table></div>';
}

/* -------------------------------------------------------------- report */
function tabReport(d) {
  $("#tab").innerHTML = '<div class="loading">Loading the import report…</div>';
  get("report", { tag: d.show.tag }).then(function (j) { $("#tab").innerHTML = reportHtml(j.report, d.show); wireReport(j.report, d.show.tag); })
    .catch(function () { $("#tab").innerHTML = '<div class="note">No import report for this show — it was set up before the import page existed.</div>'; });
}

/* ---------------------------------------------------- exports (whole show) */
function exportShow(d) {
  var s = d.show, c = statusCounts(d.items);
  var sum = [["Show", s.name || s.tag], ["Where", [s.venue, s.city].filter(Boolean).join(", ")], ["Dates", dates(s)], ["Status", s.status],
             ["Pieces taken", d.items.length], ["List value (AED)", d.items.reduce(function (t, i) { return t + i.list; }, 0)],
             ["Sold", c.SOLD], ["Sales (AED)", Math.round(d.items.reduce(function (t, i) { return t + i.saleAed; }, 0))],
             ["Available", c.AVAILABLE], ["Hold", c.HOLD], ["Memo out", c["MEMO OUT"]],
             ["Cancelled sales", d.sales.filter(function (x) { return x.status === "CANCELLED"; }).length]];
  var cats = group(d.items, function (i) { return i.p.CATEGORY; }), owners = group(d.items, function (i) { return i.owner; });
  var gh = ["", "TAKEN", "LIST VALUE (AED)", "SOLD", "SOLD FOR (AED)", "GOING BACK"];
  var gr = function (g) { return [g.key, g.n, g.list, g.sold, Math.round(g.soldAed), g.n - g.sold]; };
  excel("LEEBA " + s.tag + " full report", [
    { name: "SUMMARY", title: (s.name || s.tag) + " — show summary", sub: "exported " + new Date().toLocaleString("en-GB"), head: ["", ""], rows: sum, widths: [24, 40] },
    { name: "BY CATEGORY", head: ["CATEGORY"].concat(gh.slice(1)), rows: cats.map(gr), widths: [16, 9, 16, 8, 15, 12], money: [2, 4] },
    { name: "BY OWNER", head: ["OWNER"].concat(gh.slice(1)), rows: owners.map(gr), widths: [16, 9, 16, 8, 15, 12], money: [2, 4] },
    salesSheet(d),
    { name: "STOCK", head: STOCK_HEAD.concat(isAdmin() ? ["COST", "COST CURRENCY"] : []), rows: stockRows(d, d.items), widths: [5, 22, 13, 14, 34, 12, 9, 9, 9, 12, 13, 11, 22, 11, 9, 13, 12, 10, 14], money: [10, 13, 15], dec: [6, 7, 8] },
    { name: "ACTIVITY", head: ["WHEN", "BARCODE", "FROM", "TO", "BY", "NOTE"], rows: d.log.map(function (x) { return [x.when, x.sku, x.from, x.to, x.by, x.note]; }), widths: [17, 22, 11, 11, 14, 50] }
  ]);
}
/* unsold pieces in the show-list layout, ready to import as the next show */
function exportUnsold(d) {
  var l = d.items.filter(function (i) { return !i.sale; });
  excel("LEEBA " + d.show.tag + " unsold - next show list", [{ name: "Sheet1",
    head: ["NO", "STOCK ID", "ITEM", "JEWELERY DETAILS", "TOTAL CRT", "METAL", "GW", "NGW", "PRICE", "OWNER"],
    rows: l.map(function (i, k) { return [k + 1, i.p.BARCODE || i.sku, i.p.CATEGORY, i.p.DESCRIPTION || "", i.p.TOTAL_CT, i.p.METAL_RAW || "", i.p.GROSS_WT_GM, i.p.NET_GOLD_WT_GM,
      i.cost && i.cost.cost ? i.cost.cost : (i.p.SELLING_PRICE_USD || ""), i.owner]; }),
    widths: [6, 22, 13, 32, 10, 10, 8, 8, 11, 13], dec: [4, 6, 7] }]).then(function () {
    toast(l.some(function (i) { return i.cost && i.cost.cost; }) ? "PRICE column = cost: use the same multiplier when importing" : "PRICE column = selling price in USD: import with × 1 USD", 7000);
  });
}

/* ================================================================ NEW SHOW */
var W = null;    // wizard state
function ownerRules() {
  try { var v = JSON.parse(localStorage.getItem(KEY + "owners") || "null"); if (v) return v; } catch (e) {}
  return { prefixes: [["DJ-", "LEEBA"], ["INDIA-", "LEEBA"], ["L", "LEEBA"], ["C", "RISING STAR"], ["RISING", "RISING STAR"], ["SSM-", "SMITBHAI"], ["RUBY", "RUBY"]],
           suffixes: [["-LGD", "PARTH"]], fallback: "LEEBA" };
}
function saveOwnerRules(o) { try { localStorage.setItem(KEY + "owners", JSON.stringify(o)); } catch (e) {} }
function slug(name, start) { return (up(name).replace(/[^A-Z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 32) + (start ? "-" + String(start).slice(0, 4) : "")).replace(/--+/g, "-"); }

function viewNew(tag) {
  if (!isAdmin()) return app('<div class="err">Only ADMIN staff can create exhibitions.</div>');
  if (!shows.length) { app('<div class="loading">Loading…</div>'); return loadShows().then(function () { viewNew(tag); }).catch(fail); }
  var base = tag ? shows.filter(function (s) { return s.tag === tag; })[0] : null;
  var pr = {}; try { pr = base && base.pricing ? JSON.parse(base.pricing) : {}; } catch (e) {}
  W = { list: null, files: [], show: base ? { name: base.name, venue: base.venue, city: base.city, start: base.start, end: base.end, tag: base.tag, currency: base.currency || "AED", rate: base.aed_per_usd || 3.6725, notes: base.notes || "" }
                                       : { currency: "AED", rate: 3.6725 },
        pricing: pr.mode ? pr : { mode: "mult", mult: 3.5, colCur: "USD", outCur: "USD", ownerMult: {} }, owners: ownerRules(), result: null, editing: !!base };
  var S = W.show;
  app('<div class="head"><div><h1>' + (base ? "Re-import stock · " + esc(base.name) : "New exhibition") + '</h1><div class="sub">Fill in the show, add the files, check the report, then save or publish.</div></div></div>' +
    '<div class="steps">' +
    '<section class="step"><h2>Show details</h2><div class="sb"><div class="fg">' +
      '<label>NAME<input id="sName" value="' + esc(S.name || "") + '" placeholder="Jewellery Arabia"></label>' +
      '<label>VENUE<input id="sVenue" value="' + esc(S.venue || "") + '" placeholder="Exhibition World Bahrain"></label>' +
      '<label>CITY / COUNTRY<input id="sCity" value="' + esc(S.city || "") + '" placeholder="Bahrain"></label>' +
      '<label>FIRST DAY<input id="sStart" type="date" value="' + esc(S.start || "") + '"></label>' +
      '<label>LAST DAY<input id="sEnd" type="date" value="' + esc(S.end || "") + '"></label>' +
      '<label>SHORT CODE <em>for files and tabs</em><input id="sTag" value="' + esc(S.tag || "") + '"' + (base ? " disabled" : "") + '></label>' +
      '<label>LOCAL CURRENCY<select id="sCur">' + Object.keys(RATES).map(function (c) { return '<option' + (c === S.currency ? " selected" : "") + '>' + c + '</option>'; }).join("") + '</select></label>' +
      '<label>AED PER USD<input id="sRate" type="number" step="0.0001" value="' + esc(S.rate) + '"></label>' +
      '<label style="grid-column:1/-1">NOTES <em>optional</em><input id="sNotes" value="' + esc(S.notes || "") + '" placeholder="Booth number, team, anything to remember"></label>' +
    '</div></div></section>' +

    '<section class="step"><h2>Stock files</h2><div class="sb">' +
      '<div class="lab">SHOW LIST <em style="font-weight:600;letter-spacing:0;color:var(--ink-3)">— the pieces going to the show (photos inside it are used too)</em></div>' +
      '<label class="drop" id="dList"><input type="file" accept=".xlsx" id="fList">Drop the show list here, or click to choose</label>' +
      '<div class="row small" style="margin:6px 0 14px"><span class="muted">or start from a past show\'s unsold pieces:</span><select id="fromShow" style="width:auto"><option value="">—</option>' +
        shows.map(function (s) { return '<option value="' + esc(s.tag) + '">' + esc(s.name || s.tag) + '</option>'; }).join("") + '</select></div>' +
      '<div class="files" id="listInfo"></div><div id="mapBox"></div>' +
      '<div class="lab" style="margin-top:16px">DETAIL FILES <em style="font-weight:600;letter-spacing:0;color:var(--ink-3)">— DUBAI JEWELRY STOCK, LB TASK, partner stone lists… as many as you like</em></div>' +
      '<label class="drop" id="dFiles"><input type="file" accept=".xlsx" multiple id="fFiles">Drop detail files here, or click to choose</label>' +
      '<div class="files" id="fileInfo"></div>' +
      '<p class="small muted">Earlier shows\' stock lists are used automatically, so checked diamond details carry over.</p>' +
    '</div></section>' +

    '<section class="step"><h2>Prices and owners</h2><div class="sb">' +
      '<div class="presets"><span class="small muted">Quick pick:</span>' +
        '<button class="btn ghost sm" data-pre="cost35">Cost (USD) × 3.5 — Bahrain</button>' +
        '<button class="btn ghost sm" data-pre="aed35">Price × 3.5 → AED — Abu Dhabi</button>' +
        '<button class="btn ghost sm" data-pre="asis">Price is the selling price (USD)</button>' +
        '<button class="btn ghost sm" data-pre="formula">Stock-file formula (carats × tag × 4 + gold)</button></div>' +
      '<div id="priceBox"></div>' +
      '<h3 style="margin:18px 0 8px">OWNER RULES</h3><p class="small muted" style="margin-top:0">An OWNER column in the show list wins; then the owner at an earlier show; then these barcode rules.</p><div id="ownBox"></div>' +
    '</div></section>' +

    '<section class="step"><h2>Check</h2><div class="sb"><button class="btn dark" id="build">BUILD AND CHECK THE STOCK LIST</button><div class="prog" id="bProg"></div><div id="report"></div></div></section>' +
    '<section class="step" id="saveStep" hidden><h2>Save</h2><div class="sb"><div id="saveBox"></div></div></section>' +
    '</div>');

  ["sName", "sStart"].forEach(function (id) { $("#" + id).oninput = function () { if (!base && !$("#sTag").dataset.touched) $("#sTag").value = slug($("#sName").value, $("#sStart").value); }; });
  $("#sTag").oninput = function () { this.dataset.touched = 1; };
  dropZone("#dList", "#fList", function (fs) { readList(fs[0]); });
  dropZone("#dFiles", "#fFiles", function (fs) { Array.prototype.forEach.call(fs, readDetail); });
  $("#fromShow").onchange = function () { if (this.value) listFromShow(this.value); };
  $$("[data-pre]").forEach(function (b) { b.onclick = function () { preset(b.dataset.pre); }; });
  drawPrice(); drawOwners();
  $("#build").onclick = runBuild;
}
function dropZone(zone, input, cb) {
  var z = $(zone), i = $(input);
  i.onchange = function () { if (i.files.length) cb(i.files); i.value = ""; };
  z.ondragover = function (e) { e.preventDefault(); z.classList.add("on"); };
  z.ondragleave = function () { z.classList.remove("on"); };
  z.ondrop = function (e) { e.preventDefault(); z.classList.remove("on"); if (e.dataTransfer.files.length) cb(e.dataTransfer.files); };
}
function readFileBook(file) { return file.arrayBuffer().then(LeebaImport.readBook); }
function readList(file) {
  $("#listInfo").innerHTML = '<div class="file">Reading <b>' + esc(file.name) + '</b>…</div>';
  readFileBook(file).then(function (sheets) {
    var cands = sheets.map(function (sh) { var c = LeebaImport.classify(sh); return { sh: sh, c: c }; }).filter(function (x) { return x.c.kind === "list"; });
    if (!cands.length) { $("#listInfo").innerHTML = '<div class="err">No sheet in ' + esc(file.name) + ' has a STOCK ID / BARCODE column.</div>'; return; }
    W.listFile = { name: file.name, sheets: sheets, cands: cands };
    pickListSheet(0);
  }).catch(function (e) { $("#listInfo").innerHTML = '<div class="err">Could not read ' + esc(file.name) + ': ' + esc(e.message) + '</div>'; });
}
function pickListSheet(k) {
  var x = W.listFile.cands[k], rows = x.sh.rows, pieces = rows.slice(x.c.headerRow + 1).filter(function (r) { return r[x.c.cols.sku] != null && String(r[x.c.cols.sku]).trim(); }).length;
  W.list = { sheet: x.sh, headerRow: x.c.headerRow, cols: Object.assign({}, x.c.cols) };
  $("#listInfo").innerHTML = '<div class="file"><b>' + esc(W.listFile.name) + '</b>' +
    (W.listFile.cands.length > 1 ? '<select id="lsPick" style="width:auto">' + W.listFile.cands.map(function (c, i) { return '<option value="' + i + '"' + (i === k ? " selected" : "") + '>' + esc(c.sh.name) + '</option>'; }).join("") + '</select>' : '<span class="chip k-list">' + esc(x.sh.name) + '</span>') +
    '<span>' + pieces + ' pieces</span><span>' + (x.sh.pics.length ? x.sh.pics.length + " photos inside" : "no photos inside") + '</span></div>';
  if ($("#lsPick")) $("#lsPick").onchange = function () { pickListSheet(+this.value); };
  drawMap();
}
function drawMap() {
  var head = W.list.sheet.rows[W.list.headerRow] || [], cols = W.list.cols;
  var names = { no: "No.", sku: "Barcode *", item: "Category", desc: "Description", ct: "Total carat", metal: "Metal", gw: "Gross weight", ngw: "Net weight", price: "Price", tag: "Tag $/ct", owner: "Owner", tone: "Metal tone" };
  $("#mapBox").innerHTML = '<p class="small muted" style="margin:12px 0 6px">Columns found — change any that are wrong:</p><div class="map">' + Object.keys(names).map(function (k) {
    return '<label class="lab">' + names[k].toUpperCase() + '<select data-col="' + k + '"><option value="">—</option>' + head.map(function (h, i) {
      return h === null || h === undefined || h === "" ? "" : '<option value="' + i + '"' + (cols[k] === i ? " selected" : "") + '>' + esc(String.fromCharCode(65 + (i % 26))) + ' · ' + esc(String(h).slice(0, 26)) + '</option>';
    }).join("") + '</select></label>';
  }).join("") + '</div>';
  $$("[data-col]").forEach(function (sel) { sel.onchange = function () { if (this.value === "") delete W.list.cols[this.dataset.col]; else W.list.cols[this.dataset.col] = +this.value; }; });
}
function readDetail(file) {
  var el = document.createElement("div"); el.className = "file"; el.innerHTML = 'Reading <b>' + esc(file.name) + '</b>…';
  $("#fileInfo").appendChild(el);
  readFileBook(file).then(function (sheets) {
    var useful = sheets.map(function (sh) { return { name: sh.name, kind: LeebaImport.classify(sh).kind }; }).filter(function (x) { return x.kind !== "other" && x.kind !== "list"; });
    W.files.push({ name: file.name, short: file.name.replace(/\.xlsx$/i, ""), sheets: sheets });
    var labels = { dubai: "stock sheet", dmd: "diamond rows", ord: "order list", blocks: "diamond details", stones: "stone list" };
    el.innerHTML = '<b>' + esc(file.name) + '</b>' + (useful.length ? useful.map(function (u) { return '<span class="chip k-' + u.kind + '">' + esc(u.name) + ' · ' + labels[u.kind] + '</span>'; }).join("")
      : '<span class="chip">nothing usable found</span>') + '<span class="spacer"></span><button class="btn ghost sm">REMOVE</button>';
    var f = W.files[W.files.length - 1];
    $("button", el).onclick = function () { W.files.splice(W.files.indexOf(f), 1); el.remove(); };
  }).catch(function (e) { el.innerHTML = '<span class="err">Could not read ' + esc(file.name) + ': ' + esc(e.message) + '</span>'; });
}
function listFromShow(tag) {
  $("#listInfo").innerHTML = '<div class="file">Loading the unsold pieces of ' + esc(tag) + '…</div>';
  loadShow(tag, true).then(function (d) {
    var l = d.items.filter(function (i) { return !i.sale; }), useCost = l.some(function (i) { return i.cost && i.cost.cost; });
    var rows = [["NO", "STOCK ID", "ITEM", "JEWELERY DETAILS", "TOTAL CRT", "METAL", "GW", "NGW", "PRICE", "OWNER"]].concat(l.map(function (i, k) {
      return [k + 1, i.p.BARCODE || i.sku, i.p.CATEGORY, i.p.DESCRIPTION, i.p.TOTAL_CT, i.p.METAL_RAW, i.p.GROSS_WT_GM, i.p.NET_GOLD_WT_GM,
              useCost && i.cost ? i.cost.cost : i.p.SELLING_PRICE_USD, i.owner];
    }));
    var sh = { name: "unsold from " + tag, rows: rows, pics: [] };
    W.listFile = { name: (d.show.name || tag) + " — " + l.length + " unsold pieces", sheets: [sh], cands: [{ sh: sh, c: LeebaImport.classify(sh) }] };
    pickListSheet(0);
    if (!useCost) { preset("asis"); toast("Prices taken as the selling price at " + tag + " (USD)", 5000); }
  }).catch(function (e) { $("#listInfo").innerHTML = '<div class="err">' + esc(e.message) + '</div>'; });
}
function preset(k) {
  var P = W.pricing;
  if (k === "cost35") Object.assign(P, { mode: "mult", mult: 3.5, colCur: "USD", outCur: "USD" });
  if (k === "aed35") Object.assign(P, { mode: "mult", mult: 3.5, colCur: "USD", outCur: "AED" });
  if (k === "asis") Object.assign(P, { mode: "mult", mult: 1, colCur: "USD", outCur: "USD" });
  if (k === "formula") Object.assign(P, { mode: "formula", diaMarkup: 4, goldRate: 140, goldMarkup: 1.5 });
  drawPrice();
}
function drawPrice() {
  if (!$("#priceBox")) return;
  var P = W.pricing;
  $("#priceBox").innerHTML = '<div class="row" style="margin-bottom:10px"><label class="row small"><input type="radio" name="pm" value="mult" style="width:auto"' + (P.mode !== "formula" ? " checked" : "") + '> <b>Price column × multiplier</b></label>' +
    '<label class="row small"><input type="radio" name="pm" value="formula" style="width:auto"' + (P.mode === "formula" ? " checked" : "") + '> <b>Stock-file formula</b></label></div>' +
    (P.mode !== "formula"
      ? '<div class="fg"><label>MULTIPLIER<input type="number" step="0.01" id="pMult" value="' + esc(P.mult) + '"></label>' +
        '<label>RESULT IS IN<select id="pOut"><option value="USD"' + (P.outCur !== "AED" ? " selected" : "") + '>USD (shown as AED at the rate above)</option><option value="AED"' + (P.outCur === "AED" ? " selected" : "") + '>AED</option></select></label></div>' +
        '<p class="small muted">Selling price = PRICE column × multiplier. Example: cost $1,000 × 3.5 = $3,500 = ' + aed(3500 * (W.show.rate || 3.6725)) + '.</p>' +
        '<div class="lab" style="margin-top:10px">DIFFERENT MULTIPLIER FOR AN OWNER <em style="font-weight:600;letter-spacing:0">(optional)</em></div><div class="fg" id="omBox">' +
        Object.keys(ownerNames()).map(function (o) { return '<label>' + esc(o) + '<input type="number" step="0.01" data-om="' + esc(o) + '" placeholder="same" value="' + esc((P.ownerMult || {})[o] || "") + '"></label>'; }).join("") + '</div>'
      : '<div class="fg"><label>DIAMOND MARKUP<input type="number" step="0.1" id="pDia" value="' + esc(P.diaMarkup) + '"></label><label>GOLD + MAKING $/g<input type="number" id="pGold" value="' + esc(P.goldRate) + '"></label>' +
        '<label>GOLD MARKUP<input type="number" step="0.1" id="pGm" value="' + esc(P.goldMarkup) + '"></label></div><p class="small muted">Selling USD = carats × tag $/ct × diamond markup + net gold g × $/g × gold markup. Tag $/ct comes from the list or the stock file.</p>');
  $$("input[name=pm]").forEach(function (r) { r.onchange = function () { P.mode = this.value; if (P.mode === "formula") preset("formula"); else drawPrice(); }; });
  var bind = function (id, k) { var e = $(id); if (e) e.oninput = function () { P[k] = this.type === "number" ? parseFloat(this.value) : this.value; }; };
  bind("#pMult", "mult"); bind("#pOut", "outCur"); bind("#pDia", "diaMarkup"); bind("#pGold", "goldRate"); bind("#pGm", "goldMarkup");
  if ($("#pOut")) $("#pOut").onchange = function () { P.outCur = this.value; };
  $$("[data-om]").forEach(function (i) { i.oninput = function () { P.ownerMult = P.ownerMult || {}; if (this.value) P.ownerMult[this.dataset.om] = parseFloat(this.value); else delete P.ownerMult[this.dataset.om]; }; });
}
function ownerNames() {
  var o = { LEEBA: 1 };
  W.owners.prefixes.concat(W.owners.suffixes).forEach(function (r) { if (r[1]) o[up(r[1])] = 1; });
  return o;
}
function drawOwners() {
  var O = W.owners;
  function tbl(list, kind, label) {
    return '<table class="t rules" style="max-width:560px;margin-bottom:10px"><thead><tr><th>BARCODE ' + label + '</th><th>OWNER</th><th></th></tr></thead><tbody>' +
      list.map(function (r, i) { return '<tr><td><input data-r="' + kind + '" data-i="' + i + '" data-j="0" value="' + esc(r[0]) + '"></td><td><input data-r="' + kind + '" data-i="' + i + '" data-j="1" value="' + esc(r[1]) + '"></td><td><button class="btn ghost sm" data-del="' + kind + '" data-i="' + i + '">×</button></td></tr>'; }).join("") +
      '</tbody></table><button class="btn ghost sm" data-add="' + kind + '">+ ADD RULE</button>';
  }
  $("#ownBox").innerHTML = '<div class="grid2"><div>' + tbl(O.prefixes, "prefixes", "STARTS WITH") + '</div><div>' + tbl(O.suffixes, "suffixes", "ENDS WITH") +
    '<div class="fg" style="margin-top:14px"><label>ANYTHING ELSE<input id="oFall" value="' + esc(O.fallback) + '"></label></div></div></div>' +
    '<p class="small muted">Rules are checked top to bottom; longer prefixes should come first (e.g. DJ- before D).</p>';
  $$("[data-r]").forEach(function (i) { i.oninput = function () { O[this.dataset.r][+this.dataset.i][+this.dataset.j] = this.dataset.j === "1" ? up(this.value) : up(this.value); saveOwnerRules(O); }; });
  $$("[data-del]").forEach(function (b) { b.onclick = function () { O[b.dataset.del].splice(+b.dataset.i, 1); saveOwnerRules(O); drawOwners(); drawPrice(); }; });
  $$("[data-add]").forEach(function (b) { b.onclick = function () { O[b.dataset.add].push(["", ""]); drawOwners(); }; });
  $("#oFall").oninput = function () { O.fallback = up(this.value); saveOwnerRules(O); };
}
function readShowForm() {
  var S = W.show;
  S.name = $("#sName").value.trim(); S.venue = $("#sVenue").value.trim(); S.city = $("#sCity").value.trim();
  S.start = $("#sStart").value; S.end = $("#sEnd").value; S.tag = up($("#sTag").value).replace(/[^A-Z0-9-]+/g, "-");
  S.currency = $("#sCur").value; S.rate = parseFloat($("#sRate").value) || 3.6725; S.notes = $("#sNotes").value.trim();
  var d1 = S.start ? new Date(S.start + "T12:00:00") : null, d2 = S.end ? new Date(S.end + "T12:00:00") : null;
  var fmt = function (d, o) { return d.toLocaleDateString("en-GB", o); };
  S.dates = d1 ? fmt(d1, { day: "numeric", month: "long", year: "numeric" }) + (d2 ? " – " + fmt(d2, { day: "numeric", month: "long", year: "numeric" }) : "") : "";
  S.datesShort = d1 ? (d2 ? fmt(d1, { day: "numeric" }) + "–" + fmt(d2, { day: "numeric", month: "short", year: "numeric" }) : "from " + fmt(d1, { day: "numeric", month: "short", year: "numeric" })) : "";
  return S;
}
function existingImages() {
  if (W.imgIndex) return Promise.resolve(W.imgIndex);
  return fetch(REPO_TREE).then(function (r) { return r.json(); }).then(function (j) {
    var m = {}, rank = { jpg: 0, jpeg: 1, png: 2, webp: 3 };
    (j.tree || []).forEach(function (t) {
      var mm = t.path.match(/^images\/(.+)\.(jpe?g|png|webp)$/i);
      if (!mm) return;
      var extra = /\(|SIDE|VIEW/i.test(mm[1]) ? 1 : 0, key = up(mm[1]).replace(/\s*\(.*?\)\s*/g, "").replace(/\s+/g, ""), r = extra * 10 + rank[mm[2].toLowerCase()];
      if (!m[key] || r < m[key].r) m[key] = { r: r, f: t.path.slice(7) };
    });
    var out = {}; Object.keys(m).forEach(function (k) { out[k] = m[k].f; });
    W.imgIndex = out; return out;
  }).catch(function () { return {}; });
}
function runBuild() {
  var S = readShowForm(), prog = $("#bProg");
  if (!S.name || !S.tag) return toast("Give the show a name first");
  if (!W.list) return toast("Add the show list first");
  if (!W.editing && shows.some(function (s) { return s.tag === S.tag; })) return toast("There is already a show " + S.tag + " — change the short code");
  prog.textContent = "Loading earlier shows, photos already on the site and sales history…";
  var earlierTags = shows.filter(function (s) { return s.tag !== S.tag; }).sort(function (a, b) { return String(b.start).localeCompare(String(a.start)); }).map(function (s) { return s.tag; });
  Promise.all([
    Promise.all(earlierTags.map(function (t) { return get("catalog", { tag: t }).then(function (j) { return { tag: t, catalog: j.catalog }; }).catch(function () { return null; }); })),
    existingImages(),
    get("history").then(function (j) { return j.sales; }).catch(function () { return []; })
  ]).then(function (res) {
    prog.textContent = "Building…";
    setTimeout(function () {
      try {
        W.result = LeebaImport.build({ list: W.list, files: W.files, earlier: res[0].filter(Boolean), existingImages: res[1], history: res[2],
          pricing: W.pricing, owners: W.owners, show: S, rate: S.rate });
        prog.textContent = "";
        $("#report").innerHTML = reportHtml(reportOf(W.result, S), S);
        wireReport(W.report, S.tag, W.result);
        $("#saveStep").hidden = false;
        drawSave();
        $("#report").scrollIntoView({ behavior: "smooth" });
      } catch (e) { prog.textContent = ""; $("#report").innerHTML = '<div class="err">Build failed: ' + esc(e.message) + '</div>'; console.error(e); }
    }, 30);
  });
}
function reportOf(res, S) {
  var rate = S.rate || 3.6725, ps = res.catalog.products, own = {}, cat = {};
  ps.forEach(function (p) {
    var v = (p.SELLING_PRICE_USD || 0) * rate;
    own[p.OWNER] = own[p.OWNER] || [0, 0]; own[p.OWNER][0]++; own[p.OWNER][1] += v;
    cat[p.CATEGORY] = cat[p.CATEGORY] || [0, 0]; cat[p.CATEGORY][0]++; cat[p.CATEGORY][1] += v;
  });
  W.report = { at: new Date().toLocaleString("en-GB"), by: me.who, pieces: ps.length, valueAed: Math.round(ps.reduce(function (t, p) { return t + (p.SELLING_PRICE_USD || 0) * rate; }, 0)),
    files: [W.listFile ? W.listFile.name : ""].concat(W.files.map(function (f) { return f.name; })), pricing: W.pricing, how: res.report.counts, sources: res.report.sources,
    newPhotos: res.images.length, owners: own, categories: cat, issues: res.report.issues, fixed: res.report.fixed,
    rows: res.products.map(function (p) { return [p.SKU, p.OWNER, p.CATEGORY, p.DESCRIPTION, p.TOTAL_CT, p.QUALITY, Math.round((p.SELLING_PRICE_USD || 0) * rate), p._how, p._owner_how, p.IMAGE || ""]; }) };
  return W.report;
}
function reportHtml(R, S) {
  var lev = { error: [], warn: [], info: [] }, groups = {};
  R.issues.forEach(function (i) { var k = i.level + "|" + i.kind; (groups[k] = groups[k] || []).push(i); });
  var fixedG = {}; R.fixed.forEach(function (i) { (fixedG[i.kind] = fixedG[i.kind] || []).push(i); });
  var errs = R.issues.filter(function (i) { return i.level === "error"; }).length, warns = R.issues.filter(function (i) { return i.level === "warn"; }).length;
  function det(cls, title, list) {
    return '<details class="lv-' + cls + '"><summary>' + esc(title) + '<span class="c">' + list.length + '</span></summary><ul>' +
      list.slice(0, 600).map(function (i) { return '<li><b>' + esc(i.sku) + '</b>' + (i.detail ? ' — ' + esc(i.detail) : '') + '</li>'; }).join("") + (list.length > 600 ? '<li>…</li>' : '') + '</ul></details>';
  }
  var order = ["error", "warn", "info"];
  return '<div class="tiles" style="margin-top:14px">' +
      '<div class="tile hi"><span>PIECES</span><b>' + R.pieces + '</b><small>' + aed(R.valueAed) + '</small></div>' +
      Object.keys(R.how || {}).map(function (k) { return '<div class="tile"><span>STONES FROM ' + esc(k.toUpperCase()) + '</span><b>' + R.how[k] + '</b></div>'; }).join("") +
      '<div class="tile"><span>NEW PHOTOS</span><b>' + R.newPhotos + '</b><small>from the show list</small></div>' +
      '<div class="tile"><span>TO FIX</span><b style="color:' + (errs ? "var(--stop)" : "var(--teal-x)") + '">' + errs + '</b><small>' + warns + ' to look at</small></div></div>' +
    '<div class="grid2"><div class="panel"><div class="ph"><h3>BY OWNER</h3></div><div class="pb"><table class="t"><tbody>' + Object.keys(R.owners).map(function (o) { return '<tr><td><b>' + esc(o) + '</b></td><td class="n">' + R.owners[o][0] + '</td><td class="n">' + aed(R.owners[o][1]) + '</td></tr>'; }).join("") + '</tbody></table></div></div>' +
    '<div class="panel"><div class="ph"><h3>BY CATEGORY</h3></div><div class="pb"><table class="t"><tbody>' + Object.keys(R.categories).map(function (o) { return '<tr><td><b>' + esc(o) + '</b></td><td class="n">' + R.categories[o][0] + '</td><td class="n">' + aed(R.categories[o][1]) + '</td></tr>'; }).join("") + '</tbody></table></div></div></div>' +
    '<div class="issues">' +
      order.map(function (l) { return Object.keys(groups).filter(function (k) { return k.indexOf(l + "|") === 0; }).map(function (k) { return det(l, k.split("|")[1], groups[k]); }).join(""); }).join("") +
      Object.keys(fixedG).map(function (k) { return det("fix", "Fixed automatically: " + k, fixedG[k]); }).join("") +
    '</div><div class="row" style="margin-top:10px"><button class="btn ghost sm" id="repX">DOWNLOAD THIS REPORT (EXCEL)</button>' +
    '<span class="small muted">Built ' + esc(R.at) + ' by ' + esc(R.by) + ' from ' + esc((R.files || []).filter(Boolean).join(", ")) + '</span></div>';
}
function wireReport(R, tag, res) {
  var b = $("#repX"); if (!b) return;
  b.onclick = function () {
    var sh = [{ name: "PIECES", title: "Import report — " + tag, sub: R.at + " · " + R.pieces + " pieces · " + aed(R.valueAed),
      head: ["BARCODE", "OWNER", "CATEGORY", "DESCRIPTION", "TOTAL CT", "QUALITY", "PRICE (AED)", "STONE DETAILS FROM", "OWNER FROM", "PHOTO"], rows: R.rows,
      widths: [22, 13, 13, 32, 9, 12, 12, 24, 13, 22], money: [6], dec: [4] },
      { name: "TO CHECK", head: ["LEVEL", "CHECK", "BARCODE", "DETAIL"], rows: R.issues.map(function (i) { return [i.level.toUpperCase(), i.kind, i.sku, i.detail]; }), widths: [8, 26, 22, 70] },
      { name: "FIXED", head: ["FIX", "BARCODE", "DETAIL"], rows: R.fixed.map(function (i) { return [i.kind, i.sku, i.detail]; }), widths: [26, 22, 70] }];
    excel("LEEBA " + tag + " import report", sh);
  };
}
function drawSave() {
  var S = W.show, live = shows.filter(function (s) { return s.status === "LIVE" && s.tag !== S.tag; })[0];
  var errs = W.result.report.issues.filter(function (i) { return i.level === "error"; }).length;
  $("#saveBox").innerHTML = (errs ? '<div class="note">' + errs + ' items marked to fix. You can still save a draft and fix the files later, or publish anyway.</div>' : '') +
    '<div class="row"><button class="btn dark" id="svDraft">SAVE AS DRAFT</button><button class="btn gold" id="svPub">SAVE AND PUBLISH TO WEBSITE</button></div>' +
    '<p class="small muted">Draft: saved for staff only, the public page does not change. ' +
    (live ? 'Publish: replaces <b>' + esc(live.name) + '</b> on dubai.leeba.co (it is marked ENDED; its sales stay saved).' : 'Publish: this list goes on dubai.leeba.co.') + '</p><div class="prog" id="svProg"></div>';
  $("#svDraft").onclick = function () { saveShow(false); };
  $("#svPub").onclick = function () { if (confirm("Publish " + S.name + " to dubai.leeba.co now?")) saveShow(true); };
}
function b64(buf) {
  var bytes = new Uint8Array(buf), s = "", CH = 0x8000;
  for (var i = 0; i < bytes.length; i += CH) s += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
  return btoa(s);
}
/* photos from the list: shrink anything big, then send in batches */
function photoPayload(list) {
  return Promise.all(list.map(function (im) {
    return new Promise(function (ok) {
      var blob = new Blob([im.buffer], { type: "image/" + (im.ext === "png" ? "png" : "jpeg") });
      if (blob.size < 400000) return ok({ path: im.path, b64: b64(im.buffer) });
      var u = URL.createObjectURL(blob), img = new Image();
      img.onload = function () {
        var k = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight)), c = document.createElement("canvas");
        c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
        var g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(u); ok({ path: im.path.replace(/\.png$/, ".jpg"), b64: c.toDataURL("image/jpeg", 0.85).split(",")[1] });
      };
      img.onerror = function () { URL.revokeObjectURL(u); ok({ path: im.path, b64: b64(im.buffer) }); };
      img.src = u;
    });
  }));
}
function saveShow(publish) {
  var S = W.show, res = W.result, prog = $("#svProg");
  $("#svDraft").disabled = $("#svPub").disabled = true;
  var renamed = {};
  prog.textContent = "Saving the stock list…";
  post({ op: "saveShow", show: { tag: S.tag, name: S.name, venue: S.venue, city: S.city, start: S.start, end: S.end, currency: S.currency, rate: S.rate,
                                 notes: S.notes, pricing: W.pricing, valueAed: W.report.valueAed },
         catalog: res.catalog, cost: res.cost, report: W.report })
    .then(function () {
      if (!res.images.length) return;
      return photoPayload(res.images).then(function (imgs) {
        imgs.forEach(function (im, i) { if (im.path !== res.images[i].path) renamed[res.images[i].path] = im.path; });
        var batches = [], k = 0;
        while (k < imgs.length) { var b = [], size = 0; while (k < imgs.length && b.length < 45 && (size < 8e6 || !b.length)) { size += imgs[k].b64.length; b.push(imgs[k++]); } batches.push(b); }
        return batches.reduce(function (p, b, i) {
          return p.then(function () { prog.textContent = "Uploading photos " + (i + 1) + " / " + batches.length + "… (about 40 seconds each)"; return post({ op: "images", tag: S.tag, images: b }); });
        }, Promise.resolve());
      });
    })
    .then(function () {
      if (!Object.keys(renamed).length) return;
      res.catalog.products.forEach(function (p) { if (renamed[p.IMAGE]) p.IMAGE = p.IMAGES_ALL = renamed[p.IMAGE]; });
      return post({ op: "saveShow", show: { tag: S.tag, name: S.name, venue: S.venue, city: S.city, start: S.start, end: S.end, currency: S.currency, rate: S.rate, notes: S.notes, pricing: W.pricing, valueAed: W.report.valueAed }, catalog: res.catalog });
    })
    .then(function () { if (publish) { prog.textContent = "Publishing to dubai.leeba.co…"; return post({ op: "publish", tag: S.tag }); } })
    .then(function () {
      toast(publish ? "Published. dubai.leeba.co updates in about a minute." : "Saved as a draft", 5000);
      cache = {}; location.hash = "#/show/" + encodeURIComponent(S.tag);
    })
    .catch(function (e) { prog.textContent = ""; $("#svDraft").disabled = $("#svPub").disabled = false; toast("Not saved: " + e.message, 9000); });
}

/* ================================================================ CLIENTS */
function viewClients() {
  app('<div class="loading">Loading every sale from every show…</div>');
  Promise.all([get("history"), shows.length ? Promise.resolve(shows) : loadShows()]).then(function (res) {
    var showBy = {}; shows.forEach(function (s) { showBy[s.tag] = s; });
    var m = {};
    res[0].sales.filter(function (x) { return x.status === "ACTIVE" && x.client; }).forEach(function (x) {
      var k = x.client.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
      var c = m[k] = m[k] || { name: x.client, phone: "", sales: [], aed: 0, shows: {} };
      c.sales.push(x); c.aed += toAed(x.price, x.currency, showBy[x.show]); c.shows[x.showName || x.show] = 1;
      if (x.phone) c.phone = x.phone;
      if (x.date > (c.last || "")) c.last = x.date;
    });
    var list = Object.keys(m).map(function (k) { return m[k]; }).sort(function (a, b) { return b.aed - a.aed; });
    app('<div class="head"><div><h1>Clients</h1><div class="sub">' + list.length + ' buyers across ' + shows.length + ' shows</div></div><span class="spacer"></span><button class="btn dark sm" id="cx">EXPORT</button></div>' +
      '<div class="filters"><input id="cq" placeholder="Search a client, barcode or show…"></div><div class="tw" id="ct"></div>');
    function draw() {
      var q = $("#cq").value.toLowerCase().trim();
      var l = list.filter(function (c) { return !q || (c.name + " " + c.phone + " " + c.sales.map(function (x) { return x.sku + " " + x.showName; }).join(" ")).toLowerCase().indexOf(q) >= 0; });
      $("#ct").innerHTML = '<table class="t"><thead><tr><th>CLIENT</th><th>SHOWS</th><th class="n">PIECES</th><th class="n">SPENT (AED)</th><th>LAST BOUGHT</th><th>PIECES BOUGHT</th></tr></thead><tbody>' +
        l.map(function (c) {
          return '<tr><td><b>' + esc(c.name) + '</b>' + (c.phone ? '<br><span class="small muted">' + esc(c.phone) + '</span>' : '') + '</td><td>' + esc(Object.keys(c.shows).join(", ")) + '</td><td class="n">' + c.sales.length +
            '</td><td class="n">' + n0(c.aed) + '</td><td>' + esc(prettyDate(c.last)) + '</td><td class="small">' + c.sales.map(function (x) { return esc(x.sku) + ' <span class="muted">(' + esc(x.category || "") + ', ' + n0(x.price) + ' ' + esc(x.currency) + ')</span>'; }).join("<br>") + '</td></tr>';
        }).join("") + '</tbody></table>';
    }
    $("#cq").oninput = draw; draw();
    $("#cx").onclick = function () {
      excel("LEEBA clients", [{ name: "CLIENTS", title: "LEEBA — clients from all shows", sub: new Date().toLocaleString("en-GB"), head: ["CLIENT", "PHONE", "SHOWS", "PIECES", "SPENT (AED)", "LAST BOUGHT"],
        rows: list.map(function (c) { return [c.name, c.phone, Object.keys(c.shows).join(", "), c.sales.length, Math.round(c.aed), c.last]; }), widths: [28, 16, 40, 8, 14, 12], money: [4] },
        { name: "PURCHASES", head: ["CLIENT", "SHOW", "DATE", "BARCODE", "CATEGORY", "DESCRIPTION", "PRICE", "CURRENCY", "PAYMENT", "SOLD BY"],
          rows: list.reduce(function (a, c) { return a.concat(c.sales.map(function (x) { return [c.name, x.showName || x.show, x.date, x.sku, x.category, x.description, x.price, x.currency, x.payment, x.by]; })); }, []),
          widths: [26, 28, 11, 22, 13, 30, 11, 9, 10, 14], money: [6] }]);
    };
  }).catch(fail);
}

/* ================================================================ SETTINGS */
function viewSettings() {
  app('<div class="head"><div><h1>Settings</h1></div></div>' +
    '<div class="panel"><div class="ph"><h3>STAFF</h3></div><div class="pb"><p>Staff codes live in the <b>STAFF</b> tab of the LEEBA shows Google Sheet: CODE, NAME, ROLE (ADMIN or SALES), ACTIVE (YES / NO). ' +
      'ADMIN can import, publish and close shows and sees cost; SALES can record sales and view shows. Each code works on one device at a time.</p>' +
      '<p class="small muted">Signed in as ' + esc(me.who) + ' (' + esc(me.role) + ').</p></div></div>' +
    '<div class="panel"><div class="ph"><h3>OWNER RULES</h3></div><div class="pb"><p class="small muted">Used when importing a new show. Saved on this device.</p><div id="ownBox"></div></div></div>' +
    '<div class="panel"><div class="ph"><h3>CONNECTION</h3></div><div class="pb"><p class="small">Shows API: <code>' + esc(API) + '</code></p>' +
      '<button class="btn ghost sm" id="apiReset">USE THE ADDRESS IN CONFIG.JS</button></div></div>');
  W = { owners: ownerRules(), pricing: {}, show: {} };
  drawOwners();
  $("#apiReset").onclick = function () { try { localStorage.removeItem(KEY + "api"); } catch (e) {} location.reload(); };
}

route();
})();
