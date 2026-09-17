# Connecting the site's forms to HubSpot

Setup runbook for portal **343416288**. Do it once and the three unconnected forms start
writing to the CRM — a few minutes with the provisioning script, or about 45 by hand.

The site never renders HubSpot's own form markup. `assets/js/hubspot-forms.js` takes the
values from the site's own fields and POSTs them to HubSpot's Forms submission API. The
form you build in HubSpot exists only as a *schema* — HubSpot validates the submission
against it and rejects anything that does not match.

Three consequences worth holding onto, because nearly every failure traces back to one of
them:

- **Every field the site sends must exist on the HubSpot form**, under exactly the same
  internal name. A field HubSpot does not recognise fails the whole submission.
- **How the HubSpot form looks does not matter.** Field order, labels, column layout,
  styling, the thank-you message — all unused. Only internal names, field types and
  dropdown values matter.
- **Do not mark anything required in HubSpot that the site does not always send.** The
  site's own `required` attributes are the real gate.

---

## Two routes

**By API (faster, and the one to prefer).** `hubspot-provision.mjs` in the repo root does
steps 1 to 4 in one run: it creates the nine properties, creates the three forms with
CAPTCHA already off, and prints the GUIDs. It reads the field list out of the site's own
markup, so HubSpot cannot end up disagreeing with the pages — and the internal-name and
dropdown-value traps below stop being traps, because nothing is retyped.

```bash
# HubSpot > Settings > Integrations > Private Apps > Create a private app
# Scopes: crm.schemas.contacts.write, crm.schemas.contacts.read, forms
export HUBSPOT_TOKEN=pat-na1-...

node hubspot-provision.mjs --dry-run    # show what it would create, changes nothing
node hubspot-provision.mjs --write      # create it, then paste the GUIDs into the site
```

It is safe to re-run: an existing property is left untouched, and a form whose name
already exists is skipped rather than duplicated. Nothing is deleted or overwritten. Add
a field to a form in the HTML later, re-run it, and the property is created to match.

