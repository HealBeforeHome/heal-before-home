# Heal Before Home — static site

A hand-built static rebuild of healbeforehome.com. No build step, no framework, no
dependencies. Everything in this folder is what gets deployed.

## Deploying

**Cloudflare** — the live target, and the only one. `wrangler.jsonc` publishes the repo
root as a Workers static-assets project:

```
npx wrangler deploy
```

Clean URLs, the trailing-slash guard and the 404 page are configured there. `_headers`
carries the security and cache headers, `_redirects` the 301s from the old Framer URLs.

> **`.assetsignore` is load-bearing.** The deploy directory is the repo root, so every
> file here is public on the live site unless `.assetsignore` names it — `.git` included.
> Add a working file to that list *before* committing it, not after.

**Domain** — point `www.healbeforehome.com` at the deploy and keep the apex redirecting
to `www`, as it does today. Every canonical URL, the sitemap and the Open Graph tags all
use `https://www.healbeforehome.com`.

## Pages

| URL | File |
| --- | --- |
| `/` | `index.html` |
| `/philippines-medical-travel` | `philippines-medical-travel.html` (collection page; header dropdown) |
| `/bc-executive-collection` | `bc-executive-collection.html` (**hidden** since the 30 Sept 2026 brief: unlinked, `noindex`, out of the sitemap) |
| `/insights` | `insights.html` (**hidden** since the 30 Sept 2026 brief: unlinked and out of the sitemap; articles from `_templates/insight-article.html`) |
| `/planning-medical-wellness-journey-philippines`, `/executive-recovery-more-than-a-wellness-benefit` | the two launch Insights articles |
| `/getting-started` | `getting-started.html` |
| `/areas-of-care` | `areas-of-care.html` |
| `/recovery-experience` | `recovery-experience.html` |
| `/standards-trust` | `standards-trust.html` |
| `/medical-travel-philippines` | `medical-travel-philippines.html` (Why the Philippines) |
| `/our-story-between-two-worlds` | `our-story-between-two-worlds.html` |
| `/for-providers` | `for-providers.html` |
| `/contact` | `contact.html` |
| `/faq` | `faq.html` |
| `/meet-the-founder` | `meet-the-founder.html` |
| `/community-initiative-interest` | `community-initiative-interest.html` |
| `/oncology-second-opinion` | `oncology-second-opinion.html` (linked from Areas of Care) |
| `/dental-care`, `/hair-restoration`, `/fertility-reproductive-care`, `/women-s-health-healthy-aging`, `/aesthetic-reconstructive-health`, `/confidence-transition-coaching`, `/orthopedic-care`, `/stem-cell-hyperbaric-oxygen-therapy`, `/vision-care` | the area-of-care detail pages on `/areas-of-care` |
| `/oral-maxillofacial-surgery`, `/longevity-wellness`, `/executive-health`, `/interventional-radiology` | **hidden** since the 30 Sept 2026 brief: still published, but unlinked and out of the sitemap. Their Areas of Care cards are in `_archive/areas-of-care-cards-2026-09-30.html`; Oral & Maxillofacial now lives as a subsection of `/dental-care` |
| `/terms-of-use`, `/privacy-policy`, `/medical-service-disclaimer` | legal pages |
| `/thank-you` | form confirmation (noindex) |
| `/404` | not found |

URLs match the old Framer site exactly, so existing links and search rankings carry over.
Pages that no longer exist (`/how-it-works`, `/the-experience`, `/corporate-offerings`,
and six of the old area-of-care URLs) 301 to their new homes — see `_redirects`, which Cloudflare reads.
`/community-initiative-interest` is **not** among them: that page is live and carries a
working form.

## Forms

All four forms submit to **HubSpot** (portal `343416288`) through the public Forms
submission API, behind **Cloudflare Turnstile**. `assets/js/hubspot-forms.js` intercepts the
submit, gets a Turnstile token, and sends JSON to the site's own `/api/submit`
(`worker/index.js`), which verifies the token and forwards the submission to HubSpot; the
page then shows a status message in place. The markup stays the
site's own, so the fields look and behave like everything else on the page.

| Form | Page | `id` |
| --- | --- | --- |
| Journey enquiry | `/contact`, and a modal on every other page | `journey-enquiry` |
| Provider enquiry | `/for-providers` | `provider-enquiry` |
| Newsletter | the footer of every page | `newsletter-form` |
| Community interest | `/community-initiative-interest` | `community-form` |

Each form's GUID and its consent and success wording live in the `FORMS` table at the top
of `assets/js/hubspot-forms.js`. The GUID also goes in `FORMS` in `worker/index.js`, which
refuses any form it does not list. The Worker needs the `TURNSTILE_SECRET` secret and the
page the matching site key; see *Turnstile* in HUBSPOT-SETUP.md.

**Everything else is handled by `hubspot-provision.mjs`** — it creates the HubSpot
properties and forms, checks what has been received, and diagnoses a form that stops
working, all from the field list in the site's own markup:

```
node hubspot-provision.mjs --check      what HubSpot has received
node hubspot-provision.mjs --inspect    compare each form to what its page sends
node hubspot-provision.mjs --write      create anything missing, paste new GUIDs
```

