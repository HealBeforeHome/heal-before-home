/* Provision the HubSpot side of the site's forms, over the API.
 *
 * Does in one run what HUBSPOT-SETUP.md describes doing by hand: creates the
 * custom contact properties, creates the three forms with CAPTCHA off, and
 * prints the form GUIDs (--write pastes them into assets/js/hubspot-forms.js).
 *
 * The field list is READ OUT OF THE SITE'S OWN MARKUP rather than restated
 * here, so HubSpot cannot end up disagreeing with the pages. Edit a form in the
 * HTML, run this again, and the new field is added.
 *
 *   USAGE
 *     $env:HUBSPOT_TOKEN = "pat-na1-..."      PowerShell    (see below)
 *     export HUBSPOT_TOKEN=pat-na1-...        bash
 *
 *     node hubspot-provision.mjs --dry-run    show what it would create
 *     node hubspot-provision.mjs              create it
 *     node hubspot-provision.mjs --write      create it, then paste the GUIDs
 *     node hubspot-provision.mjs --check      list what HubSpot has received
 *     node hubspot-provision.mjs --inspect    compare each form to what its page sends
 *     node hubspot-provision.mjs --repair     turn off CAPTCHA, add missing dropdown values
 *                                             to both the properties and the forms
 *     node hubspot-provision.mjs --repair --prune   ...and DELETE dropdown values the
 *                                             pages no longer offer. Only safe when no
 *                                             contact holds one - it clears the field on
 *                                             any record that does.
 *
 *   THE TOKEN
 *     HubSpot > Settings > Integrations > Private Apps > Create a private app.
 *     Scopes: crm.schemas.contacts.write, crm.schemas.contacts.read, forms.
 *     The token is a CRM-wide credential. It is read from the environment and
 *     never written to a file - set it in the shell and keep it out of the repo,
 *     which IS the deploy directory: a .env here would be downloadable from the
 *     live site. The site itself needs no token - it posts to HubSpot's public
 *     form submission endpoint, which is designed to be called from a browser.
 *
 *   SAFE TO RE-RUN
 *     A property that already exists is left exactly as it is, and a form whose
 *     name already exists is skipped rather than duplicated. Nothing is ever
 *     deleted or overwritten.
 */

import { readFileSync, writeFileSync } from 'node:fs';

const TOKEN = process.env.HUBSPOT_TOKEN;
const DRY = process.argv.includes('--dry-run');
const WRITE = process.argv.includes('--write');
const CHECK = process.argv.includes('--check');
const INSPECT = process.argv.includes('--inspect');
const REPAIR = process.argv.includes('--repair');
const PRUNE = process.argv.includes('--prune');

const API = 'https://api.hubapi.com';
const GROUP = 'contactinformation';
const SCRIPT = 'assets/js/hubspot-forms.js';

/* Properties HubSpot ships with - never create these. */
const STANDARD = new Set(['email', 'firstname', 'lastname', 'company', 'website', 'phone', 'jobtitle']);

/* Honeypot decoys - the same list as TRAPS in hubspot-forms.js, which never
   sends them. A form field for one would only ever collect bot input. */
const TRAPS = new Set(['bot-field', 'hbh-leave-blank']);

/* Which form lives where, and the key it uses in the FORMS table of the script. */
const FORMS = [
  /* Rebuilt for the enquiry routes (general journey, Executive & Private
     Client proposal, oncology second opinion) and their new fields. A new field
     cannot be added to an existing HubSpot form, so this is deliberately a new
     name: `--write` creates it and pastes the new GUID into hubspot-forms.js.
     v2 (564001be-...) is left in HubSpot, unused. */
  { key: 'journey-enquiry',  file: 'contact.html',       hsName: 'Website: journey enquiry v3' },
  { key: 'provider-enquiry', file: 'for-providers.html', hsName: 'Website: provider enquiry' },
  { key: 'newsletter-form',  file: 'index.html',         hsName: 'Website: newsletter'       },
  /* The original "HBH Community Initiative Interest" was built in HubSpot's v4
     forms editor, which the API may read but not modify - so its CAPTCHA could
     never be turned off and it has never accepted a submission. Recreated here
     as a form we own. */
  { key: 'community-form',   file: 'community-initiative-interest.html', hsName: 'Website: community interest' }
];

