/* Community initiative interest form.
 *
 * The fields below are the site's own markup, so they inherit the same styling as
 * the contact and provider forms. Submissions go straight to HubSpot through the
 * public Forms submission API, landing in the same properties the embedded form
 * wrote to.
 *
 * One dependency worth knowing about: HubSpot refuses API submissions for any form
 * that has its CAPTCHA ("SPAM prevention") switch turned on, answering with
 * FORM_HAS_RECAPTCHA_ENABLED. That switch has to be off in the HubSpot form editor
 * for this to work. The honeypot in the markup is what guards the form instead.
 */
(function () {
  var PORTAL = '343416288';
  var FORM = '17de38a9-c398-430f-b442-047c41bb80e1';
  var ENDPOINT = 'https://api.hsforms.com/submissions/v3/integration/submit/' + PORTAL + '/' + FORM;

  var CONSENT_TEXT =
    'By submitting this form, you agree that Heal Before Home may use the information ' +
    'provided to respond to your expression of interest and communicate with you about ' +
    'relevant community initiatives.';

  var form = document.getElementById('community-form');
  if (!form) return;

  var status = form.querySelector('.form-status');
  var button = form.querySelector('[type="submit"]');

  function say(message, kind) {
    status.textContent = message;
    status.className = 'form-status is-' + kind;
    status.hidden = false;
  }

  /* HubSpot wants one entry per value, so a checkbox group contributes one entry
     per ticked box rather than a single joined string. */
  function collect() {
    var fields = [];
    var seen = Object.create(null);
    Array.prototype.forEach.call(form.elements, function (el) {
      if (!el.name || el.name === 'bot-field' || el.type === 'submit') return;
      if ((el.type === 'checkbox' || el.type === 'radio') && !el.checked) return;
      var value = String(el.value || '').trim();
      if (!value) return;
      fields.push({ objectTypeId: '0-1', name: el.name, value: value });
      seen[el.name] = true;
    });
    return fields;
  }

  function payload(withConsent) {
    var body = {
      fields: collect(),
      context: {
        pageUri: window.location.href,
        pageName: document.title
      }
    };
    if (withConsent) {
      body.legalConsentOptions = {
        consent: {
          consentToProcess: true,
          text: CONSENT_TEXT,
          communications: []
        }
      };
    }
    return body;
  }

  function post(withConsent) {
    return fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload(withConsent))
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

  form.addEventListener('submit', function (e) {
    e.preventDefault();

    /* Honeypot: a real visitor never sees this field, so anything in it is a bot.
       Answer as though it worked rather than telling the bot it was caught. */
    var trap = form.querySelector('[name="bot-field"]');
    if (trap && trap.value) {
      form.hidden = true;
      say('Thank you. Your interest has been received.', 'ok');
      return;
    }

    var email = form.querySelector('[name="email"]');
    if (!email.value.trim() || !email.checkValidity()) {
      say('Please enter an email address so we can reply.', 'error');
      email.focus();
      return;
    }

    button.disabled = true;
    var original = button.textContent;
    button.textContent = 'Sending…';

    /* Whether HubSpot requires the consent block depends on how the form is
       configured, which the API will not tell us up front - so send the plain
       payload and add consent only if it complains about it. */
    post(false)
      .then(function (r) {
        if (!r.ok && mentionsConsent(r.data)) return post(true);
        return r;
      })
      .then(function (r) {
        if (r.ok) {
          form.hidden = true;
          say('Thank you. Your interest has been received, and our team will be in touch as opportunities take shape.', 'ok');
          return;
        }
        say('Something went wrong sending your interest. Please try again, or reach us through the contact page.', 'error');
        if (window.console) console.warn('HubSpot submission failed:', r.data);
      })
      .catch(function (err) {
        say('Something went wrong sending your interest. Please try again, or reach us through the contact page.', 'error');
        if (window.console) console.warn('HubSpot submission error:', err);
      })
      .then(function () {
        button.disabled = false;
        button.textContent = original;
      });
  });
})();
