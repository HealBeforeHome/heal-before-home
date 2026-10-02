/* The site's only server code: Turnstile verification in front of HubSpot.
 *
 * Every page is still a static asset - wrangler.jsonc routes only /api/* here
 * (run_worker_first), so nothing else pays for a Worker invocation.
 *
 * POST /api/submit  { form, token, body }
 *   form   the <form> id, looked up in FORMS below; the browser never names a GUID
 *   token  the Turnstile response from the widget hubspot-forms.js rendered
 *   body   the HubSpot Forms API payload, built in the browser as before
 *
 * The token is checked with Cloudflare's siteverify; only then is the body
 * forwarded to HubSpot. HubSpot's status and JSON come back unchanged, so the
 * browser's consent retry and error logging work exactly as they did when it
 * posted to HubSpot directly.
 *
 * This folder is listed in .assetsignore: the repo root is the assets
 * directory, and this file must not be downloadable from the site.
 *
 * Needs the secret TURNSTILE_SECRET: `npx wrangler secret put TURNSTILE_SECRET`
 * for production, `.dev.vars` for `wrangler dev` (see HUBSPOT-SETUP.md).
 */

const PORTAL = '343416288';
const HUBSPOT = 'https://api.hsforms.com/submissions/v3/integration/submit/' + PORTAL + '/';
const SITEVERIFY = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

/* Form id -> HubSpot GUID. Keep in step with FORMS in assets/js/hubspot-forms.js;
   an id missing here is refused, which is the point - a public endpoint that
   forwarded to any GUID it was handed would be an open relay into the portal. */
const FORMS = {
  'community-form': '6923309e-5ff5-4333-aa2b-b94b62b72240',
  'journey-enquiry': '5890a799-9aca-4362-b89f-f30b3b9d47d4',
  'provider-enquiry': '8a7b23bb-ef40-440e-adcb-64efe1930b14',
  'newsletter-form': 'b9f3af16-f3f1-4e18-8e7e-42f201f3a1e3'
};

/* Where a token may have been issued. localhost is for `wrangler dev`, where
   the page uses Cloudflare's test site key. */
const HOSTNAMES = ['www.healbeforehome.com', 'healbeforehome.com', 'localhost'];

/* The largest real payload - the journey form with every box ticked - is a few
   KB; anything near this is not a form submission. */
const MAX_BODY = 64 * 1024;

function json(status, data) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
  });
}

async function verify(token, ip, secret) {
  const res = await fetch(SITEVERIFY, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      secret,
      response: token,
      remoteip: ip || undefined,
      idempotency_key: crypto.randomUUID()
    })
  });
  return res.json();
}

async function submit(request, env) {
  if (request.method !== 'POST') {
    return new Response(null, { status: 405, headers: { Allow: 'POST' } });
  }
  if (!(request.headers.get('Content-Type') || '').includes('application/json')) {
    return json(415, { error: 'json' });
  }
  if (!env.TURNSTILE_SECRET) {
    console.error('TURNSTILE_SECRET is not set - every submission is refused until it is.');
    return json(500, { error: 'config' });
  }

  const raw = await request.text();
  if (raw.length > MAX_BODY) return json(413, { error: 'size' });

  let input;
  try {
    input = JSON.parse(raw);
  } catch (e) {
    return json(400, { error: 'json' });
  }

  const guid = input && Object.prototype.hasOwnProperty.call(FORMS, input.form) && FORMS[input.form];
  if (!guid) return json(400, { error: 'form' });
  if (typeof input.token !== 'string' || !input.token || !input.body || typeof input.body !== 'object') {
    return json(400, { error: 'input' });
  }

  const ip = request.headers.get('CF-Connecting-IP');
  /* A network failure or a non-JSON reply from siteverify would otherwise
     throw out of the Worker as a bare 500. Still refused, just said plainly. */
  let outcome;
  try {
    outcome = await verify(input.token, ip, env.TURNSTILE_SECRET);
  } catch (e) {
    console.error('Turnstile siteverify failed for "' + input.form + '":', String(e));
    return json(502, { error: 'verify' });
  }
  /* action is set to the form id when the widget renders, so a token earned on
     the newsletter cannot be spent on the provider form. Cloudflare's test keys
     (used under `wrangler dev`) answer hostname example.com and no action, and
     flag it in metadata - which only happens when TURNSTILE_SECRET is itself
     the test secret, so it is no way around the checks in production. */
  const testing = !!(outcome.metadata && outcome.metadata.result_with_testing_key);
  const matches = testing || (HOSTNAMES.indexOf(outcome.hostname) !== -1 && outcome.action === input.form);
  if (!outcome.success || !matches) {
    console.warn('Turnstile refused "' + input.form + '":', JSON.stringify({
      success: outcome.success,
      hostname: outcome.hostname,
      action: outcome.action,
      errors: outcome['error-codes']
    }));
    return json(403, { error: 'turnstile' });
  }

  /* The submission now reaches HubSpot from Cloudflare rather than the
     visitor's browser, so pass the visitor's address on for the contact's
     analytics, as the browser's own request used to carry it. */
  const body = input.body;
  body.context = Object.assign({}, body.context, ip ? { ipAddress: ip } : {});
  /* The Turnstile token is not an answer: drop it if a page still sends it as
     a field (a browser holding an older hubspot-forms.js does), so it never
     lands on the contact or in a notification email. */
  if (Array.isArray(body.fields)) {
    body.fields = body.fields.filter((f) => !(f && /^cf[-_]turnstile/.test(String(f.name))));
  }

  let res, text;
  try {
    res = await fetch(HUBSPOT + guid, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    text = await res.text();
  } catch (e) {
    console.error('HubSpot unreachable for "' + input.form + '":', String(e));
    return json(502, { error: 'upstream' });
  }
  if (!res.ok) console.warn('HubSpot ' + res.status + ' for "' + input.form + '": ' + text);
  return new Response(text || '{}', {
    status: res.status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/submit') return submit(request, env);
    return env.ASSETS.fetch(request);
  }
};