/* ---------------------------------------------------------------- markup --- */

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", rsquo: '’', nbsp: ' ', mdash: '—', ndash: '–' };

function decode(s) {
  return s.replace(/&([a-z#0-9]+);/gi, (m, n) => (n.toLowerCase() in ENTITIES ? ENTITIES[n.toLowerCase()] : m));
}

function text(html) {
  return decode(html.replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim();
}

/* Pull one <form id="..."> out of a page. */
function formHtml(file, id) {
  const page = readFileSync(file, 'utf8');
  const open = page.indexOf(`id="${id}"`);
  if (open === -1) throw new Error(`no form with id "${id}" in ${file}`);
  const start = page.lastIndexOf('<form', open);
  const end = page.indexOf('</form>', open);
  return page.slice(start, end);
}

/* The visible label for a control, found by its for= association. */
function labelFor(html, elementId) {
  const m = html.match(new RegExp(`<label[^>]*for="${elementId}"[^>]*>([\\s\\S]*?)</label>`));
  if (!m) return null;
  /* Drop the asterisk that marks a field required on the page. */
  return text(m[1]).replace(/\s*\*\s*$/, '').trim();
}

/* A checkbox group's name comes from its fieldset legend - the inputs carry no
   label of their own, only a span per box. */
function legendFor(html, index) {
  const before = html.slice(0, index);
  const at = before.lastIndexOf('<legend');
  if (at === -1) return null;
  const end = before.indexOf('</legend>', at);
  return end === -1 ? null : text(before.slice(at, end));
}

const attr = (tag, name) => {
  const m = tag.match(new RegExp(`${name}="([^"]*)"`));
  return m ? decode(m[1]) : null;
};

/* Every field the site would send, in page order, as HubSpot field objects. */
function readFields(file, id) {
  const html = formHtml(file, id);
  const fields = [];

  const controls = html.matchAll(/<(input|select|textarea)\b([^>]*)>/g);
  for (const c of controls) {
    const [, kind, rest] = c;
    const tag = `<${kind}${rest}>`;
    const name = attr(tag, 'name');
    if (!name || TRAPS.has(name)) continue;
    if (kind === 'input' && /type="(submit|hidden|button)"/.test(tag)) continue;

    const elementId = attr(tag, 'id');
    const label = (elementId && labelFor(html, elementId)) || name;
    const required = / required[ >]/.test(tag + ' ');
    const inputType = attr(tag, 'type') || 'text';

    /* The pages ask for one name; HubSpot stores two. hubspot-forms.js splits
       the typed value at the first space, so the form needs both halves. */
    if (name === 'name') {
      fields.push(field('firstname', 'First name', 'single_line_text', required));
      fields.push(field('lastname', 'Last name', 'single_line_text', false));
      continue;
    }

    if (kind === 'textarea') {
      fields.push(field(name, label, 'multi_line_text', required));
      continue;
    }

    if (kind === 'select') {
      /* Options are matched by VALUE, so take the value attribute where the
         markup sets one and the visible text where it does not - exactly what
         the browser would submit. */
      const block = html.slice(c.index, html.indexOf('</select>', c.index));
      const options = [];
      for (const o of block.matchAll(/<option(?:\s+value="([^"]*)")?[^>]*>([\s\S]*?)<\/option>/g)) {
        const value = o[1] !== undefined ? decode(o[1]) : text(o[2]);
        if (!value) continue;                       /* the empty "Select" prompt */
        options.push({ label: text(o[2]) || value, value, displayOrder: options.length });
      }
      fields.push({ ...field(name, label, 'dropdown', required), options, defaultValues: [] });
      continue;
    }

    /* Ten checkboxes sharing one name are ONE HubSpot field with ten options,
       not ten fields. Each box contributes an option; the group is named by its
       fieldset legend. */
    if (inputType === 'checkbox' || inputType === 'radio') {
      const value = attr(tag, 'value');
      if (!value) continue;

      const group = fields.find((x) => x.name === name);
      if (group) {
        group.options.push({ label: value, value, displayOrder: group.options.length });
        continue;
      }

      const groupLabel = legendFor(html, c.index) || label;
      const kindOf = inputType === 'checkbox' ? 'multiple_checkboxes' : 'radio';
      fields.push({
        ...field(name, groupLabel, kindOf, required),
        options: [{ label: value, value, displayOrder: 0 }],
        defaultValues: []
      });
      continue;
    }

    fields.push(field(name, label, inputType === 'email' ? 'email' : 'single_line_text', required));
  }

  return fields;
}

function field(name, label, fieldType, required) {
  /* HubSpot enforces a form's required flags itself, server-side. The journey
     form shows different questions on different routes, so a question required
     on one route is simply absent on another - and HubSpot would reject that
     submission. The page does the per-route checking; HubSpot is only asked to
     insist on the identity every submission carries. */
  const hsRequired = !!required && (name === 'email' || name === 'firstname');
  const f = { objectTypeId: '0-1', name, label, fieldType, required: hsRequired, hidden: false, dependentFields: [] };

  /* Only email, phone and number fields carry a validation object, and on those
     it is REQUIRED - leaving it off fails the whole form with
     "Some required fields were not set: [validation]". The site asks for no
     phone or number, so email is the only case here. */
  if (fieldType === 'email') {
    f.validation = { useDefaultBlockList: false, blockedEmailDomains: [] };
  }

  return f;
}

/* ------------------------------------------------------------------- api --- */

async function hs(method, path, body) {
  const res = await fetch(API + path, {
    method,
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

/* A field's label on the page is the full question ("What type of care or journey
   are you considering?"), which is right on the form and unreadable as a column
   heading on a contact record. The property gets a short label instead; the form
   field keeps the question. Anything not listed here falls back to the question. */
const PROPERTY_LABELS = {
  care_type: 'Type of care considered',
  planning_stage: 'Planning stage',
  care_detail: 'Care or procedure detail',
  existing_arrangements: 'Existing arrangements',
  coordination_needs: 'Coordination needed',
  travel_dates: 'Preferred travel dates',
  provider_type: 'Provider type',
  locations: 'Locations served',
  about: 'About the organization',
  enquiry_route: 'Enquiry route',
  preferred_contact_method: 'Preferred contact method',
  /* Deliberately NOT HubSpot's own `phone`: a form field for that property has
     to be a "phone" field with its own validation settings, and a plain text
     field for it fails the whole form with VALIDATION_ERROR. A text property
     takes the number as typed; a workflow can copy it into Phone if wanted. */
  telephone: 'Telephone',
  experience_of_interest: 'Experience of interest',
  area_of_interest: 'Area of interest',
  payment_pathway: 'Payment pathway',
  guest_count: 'Number of guests',
  companion_details: 'Companion details',
  confidentiality_agreement: 'Confidentiality agreement requested'
};

/* fieldType as the form draws it -> the type/fieldType pair a property needs. */
const PROPERTY_TYPE = {
  single_line_text: { type: 'string', fieldType: 'text' },
  multi_line_text: { type: 'string', fieldType: 'textarea' },
  dropdown: { type: 'enumeration', fieldType: 'select' },
  multiple_checkboxes: { type: 'enumeration', fieldType: 'checkbox' },
  radio: { type: 'enumeration', fieldType: 'radio' },
  email: { type: 'string', fieldType: 'text' }
};

/* A property that already exists is not necessarily the RIGHT property - one made
   by hand can carry the wrong field type, or dropdown values that differ from what
   the page sends. HubSpot accepts the submission and then rejects the value, so
   the mismatch only shows up as a failed enquiry. Say so here instead. */
function checkMatches(f, prop) {
  const problems = [];

  const want = PROPERTY_TYPE[f.fieldType];
  if (want && prop.fieldType !== want.fieldType) {
    problems.push(`field type is ${prop.fieldType}, page needs ${want.fieldType}`);
  }

  if (f.options) {
    const have = new Set((prop.options || []).map((o) => o.value));
    const missing = f.options.map((o) => o.value).filter((v) => !have.has(v));
    if (missing.length) problems.push(`missing option(s): ${missing.join(' | ')}`);
  }

  return problems.length ? `MISMATCH  ${problems.join('; ')}` : 'exists';
}

async function ensureProperty(f) {
  if (STANDARD.has(f.name)) return 'standard';

  const existing = await hs('GET', `/crm/v3/properties/contacts/${f.name}`);
  if (existing.ok) return checkMatches(f, existing.data);

  const body = {
    groupName: GROUP,
    name: f.name,
    label: PROPERTY_LABELS[f.name] || f.label,
    ...PROPERTY_TYPE[f.fieldType],
    ...(f.options ? { options: f.options.map((o, i) => ({ label: o.label, value: o.value, displayOrder: i, hidden: false })) } : {})
  };

  if (DRY) return 'would create';

  const made = await hs('POST', '/crm/v3/properties/contacts', body);
  /* 409 means it is already there. That happens when the read above could not
     see it - a token with schema write but not schema read - and it is not a
     failure: the property exists, which is all this needed to guarantee. */
  if (made.status === 409) return 'exists';
  if (!made.ok) throw new Error(`property ${f.name}: ${JSON.stringify(made.data)}`);
  return 'created';
}

async function findForm(name) {
  const res = await hs('GET', '/marketing/v3/forms/?limit=100');
  if (!res.ok) throw new Error(`listing forms: ${JSON.stringify(res.data)}`);
  return (res.data.results || []).find((f) => f.name === name) || null;
}

async function ensureForm(spec, fields) {
  const existing = await findForm(spec.hsName);
  if (existing) return { guid: existing.id, state: 'exists' };
  if (DRY) return { guid: null, state: 'would create' };

  const now = new Date().toISOString();
  const body = {
    name: spec.hsName,
    formType: 'hubspot',
    archived: false,
    createdAt: now,
    updatedAt: now,
    fieldGroups: fields.map((f) => ({ groupType: 'default_group', richTextType: 'text', fields: [f] })),
    configuration: {
      language: 'en',
      cloneable: true,
      editable: true,
      archivable: true,
      /* The whole point. HubSpot rejects every API submission to a form with
         this on, answering FORM_HAS_RECAPTCHA_ENABLED. */
      recaptchaEnabled: false,
      notifyContactOwner: false,
      notifyRecipients: [],
      lifecycleStages: [],
      createNewContactForNewEmail: true,
      prePopulateKnownValues: false,
      allowLinkToResetKnownValues: false,
      /* Unused - the site shows its own message and never renders this form. */
      postSubmitAction: { type: 'thank_you', value: 'Thank you.' }
    },
    displayOptions: {
      renderRawHtml: false,
      theme: 'default_style',
      submitButtonText: 'Submit',
      style: {},
      cssClass: ''
    },
    /* Consent is sent per submission by hubspot-forms.js, which carries the
       wording actually shown on the page. */
    legalConsentOptions: { type: 'none' }
  };

  const made = await hs('POST', '/marketing/v3/forms/', body);
  if (!made.ok) throw new Error(`form "${spec.hsName}": ${JSON.stringify(made.data)}`);
  return { guid: made.data.id, state: 'created' };
}

/* ----------------------------------------------------------------- check --- */

/* The GUIDs the SITE is actually configured with, read back out of the script
   rather than from the FORMS table above - those are the ones a visitor's
   submission would have used, which is the thing being verified. */
function configuredForms() {
  const src = readFileSync(SCRIPT, 'utf8');
  const out = [];
  /* [^}] keeps each match inside its own entry, so an empty GUID reads as
     empty rather than borrowing the next form's. */
  for (const m of src.matchAll(/'([a-z][a-z-]*)':\s*\{[^}]*?guid:\s*'([^']*)'/g)) {
    out.push({ key: m[1], guid: m[2] });
  }
  return out;
}

/* Which page each configured form lives on, for --inspect. Kept separate from
   FORMS above because that list drives CREATION: the community form already
   exists in HubSpot under its own name and must never be recreated. */
const PAGE_OF = {
  'journey-enquiry': ['contact.html', 'journey-enquiry'],
  'provider-enquiry': ['for-providers.html', 'provider-enquiry'],
  'newsletter-form': ['index.html', 'newsletter-form'],
  'community-form': ['community-initiative-interest.html', 'community-form']
};

/* Compare each HubSpot form against what its page actually sends. Answers the
   two questions a rejected submission raises - is CAPTCHA on, and does the form
   know every field - without another round trip through the browser. */
async function inspectForms() {
  for (const f of configuredForms()) {
    console.log(`\n${f.key}`);

    if (!f.guid || f.guid.indexOf('PASTE') === 0) {
      console.log('  NOT CONNECTED - no GUID in ' + SCRIPT);
      continue;
    }

    const res = await hs('GET', `/marketing/v3/forms/${f.guid}`);
    if (!res.ok) {
      console.log(`  could not read form: ${JSON.stringify(res.data)}`);
      continue;
    }

    const def = res.data;
    const captcha = !!(def.configuration && def.configuration.recaptchaEnabled);
    console.log(`  name      : ${def.name}`);
    console.log(`  CAPTCHA   : ${captcha ? 'ON  <-- rejects EVERY API submission' : 'off'}`);
    console.log(`  consent   : ${(def.legalConsentOptions && def.legalConsentOptions.type) || 'none'}`);

    const have = new Map();
    for (const g of def.fieldGroups || []) {
      for (const fl of g.fields || []) have.set(fl.name, fl);
    }
    console.log(`  fields    : ${[...have.keys()].join(', ') || '(none)'}`);

    const page = PAGE_OF[f.key];
    if (!page) continue;

    let sends;
    try {
      sends = readFields(page[0], page[1]);
    } catch (err) {
      console.log(`  ${err.message}`);
      continue;
    }

    const missing = sends.filter((s) => !have.has(s.name)).map((s) => s.name);
    if (missing.length) {
      console.log(`  MISSING   : the page sends these, the form has no such field:`);
      console.log(`              ${missing.join(', ')}`);
    }

    for (const s of sends) {
      if (!s.options) continue;
      const hf = have.get(s.name);
      if (!hf) continue;
      const hv = new Set((hf.options || []).map((o) => o.value));
      const bad = s.options.map((o) => o.value).filter((v) => !hv.has(v));
      if (bad.length) {
        console.log(`  ${s.name}:`);
        console.log(`    page sends, form rejects : ${bad.join(' | ')}`);
        console.log(`    form actually accepts    : ${[...hv].join(' | ')}`);
      }
    }

    if (!missing.length && !captcha) console.log('  looks correct');
  }
}

/* Bring HubSpot into line with the pages, over the API, so nobody has to go
   clicking around the CRM: turn off any CAPTCHA that would reject our
   submissions, and add any dropdown value a page offers that the property does
   not yet accept.

   ADDITIVE by default. An option HubSpot has that the page no longer offers is
   left alone rather than deleted, because deleting one strips that value from
   any contact already carrying it; stale options are reported instead. Pass
   --prune to delete them anyway, once you know no record uses them. */
async function repair() {
  for (const f of configuredForms()) {
    console.log(`\n${f.key}`);

    if (!f.guid || f.guid.indexOf('PASTE') === 0) {
      console.log('  NOT CONNECTED - no GUID in ' + SCRIPT);
      continue;
    }

    const res = await hs('GET', `/marketing/v3/forms/${f.guid}`);
    if (!res.ok) {
      console.log(`  could not read form: ${JSON.stringify(res.data)}`);
      continue;
    }
    const def = res.data;

    if (def.configuration && def.configuration.recaptchaEnabled) {
      /* Send the whole configuration back with the one flag changed, rather
         than the flag alone - a partial object risks clearing the rest. */
      const patched = await hs('PATCH', `/marketing/v3/forms/${f.guid}`, {
        configuration: { ...def.configuration, recaptchaEnabled: false }
      });
      console.log(patched.ok
        ? '  CAPTCHA turned OFF'
        : `  could not turn CAPTCHA off: ${JSON.stringify(patched.data)}`);
    } else {
      console.log('  CAPTCHA already off');
    }

    const page = PAGE_OF[f.key];
    if (!page) continue;

    let sends;
    try {
      sends = readFields(page[0], page[1]);
    } catch (err) {
      console.log(`  ${err.message}`);
      continue;
    }

    for (const s of sends) {
      if (!s.options) continue;

      const prop = await hs('GET', `/crm/v3/properties/contacts/${s.name}`);
      if (!prop.ok) {
        console.log(`  ${s.name}: could not read property: ${JSON.stringify(prop.data)}`);
        continue;
      }

      const existing = prop.data.options || [];
      const have = new Set(existing.map((o) => o.value));
      const added = s.options.filter((o) => !have.has(o.value)).map((o) => o.value);
      const stale = existing.filter((e) => !s.options.some((o) => o.value === e.value));

      /* Page order, keeping each existing option's own label. Options HubSpot
         has that the page does not offer are kept on the end - unless --prune,
         which makes the list exactly what the page offers. */
      const desired = [];
      for (const o of s.options) {
        const found = existing.find((e) => e.value === o.value);
        desired.push({
          label: found ? found.label : o.label,
          value: o.value,
          displayOrder: desired.length,
          hidden: found ? !!found.hidden : false
        });
      }
      if (!PRUNE) {
        for (const e of stale) {
          desired.push({ label: e.label, value: e.value, displayOrder: desired.length, hidden: !!e.hidden });
        }
      }

      const unchanged = desired.length === existing.length &&
        desired.every((d, i) => existing[i] && existing[i].value === d.value);
      if (unchanged) {
        console.log(`  ${s.name}: options already match`);
        continue;
      }

      const upd = await hs('PATCH', `/crm/v3/properties/contacts/${s.name}`, { options: desired });
      if (!upd.ok) {
        console.log(`  ${s.name}: could not update options: ${JSON.stringify(upd.data)}`);
        continue;
      }

      if (added.length) console.log(`  ${s.name}: added -> ${added.join(' | ')}`);
      if (stale.length) {
        console.log(PRUNE
          ? `  ${s.name}: REMOVED -> ${stale.map((e) => e.value).join(' | ')}`
          : `  ${s.name}: still there but now unused: ${stale.map((e) => e.value).join(' | ')}`);
      }
      if (!added.length && !stale.length) console.log(`  ${s.name}: options reordered to match the page`);
    }

    await repairFormOptions(f.guid, def, sends);
  }
}

/* The form keeps its OWN copy of each dropdown's options, taken when the form
   was built - adding a value to the property does not add it to the form, and
   the submission API validates against the form's copy. Bring those in line
   too, with the same keep-unless---prune rule as the properties. */
async function repairFormOptions(guid, def, sends) {
  const wanted = new Map(sends.filter((s) => s.options).map((s) => [s.name, s.options]));
  const changed = [];

  const fieldGroups = (def.fieldGroups || []).map((g) => ({
    ...g,
    fields: (g.fields || []).map((fl) => {
      const page = wanted.get(fl.name);
      if (!page) return fl;

      const existing = fl.options || [];
      const options = page.map((o) => {
        const found = existing.find((e) => e.value === o.value);
        return found ? { ...found } : { label: o.label, value: o.value, description: '' };
      });
      if (!PRUNE) {
        for (const e of existing) {
          if (!page.some((o) => o.value === e.value)) options.push({ ...e });
        }
      }
      options.forEach((o, i) => { o.displayOrder = i; });

      const same = options.length === existing.length &&
        options.every((o, i) => existing[i].value === o.value);
      if (same) return fl;

      const added = options.filter((o) => !existing.some((e) => e.value === o.value)).map((o) => o.value);
      changed.push(`${fl.name}${added.length ? ` (added ${added.join(' | ')})` : ' (reordered)'}`);
      return { ...fl, options };
    })
  }));

  if (!changed.length) {
    console.log('  form options already match');
    return;
  }

  /* The whole fieldGroups array goes back, as read - a partial one would drop
     every field it left out. */
  const upd = await hs('PATCH', `/marketing/v3/forms/${guid}`, { fieldGroups });
  console.log(upd.ok
    ? `  form options updated: ${changed.join('; ')}`
    : `  could not update form options: ${JSON.stringify(upd.data)}`);
}

async function checkSubmissions() {
  for (const f of configuredForms()) {
    console.log(`\n${f.key}`);

    if (!f.guid || f.guid.indexOf('PASTE') === 0) {
      console.log('  NOT CONNECTED - no GUID in ' + SCRIPT);
      continue;
    }

    /* Read every page and sort here. Asking for "limit=5" and printing them as
       returned showed an old submission and hid the newest, since the order
       the API returns is not newest-first to be relied on. */
    const rows = [];
    let after = '';
    let failed = null;
    for (let page = 0; page < 40; page++) {
      const res = await hs('GET', `/form-integrations/v1/submissions/forms/${f.guid}?limit=50${after ? `&after=${after}` : ''}`);
      if (!res.ok) { failed = res.data; break; }
      rows.push(...(res.data.results || []));
      after = res.data.paging && res.data.paging.next && res.data.paging.next.after;
      if (!after) break;
    }
    if (failed && !rows.length) {
      console.log(`  could not read submissions: ${JSON.stringify(failed)}`);
      continue;
    }

    if (!rows.length) {
      console.log('  no submissions yet');
      continue;
    }

    rows.sort((a, b) => b.submittedAt - a.submittedAt);
    const recent = rows.slice(0, 5);
    console.log(`  ${rows.length} submission(s) in total, newest ${recent.length}:`);
    for (const r of recent) {
      /* Local time, not UTC - an evening submission read as UTC lands on the
         next day and looks wrong. */
      const when = new Date(r.submittedAt).toLocaleString('en-CA', {
        year: 'numeric', month: 'short', day: 'numeric',
        hour: 'numeric', minute: '2-digit', timeZoneName: 'short'
      });
      console.log(`\n    ${when}`);
      for (const v of r.values || []) {
        console.log(`      ${String(v.name).padEnd(24)} ${String(v.value).slice(0, 70)}`);
      }
    }
  }
}

/* ------------------------------------------------------------------ main --- */

function paste(guids) {
  let src = readFileSync(SCRIPT, 'utf8');
  let changed = 0;
  for (const [key, guid] of Object.entries(guids)) {
    if (!guid) continue;
    /* An unset GUID is either the placeholder or empty. */
    const re = new RegExp(`('${key}':\\s*\\{[^}]*?guid:\\s*')(?:PASTE-HUBSPOT-FORM-GUID)?(')`);
    if (!re.test(src)) continue;
    src = src.replace(re, `$1${guid}$2`);
    changed++;
  }
  if (changed) writeFileSync(SCRIPT, src);
  return changed;
}

async function main() {
  if (!TOKEN && !DRY) {
    console.error('Set HUBSPOT_TOKEN first (see the header of this file), or pass --dry-run.');
    process.exit(1);
  }

  /* Read-only: report what HubSpot has actually received, and stop. */
  if (CHECK) return checkSubmissions();
  if (INSPECT) return inspectForms();
  if (REPAIR) return repair();

  const guids = {};
  const failed = [];

  for (const spec of FORMS) {
    const fields = readFields(spec.file, spec.key);
    console.log(`\n${spec.hsName}  (${spec.file} #${spec.key})`);

    for (const f of fields) {
      const state = DRY && !TOKEN
        ? (STANDARD.has(f.name) ? 'standard' : 'would create')
        : await ensureProperty(f);
      const opts = f.options ? `, ${f.options.length} options` : '';
      console.log(`  ${state.padEnd(12)} ${f.name.padEnd(24)} ${f.fieldType}${opts}`);
    }

    if (DRY && !TOKEN) {
      console.log('  (no token: form not checked)');
      continue;
    }

    /* A form failure must not abandon the remaining forms' properties, which are
       the slower half of the job and are worth having even if the forms scope is
       missing. Report it and carry on. */
    try {
      const form = await ensureForm(spec, fields);
      guids[spec.key] = form.guid;
      console.log(`  form ${form.state}${form.guid ? `: ${form.guid}` : ''}`);
    } catch (err) {
      failed.push(spec.hsName);
      console.log(`  FORM FAILED  ${err.message}`);
    }
  }

  if (failed.length) {
    console.log(`
${failed.length} form(s) not created: ${failed.join(', ')}`);
    console.log('The error on each FORM FAILED line above says why. MISSING_SCOPES means');
    console.log('the private app needs the "forms" scope (Settings > Integrations >');
    console.log('Private Apps > your app > Auth); anything else is a bad request body.');
    console.log('Properties are unaffected either way - fix it and run this again.');
  }

  const found = Object.entries(guids).filter(([, g]) => g);
  if (!found.length) return;

  console.log('\nGUIDs for the FORMS table in ' + SCRIPT + ':\n');
  for (const [key, guid] of found) console.log(`  '${key}'  ->  ${guid}`);

  if (WRITE && !DRY) {
    const n = paste(Object.fromEntries(found));
    console.log(`\nPasted ${n} GUID${n === 1 ? '' : 's'} into ${SCRIPT}.`);
    if (n < found.length) console.log('The rest were already filled in - left alone.');
  } else if (!DRY) {
    console.log('\nRe-run with --write to paste these in automatically.');
  }
}

main().catch((err) => {
  console.error('\n' + err.message);
  process.exit(1);
});
