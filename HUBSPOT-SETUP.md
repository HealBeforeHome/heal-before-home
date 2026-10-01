# The site's forms and HubSpot

All four forms are connected to HubSpot portal **343416288** and verified end to end.
This is the reference for keeping them that way.

| Form | Page | `id` | HubSpot form | Form ID (GUID) |
| --- | --- | --- | --- | --- |
| Journey enquiry | `/contact`, and the modal on every other page | `journey-enquiry` | Website: journey enquiry 2026 | `5890a799-9aca-4362-b89f-f30b3b9d47d4` |
| Provider enquiry | `/for-providers` | `provider-enquiry` | Website: provider enquiry | `8a7b23bb-ef40-440e-adcb-64efe1930b14` |
| Newsletter | the footer of every page | `newsletter-form` | Website: newsletter | `b9f3af16-f3f1-4e18-8e7e-42f201f3a1e3` |
| Community interest | `/community-initiative-interest` | `community-form` | Website: community interest | `6923309e-5ff5-4333-aa2b-b94b62b72240` |

> **Never switch HubSpot's CAPTCHA on for these forms.** On 29 September 2026 it was
> enabled on all four, and every submission from the site failed from that moment
> (`FORM_HAS_RECAPTCHA_ENABLED`). `--inspect` found it; `--repair` turned it off on
> 30 September. HubSpot's CAPTCHA only works on forms HubSpot renders itself, and
> these are the site's own markup. Spam protection is Cloudflare Turnstile, checked by
> the site's Worker (below), with the honeypot and timing guard in `hubspot-forms.js`
> as a first layer.

## How it works

The site never renders HubSpot's markup. [`assets/js/hubspot-forms.js`](assets/js/hubspot-forms.js)
takes the values from the site's own fields, gets a Cloudflare Turnstile token, and
POSTs both to the site's own `/api/submit`. That is [`worker/index.js`](worker/index.js):
it verifies the token with Cloudflare and only then forwards the values to HubSpot's
public Forms submission API, passing HubSpot's answer straight back to the page.

The Worker keeps its own `FORMS` table of form id → GUID and refuses any form not in
it, so a new or replaced form's GUID goes in **both** files. `--write` fills unset
entries in both; a redeploy is then needed for the Worker to accept it.

## Turnstile

The widget is invisible to most visitors (`appearance: 'interaction-only'`): Cloudflare
decides on submit, and only asks for a click — shown just below the submit button —
when it is unsure. Each submission spends one token, issued for that form's id
(`action`), and the Worker rejects a token from another form or another hostname.

Setup, once:

1. Cloudflare dashboard → **Turnstile → Add widget**, mode *Managed*, hostnames
   `www.healbeforehome.com` and `healbeforehome.com`.
2. Paste the **site key** (public) into `TURNSTILE_SITEKEY` in `hubspot-forms.js`.
3. Set the **secret key** on the Worker — never in a file here:

   ```
   npx wrangler secret put TURNSTILE_SECRET
   ```

Locally (`npx wrangler dev`), the page swaps in Cloudflare's always-pass test site key.
Pair it with the test secret in a `.dev.vars` file at the repo root, which git and the
asset upload both ignore:

```
TURNSTILE_SECRET=1x0000000000000000000000000000000AA
```

The Worker's own logs (`npx wrangler tail`) show every refusal with Cloudflare's reason.
The form in HubSpot exists only as a *schema*: HubSpot validates the submission against
it and rejects anything that does not match.

Three consequences, because nearly every failure traces back to one of them:

- **Every field the site sends must exist on the HubSpot form**, under exactly the same
  internal name. One unrecognised field fails the whole submission.
- **How the HubSpot form looks does not matter.** Field order, labels, layout, styling,
  the thank-you message — all unused. Only internal names, field types and dropdown
  *values* matter.
- **CAPTCHA must be off.** HubSpot refuses every API submission to a form with spam
  prevention on, answering `FORM_HAS_RECAPTCHA_ENABLED`. Turnstile guards the forms
  instead.

## The provisioning script

[`hubspot-provision.mjs`](hubspot-provision.mjs) is the tool for all of this. It reads
the field list **out of the site's own markup**, so HubSpot cannot drift from the pages —
change a form in the HTML, run it again, and HubSpot is brought into line.

```powershell
# PowerShell. Settings > Integrations > Private Apps > your app > Auth to copy the token.
$env:HUBSPOT_TOKEN = "pat-na3-..."
```

```bash
# bash / Git Bash
export HUBSPOT_TOKEN=pat-na3-...
```

Scopes needed: `crm.schemas.contacts.write`, `crm.schemas.contacts.read`, `forms`.

