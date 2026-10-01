# Heal Before Home — static site

A hand-built static rebuild of healbeforehome.com. No build step, no framework, no
dependencies. Everything in this folder that `.assetsignore` does not name is what gets
deployed; the one piece of server code is the form endpoint in `worker/`.

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
| `/insights` | `insights.html` (**hidden** since the 30 Sept 2026 brief: unlinked, `noindex`, out of the sitemap; articles from `_templates/insight-article.html`) |
| `/planning-medical-wellness-journey-philippines`, `/executive-recovery-more-than-a-wellness-benefit` | the two launch Insights articles. **Archived** 1 Oct 2026 while Insights is hidden: the files are in `_archive/insights/` (not deployed), the URLs 302 to the home page (`_redirects`), and neither is in the sitemap. The cards on the hidden `/insights` page still point at them. See *Restoring an archived page* |
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
| `/oral-maxillofacial-surgery`, `/longevity-wellness`, `/executive-health`, `/interventional-radiology` | **hidden** since the 30 Sept 2026 brief: still published, but unlinked, `noindex` and out of the sitemap. Their Areas of Care cards were kept in `_archive/areas-of-care-cards-2026-09-30.html`, now in git history only (see *Restoring retired content*); Oral & Maxillofacial now lives as a subsection of `/dental-care` |
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
_templates/                    the Insights article template; never deployed
_archive/                      paused pages kept for restoring (the Insights articles); never deployed
assets/css/site.css            the whole design system in one stylesheet
assets/js/site.js              carousel, nav, accordions, scroll reveal, journey form stepper + modal
assets/js/hubspot-forms.js     form submissions: Turnstile token, then /api/submit
worker/index.js                /api/submit: verifies Turnstile, forwards to HubSpot; runs as the Worker, never served as a file
assets/img/*.webp              optimized imagery (multiple widths per image)
assets/img/logo*.png           transparent logo, dark and light
assets/fonts/*.woff2           the two typefaces, self-hosted
_source-images/                drop-in originals, kept for re-cropping; never deployed
rebuild-images.py              crops/converts/resizes a dropped-in photo, fixes the markup
hubspot-provision.mjs          HubSpot admin tool: create, check, inspect and repair the forms
robots.txt, sitemap.xml        search
llms.txt                       plain-language site summary for AI assistants (see *Search and AI visibility*)
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

Internal links use the clean URL: `href="contact"`, `href="faq#x"`, and `href="/"` for
the home page. Never `contact.html`: Cloudflare answers every `.html` URL with a 307 to
the clean one, so a `.html` link costs each visitor and crawler a redirect.

### The Begin Your Journey form

There is one form, in `contact.html` (`#journey-form`). On `/contact` it sits in the page;
on every other page, clicking a `.btn--journey` or `[data-journey]` link to
`contact…` fetches `/contact` once and shows that same form in a modal. If the
fetch fails, or without JavaScript, the link simply goes to `/contact`. So edit the form
in `contact.html` only.

A link preselects the collection in its fragment: `contact#philippines`, `#bc`,
`#bc/individual`, `#bc/corporate`, `#unsure`, `#oncology`. Each `[data-stage]` is one screen of
the stepper; `data-routes` decides which screens a collection uses. The Philippines
residence rule (residence Philippines + Philippines collection → no enquiry) lives in
the stepper in `site.js`.

### Publishing an Insights article

1. Copy `_templates/insight-article.html` to the repo root as `<slug>.html` and replace
   every `{{FIELD}}` (title, category, featured image, excerpt, author, dates, SEO title,
   meta description, body). Keep the meta description to about 150 characters.
2. Add its card to `insights.html` (the commented card there is the pattern), newest
   first, add the URL to `sitemap.xml` with today's `<lastmod>`, and add a line for it
   to `llms.txt`.
3. While Insights is hidden (30 Sept 2026 brief) nothing else links to articles. When
   it returns, the home page's two-card INSIGHTS section is in git history
   (`_archive/home-insights-section.html`, see *Restoring retired content*).

Insights is currently paused: both launch articles are in `_archive/insights/`. To
bring them back, follow *Restoring an archived page*.

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

## Search and AI visibility

- **Structured data.** Every indexable page ends its `<head>` with one JSON-LD
  `@graph`: the Organization (`#organization`), the WebSite, the founder's Person, the
  page itself, and a BreadcrumbList. Care pages add a `Service`. `/faq` is a `FAQPage`
  whose answers are copied from the visible accordion, so **when you edit an FAQ answer,
  edit the JSON-LD copy too** (Google penalizes FAQ markup that differs from the page).
  Organization details (phone, email, region) are repeated in every page, so `grep` for
  them to change them all, along with the social links in the Organization's `sameAs`
  and the footer's *Connect With Us* list. `noindex` pages carry no JSON-LD.
  Check changes with https://search.google.com/test/rich-results and
  https://validator.schema.org.
- **Titles and descriptions.** Keep titles under about 65 characters and meta
  descriptions to about 150–160, or Google truncates them.
- **Sitemap.** List only indexable pages. Bump a page's `<lastmod>` when its content
  changes meaningfully.
- **Hidden pages** get `<meta name="robots" content="noindex, follow">`, come out of
  the sitemap and `llms.txt`, and lose their JSON-LD. Reverse all four when unhiding.
- **`llms.txt`** is a plain-language summary of the site for AI assistants. Keep it
  ASCII (Cloudflare serves `.txt` without a charset) and in step with the sitemap.

## Local preview

Run the real thing — static assets, clean URLs, `_headers`, `_redirects` and the
`/api/submit` Worker — with:

```
npx wrangler dev
```

For the forms to submit, create `.dev.vars` in the repo root holding Cloudflare's
always-pass Turnstile test secret (see *Turnstile* in HUBSPOT-SETUP.md). It is ignored
by git and never uploaded. Note that a local submission is real: it reaches HubSpot.

For layout work only, `npx serve .` is enough, but forms will fail there (no
`/api/submit`). Opening `index.html` straight off disk loads, but nav links will not
resolve.

## Security model

- **What is public.** Wrangler uploads the repo root *from disk* (not from git) and
  does not read `.gitignore`. Only `.assetsignore` keeps files private. It covers
  `.git`, docs, tooling, `worker/`, `_source-images/`, `_templates/`, `.dev.vars`,
  `.env*`, `*.key`, `*.pem` and editor/OS files. Add any new working file there
  **before** deploying.
- **Secrets.** There are two, and neither is ever in a file here:
  `TURNSTILE_SECRET` is a Worker secret (`npx wrangler secret put`), and
  `HUBSPOT_TOKEN` lives only in the shell running `hubspot-provision.mjs`. The
  Turnstile site key and HubSpot form GUIDs in the JS are public by design.
- **The form endpoint.** `/api/submit` accepts only the four form ids it lists,
  verifies a single-use Turnstile token bound to that form and hostname, and caps the
  body at 64 KB. It fails closed: no secret, a bad token or an unreachable upstream all
  refuse the submission.
- **Headers.** `_headers` sets a strict CSP (first-party only, plus Turnstile),
  HSTS, `X-Frame-Options: DENY` and more. The CSP allows the one inline `<script>`
  by hash, so editing that snippet in any page breaks the site until the hash is
  recomputed (the command is in `_headers`).
- **After each deploy**, spot-check that private files 404 on the live site:

  ```
  for p in /README.md /.git/config /worker/index.js /wrangler.jsonc /.env; do
    curl -s -o /dev/null -w "%{http_code} $p
" https://www.healbeforehome.com$p; done
  ```

## Restoring an archived page

`_archive/` is in `.assetsignore`, so anything in it is kept in the repo but never
served. It currently holds the two Insights articles (archived 1 October 2026). To
publish one again:

1. `git mv _archive/insights/<slug>.html <slug>.html` (back to the repo root).
2. Delete its `302` line from `_redirects`.
3. Add its URL back to `sitemap.xml` (with a `<lastmod>`) and to `llms.txt`. Remove `noindex` from the page if it should
   be indexed: `executive-recovery-more-than-a-wellness-benefit.html` carries one,
   the planning article does not.
4. Make sure something links to it (the `/insights` page, once that is unhidden).

## Restoring retired content

Until 1 October 2026, `_archive/` also held the originals of everything the September 2026 brief retired (old
home-page sections, the Areas of Care cards for the four hidden specialties, the old
Getting Started, Why the Philippines and Corporate Offerings pages, the home Insights
section). Those files were removed on 1 October 2026 together with the two images only it used
(`banca*.webp` and `preview-vancouver*.webp`). Everything is still in git:

```
git show 0e3cf89:_archive/home-sections-2026-09-30.html
git checkout 0e3cf89 -- _archive/          # bring those files back alongside _archive/insights/
git checkout 0e3cf89 -- assets/img/banca.webp assets/img/banca-900.webp
```

## Known follow-ups

- **30 September 2026 brief.** BC Executive Collection, Insights, and four areas of
  care are hidden, not deleted: see the pages table. The home sections that
  went are in git history (`_archive/home-sections-2026-09-30.html`, see *Restoring
  retired content*). The Journey form's BC
  option is commented out in `contact.html`, and `bc` is out of `ROUTE_HASH` in
  `site.js`; restore both together. Nav is now Philippines Medical Travel | Our
  Story | FAQ | contact icon, with The Signature Experience second in the
  Philippines dropdown.
- **Photos to approve.** `signature-villa.webp` (home teaser) and
  `recovery-companion.webp` are generated images. `spec-orthopedics.webp` (a knee with
  an illustrated bone overlay) and `recovery-nutrition.webp` (bulalo) were replaced on
  1 October 2026 with images the client supplied; the orthopedics one is an
  illustration by design. The
  client asked for an *authentic* photo of an existing villa HBH can coordinate for
  the home teaser; swap one in when available (drop it in as `signature-villa.jpg`
  and run `rebuild-images.py`).

- **Enquiry notifications and the guest confirmation email** are not set up. The
  brief's post-submission confirmation email is a HubSpot follow-up email; the site
  sends nothing itself. The journey
  form is provisioned and live in HubSpot (*Website: journey enquiry 2026*,
  `5890a799-…`, tested on all four routes 26 Sep 2026), but nobody is emailed when an
  enquiry arrives and the guest gets no confirmation. Both are HubSpot settings — see
  the end of HUBSPOT-SETUP.md. Four test contacts (`hello+test-…@healbeforehome.com`)
  can be deleted.
- **Vision Care copy** came from the live Framer page, which repeats Dental Care text
  below its first question. Only the vision-specific parts are used.
- **Drafted copy for approval:** the three Private Executive Experience drawers on
  `/bc-executive-collection`, the HSA/LSA drawer (adapted from the old home-page
  benefits text for Canada), and the replacement for the JCI line on
  `/medical-travel-philippines`.

- **Placeholder imagery.** Every photograph the September 2026 brief asks for that does
  not exist yet renders `capiz-texture.webp`. Find them with
  `grep -rn "PLACEHOLDER ASSET" *.html`; each comment describes the photo wanted and
  names its target file. The two (archived) Insights articles also use the site default
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
