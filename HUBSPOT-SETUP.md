# The site's forms and HubSpot

All four forms are connected to HubSpot portal **343416288** and verified end to end.
This is the reference for keeping them that way.

| Form | Page | `id` | HubSpot form |
| --- | --- | --- | --- |
| Journey enquiry | `/contact` | `journey-enquiry` | Website: journey enquiry |
| Provider enquiry | `/for-providers` | `provider-enquiry` | Website: provider enquiry |
| Newsletter | `/` and `/contact` | `newsletter-form` | Website: newsletter |
| Community interest | `/community-initiative-interest` | `community-form` | Website: community interest |

## How it works

The site never renders HubSpot's markup. [`assets/js/hubspot-forms.js`](assets/js/hubspot-forms.js)
takes the values from the site's own fields and POSTs them to HubSpot's public Forms
submission API, which needs no credentials and is designed to be called from a browser.
The form in HubSpot exists only as a *schema*: HubSpot validates the submission against
it and rejects anything that does not match.

Three consequences, because nearly every failure traces back to one of them:

- **Every field the site sends must exist on the HubSpot form**, under exactly the same
  internal name. One unrecognised field fails the whole submission.
- **How the HubSpot form looks does not matter.** Field order, labels, layout, styling,
  the thank-you message — all unused. Only internal names, field types and dropdown
  *values* matter.
- **CAPTCHA must be off.** HubSpot refuses every API submission to a form with spam
  prevention on, answering `FORM_HAS_RECAPTCHA_ENABLED`. The honeypot field in the markup
  guards the forms instead.

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

**Keep the token out of this repo.** The repo root *is* the deploy directory, so a `.env`
here would be downloadable from the live site. Set it in the shell, where it lives only
for that window. The site itself needs no token.

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
| Thank-you appears but no contact | Nothing — it worked. The message only shows on a 200 | Check the record itself to confirm the fields mapped |

## Things that have already caught us

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

**journey-enquiry** (*Website: journey enquiry v3*) — one form, three routes, chosen
by `enquiry_route` (dropdown). Every route sends `enquiry_route`, `firstname`,
`lastname`, `email`, `residence` (and `residence_other`). Then:

- *General journey:* `care_type`, `planning_stage` (dropdowns), `care_detail`,
  `existing_arrangements` (multi-line), `requested_services` (checkboxes),
  `travel_dates`, `companion`, `companion_count`, `mobility_accessibility`,
  `how_may_we_serve`.
- *Executive & Private Client proposal:* `preferred_contact_method`, `telephone`,
  `jobtitle`, `company`, `experience_of_interest`, `area_of_interest`,
  `payment_pathway` (dropdowns), `travel_dates`, `guest_count`, `companion_details`,
  `confidentiality_agreement`.
- *Oncology second opinion:* `preferred_contact_method`, `telephone`,
  `confidentiality_agreement` only — no package, benefit or travel questions.

Fields on another route are disabled in the page and never sent, so the HubSpot form
marks only `email` and `firstname` required; the page enforces the rest per route.

**provider-enquiry** — `company`, `firstname`, `lastname`, `email`, `provider_type`
(dropdown), `locations`, `about` (multi-line), `website`.

**newsletter-form** — `email`.

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

**Advisor notification for private proposals and oncology enquiries.** The brief
expects the advisor to hear about these. Filter on the `enquiry_route` property in a
HubSpot workflow (or set the form's notification recipients) — not something the
script does.

**Nobody is notified when an enquiry arrives.** The forms were created with an empty
notification list, so submissions land silently. Set it per form under
**Marketing → Forms →** the form **→ Options →** *Send form notification emails to*.
Worth doing before the site takes real traffic.

**The newsletter records consent to process, not a subscription opt-in.** Fine for
replying to someone; not enough to evidence opt-in for marketing email. To fix, find the
subscription type's numeric id under **Settings → Marketing → Email → Subscriptions** and
set `subscriptionId` in the `newsletter-form` entry of `hubspot-forms.js`.

**Test contacts** from setup are still in the CRM (`vencent.u@gmail.com`,
`legacy1126ad@gmail.com`).
