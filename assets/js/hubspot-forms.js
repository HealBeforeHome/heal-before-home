/* HubSpot form submissions.
 *
 * Every enquiry form on the site posts here rather than to a host's own form
 * handler: the fields stay the site's own markup, so they inherit the same
 * styling and validation as everything around them, and the values land in
 * HubSpot through the public Forms submission API.
 *
 * To wire a form up:
 *   1. build the form in HubSpot with matching field internal names (see the
 *      Forms section of README.md for the list each form needs),
 *   2. turn the form's CAPTCHA ("SPAM prevention") switch OFF - HubSpot refuses
 *      API submissions for a form that has it on, answering with
 *      FORM_HAS_RECAPTCHA_ENABLED. The honeypot in the markup guards it instead.
 *      Switching it on in HubSpot stops every form on the site: that is exactly
 *      what happened on 29 September 2026, when CAPTCHA was enabled on all four
 *      forms and every submission failed until `hubspot-provision.mjs --repair`
 *      turned it off again on 30 September,
 *   3. paste the form's GUID into FORMS below, keyed by the form's id attribute.
 *
 * The GUID is the last path segment of the form's editor URL:
 *   app.hubspot.com/forms/343416288/editor/<GUID>/edit/form
 */
(function () {
  var PORTAL = '343416288';

  /* ---------------------------------------------------------------------
     The only thing that needs editing when a form is added or replaced.
     Each key is the id attribute of a <form> in the markup.
     --------------------------------------------------------------------- */
  var FORMS = {
    'community-form': {
      guid: '6923309e-5ff5-4333-aa2b-b94b62b72240',
      consent:
        'By submitting this form, you agree that Heal Before Home may use the information ' +
        'provided to respond to your expression of interest and communicate with you about ' +
        'relevant community initiatives.',
      success: 'Thank you. Your interest has been received, and our team will be in touch as opportunities take shape.'
    },
    'journey-enquiry': {
      /* Set by `node hubspot-provision.mjs --write` after "Website: journey enquiry
         2026" is created.
         It is the single staged form for both collections (September 2026 brief);
         v3 (aabcaefc-2d81-4bfc-94a9-b3d3e25e84d1) lacks its fields and would
         reject them, so it is not left in place here. */
      guid: '5890a799-9aca-4362-b89f-f30b3b9d47d4',
      consent:
        'I understand HBH’s non-clinical coordination role. I have read the Privacy Policy ' +
        'and consent to HBH contacting me about this enquiry.',
      /* No response time: the brief rules out promising one until it is operational. */
      success: 'Thank you. Your enquiry has been received, and our team will be in touch.'
    },
    'provider-enquiry': {
      guid: '8a7b23bb-ef40-440e-adcb-64efe1930b14',
      consent:
        'By submitting this form, you agree that Heal Before Home may use the information ' +
        'provided to respond to your enquiry and communicate with you about a possible partnership.',
      success: 'Thank you. Your enquiry has been received, and our team will review it shortly.'
    },
    'newsletter-form': {
      guid: 'b9f3af16-f3f1-4e18-8e7e-42f201f3a1e3',
      consent:
        'By subscribing, you agree that Heal Before Home may use your email address to send ' +
        'you occasional updates.',
      /* Optional: the numeric id of the HubSpot subscription type this signs the
         visitor up to (Settings > Marketing > Email > Subscription types). With
         it set, the submission records an explicit opt-in to that subscription;
         left null, only consent to process is recorded. */
      subscriptionId: 3060772435,
      success: 'Thank you. You are on the list.'
    }
  };

  var ENDPOINT = 'https://api.hsforms.com/submissions/v3/integration/submit/';

  /* Spam guards. HubSpot's own CAPTCHA has to stay off (see the note at the top
     of this file), the portal id and every GUID are public, and the endpoint
     takes anonymous POSTs - so these are what stands between a scripted bot and
     the CRM. Neither stops anyone who has read this file; they stop the
     commodity bots that crawl for exposed form endpoints, which is what
     actually shows up. If real spam ever arrives, the answer is Turnstile
     behind a Worker that proxies the submission, which would also let HubSpot's
     own protection be switched back on.

     Every name here is a decoy field, hidden by .hp and skipped by collect().
     Anything typed into one came from something that cannot see the page. */
  var TRAPS = ['bot-field', 'hbh-leave-blank'];

  /* A submit this soon after the form was wired did not come from someone
     reading the page. Kept deliberately low: a false positive here is silently
     answered with a fake success, which would lose a real enquiry - the same
     failure the autocomplete="off" on the decoys exists to prevent. 1.5s still
     catches the instant-POST scripts this is aimed at, which fire in well under
     a tenth of that, while leaving no realistic way for a person to trip it.
     Measured from wiring, so a page left open is never penalised. */
  var MIN_SUBMIT_MS = 1500;
  var ERROR = 'Something went wrong sending this. Please try again, or reach us through the contact page.';

  function warn(message, detail) {
    if (window.console) console.warn('HubSpot: ' + message, detail === undefined ? '' : detail);
  }

  /* HubSpot models a person as firstname + lastname, while the enquiry forms ask
     for one name in one field. Split at the FIRST space, which keeps a compound
     surname whole - "Maria de la Cruz" becomes Maria / de la Cruz. A single word
     becomes a first name. */
  function splitName(value) {
    var cut = value.indexOf(' ');
    if (cut === -1) return { firstname: value, lastname: '' };
    return { firstname: value.slice(0, cut).trim(), lastname: value.slice(cut + 1).trim() };
  }

  /* One entry per field. A checkbox group contributes every ticked box as a
     single semicolon-joined value, which is the format the submission API
     documents for a multi-value field. */
  function collect(form) {
    var order = [];
    var values = Object.create(null);

    function add(name, value) {
      if (!value) return;
      if (!(name in values)) {
        order.push(name);
        values[name] = value;
        return;
      }
      values[name] += ';' + value;
    }

    Array.prototype.forEach.call(form.elements, function (el) {
      if (!el.name || TRAPS.indexOf(el.name) !== -1 || el.type === 'submit' || el.disabled) return;
      if ((el.type === 'checkbox' || el.type === 'radio') && !el.checked) return;

      var value = String(el.value || '').trim();
      if (!value) return;

      if (el.name === 'name') {
        var parts = splitName(value);
        add('firstname', parts.firstname);
        add('lastname', parts.lastname);
        return;
      }

      add(el.name, value);
    });

    return order.map(function (name) {
      return { objectTypeId: '0-1', name: name, value: values[name] };
    });
  }

  function payload(form, config, withConsent) {
    var body = {
      fields: collect(form),
      context: {
        pageUri: window.location.origin + window.location.pathname,
        pageName: document.title
      }
    };

    if (withConsent && config.consent) {
      var communications = [];
      if (config.subscriptionId) {
        communications.push({
          value: true,
          subscriptionTypeId: config.subscriptionId,
          text: config.consent
        });
      }
      body.legalConsentOptions = {
        consent: {
          consentToProcess: true,
          text: config.consent,
          communications: communications
        }
      };
    }

    return body;
  }

  function post(form, config, withConsent) {
    return fetch(ENDPOINT + PORTAL + '/' + config.guid, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload(form, config, withConsent))
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        return { ok: res.ok, data: data };
      });
    });
  }

  /* A url input rejects "example.com" outright - browsers want a scheme. People
     type the bare domain anyway, so put the scheme they left off rather than
     making them discover the rule from a rejection. */
  function normalizeUrls(form) {
    var urls = form.querySelectorAll('input[type="url"]');
    Array.prototype.forEach.call(urls, function (el) {
      var value = String(el.value || '').trim();
      if (!value || /^[a-z][a-z0-9+.-]*:\/\//i.test(value)) return;
      el.value = 'https://' + value.replace(/^\/+/, '');
    });
  }

  /* The first control the browser objects to, and why - "Please complete the
     required fields" is no help when the real problem is one malformed field
     halfway down a long form. */
  function firstInvalid(form) {
    for (var i = 0; i < form.elements.length; i++) {
      var el = form.elements[i];
      if (el.willValidate && !el.checkValidity()) return el;
    }
    return null;
  }

  function describe(form, el) {
    var message = el.validationMessage || 'Please check this field.';
    var label = el.id ? form.querySelector('label[for="' + el.id + '"]') : null;
    if (!label) return message;
    var name = label.textContent.replace(/\*/g, '').replace(/\s+/g, ' ').trim().replace(/:$/, '');
    if (!name) return message;
    /* Most of these labels are whole questions, where a colon reads badly:
       "...are you considering?: Please select an item." Punctuation already
       ends the sentence, so just follow it with a space. */
    return name + (/[?.!]$/.test(name) ? ' ' : ': ') + message;
  }

  /* ---------------------------------------------------------------------
     Format checks. The browser's own are too loose to keep a CRM clean:
     type="email" takes "jane@gmail", type="tel" takes anything at all. These
     rules are applied through setCustomValidity, so every existing check
     picks them up unchanged - firstInvalid() below, and the staged form's
     per-screen "Next" in site.js, which calls checkValidity() itself.
     Which rule a field gets is read off its own markup (type, autocomplete),
     so a new field of a known kind is covered with no config here.
     --------------------------------------------------------------------- */
  var EMAIL_RE = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)*\.[A-Za-z]{2,}$/;
  /* Built from strings: a browser without Unicode property escapes would
     reject a regex literal at parse time and take every form down with it.
     The fallback covers Latin letters with their accents. */
  var NAME_RE, LETTER_RE;
  try {
    NAME_RE = new RegExp("^[\\p{L}\\p{M}][\\p{L}\\p{M} .'’-]*$", 'u');
    LETTER_RE = new RegExp('\\p{L}', 'gu');
  } catch (e) {
    NAME_RE = /^[A-Za-zÀ-ɏ][A-Za-zÀ-ɏ .'’-]*$/;
    LETTER_RE = /[A-Za-zÀ-ɏ]/g;
  }
  var NAME_FIELDS = ['name', 'given-name', 'family-name'];

  function kindOf(el) {
    if (el.type === 'email') return 'email';
    if (el.type === 'tel') return 'phone';
    if (el.type === 'url') return 'url';
    if (NAME_FIELDS.indexOf(el.getAttribute('autocomplete')) !== -1) return 'name';
    return null;
  }

  /* The message for a malformed value, or '' when it is fine. An empty field
     is always fine here - whether it may be empty is `required`'s job. */
  function formatError(el) {
    var value = String(el.value || '').trim();
    if (!value) return '';
    switch (kindOf(el)) {
      case 'email':
        return EMAIL_RE.test(value) ? '' : 'Please enter a valid email address, like name@example.com.';
      case 'phone':
        if (value.charAt(0) !== '+') return 'Please include your country code, starting with +, e.g. +1 604 555 0123.';
        if (!/^\+[\d\s().-]+$/.test(value)) return 'Please use numbers only, with spaces or dashes if you like.';
        var digits = value.replace(/\D/g, '').length;
        /* 15 is the international (E.164) ceiling, country code included; 8
           is about the shortest real number with its country code. */
        if (digits < 8) return 'That number looks too short. Please include the country code and full number.';
        if (digits > 15) return 'That number looks too long. Please check it and try again.';
        return '';
      case 'name':
        /* Letters in any script, so accents and non-Latin names pass. */
        if (!NAME_RE.test(value)) return 'Please use letters only; spaces, hyphens and apostrophes are fine.';
        if ((value.match(LETTER_RE) || []).length < 2) return 'Please enter your name in full.';
        return '';
      case 'url':
        var host = value.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '').split(/[/?#:]/)[0];
        return /^[^\s.]+(\.[^\s.]+)*\.[A-Za-z]{2,}$/.test(host) ? '' : 'Please enter a full website address, like example.com.';
    }
    return '';
  }

  /* The inline message under a field. Created on first use and linked through
     aria-describedby alongside any hint the field already carries. Only for
     controls inside a .field: the newsletter has no room for one, and its
     message goes to the status line instead, as before. */
  function errorSlot(el, create) {
    var field = el.closest('.field');
    if (!field || !el.id) return null;
    var id = el.id + '-error';
    var slot = document.getElementById(id);
    if (slot || !create) return slot;
    slot = document.createElement('p');
    slot.className = 'field-error';
    slot.id = id;
    slot.hidden = true;
    field.appendChild(slot);
    var described = el.getAttribute('aria-describedby');
    el.setAttribute('aria-describedby', described ? described + ' ' + id : id);
    return slot;
  }

  function showError(el, message) {
    var slot = errorSlot(el, !!message);
    if (message) el.setAttribute('aria-invalid', 'true');
    else el.removeAttribute('aria-invalid');
    if (!slot) return;
    slot.textContent = message;
    slot.hidden = !message;
  }

  function check(el) {
    el.setCustomValidity(formatError(el));
  }

  function guardFormats(form) {
    var fields = Array.prototype.filter.call(form.elements, function (el) {
      return el.name && TRAPS.indexOf(el.name) === -1 && kindOf(el);
    });

    fields.forEach(function (el) {
      check(el);

      el.addEventListener('input', function () {
        /* Phone: characters a number can never hold do not go in at all -
           typed or pasted. A leading 00 is the international prefix, so it
           becomes the + the rule asks for. */
        if (el.type === 'tel') {
          var cleaned = el.value.replace(/[^\d\s()+.-]/g, '').replace(/^\s*00/, '+');
          if (cleaned !== el.value) el.value = cleaned;
        }
        /* Validity is kept current on every keystroke so a check fired from
           anywhere sees the right answer; the visible message only updates
           once one is already showing, so nobody is scolded mid-word. */
        check(el);
        if (el.getAttribute('aria-invalid') === 'true') {
          showError(el, el.checkValidity() ? '' : el.validationMessage);
        }
      });

      el.addEventListener('blur', function () {
        if (el.type === 'url') normalizeUrls(form);
        check(el);
        if (String(el.value || '').trim()) showError(el, el.validationMessage);
      });
    });

    /* checkValidity() fires `invalid` on each failing control - from the
       submit handler here and from the staged form's "Next" in site.js - so
       one listener shows the message wherever the check came from. Covers
       required-but-empty controls as well as malformed ones. */
    form.addEventListener('invalid', function (e) {
      showError(e.target, e.target.validationMessage);
    }, true);
    form.addEventListener('change', function (e) {
      var el = e.target;
      if (el.getAttribute && el.getAttribute('aria-invalid') === 'true' && !kindOf(el)) {
        showError(el, el.checkValidity() ? '' : el.validationMessage);
      }
    });
  }

  function mentionsConsent(data) {
    var text = JSON.stringify(data || {}).toLowerCase();
    return text.indexOf('consent') !== -1 || text.indexOf('legal') !== -1;
  }

  function wire(form, config) {
    /* The status paragraph lives OUTSIDE the form, as a sibling named after it,
       because a successful submit hides the form - a status inside would go with
       it and the thank-you would never be seen. */
    var status = document.getElementById(form.id + '-status') || form.querySelector('.form-status');
    var button = form.querySelector('[type="submit"]');
    var wiredAt = Date.now();

    /* Whatever classes the markup gave the status element are kept - the
       newsletter's sits on a dark band and carries a modifier for it. */
    var statusClasses = status ? status.className : '';

    guardFormats(form);

    /* A form serving several enquiry routes (see "Enquiry routes" in site.js)
       carries the thank-you for the current route in data-success. */
    function successText() {
      return form.getAttribute('data-success') || config.success;
    }

    function say(message, kind) {
      if (!status) return;
      status.textContent = message;
      status.className = statusClasses + ' is-' + kind;
      status.hidden = false;
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();

      /* Honeypots: a real visitor never sees these fields, so anything in one
         is a bot. Paired with the elapsed-time floor, since a bot that skips
         the decoys usually submits instantly instead. Answer as though it
         worked rather than telling the bot it was caught - a bot told it
         failed simply tries again differently. */
      var tripped = TRAPS.some(function (name) {
        var trap = form.querySelector('[name="' + name + '"]');
        return trap && trap.value;
      });
      if (tripped || Date.now() - wiredAt < MIN_SUBMIT_MS) {
        form.hidden = true;
        say(successText(), 'ok');
        return;
      }

      /* The forms carry novalidate so that the browser's own bubble does not
         pre-empt this handler; the same checks still run, just from here. */
      normalizeUrls(form);
      Array.prototype.forEach.call(form.elements, function (el) {
        if (el.setCustomValidity && kindOf(el)) check(el);
      });
      var bad = firstInvalid(form);
      if (bad) {
        say(describe(form, bad), 'error');
        bad.focus();
        if (bad.reportValidity) bad.reportValidity();
        return;
      }

      if (!config.guid || config.guid.indexOf('PASTE') === 0) {
        say(ERROR, 'error');
        warn('no form GUID set for "' + form.id + '" - see FORMS in assets/js/hubspot-forms.js');
        return;
      }

      button.disabled = true;
      var original = button.textContent;
      button.textContent = 'Sending…';

      /* Whether HubSpot requires the consent block depends on how the form is
         configured, which the API will not tell us up front - so send the plain
         payload and add consent only if it complains about it. A form that
         signs the visitor up to a subscription always sends it: HubSpot accepts
         that submission without consent too, and the opt-in would be lost. */
      post(form, config, !!config.subscriptionId)
        .then(function (r) {
          if (!r.ok && mentionsConsent(r.data)) return post(form, config, true);
          return r;
        })
        .then(function (r) {
          if (r.ok) {
            form.hidden = true;
            say(successText(), 'ok');
            return;
          }
          say(ERROR, 'error');
          warn('submission failed for "' + form.id + '":', r.data);
        })
        .catch(function (err) {
          say(ERROR, 'error');
          warn('submission error for "' + form.id + '":', err);
        })
        .then(function () {
          button.disabled = false;
          button.textContent = original;
        });
    });
  }

  function wireOnce(form) {
    var config = form && FORMS[form.id];
    if (!config || form.__hbhWired) return;
    form.__hbhWired = true;
    wire(form, config);
  }

  Object.keys(FORMS).forEach(function (id) {
    wireOnce(document.getElementById(id));
  });

  /* The journey form is also loaded into a modal on every other page (see
     site.js), after this file has run, so site.js wires it through here. */
  window.HBHForms = { wire: wireOnce };
})();
