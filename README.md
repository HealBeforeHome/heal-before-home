# Heal Before Home — static site

A hand-built static rebuild of healbeforehome.com. No build step, no framework, no
dependencies. Everything in this folder is what gets deployed.

## Deploying

**Netlify** — drag this folder onto the Netlify dashboard, or connect the repo with
`publish = "."` (already set in `netlify.toml`). Pretty URLs, redirects, caching headers
and form handling all work out of the box.

**Vercel** — import the folder as a static project. `vercel.json` sets `cleanUrls`,
the redirects and the caching headers.

**Domain** — point `www.healbeforehome.com` at the deploy and keep the apex redirecting
to `www`, as it does today. Every canonical URL, the sitemap and the Open Graph tags all
use `https://www.healbeforehome.com`.

## Pages

| URL | File |
| --- | --- |
| `/` | `index.html` |
| `/areas-of-care` | `areas-of-care.html` |
| `/medical-travel-philippines` | `medical-travel-philippines.html` (Why the Philippines) |
| `/our-story-between-two-worlds` | `our-story-between-two-worlds.html` |
| `/for-providers` | `for-providers.html` |
| `/contact` | `contact.html` |
| `/terms-of-use`, `/privacy-policy`, `/medical-service-disclaimer` | legal pages |
| `/thank-you` | form confirmation (noindex) |
| `/404` | not found |

URLs match the old Framer site exactly, so existing links and search rankings carry over.
Pages that no longer exist (`/how-it-works`, the fourteen individual area-of-care pages,
`/the-experience`, `/community-initiative-interest`) 301 to their new homes — see
`_redirects` (Netlify) and `vercel.json` (Vercel).

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
- The old Netlify Forms wiring has been removed. It had stopped working anyway — the site
  deploys to Cloudflare (see `wrangler.jsonc`), where `data-netlify` does nothing.
- **No one is emailed when an enquiry arrives.** See the end of HUBSPOT-SETUP.md.

## Structure

```
index.html … contact.html      one file per page, self-contained markup
assets/css/site.css            the whole design system in one stylesheet
assets/js/site.js              carousel, mobile nav, accordions, scroll reveal
assets/js/hubspot-forms.js     form submissions to HubSpot
assets/img/*.webp              optimized imagery (multiple widths per image)
assets/img/logo*.png           transparent logo, dark and light
hubspot-provision.mjs          one-off: creates the HubSpot properties and forms
robots.txt, sitemap.xml        search
netlify.toml, vercel.json      host config, redirects, cache headers
_redirects                     Netlify redirect table
```

### Design tokens

The base palette is carried over from the original site and lives at the top of
`site.css`: cream `#faf7f1` (page ground), sand `#eae7df` (alternating sections,
form panels, inset notes), forest `#1e2a25` (ink), sage `#65766b`, ivory `#fffff0`.
The original site's third cream `#f7f4ed` was dropped — it sat only 3 points off the
page ground and read as no separation at all. Type is Cormorant (display) over Alegreya Sans (body),
both loaded from Google Fonts — the same pairing the Framer site used.

Spacing, type sizes and section rhythm are all `clamp()`-based, so the layout scales
continuously rather than jumping at breakpoints. Grids collapse at 980px and 620px;
the navigation becomes a drawer at 1120px.

### Editing content

Everything is plain HTML — open the page and edit the text. Repeated chrome (header,
footer, legal disclaimer) is duplicated in each file, so a change to the nav or footer
needs to be made in every page. `grep` for the string you're changing to find them all.

### Replacing images

Photography lives in `assets/img/`. Each image ships at two or three widths referenced
through `srcset`; when swapping one in, either match the existing filenames and aspect
ratios or update the `src`, `srcset`, `width`, `height` and `alt` together. Aspect ratios
in use: 16:9 (heroes), 4:3 (feature cards), 3:2 (destinations), 1:1 (specialty tiles),
4:5 (portraits), 21:9 (full-width bands).

## Local preview

Clean URLs need a server that maps `/contact` to `contact.html`. The simplest option:

```
npx serve .
```

Opening `index.html` straight off disk will load, but the nav links will not resolve.

## Known follow-ups

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
