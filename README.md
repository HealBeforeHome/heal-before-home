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
submission API. Nothing is posted to the host: `assets/js/hubspot-forms.js` intercepts
the submit, sends JSON to HubSpot and shows a status message in place. The markup stays
the site's own, so the fields look and behave like everything else on the page.

| Form | Page | `id` |
| --- | --- | --- |
| Journey enquiry | `/contact` | `journey-enquiry` |
| Provider enquiry | `/for-providers` | `provider-enquiry` |
| Newsletter | `/` and `/contact` | `newsletter-form` |
| Community interest | `/community-initiative-interest` | `community-form` |

### Connecting a form

Either run `node hubspot-provision.mjs --write`, which creates the properties and forms
over the API and pastes the GUIDs back in, or do it by hand — both are written up in
**[HUBSPOT-SETUP.md](HUBSPOT-SETUP.md)**. By hand, the short version:

1. **Build the form in HubSpot** with fields whose *internal names* match the `name`
   attributes in the markup — the tables below list them. Standard contact properties
   (`email`, `firstname`, `lastname`, `company`, `website`) already exist; the rest have
   to be created under *Settings → Properties → Contact properties* first, then added to
   the form.
2. **Turn the form's CAPTCHA off.** HubSpot refuses API submissions for any form with
   "SPAM prevention" enabled, answering `FORM_HAS_RECAPTCHA_ENABLED`. The honeypot field
   in the markup is what guards the form instead.
3. **Paste the form GUID** into the `FORMS` table at the top of
   `assets/js/hubspot-forms.js`, keyed by the form's `id`. The GUID is the last path
   segment of the form's editor URL:
   `app.hubspot.com/forms/343416288/editor/<GUID>/edit/form`.

Until a GUID is filled in, that form shows its error message and logs the reason to the
browser console; the other forms are unaffected.

### Fields each form sends

**`journey-enquiry`** — the name field is split on the last space into `firstname` and
`lastname`, because HubSpot has no single-name property.

| HubSpot internal name | Field type | Question |
| --- | --- | --- |
| `firstname`, `lastname` | single-line text | Your name |
| `email` | email | Email address |
| `care_type` | dropdown | What type of care or journey |
| `planning_stage` | dropdown | What stage of planning |
| `care_detail` | multi-line text | What care, procedure or retreat |
| `existing_arrangements` | multi-line text | What is already in place |
| `coordination_needs` | multi-line text | What to coordinate |
| `travel_dates` | single-line text | Preferred dates and length of stay |

**`provider-enquiry`** — same name split.

| HubSpot internal name | Field type | Question |
| --- | --- | --- |
| `company` | single-line text | Organization name |
| `firstname`, `lastname` | single-line text | Contact name |
| `email` | email | Email address |
| `provider_type` | dropdown | Type of provider |
| `locations` | single-line text | Location(s) served |
| `about` | multi-line text | Tell us about your organization |
| `website` | single-line text | Website |

**`newsletter`** — `email` only. To record an opt-in against a HubSpot subscription type
rather than only consent-to-process, put that subscription's numeric id in
`subscriptionId` in the `FORMS` table (*Settings → Marketing → Email → Subscription
types*).

**`community-form`** — already connected; its fields match the HubSpot form it was built
against. The contribution-type checkboxes arrive as one semicolon-joined value, which is
the format the submission API documents for a multi-value field.

Dropdown options must match the `<option>` values in the markup exactly, or HubSpot
rejects the value.

### Consent

Each form sends `consentToProcess` with the wording shown on the page. Because the API
does not say up front whether a form requires the consent block, the script sends the
plain payload first and retries with consent only if HubSpot objects — so either form
configuration works.

### Notes

- Submitting is AJAX, so the page no longer navigates to `/thank-you`; the thank-you
  message appears in place of the form. `thank-you.html` is still served but nothing
  links to it any more.
- Every form carries `novalidate` so a failed check does not throw away typed answers;
  the script runs the same validity check itself and focuses the first bad field.
- The old Netlify Forms wiring has been removed. It had stopped working anyway — the
  site deploys to Cloudflare (see `wrangler.jsonc`), where `data-netlify` does nothing
  and the submissions went nowhere.

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
