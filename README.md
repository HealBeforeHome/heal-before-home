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
| `/dental-care`, `/oral-maxillofacial-surgery`, `/hair-restoration`, `/fertility-reproductive-care`, `/women-s-health-healthy-aging`, `/aesthetic-reconstructive-health`, `/confidence-transition-coaching`, `/longevity-wellness`, `/executive-health`, `/interventional-radiology` | the ten area-of-care detail pages |
| `/terms-of-use`, `/privacy-policy`, `/medical-service-disclaimer` | legal pages |
| `/thank-you` | form confirmation (noindex) |
| `/404` | not found |

URLs match the old Framer site exactly, so existing links and search rankings carry over.
Pages that no longer exist (`/how-it-works`, `/the-experience`, and seven of the old
area-of-care URLs) 301 to their new homes — see `_redirects`, which Cloudflare reads.
`/community-initiative-interest` is **not** among them: that page is live and carries a
working form.

## Forms

All four forms submit to **HubSpot** (portal `343416288`) through the public Forms
submission API. Nothing is posted to the host: `assets/js/hubspot-forms.js` intercepts the
submit, sends JSON to HubSpot and shows a status message in place. The markup stays the
site's own, so the fields look and behave like everything else on the page.

| Form | Page | `id` |
| --- | --- | --- |
| Journey enquiry | `/contact` | `journey-enquiry` |
| Provider enquiry | `/for-providers` | `provider-enquiry` |
| Newsletter | `/` and `/contact` | `newsletter-form` |
| Community interest | `/community-initiative-interest` | `community-form` |

Each form's GUID and its consent and success wording live in the `FORMS` table at the top
of `assets/js/hubspot-forms.js`. That table is the only thing to edit when a form is added
or replaced.

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
- Nothing is posted to the host. The whole form path is the site's own markup plus
  `hubspot-forms.js`, so it behaves identically wherever this is deployed.
- **No one is emailed when an enquiry arrives.** See the end of HUBSPOT-SETUP.md.

## Structure

```
index.html … contact.html      one file per page, self-contained markup
assets/css/site.css            the whole design system in one stylesheet
assets/js/site.js              carousel, mobile nav, accordions, scroll reveal
assets/js/hubspot-forms.js     form submissions to HubSpot
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
`assets/fonts/` rather than fetched from Google Fonts, so the site loads no third-party
resources at all. Keep it that way: the Content-Security-Policy in `_headers` allows no
external origin except the HubSpot form endpoint.

The contrast ratios in the comments throughout `site.css` are measured, not estimated.
If you change a colour, re-measure the pairs the comments name.

Spacing, type sizes and section rhythm are all `clamp()`-based, so the layout scales
continuously rather than jumping at breakpoints. Grids collapse at 980px and 620px;
the navigation becomes a drawer at 1400px. That breakpoint is high because the nav
carries nine items plus the CTA, which needs roughly 1150px of bar to sit on one line
— `.site-header .wrap.header-inner` is allowed to run wider than the 1220px body
measure for the same reason. **The 1400 in `site.css` and the 1400 in `site.js` must
stay in sync.**

### Editing content

Everything is plain HTML — open the page and edit the text. Repeated chrome (header,
footer, legal disclaimer) is duplicated in each file, so a change to the nav or footer
needs to be made in every page. `grep` for the string you're changing to find them all.

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

- **The journey enquiry form needs provisioning before it will accept anything.** The
  intake form gained residence, companion, requested-services, mobility and "how may we
  be of service" fields. A new field cannot be added to an existing HubSpot form, so
  `hubspot-provision.mjs` now names it *Website: journey enquiry v2* and the GUID in
  `hubspot-forms.js` is deliberately blank. Run `node hubspot-provision.mjs --write`
  with `HUBSPOT_TOKEN` set, then `--inspect`, then send a real test enquiry. Until then
  the form shows visitors the "not configured" message.
- **Placeholder imagery.** Nine slots currently render `capiz-texture.webp`. Find them
  with `grep -rn "PLACEHOLDER ASSET" *.html`; each comment names the file to drop in.
  They cover the Getting Started hero, the Recovery Experience hero and its home
  preview, the Standards & Trust hero and its home preview, and the Oral &
  Maxillofacial and Women's Health heroes plus their two Areas of Care cards. Drop the
  approved photo in under the filename the comment names and run `rebuild-images.py`,
  which fixes `srcset`, `width` and `height` for you.
- **`/standards-trust` is deliberately short.** It carries only what the approved
  source page carries — the H1, one intro paragraph and Our Promise — plus the standard
  CTA band. Part 3 of the handoff describes four Our Promise items and six further
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
- **Contact details.** The site has no phone number, email address or postal address
  anywhere — enquiries run through the forms only. Worth adding if that is intentional
  only for now.
- **The Manila photograph** is only 1080px on its longest side — the highest resolution
  the Framer CDN serves for that asset. It is slightly soft as a full-bleed hero on large
  displays and is the first image worth re-shooting or re-sourcing.
- **The fourteen area-of-care detail pages** from the Framer site are condensed into the
  accordion on `/areas-of-care` and redirect there. If those pages were earning search
  traffic on their own, they can be rebuilt as standalone pages using the same template.
