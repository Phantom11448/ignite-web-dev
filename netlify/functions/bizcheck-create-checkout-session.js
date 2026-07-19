// bizcheck-create-checkout-session.js
// -----------------------------------------------------------------------
// Netlify Function — creates a Stripe Checkout Session for a BizCheck
// business subscription and hands the client back the URL to redirect to.
//
// Namespaced with a "bizcheck-" prefix because Netlify Functions are
// site-wide (they live at /.netlify/functions/<name> regardless of URL
// path), not scoped to /bizcheck/ — this file has to coexist with
// whatever else ever gets added to the rest of ignitewebdev.com.
//
// The Stripe secret key is read from the STRIPE_SECRET_KEY environment
// variable (set in the Netlify dashboard, never committed here).
// -----------------------------------------------------------------------

const Stripe = require("stripe");

const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

const BIZCHECK_PRICE_ID = "price_1TuwqbQMVShkVe1Vm2014I3k";
const SUCCESS_URL = "https://ignitewebdev.com/bizcheck/app.html?checkout=success";
const CANCEL_URL = "https://ignitewebdev.com/bizcheck/app.html?checkout=cancelled";

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method Not Allowed" }) };
  }

  let businessId, email;
  try {
    ({ businessId, email } = JSON.parse(event.body || "{}"));
  } catch (err) {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid JSON body" }) };
  }

  if (!businessId || !email) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "businessId and email are both required" }),
    };
  }

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: BIZCHECK_PRICE_ID, quantity: 1 }],
      // How bizcheck-stripe-webhook.js knows which business just paid —
      // Stripe hands this straight back on checkout.session.completed.
      client_reference_id: businessId,
      customer_email: email,
      success_url: SUCCESS_URL,
      cancel_url: CANCEL_URL,
    });

    return {
      statusCode: 200,
      body: JSON.stringify({ url: session.url }),
    };
  } catch (err) {
    console.error("Stripe Checkout Session creation failed:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Could not create checkout session" }),
    };
  }
};
