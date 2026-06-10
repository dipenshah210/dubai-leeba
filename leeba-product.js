/* ============================================================
   LEEBA — Product DNA Page Logic
   ============================================================ */

/* ─────────────────────────────────────────────────
   CONFIG  — update API_URL when your backend is ready
───────────────────────────────────────────────── */
var API_URL = 'https://your-api.example.com/products/PRODUCT_ID';

/* ─────────────────────────────────────────────────
   TONE LABELS
───────────────────────────────────────────────── */
var TONE_MAP = {
  W:  'White (W)',
  Y:  'Yellow (Y)',
  YW: 'Yellow + White',
  R:  'Rose (R)',
  RW: 'Rose + White'
};

function toneLabel(t) {
  return TONE_MAP[t] || t || '';
}

/* ─────────────────────────────────────────────────
   MOCK / DEMO PRODUCT
   Shown when no URL params exist and API_URL is
   still the placeholder value.
   Replace or remove once your real API is live.
───────────────────────────────────────────────── */
var mockProduct = {
  sku:         'LB-RG-2401',
  category:    'RING',
  purity:      '18KT',
  kt:          '18KT',
  grossWeight: '8.50 g',
  netWeight:   '6.20 g',
  diaWeight:   '1.24 ct',
  diaPcs:      '68',
  metalTone:   'YW',
  location:    'Mumbai',
  size:        '16',

  /* Multiple images → triggers slider with 3 dots */
  imageUrls: [
    'https://picsum.photos/seed/leeba1/800/600',
    'https://picsum.photos/seed/leeba2/800/600',
    'https://picsum.photos/seed/leeba3/800/600'
  ],

  /* Two video entries → triggers slider with 2 dots */
  videoUrls: ['', ''],

  /* 6 rows → triggers 2-column diamond grid */
  diamondDetails: [
    'Centre Stone \u00B7 Round Brilliant \u00B7 0.50 ct \u00B7 F / VS1',
    'Side Stones \u00B7 Princess Cut \u00B7 0.30 ct \u00B7 G / VS2',
    'Micro Pav\u00E9 Band \u00B7 Round \u00B7 0.20 ct \u00B7 G / SI1 \u00B7 24 pcs',
    'Baguette Accents \u00B7 Step Cut \u00B7 0.14 ct \u00B7 H / VS2 \u00B7 8 pcs',
    'Halo Ring \u00B7 Round Brilliant \u00B7 0.08 ct \u00B7 G / SI1 \u00B7 16 pcs',
    'Total Diamond Weight: 1.22 ct \u00B7 68 pcs'
  ]
};

/* ─────────────────────────────────────────────────
   URL PARAMS
   Reads the query string passed by the collection
   page when the user clicks a DNA button.
   Returns null if no ?sku= param is found.
───────────────────────────────────────────────── */
function getParams() {
  var p      = new URLSearchParams(window.location.search);
  var sku    = p.get('sku')    || '';
  var cat    = p.get('cat')    || '';
  var purity = p.get('purity') || '';
  var gw     = p.get('gw')    || '';
  var nw     = p.get('nw')    || '';
  var dw     = p.get('dw')    || '';
  var dp     = p.get('dp')    || '';
  var tone   = p.get('tone')  || '';

  if (!sku) return null;

  var details = [];
  if (dw) details.push('Diamond Weight: ' + dw + ' ct');
  if (dp) details.push('Diamond Pieces: ' + dp + ' pcs');

  return {
    sku:         sku,
    category:    cat,
    purity:      purity,
    kt:          purity,
    grossWeight: gw ? gw + ' g' : '',
    netWeight:   nw ? nw + ' g' : '',
    diaWeight:   dw ? dw + ' ct' : '',
    diaPcs:      dp || '',
    metalTone:   tone,
    location:    '',
    size:        '',
    imageUrls:   [],   /* populated by API in production */
    videoUrls:   [],
    diamondDetails: details
  };
}