It needs `HUBSPOT_TOKEN` in the environment — never in a file here, since the repo root is
the deploy directory. **[HUBSPOT-SETUP.md](HUBSPOT-SETUP.md)** covers the whole thing:
every command, the field list per form, troubleshooting, and the traps already hit.

### Notes

- Submitting is AJAX, so the page does not navigate to `/thank-you`; the thank-you message
  replaces the form. `thank-you.html` is still served but nothing links to it.
- Forms carry `novalidate` so a failed check does not discard typed answers. The script
  runs the same validity check itself, names the offending field in the message, and adds
  a missing `https://` to URL fields rather than rejecting a bare domain.
- The one server-side piece is `worker/index.js`, and it runs only for `/api/*`; every
  page and asset is still served as a static file. It is in `.assetsignore`, as is
  `.dev.vars` (the local Turnstile test secret for `wrangler dev`).
- **No one is emailed when an enquiry arrives.** See the end of HUBSPOT-SETUP.md.

## Structure

```
index.html … contact.html      one file per page, self-contained markup
_archive/                      originals of content the Sept 2026 brief retired; never deployed
_templates/                    the Insights article template; never deployed
assets/css/site.css            the whole design system in one stylesheet
assets/js/site.js              carousel, nav, accordions, scroll reveal, journey form stepper + modal
assets/js/hubspot-forms.js     form submissions: Turnstile token, then /api/submit
worker/index.js                /api/submit: verifies Turnstile, forwards to HubSpot; never deployed as a file
assets/img/*.webp              optimized imagery (multiple widths per image)
assets/img/logo*.png           transparent logo, dark and light
assets/fonts/*.woff2           the two typefaces, self-hosted
_source-images/                drop-in originals, kept for re-cropping; never deployed
rebuild-images.py              crops/converts/resizes a dropped-in photo, fixes the markup
hubspot-provision.mjs          one-off: creates the HubSpot properties and forms
robots.txt, sitemap.xml        search
wrangler.jsonc                 the Cloudflare deploy config
_headers                       security headers and the cache policy
_redirects                     301s from the old Framer URLs
.assetsignore                  what Cloudflare must NOT publish
```

### Design tokens

The base palette is carried over from the original site and lives at the top of
`site.css`: cream `#faf7f1` (page ground), sand `#ede7db` (alternating sections,
form panels, inset notes), forest `#1e2a25` (ink), sage `#5a6a60`, ivory `#fffff0`.
The original site's third cream `#f7f4ed` was dropped — it sat only 3 points off the
page ground and read as no separation at all. Type is Cormorant (display) over Alegreya
Sans (body) — the same pairing the Framer site used, but **self-hosted** from
`assets/fonts/` rather than fetched from Google Fonts. Keep it that way: the only
third-party resource is Cloudflare Turnstile (script and challenge frame), and the
Content-Security-Policy in `_headers` allows no other external origin.

The contrast ratios in the comments throughout `site.css` are measured, not estimated.
If you change a colour, re-measure the pairs the comments name.

Spacing, type sizes and section rhythm are all `clamp()`-based, so the layout scales
continuously rather than jumping at breakpoints. Grids collapse at 980px and 620px;
the navigation becomes a drawer at 1180px. The bar — logo, four nav items, the contact
icon and the CTA — needs about 1140px to sit on one line, and
`.site-header .wrap.header-inner` is allowed to run wider than the 1220px body measure
for that reason. **The 1180 in `site.css` and `NAV_BREAKPOINT` in `site.js` must stay in
sync.**

### Editing content

Everything is plain HTML — open the page and edit the text. Repeated chrome (header,
footer, legal disclaimer) is duplicated in each file, so a change to the nav or footer
needs to be made in every page. `grep` for the string you're changing to find them all.

### The Begin Your Journey form

There is one form, in `contact.html` (`#journey-form`). On `/contact` it sits in the page;
on every other page, clicking a `.btn--journey` or `[data-journey]` link to
`contact.html…` fetches `/contact` once and shows that same form in a modal. If the
fetch fails, or without JavaScript, the link simply goes to `/contact`. So edit the form
in `contact.html` only.

A link preselects the collection in its fragment: `contact.html#philippines`, `#bc`,
`#bc/individual`, `#bc/corporate`, `#unsure`, `#oncology`. Each `[data-stage]` is one screen of
the stepper; `data-routes` decides which screens a collection uses. The Philippines
residence rule (residence Philippines + Philippines collection → no enquiry) lives in
the stepper in `site.js`.

### Publishing an Insights article

1. Copy `_templates/insight-article.html` to the repo root as `<slug>.html` and replace
   every `{{FIELD}}` (title, category, featured image, excerpt, author, dates, SEO title,
   meta description, body).
2. Add its card to `insights.html` (the commented card there is the pattern), newest
   first, and add the URL to `sitemap.xml`.
3. The home page shows exactly two article cards (the brief). To feature a newer
   article there, swap one of the two cards in the INSIGHTS section of `index.html`.

Never publish an article before its complete approved body has been supplied.

### Replacing images

