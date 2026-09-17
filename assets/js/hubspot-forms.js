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
 *      FORM_HAS_RECAPTCHA_ENABLED. The honeypot in the markup guards it instead,
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
      guid: '17de38a9-c398-430f-b442-047c41bb80e1',
      consent:
        'By submitting this form, you agree that Heal Before Home may use the information ' +
        'provided to respond to your expression of interest and communicate with you about ' +
        'relevant community initiatives.',
      success: 'Thank you. Your interest has been received, and our team will be in touch as opportunities take shape.'
    },
    'journey-enquiry': {
      guid: 'PASTE-HUBSPOT-FORM-GUID',
      consent:
        'By submitting this form, you agree that Heal Before Home may use the information ' +
        'provided to respond to your enquiry and communicate with you about your journey.',
      success: 'Thank you. Your enquiry has been received, and our team will be in touch shortly.'
    },
    'provider-enquiry': {
      guid: 'PASTE-HUBSPOT-FORM-GUID',
      consent:
        'By submitting this form, you agree that Heal Before Home may use the information ' +
        'provided to respond to your enquiry and communicate with you about a possible partnership.',
      success: 'Thank you. Your enquiry has been received, and our team will review it shortly.'
    },
    'newsletter-form': {
      guid: 'PASTE-HUBSPOT-FORM-GUID',
      consent:
        'By subscribing, you agree that Heal Before Home may use your email address to send ' +
        'you occasional updates.',
      /* Optional: the numeric id of the HubSpot subscription type this signs the
         visitor up to (Settings > Marketing > Email > Subscription types). With
         it set, the submission records an explicit opt-in to that subscription;
         left null, only consent to process is recorded. */
      subscriptionId: null,
      success: 'Thank you. You are on the list.'
    }
  };

  var ENDPOINT = 'https://api.hsforms.com/submissions/v3/integration/submit/';
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
      if (!el.name || el.name === 'bot-field' || el.type === 'submit' || el.disabled) return;
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
        pageUri: window.location.href,
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

    /* Whatever classes the markup gave the status element are kept - the
       newsletter's sits on a dark band and carries a modifier for it. */
    var statusClasses = status ? status.className : '';

    function say(message, kind) {
      if (!status) return;
      status.textContent = message;
      status.className = statusClasses + ' is-' + kind;
      status.hidden = false;
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();

      /* Honeypot: a real visitor never sees this field, so anything in it is a
         bot. Answer as though it worked rather than telling the bot it was
         caught. */
      var trap = form.querySelector('[name="bot-field"]');
      if (trap && trap.value) {
        form.hidden = true;
        say(config.success, 'ok');
        return;
      }

      /* The forms carry novalidate so that the browser's own bubble does not
         pre-empt this handler; the same checks still run, just from here. */
      if (!form.checkValidity()) {
        var firstInvalid = form.querySelector(':invalid');
        say('Please complete the required fields before sending.', 'error');
        if (firstInvalid) {
          firstInvalid.focus();
          if (firstInvalid.reportValidity) firstInvalid.reportValidity();
        }
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
         payload and add consent only if it complains about it. */
      post(form, config, false)
        .then(function (r) {
          if (!r.ok && mentionsConsent(r.data)) return post(form, config, true);
          return r;
        })
        .then(function (r) {
          if (r.ok) {
            form.hidden = true;
            say(config.success, 'ok');
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

  Object.keys(FORMS).forEach(function (id) {
    var form = document.getElementById(id);
    if (form) wire(form, FORMS[id]);
  });
})();