| Command | What it does |
| --- | --- |
| `--dry-run` | Shows what it would create. Changes nothing, works without a token. |
| `--check` | Lists the last five submissions per form, with every value. Read-only. |
| `--inspect` | Compares each HubSpot form to what its page sends: CAPTCHA state, consent type, missing fields, dropdown values that would be rejected. Read-only. |
| *(no flag)* | Creates missing properties and forms. |
| `--write` | The same, then pastes new form GUIDs into `hubspot-forms.js`. |
| `--repair` | Turns off CAPTCHA where it is on, and adds dropdown values a page offers that the property lacks. |
| `--repair --prune` | Also **deletes** values the pages no longer offer. Only safe when no contact holds one — it clears the field on any record that does. |

Re-running is safe: an existing property is left alone, and a form whose name already
exists is skipped rather than duplicated.

**Keep the token out of this repo.** The repo root *is* the deploy directory. `.env`
and the usual key-file patterns are in `.assetsignore` as a safety net, but any other
file holding the token would be downloadable from the live site. Set it in the shell,
where it lives only for that window. The site itself needs no token.

## Day to day

**Did an enquiry arrive?** `--check`, or in HubSpot: **Contacts → Contacts** (sort by
Create date), or **Marketing → Forms →** a form **→ Submissions**, or the contact's own
timeline, which shows the full submission.

**A form stopped working?** In order: hard-refresh the page (`assets/js/*` has a
ten-minute cache, and a stale copy is indistinguishable from a real failure), check the
browser console for the `HubSpot:` line, then run `--inspect`.

**Added a field to a page?** Give the input a `name` that is a valid HubSpot internal
name (lowercase, underscores), then run `--write`. The property is created and the form
updated to match. Note that a *new* field on an *existing* form needs the form rebuilding
— rename it in `FORMS` in the script so a fresh one is created, then repoint the GUID.

## Troubleshooting

| Error | Cause | Fix |
| --- | --- | --- |
| `FORM_HAS_RECAPTCHA_ENABLED` | Spam prevention is on | `--repair`, or turn it off in the form's Options tab |
| `Field "x" is not a valid field` | Field missing from the HubSpot form, or the internal name differs | `--inspect` names it; `--write` after rebuilding the form |
| `x is not a valid enumeration option` | A dropdown value the page sends is not one of HubSpot's internal values | `--inspect` prints both lists; `--repair` adds the missing ones |
| `Some required fields were not set: [validation]` | Creating a form with an email field that has no `validation` object | Already handled in the script |
| `MISSING_SCOPES` | The private app lacks `forms` | Add the scope on the app's Auth tab |
| `The client is not allowlisted to perform an operation to v4 forms` | The form was built in HubSpot's newer forms editor. The API can read it but never modify it | Recreate the form through the script and repoint the GUID |
| `no form GUID set for "…"` | Placeholder still in `FORMS` | `--write` |
| `no Turnstile site key set` | Placeholder still in `TURNSTILE_SITEKEY` | Paste the site key (see Turnstile above) |
| `/api/submit` answers 403 `{"error":"turnstile"}` | Token rejected: wrong secret, a hostname not on the widget, or a reused/expired token | `npx wrangler tail` prints Cloudflare's error codes |
| `/api/submit` answers 500 `{"error":"config"}` | `TURNSTILE_SECRET` not set on the Worker | `npx wrangler secret put TURNSTILE_SECRET` |
| `/api/submit` answers 400 `{"error":"form"}` | Form id missing from `FORMS` in `worker/index.js` | Add it there and redeploy |
| `/api/submit` answers 502 `{"error":"verify"}` | The Worker could not reach Cloudflare's siteverify, or got a non-JSON reply | Transient; `npx wrangler tail` shows the cause. Persistent → check Cloudflare status |
| `/api/submit` answers 502 `{"error":"upstream"}` | The Worker could not reach HubSpot | Transient; `npx wrangler tail` shows the cause. Persistent → check HubSpot status |
| `verification unavailable` in the console | The Turnstile script did not load — usually a blocker or network filter | Nothing site-side; the visitor sees the usual error with the contact-page fallback |
| Thank-you appears but no contact | Nothing — it worked. The message only shows on a 200 | Check the record itself to confirm the fields mapped |

## Things that have already caught us

**HubSpot silently discards submissions from `*.workers.dev`.** Every form answers
200 "Thank you." and the site shows its thank-you, but a submission whose page is on
the Cloudflare preview address (`heal-before-home.sweet-fog-edc7.workers.dev`) never
becomes a contact or a submission. Found 30 September 2026: the same payload to the
same form from `localhost` or `www.healbeforehome.com` became a contact within
seconds; from `workers.dev`, never. So **test the live forms only on the real
domain** (or locally), never on the preview address, and do not treat a thank-you
as proof: confirm with

```
node hubspot-provision.mjs --find someone+test@example.com
```