/* ─────────────────────────────────────────────────
   MEDIA FRAME BUILDER
   Constructs the HTML for one media slot (image
   or video).  If urls has > 1 entry, a slider
   with dot indicators is automatically added.
───────────────────────────────────────────────── */
function buildMediaFrame(urls, type, labelText) {

  /* SVG icons used in placeholders */
  var imgSvg =
    '<svg width="44" height="44" fill="none" stroke="currentColor" stroke-width="1.2" viewBox="0 0 24 24">' +
    '<rect x="3" y="3" width="18" height="18" rx="2"/>' +
    '<circle cx="8.5" cy="8.5" r="1.5"/>' +
    '<polyline points="21 15 16 10 5 21"/>' +
    '</svg><span>Product Image</span>';

  var vidSvg =
    '<svg width="44" height="44" fill="none" stroke="currentColor" stroke-width="1.2" viewBox="0 0 24 24">' +
    '<polygon points="23 7 16 12 23 17 23 7"/>' +
    '<rect x="1" y="5" width="15" height="14" rx="2"/>' +
    '</svg><span>Product Video</span>';

  /* Build one <div class="slide"> per URL */
  var slides = urls.map(function(url) {
    var inner;
    if (type === 'image') {
      inner = url
        ? '<img src="' + url + '" alt="Product image" loading="lazy"/>'
        : '<div class="media-placeholder">' + imgSvg + '</div>';
    } else {
      inner = url
        ? '<video src="' + url + '" controls playsinline muted loop></video>'
        : '<div class="media-placeholder">' + vidSvg + '</div>';
    }
    return '<div class="slide">' + inner + '</div>';
  }).join('');

  /* Dot indicators — only rendered when there are multiple slides */
  var isMulti  = urls.length > 1;
  var dotsHtml = '';
  if (isMulti) {
    dotsHtml =
      '<div class="slider-dots">' +
      urls.map(function(_, i) {
        return '<button class="dot' + (i === 0 ? ' active' : '') +
               '" aria-label="Slide ' + (i + 1) + '"></button>';
      }).join('') +
      '</div>';
  }

  return (
    '<div class="media-frame">' +
      '<div class="slider-wrap">' +
        '<div class="slider-track">' + slides + '</div>' +
      '</div>' +
      dotsHtml +
      '<div class="media-label">' + labelText + '</div>' +
    '</div>'
  );
}

/* ─────────────────────────────────────────────────
   SLIDER INITIALISER
   Must be called after product HTML is injected
   into the DOM.  Attaches swipe + dot-click
   handlers to every .media-frame that has > 1 slide.
───────────────────────────────────────────────── */
function initSliders() {
  document.querySelectorAll('.media-frame').forEach(function(frame) {
    var track  = frame.querySelector('.slider-track');
    if (!track) return;

    var slides = frame.querySelectorAll('.slide');
    var dots   = frame.querySelectorAll('.dot');
    var count  = slides.length;
    if (count <= 1) return;   /* nothing to slide */

    var current  = 0;

    /* Move to slide at index idx (wraps around) */
    function goTo(idx) {
      current = ((idx % count) + count) % count;
      track.style.transform = 'translateX(-' + (current * 100) + '%)';
      dots.forEach(function(d, i) {
        d.classList.toggle('active', i === current);
      });
    }

    /* Dot clicks */
    dots.forEach(function(d, i) {
      d.addEventListener('click', function() { goTo(i); });
    });

    /* Touch swipe */
    var startX   = 0;
    var dragging = false;
    var wrap     = frame.querySelector('.slider-wrap');

    wrap.addEventListener('touchstart', function(e) {
      startX   = e.touches[0].clientX;
      dragging = true;
    }, { passive: true });

    wrap.addEventListener('touchend', function(e) {
      if (!dragging) return;
      dragging = false;
      var diff = startX - e.changedTouches[0].clientX;
      if (Math.abs(diff) > 40) goTo(current + (diff > 0 ? 1 : -1));
    });

    /* Mouse drag */
    wrap.addEventListener('mousedown', function(e) {
      startX   = e.clientX;
      dragging = true;
      e.preventDefault();
    });

    wrap.addEventListener('mouseup', function(e) {
      if (!dragging) return;
      dragging = false;
      var diff = startX - e.clientX;
      if (Math.abs(diff) > 40) goTo(current + (diff > 0 ? 1 : -1));
    });

    wrap.addEventListener('mouseleave', function() {
      dragging = false;
    });
  });
}