Then skip to [Step 5 — Test each one](#step-5--test-each-one).

**About that token:** it is a CRM-wide credential, quite unlike the public submission
endpoint the site uses. Keep it in your shell, never in a file in this repo, and never in
anything that gets deployed — the repo root *is* the deploy directory here. If it leaks,
revoke it in Private Apps. Nothing the live site does needs a token.

**By hand.** Everything below. Worth reading anyway if a submission later gets rejected,
because it explains what HubSpot is actually validating.

---

## Before you start

Check you have the two permissions this needs. Open **Settings** (gear icon, top right):

| You need | Where it shows | If it is missing |
| --- | --- | --- |
| Edit property settings | **Data Management → Properties** is visible | Ask the client to enable *Contacts → Edit property settings* on your user |
| Publish forms | **Marketing → Forms** (or *Lead Capture → Forms*) is visible and has a **Create form** button | Ask for *Marketing → Forms → Publish* |

"Developer access" sometimes means an app-developer account rather than a seat on the
production portal. Confirm the portal id reads **343416288** — it is in the URL of every
HubSpot page as `app.hubspot.com/…/343416288/…`. If it does not, you are in the wrong
account and the GUIDs you collect will not work.

HubSpot moves navigation around between releases. If a path below does not match what you
see, use the search box at the top of Settings — the destination names are stable even
when the menu tree is not.

---

## Step 1 — Create the custom contact properties

Standard properties already exist and need nothing: `email`, `firstname`, `lastname`,
`company`, `website`.

These nine do not exist yet. **Settings → Data Management → Properties → Create
property**, once each:

| Internal name | Label to type | Field type | Used by |
| --- | --- | --- | --- |
| `care_type` | Type of care considered | Dropdown select | Journey enquiry |
| `planning_stage` | Planning stage | Dropdown select | Journey enquiry |
| `care_detail` | Care or procedure detail | Multi-line text | Journey enquiry |
| `existing_arrangements` | Existing arrangements | Multi-line text | Journey enquiry |
| `coordination_needs` | Coordination needed | Multi-line text | Journey enquiry |
| `travel_dates` | Preferred travel dates | Single-line text | Journey enquiry |
| `provider_type` | Provider type | Dropdown select | Provider enquiry |
| `locations` | Locations served | Single-line text | Provider enquiry |
| `about` | About the organization | Multi-line text | Provider enquiry |

For each one: object type **Contact**, any group you like (making a group called
"Heal Before Home enquiry" keeps them together and out of the standard fields).

### Setting the internal name

This is the step that bites. HubSpot generates the internal name from the label you type
— "Type of care considered" becomes `type_of_care_considered`, which is **not** what the
site sends.

In the create-property panel, the generated internal name appears in small grey text just
under the Label field, with a `</>` or pencil control beside it. Click that and type the
internal name from the table above.

The internal name is permanent once saved. If you get one wrong you cannot rename it —
delete the property and create it again.

### Dropdown options

For the three dropdowns, add these options. HubSpot gives each option a **label** (shown
to humans) and an **internal value** (what the API matches on). The site sends the strings
below, so the *internal value* has to match them character for character — capitals,
ampersands, spelling and all.

`care_type`:

```
Hair restoration
Dental care
Fertility & reproductive care
Aesthetic, regenerative or reconstructive care
Longevity & wellness
Executive health
Interventional radiology
Spiritual or restorative retreat
Recovery support after a scheduled procedure
Other
```

`planning_stage`:

```
Exploring providers or options
Provider selected
Consultation completed
Date scheduled
Planning a wellness or longevity journey
Not sure where to begin
```

`provider_type`:

```
Hospital or medical centre
Specialist or accredited clinic
Dental care
Hair restoration
Fertility & reproductive care
Aesthetic, regenerative & reconstructive care
Interventional radiology
Executive health or longevity
Recovery & allied health
Hospitality or accommodation
Private transportation or mobility
Other
```

Note "medical **centre**" — British spelling, and the provider list uses
"Aesthetic, regenerative **&** reconstructive" where the journey list uses "**or**". Those
differences are in the live markup; copy them as they are.

After saving, reopen each dropdown property and check the internal values, not just the
labels. HubSpot sometimes rewrites characters it does not like — an ampersand is the
usual casualty. **If HubSpot will not hold a value exactly, do not fight it.** Let HubSpot
keep whatever it produced, and change the site's markup to match instead, by giving the
option an explicit `value`:

```html
<option value="Fertility and reproductive care">Fertility &amp; reproductive care</option>
```

The visitor still sees the ampersand; the API gets the string HubSpot accepts. The
dropdowns are in [contact.html:113](contact.html#L113), [contact.html:130](contact.html#L130)
and [for-providers.html:203](for-providers.html#L203).

---

## Step 2 — Build the three forms

**Marketing → Forms → Create form → Regular form → Blank template.**

Drag in the fields listed below from the left-hand panel — search by the label you gave
the property. Nothing else needs configuring: skip the styling, the thank-you message and
the follow-up email, since none of them run.

**Name the forms** something you will recognise in the submissions list — the names below
are suggestions, they are not read by anything.

### Form 1 — "Website: journey enquiry"

```
firstname                lastname
email
care_type
planning_stage
care_detail
existing_arrangements
coordination_needs
travel_dates
```

`firstname` and `lastname` both have to be on the form even though the site shows a single
"Your name" box — the script splits the typed name at the first space and sends the two
halves separately.

### Form 2 — "Website: provider enquiry"

```
company
firstname                lastname
email
provider_type
locations
about
website
```

### Form 3 — "Website: newsletter"

```
email
```

That is the whole form. It is used by the signup on both the home page and the contact
page.

---

## Step 3 — Turn CAPTCHA off on all three

**This is not optional.** HubSpot refuses every API submission to a form with CAPTCHA
enabled, answering `FORM_HAS_RECAPTCHA_ENABLED`. There is no way to satisfy it from our
own markup.

In the form editor, open the **Options** tab and find the spam prevention section —
labelled "SPAM prevention", "Add reCAPTCHA" or "Bot protection" depending on the release.
Switch it **off**, then **Publish** (or **Update**) the form.

Spam is handled instead by the honeypot field already in the site's markup: a field hidden
from humans that bots fill in, whose submissions are silently dropped.

---

## Step 4 — Copy the GUIDs into the code

With a form open in the editor, the address bar reads:

```
app.hubspot.com/forms/343416288/editor/17de38a9-c398-430f-b442-047c41bb80e1/edit/form
                                        └──────────── the GUID ────────────┘
```

Open [assets/js/hubspot-forms.js](assets/js/hubspot-forms.js) and replace the three
`PASTE-HUBSPOT-FORM-GUID` placeholders in the `FORMS` table at the top:

| Replace the placeholder under | With the GUID of |
| --- | --- |
| `'journey-enquiry'` | Website: journey enquiry |
| `'provider-enquiry'` | Website: provider enquiry |
| `'newsletter-form'` | Website: newsletter |

Leave `'community-form'` alone — it is already connected and working.

---

## Step 5 — Test each one

Test from the deployed site rather than from `file://`, or the browser blocks the request
before HubSpot sees it. `npx serve .` locally is fine — the submission API accepts
localhost.

For each form: open the page, fill it in with a throwaway address you can search for
later (Gmail's `you+hbhtest@gmail.com` trick works and keeps the test contacts findable),
and submit. **Keep the browser console open** — every failure is logged there with
HubSpot's own explanation, which is far more specific than the message shown on the page.

A success looks like: the form disappears, the thank-you message replaces it, and within a
few seconds the contact appears under **Contacts → Contacts** with every value on the
record. Check the record itself, not just that the contact exists — a field that silently
failed to map is the thing worth catching now.

Then delete the test contacts.

---

## Troubleshooting

| Console message | Cause | Fix |
| --- | --- | --- |
| `FORM_HAS_RECAPTCHA_ENABLED` | Step 3 was skipped, or the form was republished with it back on | Turn spam prevention off, republish |
| `Field "xyz" is not a valid field` | That field is not on the HubSpot form, or the internal name differs | Add it to the form; check the internal name, not the label |
| `xyz is not a valid enumeration option` | A dropdown value the site sends is not one of HubSpot's internal values | Compare character by character; fix the HubSpot option or the markup's `value` |
| `Error in 'fields.email'` / `INVALID_EMAIL` | HubSpot rejects role or disposable addresses on some portals | Test with a real mailbox |
| `404` | Wrong GUID, or the form was never published | Re-copy the GUID from the editor URL; publish the form |
| `no form GUID set for "…"` | Step 4 was skipped for that form | Paste the GUID |
| Nothing logged, nothing happens | The script did not load | Check `assets/js/hubspot-forms.js` returns 200 on that page |

A submission that HubSpot accepts but that you cannot find in Contacts is usually the
portal's marketing contact limit. Check **Settings → Objects → Contacts → Marketing
contacts** for the automation that sets contacts as marketing.

---

## Optional: record a real newsletter opt-in

As delivered, the newsletter records consent to *process* the address. That is enough to
reply to someone, but it is not a subscription — if the client intends to send marketing
email to this list, do this as well, because an opt-in you cannot evidence is the
expensive kind of missing.

1. **Settings → Marketing → Email → Subscriptions.** Find the subscription type the
   newsletter should sign people up to, or create one.
2. Get its numeric id. Opening the subscription type puts the id in the URL. Alternatively
   `GET /communication-preferences/v3/definitions` returns all of them with their ids.
3. In [assets/js/hubspot-forms.js](assets/js/hubspot-forms.js), set `subscriptionId` in
   the `newsletter-form` entry from `null` to that number (unquoted).

The signup then records an explicit opt-in against that subscription, with the consent
wording shown on the page stored alongside it.

---

## Optional: GDPR consent on the forms

If the portal has GDPR functionality switched on (**Settings → Privacy & Consent**), a
form can be set to require an explicit consent block on every submission. The script
handles either configuration without changes: it sends the plain payload first, and if
HubSpot objects about consent it immediately retries with the consent block and the
wording from the page. So you can turn this on or off later without touching the code.

The consent text sent for each form is in the `FORMS` table in
[assets/js/hubspot-forms.js](assets/js/hubspot-forms.js), and is worded to match what the
pages actually say. If the page copy changes, change it there too — that string is what
HubSpot stores as evidence of what the person agreed to.

---

## What the site sends, for reference

Full field tables per form are in the [README](README.md#forms). In short:

| Form | `id` in the markup | Page |
| --- | --- | --- |
| Journey enquiry | `journey-enquiry` | `/contact` |
| Provider enquiry | `provider-enquiry` | `/for-providers` |
| Newsletter | `newsletter-form` | `/` and `/contact` |
| Community interest | `community-form` | `/community-initiative-interest` |