which looks the address up as a contact. `--check` reads HubSpot's submission list,
which a discarded submission never reaches either.

**A v4 form cannot be repaired, only replaced.** The original community form was built in
HubSpot's newer editor and connected to the old Framer site. Its CAPTCHA could not be
turned off over the API, so it had never accepted a single submission. It was recreated
as *Website: community interest*; the original still exists, unused, and can be archived.

**`--prune` deletes through the property, which affects forms immediately, while adding
an option does not propagate to an existing form.** Running it against a form the API
cannot write to left a dropdown worse than before. Run `--inspect` first and confirm the
form is writable.

**A stale cached script looks exactly like a HubSpot outage.** The "no GUID configured"
path shows visitors the same message as a genuine API failure; only the console
distinguishes them. Hard-refresh before investigating anything else.

## Reference: what each form sends

The enquiry forms ask for one name; `hubspot-forms.js` splits it at the first space into
`firstname` and `lastname`, so both must exist on the form. Standard properties (`email`,
`firstname`, `lastname`, `company`, `website`) ship with HubSpot; everything else below is
a custom contact property created by the script.

**journey-enquiry** (*Website: journey enquiry 2026*) — the one shared, staged form behind
every Begin Your Journey button, on `/contact` and in the modal on every other page. The
route is chosen by `collection` (dropdown: Philippines Medical Travel, BC Executive
Collection, Not Sure Yet, and Oncology second opinion when arriving from the oncology
page). Every route sends `firstname`, `lastname`, `email`, `telephone`, `residence` (and
`residence_other`), `collection`, `consent_role` and `consent_contact`. Then:

- *Philippines Medical Travel:* `ph_areas` (checkboxes), `ph_timeline` (dropdown),
  `ph_arrangements` (checkboxes). A guest whose `residence` is Philippines is stopped
  before these questions and cannot submit a Philippines enquiry.
- *BC Executive Collection:* `bc_participation`, `on_behalf_of_organization`,
  `benefits_arrangement`, `companion_preference` (dropdowns), `company` and `jobtitle`
  (only when enquiring for an organization), `bc_services` (checkboxes).
- *Not sure yet:* `exploring_detail` (multi-line).
- *Oncology second opinion:* `preferred_contact_method`, `confidentiality_agreement`.

**Provisioned 26 September 2026** (`5890a799-9aca-4362-b89f-f30b3b9d47d4`): `--write`
created it, `--repair` added *New Zealand* to the existing `residence` property, and
`--inspect` plus one test submission per route came back clean. To rebuild it from
scratch, blank its GUID in `hubspot-forms.js`, change `hsName`, and repeat those steps.

Fields on another route are disabled in the page and never sent, so the HubSpot form
marks only `email` and `firstname` required; the page enforces the rest per route.

**provider-enquiry** — `company`, `firstname`, `lastname`, `email`, `provider_type`
(dropdown), `locations`, `about` (multi-line), `website`.

**newsletter-form** — `email`. Sent with consent to process **and** an explicit opt-in
to subscription type `3060772435` (`subscriptionId` in `hubspot-forms.js`), so it
evidences marketing consent.

**community-form** — `firstname`, `lastname`, `email`,
`strong_how_would_you_describe_your_role_or_area_of_contribution___strong_` (dropdown),
`community_initiative_contribution_type` (multiple checkboxes),
`community_initiative_contribution_details`.

That last dropdown's internal name is an artefact of the original HubSpot form, which
generated it from a label containing `<strong>` tags. It works, so it has been left
alone; the portal also has a cleaner `community_initiative_role` property, unused.

Dropdown values must match the `<option>` values in the markup exactly. `--inspect`
is the way to confirm that rather than reading them side by side.

Multi-checkbox values are sent as one semicolon-joined string, which is the format the
submission API documents; HubSpot splits them back into separate selected values.

## Not done yet

**The confirmation email to the guest.** The September 2026 brief asks for the
previously approved confirmation email to go out only after a successful submission.
The site does not send one: set it up in HubSpot as the 2026 form's follow-up email (or a
workflow triggered by a submission to it). Do not promise an advisor or a response time in
it unless those processes are running.

**Advisor notification by collection.** Filter on the `collection` property in a
HubSpot workflow (or set the form's notification recipients) to route Philippines, BC
and oncology enquiries — not something the script does.

**Enquiry notifications.** The script creates forms with an empty notification
list; since then, all four forms have been set to notify one HubSpot user (id
94986492, checked 1 October 2026). Change or add recipients per form under
**Marketing → Forms →** the form **→ Options →** *Send form notification emails to*.
A form recreated by the script starts with no recipients again.

**Test contacts** from setup are still in the CRM: two from team members' personal
addresses and the four `hello+test-…@healbeforehome.com` journey tests. Delete them
before reporting on real enquiries.
