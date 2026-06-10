# LEEBA — Digital Product Catalogue

## Project Structure

```
leeba-collection.html    ← Collection / listing page (HTML only)
leeba-collection.css     ← All styles for the collection page
leeba-collection.js      ← Product data array + all logic

leeba-product.html       ← Product DNA detail page (HTML only)
leeba-product.css        ← All styles for the DNA page
leeba-product.js         ← Product rendering + slider logic
```

All 6 files must be in the **same folder** for the links between them to work.

---

## How It Works

### Collection Page  (`leeba-collection.html`)
- Renders a filterable table (desktop) and card grid (mobile) of all 133 products.
- Filters: category pills (multi-select), purity dropdown, metal tone dropdown, SKU search.
- Clicking **◆ DNA** opens the Product DNA page for that SKU in a new tab.
- Clicking **Price on Request** opens WhatsApp with a pre-filled message.

### Product DNA Page  (`leeba-product.html`)
- Reads product details from the URL query string passed by the collection page.
- Shows an image slider, a video slider, a spec grid, and diamond details.
- Falls back to a **mock product** with demo data when opened directly (no URL params).

---

## How Data Flows

```
Collection page builds the URL:
  leeba-product.html?sku=LBR00806&cat=BRACELET&purity=14KT&gw=16.11&nw=14.06&dw=10.25&dp=41&tone=W

Product page reads it in  getParams()  and renders the product.
```

---

## Where to Make Changes

| What                                 | Where                                      |
|--------------------------------------|--------------------------------------------|
| Add / update product records         | `leeba-collection.js` → `PRODUCTS` array  |
| Change the DNA page filename         | `leeba-collection.js` → `DNA_PAGE` const  |
| Update WhatsApp number               | `leeba-collection.js` → `WA_NUM` const    |
| Connect a real API                   | `leeba-product.js`   → `API_URL` const    |
| Change colours / typography          | `:root` block in each `.css` file          |
| Change the logo                      | `src` attribute on the `<img>` in each HTML file |

---

## Slider Behaviour (DNA Page)

The image and video sections become sliders automatically:

- **1 item** → no dots, no drag behaviour (plain frame).
- **2+ items** → dot indicators appear; user can click dots or swipe / drag.

When opened from the collection page, only URL-param data is available
(no image URLs), so each frame shows a single placeholder — this is correct.
The slider activates when your API returns multiple `imageUrls` or `videoUrls`.

## Diamond Details Layout (DNA Page)

- **≤ 4 rows** → single vertical list.
- **> 4 rows** → automatic 2-column grid, filled top-to-bottom column by column.
- On screens ≤ 700 px, the 2-column grid collapses back to a single column.