Photography lives in `assets/img/`, each image at two or three widths referenced through
`srcset`. **Do not do this by hand — `rebuild-images.py` automates it:**

```
python rebuild-images.py --check     report what would change, write nothing
python rebuild-images.py             do it
```

Drop the replacement into `assets/img/` named after the file it replaces, in any format
(`spec-hair.jpg`), and run it. It crops to the shape that slot already uses, converts to
WebP, rebuilds every smaller rendition, corrects `width`/`height`/`srcset` in the markup,
and moves your original to `_source-images/`. Heroes are exempt from the crop — CSS
frames those — so their original framing is kept.

Only `alt` is left to you. Aspect ratios in use: 16:9 (heroes), 4:3 (feature cards),
3:2 (destinations), 1:1 (specialty tiles), 4:5 (portraits), 21:9 (full-width bands).

## Local preview

Clean URLs need a server that maps `/contact` to `contact.html`. The simplest option:

```
npx serve .
```

Opening `index.html` straight off disk will load, but the nav links will not resolve.

## Known follow-ups

- **30 September 2026 brief.** BC Executive Collection, Insights, and four areas of
  care are hidden, not deleted: see the pages table. The home sections that
  went are in `_archive/home-sections-2026-09-30.html`. The Journey form's BC
  option is commented out in `contact.html`, and `bc` is out of `ROUTE_HASH` in
  `site.js`; restore both together. Nav is now Philippines Medical Travel | Our
  Story | FAQ | contact icon, with The Signature Experience second in the
  Philippines dropdown.
- **Photos to approve.** `signature-villa.webp` (home teaser), `recovery-nutrition.webp`,
  `recovery-companion.webp` and `spec-orthopedics.webp` are generated images. The
  client asked for an *authentic* photo of an existing villa HBH can coordinate for
  the home teaser; swap one in when available (drop it in as `signature-villa.jpg`
  and run `rebuild-images.py`).

- **Enquiry notifications and the guest confirmation email** are not set up. The journey
  form is provisioned and live in HubSpot (*Website: journey enquiry 2026*,
  `5890a799-…`, tested on all four routes 26 Sep 2026), but nobody is emailed when an
  enquiry arrives and the guest gets no confirmation. Both are HubSpot settings — see
  the end of HUBSPOT-SETUP.md. Four test contacts (`hello+test-…@healbeforehome.com`)
  can be deleted.
- **Confirmation email.** The brief's post-submission confirmation email is a HubSpot
  follow-up email to set up there; the site sends nothing itself.
- **Vision Care copy** came from the live Framer page, which repeats Dental Care text
  below its first question. Only the vision-specific parts are used.
- **Drafted copy for approval:** the three Private Executive Experience drawers on
  `/bc-executive-collection`, the HSA/LSA drawer (adapted from the old home-page
  benefits text for Canada), and the replacement for the JCI line on
  `/medical-travel-philippines`.

- **Placeholder imagery.** Every photograph the September 2026 brief asks for that does
  not exist yet renders `capiz-texture.webp`. Find them with
  `grep -rn "PLACEHOLDER ASSET" *.html`; each comment describes the photo wanted and
  names its target file. The two Insights articles also use the site default
  `og-image.jpg` for link previews until their photos are in; then point `og:image`,
  `twitter:image` and the JSON-LD `image` at the real photo.
  **`rebuild-images.py` cannot fill a placeholder on its own:** it only replaces a file
  a page already points at, and these point at `capiz-texture.webp`. First change the
  slot's `src` to the filename its comment names, then drop the photo in under that
  name and run the script, which converts it, builds the smaller renditions and fixes
  `srcset`, `width` and `height`.
- **`/standards-trust` is deliberately short.** It carries only what the approved
  source page carries — the H1, one intro paragraph and Our Promise — plus the
  Personalized Wellness & Digital Boundaries section the September 2026 brief added,
  and the standard CTA band. Part 3 of the handoff describes four Our Promise items and six further
  sections (Our Role, Provider Navigation, Our Partner Standards, Privacy & Discretion,
  Clinical Boundaries, Continuity Across Borders); none of that copy exists in the
  approved source, so none of it is on the page. Add those sections only when the copy
  is supplied.
- **Travelling Together on `/recovery-experience` ships as three bare titles.** Stay
  Together, Practical Support and Move Together carry no body copy because the source
  page has none, and it repeats the Welcome Amenity paragraph there by mistake. Signed
  off in this state; add descriptions if that source is ever corrected.

- **Batangas copy** on `/medical-travel-philippines` was rewritten. The original site
  repeated the Tagaytay paragraph there by mistake; the replacement is short and neutral
  and should be reviewed or replaced with Agnes's own words.
- **The Manila photograph** is only 1080px on its longest side — the highest resolution
  the Framer CDN serves for that asset. It is slightly soft as a full-bleed hero on large
  displays and is the first image worth re-shooting or re-sourcing.
- **The fourteen area-of-care detail pages** from the Framer site are condensed into the
  accordion on `/areas-of-care` and redirect there. If those pages were earning search
  traffic on their own, they can be rebuilt as standalone pages using the same template.
