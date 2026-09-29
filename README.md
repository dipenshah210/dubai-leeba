# dubai.leeba.co — LEEBA at the Sharjah show

The exhibition catalogue for the **58th Watch & Jewellery Middle East Show, Expo Centre
Sharjah, 30 September – 4 October 2026**.

Plain HTML, CSS and JavaScript. No build step, no server code, nothing to install —
upload the folder and it runs.

## What to upload

Everything in this folder **except `tools/`**:

```
index.html
config.js
CNAME
assets/      shows.css, shows.js, leeba-logo.png
data/        catalog.json, prices.cost.enc.json
images/      one photo per SKU
README.md    (optional)
```

**Never upload `tools/`.** It holds the full internal catalogue — cost, margin and the
pricing build-up in plain text. It is there so the data files can be rebuilt, not to be
published.

## GitHub Pages

1. Push the files above to the repository root.
2. Settings → Pages → Source: branch `main`, folder `/ (root)`.
3. Custom domain: `dubai.leeba.co` — the `CNAME` file in this folder already sets it.
4. Tick **Enforce HTTPS**. The cost view will not open without it: the browser's
   decryption API only runs on a secure page.
5. At GoDaddy, add a DNS record — Type `CNAME`, Name `dubai`, Value `dipenshah210.github.io`.

DNS usually takes a few minutes; the certificate can take up to an hour.

## Prices

Selling prices are public — anyone with the link sees them.

Cost, margin and the build-up are **not in `catalog.json` at all**. They live encrypted in
`data/prices.cost.enc.json` (AES-256-GCM, key derived from the passcode with
PBKDF2-SHA256, 250,000 rounds) and are decrypted in the browser only when the passcode is
entered. Without it the file is noise.

The COST button is hidden on phones, tablets and iPads — a customer could be looking at
any of those at the stand. On your own laptop the button sits in the header. On any
device, `dubai.leeba.co/#cost` opens the passcode box; nothing on the page hints at it.

To change the passcode, re-run:

```
python3 tools/build_site_data.py --cost "YOUR NEW PASSCODE"
```

## Editing without touching code

`config.js` is the only file to edit:

| Setting | What it does |
|---|---|
| `LOGO` | Header logo. Falls back to the LEEBA wordmark if it cannot load. |
| `IMAGE_BASE` | Where photos come from. `images/` locally, or an S3/CloudFront URL. |
| `SHOW_STRAP` | The line under the logo. |
| `SHOW_NAME`, `EXPORT_TAG` | Title and filename used by the Excel export. |
| `COLLECTIONS` | The pill row under the header — see below. |
| `PAGE_SIZE` | Cards loaded per batch while scrolling. |

### Collections

The pills under the header are for putting a budget in front of a client in one tap.
Each one is a line in `config.js`:

```js
{ label: "Rings under $1,500", cat: "RING", max: 1500 },
{ label: "Statement $10,000+", min: 10000 },
```

`cat` is optional (leave it out for all categories), as are `min` and `max`. Counts are
worked out from the live data each time the page loads, and any collection that matches
nothing is hidden automatically — so these keep working when the stock list is swapped.

## Filters

Category, location, metal colour, purity and diamond shape are all **multi-select** —
tap RING and BRACELET and you get both; tap D and I and you get both. Different filters
narrow each other (RING + BRACELET **and** D + I). `ALL` in any group clears that group.

Price has quick bands plus a min/max box; carat and gross weight have min/max. Whatever
is switched on shows as a row of pills above the grid — tap the × on one to drop just
that filter, or CLEAR ALL to start over.

## Live stock control

Out of the box, marking a piece SOLD is remembered only in the browser that did it.
Switch this on and stock goes live: mark a piece SOLD at the stand and every other
phone, tablet and laptop showing the page catches up within about 25 seconds —
customers included.

**Setup, about five minutes.** Open `tools/stock-api.gs`; the steps are at the top of
that file. In short: make a Google Sheet, paste the script into Extensions → Apps
Script, put your own staff codes in, deploy it as a web app (*Execute as: Me*, *Who has
access: Anyone*), and paste the `/exec` URL it gives you into `config.js`:

```js
STOCK: {
  URL: "https://script.google.com/macros/s/AKfy.../exec",
  POLL_SECONDS: 25
},
```

Leave `URL` empty and everything behaves exactly as before.

### Who can change what

| | Sees SOLD / HOLD / MEMO | Can change it |
|---|---|---|
| Anyone with the link | yes | no |
| Staff with a code | yes | yes |

The page is view-only until a staff code is entered — tapping a status button just
opens the unlock box. Press **STAFF** in the header, or go to `dubai.leeba.co/#staff`.

Give each person their own code. Every change is written to the sheet with the name
and time, and the `LOG` tab keeps the full history — who marked what, and what it was
before. The detail view shows the last change under the buttons ("Dipen · 27 Sept, 14:22").

To take someone's access away, delete their line from `STAFF` in the script and
re-deploy. It stops working immediately, because the code is checked on the server on
every single write — it is never in this site's files and never in the browser of
anyone who has not typed it.

### What this does and does not protect

The sheet itself stays private; only the script can reach it, and reads give out
nothing but SKU and status.

It is worth being straight about the limit: this is a public page with no login, so a
staff code is only as private as the device it was typed into. Anyone who can use an
unlocked staff phone can change stock as that person. Use the "Stay unlocked on this
device" tick only on your own phone, keep codes long (`LB-7K4M-QX`, not `1234`), and if
a device goes missing, change that code and re-deploy — it takes a minute and it locks
that device out.

### If the wifi drops

Exhibition halls being what they are: a change made while offline still shows on that
device straight away, the header pill turns amber and says how many are waiting, and
they are sent as soon as the connection is back. Nothing is lost, and nothing needs to
be remembered.

## On the stand

- **Availability** — set AVAILABLE / HOLD / SOLD / MEMO OUT on any piece. With live stock
  switched on (above) this is shared across every device; without it, it stays in that
  one browser.
- **Selection** — tick pieces and export them to Excel to send a client. The export
  includes the full stone breakdown on a second sheet, and cost columns only if the cost
  view is open.
- **Search** — SKU, description, shape, quality or certificate. `/` focuses it.
- **Keyboard** — `←` `→` move between pieces while a piece is open, `Esc` closes.

## Rebuilding the data

`tools/build_site_data.py` turns the internal catalogue into the two files in `data/`:

```
python3 tools/build_site_data.py --cost "LEEBA-COST-2026"
```

It checks the public file for leaks before writing — cost, margin and the internal
location description must never appear in `catalog.json`.
