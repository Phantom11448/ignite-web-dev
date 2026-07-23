// form-notify.js
// -----------------------------------------------------------------------
// Netlify Function — receives an outgoing webhook from Netlify Forms on
// new submission and sends a notification email via Resend, from a
// verified domain, instead of relying on Netlify's built-in form
// notification email (which comes from a shared Netlify address and
// gets flagged as spam by Gmail/Outlook).
//
// Reusable across client sites: everything site-specific is read from
// environment variables, so this same file can be dropped into any
// project's netlify/functions directory unchanged.
//
// SETUP (per site):
//   1. In Resend, verify a subdomain of the client's domain
//      (e.g. mail.clientsite.com) and get an API key.
//   2. In Netlify dashboard > Project configuration > Environment
//      variables, set:
//        RESEND_API_KEY   - the Resend API key
//        NOTIFY_FROM      - e.g. "Ignite Web Dev <notifications@ignitewebdev.com>"
//        NOTIFY_TO        - where the client wants leads sent, e.g. burnsgrey3@gmail.com
//        WEBHOOK_SECRET    - any random string you make up
//   3. In Netlify dashboard > Project configuration > Notifications >
//      Forms > Add notification > Outgoing webhook, set:
//        Form: contact (or "All forms")
//        URL: https://<site>.netlify.app/.netlify/functions/form-notify?token=<WEBHOOK_SECRET>
//      (use the same random string you put in WEBHOOK_SECRET)
// -----------------------------------------------------------------------

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method not allowed" };
  }

  // Simple shared-secret check so random requests to this URL can't
  // trigger outbound emails. The secret is set as a query param on the
  // webhook URL you configure in Netlify's Forms notification settings.
  const expectedSecret = process.env.WEBHOOK_SECRET;
  const providedSecret = event.queryStringParameters && event.queryStringParameters.token;
  if (!expectedSecret || providedSecret !== expectedSecret) {
    return { statusCode: 401, body: "Unauthorized" };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch (err) {
    return { statusCode: 400, body: "Invalid JSON" };
  }

  // Netlify's outgoing webhook wraps the submission under "payload";
  // handle both that and a bare submission object defensively.
  const submission = body.payload || body;
  const fields = submission.data || submission.human_fields || {};
  const formName = submission.form_name || submission.form_id || "contact";

  const name = fields.name || "(no name given)";
  const email = fields.email || "(no email given)";
  const message = fields.message || "(no message)";

  const fromAddress = process.env.NOTIFY_FROM;
  const toAddress = process.env.NOTIFY_TO;
  const resendApiKey = process.env.RESEND_API_KEY;

  if (!fromAddress || !toAddress || !resendApiKey) {
    console.error("form-notify: missing NOTIFY_FROM, NOTIFY_TO, or RESEND_API_KEY env var");
    return { statusCode: 500, body: "Server misconfigured" };
  }

  const emailBody = {
    from: fromAddress,
    to: toAddress,
    reply_to: email,
    subject: `New ${formName} submission from ${name}`,
    text: `Name: ${name}\nEmail: ${email}\n\nMessage:\n${message}`,
  };

  try {
    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${resendApiKey}`,
      },
      body: JSON.stringify(emailBody),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      console.error("form-notify: Resend API error", resp.status, errText);
      return { statusCode: 502, body: "Failed to send notification email" };
    }
  } catch (err) {
    console.error("form-notify: fetch to Resend failed", err);
    return { statusCode: 502, body: "Failed to send notification email" };
  }

  return { statusCode: 200, body: "OK" };
};
