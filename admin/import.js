/* ==================================================================
   LEEBA shows - stock import engine.
   Turns a show list plus any number of detail files (DUBAI JEWELRY
   STOCK, LB TASK, partner lists, earlier catalogues) into a show
   catalogue, with a report of what was fixed and what needs a look.
   Runs in the browser; nothing leaves the device until you save.
================================================================== */
(function (root) {
"use strict";

var CAT = { RING: "RING", RINGS: "RING", EARRING: "EARRING", EARRINGS: "EARRING", EARING: "EARRING", STUDS: "EARRING",
  BRACELET: "BRACELET", BRACLET: "BRACELET", BRACELETS: "BRACELET", ETERNITY: "ETERNITY BAND", "ETERNITY BAND": "ETERNITY BAND",
  BAND: "ETERNITY BAND", NECKLACE: "NECKLACE", NECKLACES: "NECKLACE", PENDANT: "PENDANT", PENDENT: "PENDANT",
  PENDANTS: "PENDANT", BANGLES: "BANGLE", BANGLE: "BANGLE", CHAIN: "CHAIN" };
var TONE = { WG: "WHITE", YG: "YELLOW", RG: "ROSE", PG: "ROSE", MG: "MIX", MIX: "MIX", TT: "MIX", WHITE: "WHITE", YELLOW: "YELLOW", ROSE: "ROSE" };
var SHAPE_WORDS = [["SQ EMERALD", "EMERALD"], ["SQ.EMERALD", "EMERALD"], ["SQ EM", "EMERALD"], ["EMERALD", "EMERALD"], ["EM", "EMERALD"],
  ["ED", "EMERALD"], ["ROUND", "ROUND"], ["RD", "ROUND"], ["OVAL", "OVAL"], ["OV", "OVAL"], ["PEAR", "PEAR"], ["PE", "PEAR"],
  ["PS", "PEAR"], ["PAER", "PEAR"], ["MARQUISE", "MARQUISE"], ["MQ", "MARQUISE"], ["HEART", "HEART"], ["HRT", "HEART"],
  ["HR", "HEART"], ["HT", "HEART"], ["CUSHION", "CUSHION"], ["CUS", "CUSHION"], ["RADIANT", "RADIANT"], ["RAD", "RADIANT"],
  ["PRINCESS", "PRINCESS"], ["PRI", "PRINCESS"], ["PRN", "PRINCESS"], ["TAPER", "TAPER"], ["TAPPER", "TAPER"], ["TAP", "TAPER"],
  ["TRILLION", "TRILLION"], ["TRIANGLE", "TRILLION"], ["TRI", "TRILLION"], ["ASSCHER", "ASSCHER"], ["BAGUETTE", "BAGUETTE"],
  ["BUGUETTE", "BAGUETTE"], ["BUG", "BAGUETTE"], ["BG", "BAGUETTE"], ["MIX SHAPE", "MIX SHAPES"], ["MIX", "MIX SHAPES"], ["ROSE CUT", "ROSE CUT"]];

/* ------------------------------------------------------------ helpers */
function s(x) {
  if (x === null || x === undefined) return null;
  var t = String(x).replace(/\s+/g, " ").trim();
  return t && t !== "-" && t !== "—" ? t : null;
}
function f(x) {
  if (x === null || x === undefined || x === "") return null;
  if (typeof x === "number") return isFinite(x) ? x : null;
  var m = String(x).replace(/,/g, "").match(/-?\d+(\.\d+)?/);
  return m ? parseFloat(m[0]) : null;
}
function r(x, n) { if (typeof x !== "number" || !isFinite(x)) return null; var k = Math.pow(10, n === undefined ? 2 : n); return Math.round(x * k) / k; }
function up(x) { return (s(x) || "").toUpperCase(); }
function norm(h) { return up(h).replace(/[^A-Z0-9$]+/g, " ").trim(); }

function shapesFrom(desc) {
  var d = " " + up(desc).replace(/[^A-Z0-9. ]/g, " ") + " ", out = [];
  SHAPE_WORDS.forEach(function (w) {
    var re = new RegExp("(^|[^A-Z])" + w[0].replace(/\./g, "\\.") + "(?![A-Z])");
    if (re.test(d) && out.indexOf(w[1]) < 0) { out.push(w[1]); d = d.split(w[0]).join(" "); }
  });
  return out;
}
function shapeOf(x) { var sh = shapesFrom(x); return sh.length ? sh[0] : null; }
function splitMetal(t) {
  t = up(t);
  if (!t || t === "NONE") return { kt: null, tone: null };
  var k = t.match(/(\d{1,2})\s*K/), tones = {};
  Object.keys(TONE).forEach(function (w) { if (new RegExp("\\b" + w + "\\b").test(t)) tones[TONE[w]] = 1; });
  var tl = Object.keys(tones);
  return { kt: k ? parseInt(k[1], 10) : null, tone: tl.length > 1 ? "MIX" : (tl[0] || null) };
}
function splitCC(t) {
  t = up(t);
  if (!t) return { col: null, cla: null };
  var m = t.match(/^(.*?)\s*((?:FL|IF|VVS|VS|SI|I)\d?(?:-(?:VVS|VS|SI|I)\d?)?)$/);
  return m ? { col: s(m[1]), cla: m[2] } : { col: t, cla: null };
}
function line(sku, role, o) {
  var pcs = f(o.pcs), ct = f(o.ct);
  return { DETAIL_SET: "STONE LINE", STONE_ROLE: role, PACKET_NO: s(o.pk), SHAPE: o.shape ? shapeOf(o.shape) : null,
           MM_SIEVE: s(o.mm), NOTE: o.note || null, PCS: pcs ? Math.round(pcs) : null, CARAT: r(ct, 3),
           AVG_CT: pcs && ct ? r(ct / pcs, 3) : null, COLOR: s(o.col), CLARITY: s(o.cla),
           CERT_NO: o.cert === null || o.cert === undefined ? null : s(typeof o.cert === "number" ? String(Math.round(o.cert)) : o.cert), SKU: sku };
}
function graded(L) { return (L || []).some(function (l) { return l.COLOR || l.CLARITY; }); }
function score(L) {
  var n = 0;
  (L || []).forEach(function (l) { if (l.COLOR || l.CLARITY) n += 10; if (l.PCS) n++; if (l.SHAPE) n++; if (l.MM_SIEVE) n++; });
  return n;
}
function sumCt(L) { return (L || []).reduce(function (t, l) { return t + (l.CARAT || 0); }, 0); }

/* ----------------------------------------------- reading a workbook */
/* ExcelJS cell values come as numbers, strings, dates, rich text, formulas
   or hyperlinks - flatten every one to a plain value. */
function cellVal(v) {
  if (v === null || v === undefined) return null;
  if (typeof v !== "object" || v instanceof Date) return v;
  if (v.richText) return v.richText.map(function (t) { return t.text; }).join("");
  if ("result" in v) return cellVal(v.result);
  if ("text" in v) return cellVal(v.text);
  if (v.error) return null;
  return null;
}
function sheetRows(ws) {
  var out = [];
  ws.eachRow({ includeEmpty: true }, function (row, n) {
    var a = [];
    row.eachCell({ includeEmpty: true }, function (c, col) { a[col - 1] = cellVal(c.value); });
    out[n - 1] = a;
  });
  for (var i = 0; i < out.length; i++) if (!out[i]) out[i] = [];
  return out;
}
function readBook(buf) {
  var wb = new ExcelJS.Workbook();
  return wb.xlsx.load(buf).then(function () {
    var sheets = [];
    wb.eachSheet(function (ws) {
      var pics = [];
      try {
        ws.getImages().forEach(function (im) {
          var med = wb.getImage(im.imageId);
          if (med && med.buffer) pics.push({ row: Math.floor(im.range.tl.nativeRow != null ? im.range.tl.nativeRow : im.range.tl.row),
                                              ext: med.extension || "jpeg", buffer: med.buffer });
        });
      } catch (e) {}
      sheets.push({ name: ws.name, rows: sheetRows(ws), pics: pics });
    });
    return sheets;
  });
}

/* --------------------------------------------- recognising the files */
var SHOWLIST_COLS = {
  no:     ["NO", "SR", "SR NO", "S NO", "SNO", "NUMBER"],
  sku:    ["STOCK ID", "BARCODE", "SKU", "STOCK NO", "ITEM CODE", "DESIGN NO"],
  item:   ["ITEM", "CATEGORY", "TYPE"],
  desc:   ["JEWELERY DETAILS", "JEWELLERY DETAILS", "DESCRIPTION", "DETAILS", "DESC"],
  tag:    ["PRICE CT FOR TAG", "TAG", "PRICE PER CT", "PER CT"],
  ct:     ["TOTAL CRT", "TOTAL CT", "DIA WGT", "DIA WT", "CT", "CARAT", "CTS", "TOTAL CARAT", "DIA WGT CT"],
  metal:  ["METAL", "METAL KT", "GOLD", "KT"],
  gw:     ["GW", "GROSS WT", "GROSS WGT", "GR WT", "GROSS WEIGHT", "GROSS WGT G"],
  ngw:    ["NGW", "NET WT", "NET WGT", "NET GOLD", "NET WEIGHT", "NET WGT G"],
  price:  ["PRICE", "TOTAL USD $", "TOTAL USD", "COST", "COST USD", "USD", "PRICE USD", "AMOUNT"],
  owner:  ["OWNER", "PARTY", "SUPPLIER"],
  tone:   ["METAL TONE", "TONE", "COLOR", "COLOUR"]
};
function findHeader(rows) {
  for (var i = 0; i < Math.min(rows.length, 12); i++) {
    var h = (rows[i] || []).map(norm);
    if (h.some(function (x) { return SHOWLIST_COLS.sku.indexOf(x) >= 0; })) return i;
  }
  return -1;
}
function guessCols(headRow) {
  var h = headRow.map(norm), map = {};
  Object.keys(SHOWLIST_COLS).forEach(function (k) {
    for (var i = 0; i < SHOWLIST_COLS[k].length; i++) {
      var j = h.indexOf(SHOWLIST_COLS[k][i]);
      if (j >= 0 && Object.keys(map).every(function (o) { return map[o] !== j; })) { map[k] = j; break; }
    }
  });
  return map;
}
/* what kind of sheet is this?  returns {kind, ...} */
function classify(sh) {
  var rows = sh.rows, h0 = (rows[0] || []).map(norm), name = up(sh.name);
  if (h0.indexOf("STOCK ID") === 1 && h0.indexOf("CENTER STONE") >= 0) return { kind: "dubai" };
  if (h0.indexOf("SR NO") === 0 && h0.indexOf("BARCODE") >= 0 && h0.indexOf("CATEGORY") >= 0) return { kind: "ord", head: h0 };
  if (h0.indexOf("PACKET NUMBER") >= 0 && h0.indexOf("WGT") >= 0) return { kind: "dmd", head: h0 };
  var t = (rows[0] || [])[0];
  if (name.indexOf("DIAMOND DETAIL") >= 0 || (typeof t === "string" && /LEEBA JEWELS/.test(t) && rows.some(function (r) { return norm(r[0]) === "SHAPE"; }))) return { kind: "blocks" };
  var hi = findHeader(rows);
  if (hi >= 0) {
    var hr = (rows[hi] || []).map(norm), cols = guessCols(rows[hi]);
    var stoneish = hr.some(function (x) { return x === "CLARITY" || x === "COLOR" || x === "COLOUR"; }) &&
                   hr.some(function (x) { return ["WGT", "WGT CT", "CARAT", "CT", "WEIGHT"].indexOf(x) >= 0; }) &&
                   !hr.some(function (x) { return SHOWLIST_COLS.price.indexOf(x) >= 0; });
    if (stoneish) return { kind: "stones", headerRow: hi };
    if (cols.sku !== undefined && (cols.ct !== undefined || cols.price !== undefined)) return { kind: "list", headerRow: hi, cols: cols };
  }
  return { kind: "other" };
}

/* -------------------------------------- stone details from each source */
function fromDubai(rows, src) {
  var g = {}, cur = null;
  rows.slice(1).forEach(function (r) {
    var id = up(r[1]);
    if (id) { cur = g[id] ? null : id; if (cur) g[cur] = { head: r, rows: [r] }; }
    else if (cur) g[cur].rows.push(r);
  });
  Object.keys(g).forEach(function (k) {
    var L = [];
    g[k].rows.forEach(function (r) {
      [[6, 7, 8, 9, "C"], [13, 14, 15, null, "S"]].forEach(function (c) {
        var ct = f(r[c[2]]);
        if (!ct) return;
        var cc = c[3] !== null ? splitCC(r[c[3]]) : { col: null, cla: null }, pcs = f(r[c[1]]);
        L.push(line(k, c[4] === "C" && pcs === 1 ? "CENTER" : "SIDE",
          { pk: r[c[0]], pcs: pcs, ct: ct, col: cc.col, cla: cc.cla, cert: c[4] === "C" ? r[38] : null }));
      });
    });
    var h = g[k].head;
    src.add(k, "DUBAI STOCK", L, { tag: f(h[19]), total: f(h[20]), desc: s(h[5]), item: s(h[3]), metal: s(h[22]),
                                  gw: f(h[24]), ngw: f(h[25]), cert: s(h[38]), status: s(h[2]) });
  });
}
function fromBlocks(rows, src) {
  var cur = null, L = null;
  rows.forEach(function (r) {
    var a = s(r[0]);
    if (a && (r[1] === null || r[1] === undefined) && /^[A-Z0-9-]{4,}\s/.test(up(a) + " ") && up(a) !== "TOTAL" && !/LEEBA/.test(up(a))) {
      if (cur) src.add(cur, "DIAMOND DETAILS", L);
      cur = up(a).split(" ")[0]; L = []; return;
    }
    if (!cur || !a && !f(r[3]) || norm(r[0]) === "SHAPE" || norm(r[0]) === "TOTAL") return;
    var ct = f(r[3]);
    if (!ct) return;
    L.push(line(cur, f(r[2]) === 1 && ct >= 0.3 ? "CENTER" : "SIDE", { shape: r[0], mm: r[1], pcs: r[2], ct: ct, col: r[5], cla: r[6], cert: r[7] }));
  });
  if (cur) src.add(cur, "DIAMOND DETAILS", L);
}
/* LB TASK style: DMD DET blocks keyed by item number (needs ORD) or by barcode */
function fromDmd(rows, h, ord, src, label) {
  var ix = function (n, d) { var j = h.indexOf(n); return j >= 0 ? j : d; };
  var cP = ix("PACKET NUMBER", 1), cC = ix("COLOR", 2), cQ = ix("CLARITY", 3), cR = ix("CERTI NUMBER", 4), cS = ix("SHAPE", 5),
      cV = ix("SEIVE", 6), cM = ix("MM", 7), cN = ix("PCS", 8), cW = ix("WGT", 9);
  var blocks = {}, order = [], cur = null;
  rows.slice(1).forEach(function (r) {
    var a = r[0];
    if (a !== null && a !== undefined && a !== "") {
      var key = typeof a === "number" ? (ord[Math.round(a)] || null) : (/^[A-Z]{1,5}\d{2,}/.test(up(a)) ? up(a) : null);
      if (typeof a !== "number" && f(a) !== null && /^\d+$/.test(String(a).trim())) key = ord[parseInt(a, 10)] || null;
      cur = key;
      if (cur && !blocks[cur]) { blocks[cur] = []; order.push(cur); }
    }
    if (!cur || !f(r[cW])) return;
    var pcs = f(r[cN]), ct = f(r[cW]);
    blocks[cur].push(line(cur, pcs === 1 && ct >= 0.3 ? "CENTER" : "SIDE",
      { pk: r[cP], col: r[cC], cla: r[cQ], cert: r[cR], shape: r[cS], mm: s(r[cM]) || (shapeOf(r[cV]) ? null : s(r[cV])), pcs: pcs, ct: ct }));
  });
  order.forEach(function (k) { src.add(k, label, blocks[k]); });
}
function ordMap(rows) {
  var h = (rows[0] || []).map(norm), b = h.indexOf("BARCODE"), m = {}, info = {};
  rows.slice(1).forEach(function (r) {
    var n = f(r[0]), bc = up(r[b]);
    if (n !== null && bc) { m[Math.round(n)] = bc; info[bc] = { item: s(r[h.indexOf("CATEGORY")]), gw: f(r[h.indexOf("GR WGT")]), ngw: f(r[h.indexOf("NET WGT")]), kt: f(r[h.indexOf("METAL KT")]), tone: s(r[h.indexOf("COLOR")]) }; }
  });
  return { map: m, info: info };
}
/* a plain table: barcode, shape, pcs, carat, colour, clarity, cert - one stone line per row */
function fromStones(rows, hi, src, label) {
  var h = (rows[hi] || []).map(norm), ix = function (names) { for (var i = 0; i < names.length; i++) { var j = h.indexOf(names[i]); if (j >= 0) return j; } return -1; };
  var cB = ix(SHOWLIST_COLS.sku), cS = ix(["SHAPE"]), cN = ix(["PCS", "PIECES", "QTY"]), cW = ix(["WGT", "WGT CT", "CARAT", "CT", "WEIGHT"]),
      cC = ix(["COLOR", "COLOUR"]), cQ = ix(["CLARITY"]), cR = ix(["CERT", "CERTI NO", "CERT NO", "CERTIFICATE"]), cM = ix(["MM", "SIZE", "SIEVE"]);
  var g = {}, cur = null;
  rows.slice(hi + 1).forEach(function (r) {
    var b = up(r[cB]);
    if (b) cur = b;
    if (!cur || !f(r[cW])) return;
    (g[cur] = g[cur] || []).push(line(cur, f(r[cN]) === 1 && f(r[cW]) >= 0.3 ? "CENTER" : "SIDE",
      { shape: cS >= 0 ? r[cS] : null, pcs: cN >= 0 ? r[cN] : null, ct: r[cW], col: cC >= 0 ? r[cC] : null, cla: cQ >= 0 ? r[cQ] : null,
        cert: cR >= 0 ? r[cR] : null, mm: cM >= 0 ? r[cM] : null }));
  });
  Object.keys(g).forEach(function (k) { src.add(k, label, g[k]); });
}

function Sources() {
  this.lines = {};   // barcode -> {label: lines}
  this.info = {};    // barcode -> extra facts from the stock file
  this.counts = {};
}
Sources.prototype.add = function (bc, label, L, info) {
  bc = up(bc);
  if (!bc) return;
  if (L && L.length) { (this.lines[bc] = this.lines[bc] || {})[label] = L; this.counts[label] = (this.counts[label] || 0) + 1; }
  if (info) this.info[bc] = info;
};

/* ------------------------------------------------------- the import */
/* opts: { list: {sheet, headerRow, cols}, files: [{name, sheets}], earlier: [{tag, catalog}],
           history: [sale], pricing: {...}, owners: {prefixes:[[prefix, owner]], fallback}, existingImages: {KEY: file},
           show: {tag, name, ...}, rate } */
function build(opts) {
  var rate = opts.rate || 3.6725, P = opts.pricing || { mode: "mult", mult: 1, colCur: "USD", outCur: "USD" };
  var rep = { fixed: [], issues: [], counts: {}, sources: {} };
  function fix(kind, sku, detail) { rep.fixed.push({ kind: kind, sku: sku, detail: detail || "" }); }
  function issue(level, kind, sku, detail) { rep.issues.push({ level: level, kind: kind, sku: sku, detail: detail || "" }); }

  /* 1. every detail file */
  var src = new Sources(), ord = { map: {}, info: {} };
  opts.files.forEach(function (fl) { fl.sheets.forEach(function (sh) { if (classify(sh).kind === "ord") { var o = ordMap(sh.rows); Object.assign(ord.map, o.map); Object.assign(ord.info, o.info); } }); });
  opts.files.forEach(function (fl) {
    fl.sheets.forEach(function (sh) {
      var c = classify(sh), label = fl.short || fl.name;
      if (c.kind === "dubai") fromDubai(sh.rows, src);
      else if (c.kind === "blocks") fromBlocks(sh.rows, src);
      else if (c.kind === "dmd") fromDmd(sh.rows, c.head, ord.map, src, /IND/.test(up(sh.name)) ? "IND DIAMOND DETAILS" : "LB TASK");
      else if (c.kind === "stones") fromStones(sh.rows, c.headerRow, src, label + " / " + sh.name);
    });
  });
  rep.sources = src.counts;
  var earlier = {};          // newest show first
  (opts.earlier || []).forEach(function (e) {
    (e.catalog.products || []).forEach(function (p) {
      var k = up(p.BARCODE || p.SKU).replace(/ \(\d+\)$/, "");
      if (!earlier[k]) earlier[k] = { p: p, show: e.tag };
    });
  });
  var soldBefore = {};
  (opts.history || []).forEach(function (x) { if (x.status === "ACTIVE" && x.show !== (opts.show || {}).tag) soldBefore[up(x.sku).replace(/ \(\d+\)$/, "")] = x; });

  /* 2. the show list */
  var L0 = opts.list, rows = L0.sheet.rows, cols = L0.cols, pics = {};
  (L0.sheet.pics || []).forEach(function (p) { if (!pics[p.row]) pics[p.row] = p; });
  var products = [], seen = {}, cost = [], newImages = [];
  for (var i = L0.headerRow + 1; i < rows.length; i++) {
    var row = rows[i] || [], g = function (k) { return cols[k] === undefined || cols[k] === "" ? null : row[cols[k]]; };
    var raw = g("sku");
    var bc = up(raw);
    if (!bc) continue;
    if (bc !== String(raw)) fix("Barcode tidied", bc, JSON.stringify(String(raw)) + " → " + bc);
    var sku = bc;
    if (seen[sku]) { var n = 2; while (seen[bc + " (" + n + ")"]) n++; sku = bc + " (" + n + ")"; issue("warn", "Barcode listed twice", bc, "second one kept as " + sku); }
    seen[sku] = 1;
    var info = src.info[bc] || {}, ordI = ord.info[bc] || {}, old = earlier[bc] ? earlier[bc].p : null;
    var no = f(g("no")), itemRaw = s(g("item")) || info.item || ordI.item || (old && old.CATEGORY);
    var cat = CAT[up(itemRaw)] || up(itemRaw) || "OTHER";
    if (itemRaw && CAT[up(itemRaw)] && CAT[up(itemRaw)] !== up(itemRaw)) fix("Category name", sku, itemRaw + " → " + cat);
    if (!s(g("item")) && itemRaw) fix("Category filled in", sku, cat + " (from " + (info.item ? "stock file" : ordI.item ? "LB TASK" : "earlier show") + ")");
    var desc = s(g("desc")) || info.desc || (old && old.DESCRIPTION) || null;
    if (!s(g("desc")) && desc) fix("Description filled in", sku, desc);
    var metalRaw = s(g("metal")) || info.metal || (old && old.METAL_RAW) || (ordI.kt ? ordI.kt + "K " + (ordI.tone || "") : null);
    var mt = splitMetal(metalRaw);
    if (!mt.tone && s(g("tone"))) mt.tone = TONE[up(g("tone"))] || up(g("tone"));
    if (!s(g("metal")) && metalRaw) fix("Metal filled in", sku, metalRaw);
    var tot = f(g("ct")), gw = f(g("gw")), ngw = f(g("ngw"));
    if (gw === null && (info.gw || ordI.gw)) { gw = info.gw || ordI.gw; fix("Gross weight filled in", sku, String(gw)); }
    if (ngw === null && (info.ngw || ordI.ngw)) { ngw = info.ngw || ordI.ngw; fix("Net weight filled in", sku, String(ngw)); }
    if (tot === null && info.total) { tot = info.total; fix("Total carat filled in", sku, String(tot) + " (stock file)"); }

    /* stones */
    var lines = null, how = null;
    if (old && tot !== null && old.TOTAL_CT !== null && Math.abs(old.TOTAL_CT - tot) < 0.011 && graded(old.DIAMONDS)) {
      lines = old.DIAMONDS.map(function (l) { return Object.assign({}, l, { SKU: sku }); }); how = "earlier show (" + earlier[bc].show + ")";
    }
    var cands = src.lines[bc] || {}, best = null;
    Object.keys(cands).forEach(function (lab) {
      var L = cands[lab], t = sumCt(L);
      if (lines && score(L) <= score(lines)) return;
      if (tot && Math.abs(t - tot) <= Math.max(0.06, 0.06 * tot)) { if (!best || score(L) > score(best.L)) best = { L: L, lab: lab }; }
    });
    if (!best && !graded(lines) && tot) {       // only part of the stones is graded: keep it and add the balance
      Object.keys(cands).forEach(function (lab) {
        var L = cands[lab], t = sumCt(L);
        if (!best && graded(L) && t < tot - 0.06) {
          var bal = line(sku, "SIDE", { ct: tot - t, note: "balance of total carat" });
          best = { L: L.concat([bal]), lab: lab + " + balance" };
          fix("Balance line added", sku, r(tot - t, 2) + " ct not in " + lab);
        }
      });
    }
    if (best) { lines = best.L.map(function (l) { return Object.assign({}, l, { SKU: sku }); }); how = best.lab; }
    if (!lines && old && tot !== null && old.TOTAL_CT !== null && Math.abs(old.TOTAL_CT - tot) < 0.011) {
      lines = old.DIAMONDS.map(function (l) { return Object.assign({}, l, { SKU: sku }); }); how = "earlier show (" + earlier[bc].show + ")";
    }
    if (!lines) {
      lines = tot ? [line(sku, "SIDE", { ct: tot })] : [];
      how = "show list only";
      var near = Object.keys(cands).map(function (lab) { return lab + " " + r(sumCt(cands[lab]), 2) + " ct"; });
      if (near.length) issue("warn", "Stone details don't add up", sku, "list says " + tot + " ct; " + near.join(", "));
    }
    rep.counts[how.replace(/ \(.*\)/, "")] = (rep.counts[how.replace(/ \(.*\)/, "")] || 0) + 1;
    if (tot && !graded(lines)) issue("info", "No colour / clarity", sku, desc || "");

    var q = {}, cen = lines.filter(function (l) { return l.STONE_ROLE === "CENTER"; }), big = null;
    lines.forEach(function (l) { if (l.COLOR || l.CLARITY) { var k = (l.COLOR || "") + "|" + (l.CLARITY || ""); q[k] = (q[k] || 0) + (l.CARAT || 0); } });
    cen.forEach(function (l) { if (!big || (l.CARAT || 0) > (big.CARAT || 0)) big = l; });
    var qk = Object.keys(q).sort(function (a, b) { return q[b] - q[a]; })[0];
    var shapes = shapesFrom(desc);
    lines.forEach(function (l) { if (l.SHAPE && shapes.indexOf(l.SHAPE) < 0) shapes.push(l.SHAPE); });

    /* owner */
    var owner = s(g("owner")) ? up(g("owner")) : null, ownHow = owner ? "list" : null;
    if (!owner && old && old.OWNER) { owner = old.OWNER; ownHow = "earlier show"; }
    if (!owner) (opts.owners.prefixes || []).forEach(function (pr) { if (!owner && pr[0] && bc.indexOf(up(pr[0])) === 0) { owner = up(pr[1]); ownHow = "prefix"; } });
    if (!owner) (opts.owners.suffixes || []).forEach(function (pr) { if (!owner && pr[0] && bc.slice(-up(pr[0]).length) === up(pr[0])) { owner = up(pr[1]); ownHow = "suffix"; } });
    if (!owner) { owner = up(opts.owners.fallback) || "LEEBA"; issue("info", "Owner guessed", sku, owner + " (no rule matched)"); }

    /* price */
    var pv = f(g("price")), usd = null, mult = (P.ownerMult && P.ownerMult[owner]) || P.mult || 1, costV = null, costCur = P.colCur || "USD";
    if (P.mode === "formula") {
      var tag = f(g("tag")) || info.tag;
      if (tag && tot && ngw) {
        costV = tot * tag + ngw * (P.goldRate || 140); costCur = "USD";
        usd = tot * tag * (P.diaMarkup || 4) + ngw * (P.goldRate || 140) * (P.goldMarkup || 1.5);
      } else issue("error", "No price", sku, "missing " + [!tag && "tag $/ct", !tot && "carat", !ngw && "net weight"].filter(Boolean).join(", "));
    } else if (pv) {
      costV = pv;
      var sell = pv * mult;
      usd = (P.outCur || "USD") === "AED" ? sell / rate : sell;
    } else issue("error", "No price", sku, "price column empty");
    usd = usd ? r(usd, 2) : null;

    /* photo */
    var key = bc.replace(/\s+/g, ""), img = (opts.existingImages || {})[key] || null;
    var pic = pics[i];
    if (!img && pic) {
      img = key.replace(/[^A-Z0-9-]/g, "_") + "." + (pic.ext === "png" ? "png" : "jpg");
      newImages.push({ path: img, buffer: pic.buffer, ext: pic.ext, sku: sku });
      fix("Photo taken from the list", sku, img);
    }
    if (!img) issue("warn", "No photo", sku, "add images/" + key + ".jpg");

    /* checks */
    if (!mt.kt && tot !== null) issue("warn", "No metal", sku, "");
    if (gw && ngw && ngw > gw + 0.001) issue("error", "Net weight more than gross", sku, ngw + " > " + gw);
    if (soldBefore[bc]) issue("error", "Sold at an earlier show", sku, soldBefore[bc].showName + " · " + soldBefore[bc].date + " · " + soldBefore[bc].client);
    if (info.status && /SOLD/.test(up(info.status))) issue("warn", "Stock file says SOLD", sku, info.status);

    var p = { SR: no !== null ? no : products.length + 1, SKU: sku, BARCODE: bc, OWNER: owner, LIST_NO: no, CATEGORY: cat,
      DESCRIPTION: desc, METAL_KT: mt.kt, METAL_COLOR: mt.tone, METAL_RAW: metalRaw, SIZE: null,
      GROSS_WT_GM: r(gw, 3), NET_GOLD_WT_GM: r(ngw, 3), TOTAL_CT: r(tot, 2),
      CENTER_CT: r(sumCt(cen), 2) || null, SIDE_CT: r(sumCt(lines) - sumCt(cen), 2) || null,
      TOTAL_PCS: lines.length && lines.every(function (l) { return l.PCS; }) ? lines.reduce(function (t, l) { return t + l.PCS; }, 0) : null,
      CENTER_SHAPE: big ? big.SHAPE : null, CENTER_STONE_CT: big ? big.CARAT : null, CENTER_COLOR: big ? big.COLOR : null,
      CENTER_CLARITY: big ? big.CLARITY : null, CENTER_CERT: big ? big.CERT_NO : null,
      SHAPES: shapes.join(", ") || null, QUALITY: qk ? qk.split("|").filter(Boolean).join(" ") : null, CERT: info.cert || null,
      SELLING_PRICE_USD: usd, SELL_PER_CT_USD: usd && tot ? r(usd / tot, 2) : null,
      IMAGE: img, IMAGES_ALL: img, IMAGE_COUNT: img ? 1 : 0, DIA_LINES: lines.length, AVAILABILITY: "AVAILABLE", DIAMONDS: lines,
      _how: how, _owner_how: ownHow };
    products.push(p);
    cost.push([sku, owner, costV !== null ? r(costV, 2) : "", costCur, P.mode === "formula" ? "formula" : mult, usd || ""]);
  }

  /* price outliers: AED per carat far from the category's middle */
  var byCat = {};
  products.forEach(function (p) { if (p.SELL_PER_CT_USD) (byCat[p.CATEGORY] = byCat[p.CATEGORY] || []).push(p.SELL_PER_CT_USD); });
  Object.keys(byCat).forEach(function (c) { byCat[c].sort(function (a, b) { return a - b; }); });
  products.forEach(function (p) {
    var a = byCat[p.CATEGORY];
    if (!p.SELL_PER_CT_USD || !a || a.length < 8) return;
    var med = a[Math.floor(a.length / 2)];
    if (p.SELL_PER_CT_USD > med * 5 || p.SELL_PER_CT_USD < med / 5)
      issue("warn", "Price looks unusual", p.SKU, "AED " + Math.round(p.SELL_PER_CT_USD * rate).toLocaleString("en-US") + "/ct vs about AED " +
            Math.round(med * rate).toLocaleString("en-US") + "/ct for " + p.CATEGORY.toLowerCase() + "s");
  });

  var sh = opts.show || {};
  var catalog = { exhibition: "LEEBA Jewels - " + [sh.name, sh.venue, sh.dates].filter(Boolean).join(", "),
                  strap: [sh.name, sh.venue, sh.datesShort].filter(Boolean).join(" · "), tag: sh.tag, mode: "show", currency: "USD",
                  saleCurrency: sh.currency && sh.currency !== "AED" ? sh.currency : undefined,
                  built: new Date().toISOString().slice(0, 16).replace("T", " "), count: products.length,
                  products: products.map(function (p) { var o = Object.assign({}, p); delete o._how; delete o._owner_how; return o; }) };
  return { catalog: catalog, products: products, cost: cost, images: newImages, report: rep };
}

root.LeebaImport = { readBook: readBook, classify: classify, findHeader: findHeader, guessCols: guessCols, build: build,
                     SHOWLIST_COLS: SHOWLIST_COLS, shapesFrom: shapesFrom, up: up, f: f };
})(typeof window !== "undefined" ? window : this);
