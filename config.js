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
  PRICES_COST: "data/prices.cost.enc.json",

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
       max    price ceiling in USD (optional)
       min    price floor in USD (optional)

     Counts are worked out from the live data every time the page loads,
     and any collection that matches nothing is hidden automatically - so
     these keep working when the stock list is swapped. Add, remove or
     re-order freely; the row scrolls.
  ---------------------------------------------------------------- */
  COLLECTIONS: [
    { label: "Under $1,000",        max: 1000 },
    { label: "Rings under $1,500",  cat: "RING",          max: 1500 },
    { label: "Rings under $2,500",  cat: "RING",          max: 2500 },
    { label: "Bracelets under $2,000", cat: "BRACELET",   max: 2000 },
    { label: "Bracelets under $3,000", cat: "BRACELET",   max: 3000 },
    { label: "Earrings under $1,000",  cat: "EARRING",    max: 1000 },
    { label: "Earrings under $2,000",  cat: "EARRING",    max: 2000 },
    { label: "Bands under $1,000",  cat: "ETERNITY BAND", max: 1000 },
    { label: "Pendants under $1,000", cat: "PENDANT",     max: 1000 },
    { label: "Necklaces under $5,000", cat: "NECKLACE",   max: 5000 },
    { label: "Statement $10,000+",  min: 10000 }
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

     URL is the /exec address of the web app in tools/stock-api.gs - open
     that file, it has the five-minute setup at the top.
  ---------------------------------------------------------------- */
  STOCK: {
    URL: "",
    POLL_SECONDS: 25
  },

  /* Cards rendered per batch while scrolling. */
  PAGE_SIZE: 120
};
