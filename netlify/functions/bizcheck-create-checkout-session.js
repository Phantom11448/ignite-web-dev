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
//
// AUTHORIZATION: the request body's businessId is caller-supplied and
// can't be trusted on its own — anyone who knows or guesses a businessId
// (which is the same value as the owner's own Firebase uid) could
// otherwise generate a Checkout Session attributed to a business they
// don't own. billing.js's createCheckoutSession() sends the caller's
// Firebase ID token as a Bearer token; this function verifies it with
// the Firebase Admin SDK (same init pattern as bizcheck-stripe-webhook.js,
// reusing FIREBASE_SERVICE_ACCOUNT_JSON) and requires the verified uid to
// equal businessId before creating a session. See the security audit's
// "checkout session has no authorization check" finding.
//
// DEPLOY NOTE: this file's source has been clean of jwks-rsa/jose since
// the authorization fix above was written — it only ever used
// getAuth().verifyIdToken(). A stale Netlify build (from before this
// file existed in its current form) left jwks-rsa/jose baked into the
// deployed function bundle's node_modules, causing a fatal
// ERR_REQUIRE_ESM crash at cold start on every invocation. Netlify's
// content-addressed deploys dedupe by commit, so a "Clear cache and
// deploy" against an unchanged commit silently reused that same broken
// bundle instead of rebuilding it. This comment exists to change the
// file's content so the next deploy can't be deduped and actually
// reruns npm install against the (already clean) package.json.
// -----------------------------------------------------------------------

const Stripe = require("stripe");
// firebase-admin v12+ uses this modular form (submodule imports) instead
// of the old monolithic `admin.initializeApp()`/`admin.auth()` namespace
// — see bizcheck-stripe-webhook.js, which established this same pattern.
const { initializeApp, getApps, cert } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");

const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

// Netlify Functions can reuse the same warm container across invocations,
// and initializeApp() throws if called more than once in the same
// process — guard against re-initializing on a warm start. (This function
// and bizcheck-stripe-webhook.js each run in their own container, so each
// needs its own guarded init — they don't share this app instance.)
if (!getApps().length) {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
  initializeApp({
    credential: cert(serviceAccount),
  });
}

const BIZCHECK_PRICE_ID = "price_1TuwqbQMVShkVe1Vm2014I3k";
const SUCCESS_URL = "https://ignitewebdev.com/bizcheck/app.html?checkout=success";
const CANCEL_URL = "https://ignitewebdev.com/bizcheck/app.html?checkout=cancelled";

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method Not Allowed" }) };
  }

  // Netlify lowercases incoming header names, but check both casings —
  // cheap insurance against a proxy/test client that doesn't.
  const authHeader = event.headers.authorization || event.headers.Authorization || "";
  const tokenMatch = authHeader.match(/^Bearer (.+)$/);
  if (!tokenMatch) {
    return {
      statusCode: 401,
      body: JSON.stringify({ error: "Missing or invalid Authorization header" }),
    };
  }

  let decodedToken;
  try {
    decodedToken = await getAuth().verifyIdToken(tokenMatch[1]);
  } catch (err) {
    console.error("Checkout session request had an invalid/expired ID token:", err);
    return {
      statusCode: 401,
      body: JSON.stringify({ error: "Invalid or expired session — please log in again." }),
    };
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

  // This app's businessId IS the owner's own Firebase uid (see
  // signUpOwner in auth.js) — a verified token whose uid doesn't match
  // the requested businessId means the caller is asking to start
  // checkout for a business they don't own.
  if (decodedToken.uid !== businessId) {
    console.error(
      `Checkout session request rejected: token uid (${decodedToken.uid}) does not match requested businessId (${businessId}).`
    );
    return {
      statusCode: 403,
      body: JSON.stringify({ error: "You are not authorized to start checkout for this business." }),
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
