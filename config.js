/* ------------------------------------------------------------------
   dubai.leeba.co - site configuration
   Edit this file only; the app code never needs touching for these.
------------------------------------------------------------------- */
window.LEEBA_CONFIG = {

  /* The LEEBA logo in the header - shipped with this site as assets/leeba-logo.png.
     If the logo cannot load, the header falls back to the LEEBA wordmark. */
  LOGO: "assets/leeba-logo.png",

  /* Where the product photos live.
     Local folder shipped with this site:      "images/"
     Or point it at S3 / CloudFront, e.g.:     "https://leeba-media.s3.ap-south-1.amazonaws.com/sharjah2026/"
     Must end with a slash. */
  IMAGE_BASE: "images/",

  /* Data files (relative to index.html). */
  CATALOG:     "data/catalog.json",

  /* Prices are shown in AED with USD small beside them. The catalogue is priced in
     USD; this converts. 3.6725 is the dirham's fixed peg to the dollar. */
  AED_PER_USD: 3.6725,

  /* Shown under the logo in the header. */
  SHOW_STRAP: "WATCH &amp; JEWELLERY MIDDLE EAST SHOW &middot; EXPO CENTRE SHARJAH &middot; 30 SEPT &ndash; 4 OCT",

  /* Show title, used in exported files and the export file name. */
  SHOW_NAME: "LEEBA - 58th Watch & Jewellery Middle East Show, Expo Centre Sharjah",
  EXPORT_TAG: "SHARJAH",

  /* ----------------------------------------------------------------
     READY-MADE COLLECTIONS
     The pill row under the header. Tap one and the list filters to it -
     made for putting a budget in front of a client in one move.

       label  what the pill says
       cat    category to limit to, or leave out for all categories
       max    price ceiling in AED (optional)
       min    price floor in AED (optional)
       sale   true = only pieces with a SALE or PROMO price
       tray   a display tray name, e.g. "PROMO TRAY"

     Pick a category above and only that category's collections show;
     with ALL, every collection shows.

     Counts are worked out from the live data every time the page loads,
     and any collection that matches nothing is hidden automatically - so
     these keep working when the stock list is swapped. Add, remove or
     re-order freely; the row scrolls.
  ---------------------------------------------------------------- */
  COLLECTIONS: [
    { label: "On sale",                    sale: true },
    { label: "Promo tray",                 tray: "PROMO TRAY" },
    { label: "Under AED 2,000",            max: 2000 },
    { label: "Under AED 5,000",            max: 5000 },
    { label: "Under AED 10,000",           max: 10000 },
    { label: "Rings under AED 5,000",      cat: "RING",          max: 5000 },
    { label: "Rings under AED 10,000",     cat: "RING",          max: 10000 },
    { label: "Rings under AED 20,000",     cat: "RING",          max: 20000 },
    { label: "Rings AED 50,000+",          cat: "RING",          min: 50000 },
    { label: "Earrings under AED 5,000",   cat: "EARRING",       max: 5000 },
    { label: "Earrings under AED 10,000",  cat: "EARRING",       max: 10000 },
    { label: "Earrings under AED 20,000",  cat: "EARRING",       max: 20000 },
    { label: "Bracelets under AED 15,000", cat: "BRACELET",      max: 15000 },
    { label: "Bracelets under AED 25,000", cat: "BRACELET",      max: 25000 },
    { label: "Bracelets under AED 40,000", cat: "BRACELET",      max: 40000 },
    { label: "Bands under AED 5,000",      cat: "ETERNITY BAND", max: 5000 },
    { label: "Bands under AED 8,000",      cat: "ETERNITY BAND", max: 8000 },
    { label: "Bands under AED 12,000",     cat: "ETERNITY BAND", max: 12000 },
    { label: "Pendants under AED 5,000",   cat: "PENDANT",       max: 5000 },
    { label: "Pendants under AED 10,000",  cat: "PENDANT",       max: 10000 },
    { label: "Pendants under AED 15,000",  cat: "PENDANT",       max: 15000 },
    { label: "Necklaces under AED 40,000", cat: "NECKLACE",      max: 40000 },
    { label: "Necklaces under AED 75,000", cat: "NECKLACE",      max: 75000 },
    { label: "Necklaces AED 150,000+",     cat: "NECKLACE",      min: 150000 },
    { label: "Bangles",                    cat: "BANGLE" },
    { label: "Statement AED 100,000+",     min: 100000 }
  ],

  /* ----------------------------------------------------------------
     LIVE STOCK CONTROL
     Leave URL empty and the page behaves as before: AVAILABLE / HOLD /
     SOLD / MEMO OUT is remembered only in the browser that set it.

     Fill URL in and stock goes live - mark a piece SOLD at the stand and
     every other phone, tablet and laptop showing the page picks it up
     within POLL_SECONDS, customers included. Changing it needs a staff
     code, which is checked on the server on every write and never appears
     anywhere in this site's files.

     URL is the /exec address of the web app built from stock-api.gs, the
     file sent alongside this site. That is a new, stand-alone script on its
     own Google Sheet - nothing to do with the one behind live.leeba.co. The
     five-minute setup is written at the top of it.
  ---------------------------------------------------------------- */
  STOCK: {
    URL: "https://script.google.com/macros/s/AKfycbwEh1WxFpp4eVuQRRxWBHTREk7EZDVQG1TMvFY_KnnGxx5OYhfU17pgwikAYsUCZeV0/exec",
    POLL_SECONDS: 25
  },

  /* Cards rendered per batch while scrolling. */
  PAGE_SIZE: 120
};