/* ─────────────────────────────────────────────────
   RENDER PRODUCT
   Builds and injects the full product HTML from
   a product data object p.
───────────────────────────────────────────────── */
function renderProduct(p) {

  /* Update browser tab title */
  if (p.sku) document.title = 'LEEBA \u2014 ' + p.sku;

  /* Helper: wrap a value in spec-value span, or show dash */
  function v(val) {
    return val
      ? '<span class="spec-value">' + val + '</span>'
      : '<span class="spec-value empty">\u2014</span>';
  }

  /* Normalise image / video URLs to arrays
     (supports both single string field and array field) */
  var imageUrls = Array.isArray(p.imageUrls) ? p.imageUrls
                : (p.imageUrl ? [p.imageUrl] : ['']);
  var videoUrls = Array.isArray(p.videoUrls) ? p.videoUrls
                : (p.videoUrl ? [p.videoUrl] : ['']);
  if (imageUrls.length === 0) imageUrls = [''];
  if (videoUrls.length === 0) videoUrls = [''];

  /* Diamond details layout:
     ≤ 4 rows → single column list
     > 4 rows → 2-column vertical-first grid        */
  var dItems      = p.diamondDetails || [];
  var diamondHtml = '';

  if (dItems.length > 4) {
    var rows = Math.ceil(dItems.length / 2);
    diamondHtml =
      '<ul class="diamond-grid" style="grid-template-rows: repeat(' + rows + ', auto)">' +
      dItems.map(function(d) { return '<li>' + d + '</li>'; }).join('') +
      '</ul>';
  } else {
    var listItems = dItems.length
      ? dItems.map(function(d) { return '<li>' + d + '</li>'; }).join('')
      : '<li>\u2014</li>';
    diamondHtml = '<ul class="diamond-list">' + listItems + '</ul>';
  }

  /* Capitalise category for display */
  var catDisplay = p.category
    ? p.category.charAt(0).toUpperCase() + p.category.slice(1).toLowerCase()
    : '';

  /* Inject HTML */
  document.getElementById('product').innerHTML =
    '<div class="product-page">' +

      /* Badge */
      '<span class="badge">' +
        (p.category ? p.category.toUpperCase() + ' \u00B7 ' : '') +
        'PRODUCT DNA' +
        (p.sku ? ' \u00B7 ' + p.sku : '') +
      '</span>' +

      /* Media row */
      '<div class="media-row">' +
        buildMediaFrame(imageUrls, 'image', 'Product Image') +
        buildMediaFrame(videoUrls, 'video', 'Product Video') +
      '</div>' +

      /* Spec grid */
      '<div class="details-section">' +
        '<div class="section-title">Details</div>' +
        '<div class="specs-grid">' +
          '<div class="spec-item"><span class="spec-label">SKU</span>'           + v(p.sku)                     + '</div>' +
          '<div class="spec-item"><span class="spec-label">Category</span>'      + v(catDisplay)                + '</div>' +
          '<div class="spec-item"><span class="spec-label">Purity / KT</span>'   + v(p.purity || p.kt)          + '</div>' +
          '<div class="spec-item"><span class="spec-label">Metal Tone</span>'    + v(toneLabel(p.metalTone))    + '</div>' +
          '<div class="spec-item"><span class="spec-label">Size</span>'          + v(p.size)                    + '</div>' +
		  '<div class="spec-item"><span class="spec-label">Gross Weight</span>'  + v(p.grossWeight)             + '</div>' +
          '<div class="spec-item"><span class="spec-label">Net Weight</span>'    + v(p.netWeight)               + '</div>' +
          '<div class="spec-item"><span class="spec-label">Diamond Wgt</span>'   + v(p.diaWeight)               + '</div>' +
          '<div class="spec-item"><span class="spec-label">Diamond Pcs</span>'   + v(p.diaPcs)                  + '</div>' +
          '<div class="spec-item"><span class="spec-label">Location</span>'      + v(p.location)                + '</div>' +
          
        '</div>' +
      '</div>' +

      /* Diamond details */
      '<div class="details-section">' +
        '<div class="section-title">Diamond Details</div>' +
        diamondHtml +
      '</div>' +

    '</div>';

  /* Activate sliders after HTML is in the DOM */
  initSliders();
}

/* ─────────────────────────────────────────────────
   LOAD PRODUCT
   Priority order:
   1. URL query params  (from collection page link)
   2. Real API          (when API_URL is configured)
   3. Demo / mock data  (development fallback)
───────────────────────────────────────────────── */
async function loadProduct() {
  show('loading');
  hide('error');
  hide('product');

  /* 1. URL params */
  var urlData = getParams();
  if (urlData) {
    renderProduct(urlData);
    show('product');
    hide('loading');
    return;
  }

  /* 2. Real API */
  if (!API_URL.includes('your-api.example.com')) {
    try {
      var res = await fetch(API_URL, { headers: { 'Accept': 'application/json' } });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      renderProduct(await res.json());
      show('product');
    } catch (err) {
      document.getElementById('error-msg').textContent =
        'Could not load product: ' + err.message;
      show('error');
    } finally {
      hide('loading');
    }
    return;
  }

  /* 3. Demo / mock */
  renderProduct(mockProduct);
  show('product');
  hide('loading');
}

/* ─────────────────────────────────────────────────
   DOM HELPERS
───────────────────────────────────────────────── */
function show(id) { document.getElementById(id).style.display = ''; }
function hide(id) { document.getElementById(id).style.display = 'none'; }

/* ── START ── */
loadProduct();
