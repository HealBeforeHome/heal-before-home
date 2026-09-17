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
 *     export HUBSPOT_TOKEN=pat-na1-...        (see below)
 *     node hubspot-provision.mjs --dry-run    show what it would create
 *     node hubspot-provision.mjs              create it
 *     node hubspot-provision.mjs --write      create it, then paste the GUIDs
 *
 *   THE TOKEN
 *     HubSpot > Settings > Integrations > Private Apps > Create a private app.
 *     Scopes: crm.schemas.contacts.write, crm.schemas.contacts.read, forms.
 *     The token is a CRM-wide credential. It is read from the environment and
 *     never written to a file - keep it out of the repo, and out of anything
 *     that gets deployed. The site itself needs no token: it posts to HubSpot's
 *     public form submission endpoint, which is designed to be called from a
 *     browser.
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

const API = 'https://api.hubapi.com';
const GROUP = 'contactinformation';
const SCRIPT = 'assets/js/hubspot-forms.js';

/* Properties HubSpot ships with - never create these. */
const STANDARD = new Set(['email', 'firstname', 'lastname', 'company', 'website', 'phone']);

/* Which form lives where, and the key it uses in the FORMS table of the script. */
const FORMS = [
  { key: 'journey-enquiry',  file: 'contact.html',       hsName: 'Website: journey enquiry'  },
  { key: 'provider-enquiry', file: 'for-providers.html', hsName: 'Website: provider enquiry' },
  { key: 'newsletter-form',  file: 'index.html',         hsName: 'Website: newsletter'       }
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
    if (!name || name === 'bot-field') continue;
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
      fields.push({ ...field(name, label, 'dropdown', required), options });
      continue;
    }

    fields.push(field(name, label, inputType === 'email' ? 'email' : 'single_line_text', required));
  }

  return fields;
}

function field(name, label, fieldType, required) {
  return { objectTypeId: '0-1', name, label, fieldType, required: !!required, hidden: false, dependentFields: [] };
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
  about: 'About the organization'
};

/* fieldType as the form draws it -> the type/fieldType pair a property needs. */
const PROPERTY_TYPE = {
  single_line_text: { type: 'string', fieldType: 'text' },
  multi_line_text: { type: 'string', fieldType: 'textarea' },
  dropdown: { type: 'enumeration', fieldType: 'select' },
  email: { type: 'string', fieldType: 'text' }
};

async function ensureProperty(f) {
  if (STANDARD.has(f.name)) return 'standard';

  const existing = await hs('GET', `/crm/v3/properties/contacts/${f.name}`);
  if (existing.ok) return 'exists';

  const body = {
    groupName: GROUP,
    name: f.name,
    label: PROPERTY_LABELS[f.name] || f.label,
    ...PROPERTY_TYPE[f.fieldType],
    ...(f.options ? { options: f.options.map((o, i) => ({ label: o.label, value: o.value, displayOrder: i, hidden: false })) } : {})
  };

  if (DRY) return 'would create';

  const made = await hs('POST', '/crm/v3/properties/contacts', body);
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

/* ------------------------------------------------------------------ main --- */

function paste(guids) {
  let src = readFileSync(SCRIPT, 'utf8');
  let changed = 0;
  for (const [key, guid] of Object.entries(guids)) {
    if (!guid) continue;
    const re = new RegExp(`('${key}':\\s*\\{[\\s\\S]*?guid:\\s*')PASTE-HUBSPOT-FORM-GUID(')`);
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

  const guids = {};

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

    const form = await ensureForm(spec, fields);
    guids[spec.key] = form.guid;
    console.log(`  form ${form.state}${form.guid ? `: ${form.guid}` : ''}`);
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
