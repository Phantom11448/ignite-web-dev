// bizcheck-create-portal-session.js
// -----------------------------------------------------------------------
// Netlify Function — creates a Stripe Billing Portal session for an
// already-subscribed BizCheck business and hands the client back the URL
// to redirect to. Lets an owner update their payment method, view past
// invoices, or cancel — all inside Stripe's own hosted portal UI, without
// this app needing to build any of that itself.
//
// Namespaced with a "bizcheck-" prefix — see bizcheck-create-checkout-
// session.js for why (Netlify Functions are site-wide, not scoped to
// /bizcheck/).
//
// AUTHORIZATION: same pattern as bizcheck-create-checkout-session.js —
// the request body's businessId is caller-supplied and can't be trusted
// on its own. billing.js's createPortalSession() sends the caller's
// Firebase ID token as a Bearer token; this function verifies it with the
// Firebase Admin SDK (same init pattern as bizcheck-stripe-webhook.js and
// bizcheck-create-checkout-session.js, reusing FIREBASE_SERVICE_ACCOUNT_JSON)
// and requires the verified uid to equal businessId before doing anything.
//
// The Stripe customer id is NOT taken from the client at all — it's read
// server-side off the business's own Firestore doc (stripe_customer_id,
// written only by bizcheck-stripe-webhook.js) via the Admin SDK, which
// bypasses firestore.rules. This is the only trustworthy source for it:
// a client-supplied customer id could otherwise be used to open someone
// else's billing portal.
// -----------------------------------------------------------------------

const Stripe = require("stripe");
// firebase-admin v12+ uses this modular form (submodule imports) instead
// of the old monolithic `admin.initializeApp()`/`admin.auth()`/
// `admin.firestore()` namespace — see bizcheck-stripe-webhook.js and
// bizcheck-create-checkout-session.js, which established this same
// pattern.
const { initializeApp, getApps, cert } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore } = require("firebase-admin/firestore");

const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

// Netlify Functions can reuse the same warm container across invocations,
// and initializeApp() throws if called more than once in the same
// process — guard against re-initializing on a warm start. (This
// function, bizcheck-create-checkout-session.js, and
// bizcheck-stripe-webhook.js each run in their own container, so each
// needs its own guarded init — they don't share this app instance.)
if (!getApps().length) {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
  initializeApp({
    credential: cert(serviceAccount),
  });
}

const db = getFirestore();

const RETURN_URL = "https://ignitewebdev.com/bizcheck/app.html";

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
    console.error("Portal session request had an invalid/expired ID token:", err);
    return {
      statusCode: 401,
      body: JSON.stringify({ error: "Invalid or expired session — please log in again." }),
    };
  }

  let businessId;
  try {
    ({ businessId } = JSON.parse(event.body || "{}"));
  } catch (err) {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid JSON body" }) };
  }

  if (!businessId) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "businessId is required" }),
    };
  }

  // This app's businessId IS the owner's own Firebase uid (see
  // signUpOwner in auth.js) — a verified token whose uid doesn't match
  // the requested businessId means the caller is asking to manage
  // billing for a business they don't own.
  if (decodedToken.uid !== businessId) {
    console.error(
      `Portal session request rejected: token uid (${decodedToken.uid}) does not match requested businessId (${businessId}).`
    );
    return {
      statusCode: 403,
      body: JSON.stringify({ error: "You are not authorized to manage billing for this business." }),
    };
  }

  let stripeCustomerId;
  try {
    const businessSnap = await db.collection("businesses").doc(businessId).get();
    if (!businessSnap.exists) {
      return { statusCode: 404, body: JSON.stringify({ error: "Business not found" }) };
    }
    stripeCustomerId = businessSnap.data().stripe_customer_id;
  } catch (err) {
    console.error("Failed to read business doc for portal session:", err);
    return { statusCode: 500, body: JSON.stringify({ error: "Could not look up billing account" }) };
  }

  if (!stripeCustomerId) {
    // Happens if an owner without any prior Stripe checkout somehow hits
    // this endpoint directly — the UI shouldn't offer "Manage Billing"
    // until subscription_status is active/past_due, which only ever gets
    // set alongside stripe_customer_id in the webhook, but this guards
    // the endpoint itself rather than trusting the client's state.
    return {
      statusCode: 400,
      body: JSON.stringify({
        error: "This business doesn't have a Stripe billing account yet — subscribe first.",
      }),
    };
  }

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: stripeCustomerId,
      return_url: RETURN_URL,
    });

    return {
      statusCode: 200,
      body: JSON.stringify({ url: session.url }),
    };
  } catch (err) {
    console.error("Stripe Billing Portal session creation failed:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Could not create billing portal session" }),
    };
  }
};
