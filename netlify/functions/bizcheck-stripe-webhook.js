// bizcheck-stripe-webhook.js
// -----------------------------------------------------------------------
// Netlify Function — Stripe webhook endpoint for BizCheck subscriptions.
// Verifies every request came from Stripe (rejects anything that doesn't
// verify), then writes subscription state directly to Firestore via the
// Firebase Admin SDK, which bypasses firestore.rules entirely. That's
// expected and correct here: this is a trusted server context, and it's
// the ONLY writer subscription_status/stripe_customer_id/
// stripe_subscription_id are ever allowed to have — see firestore.rules,
// where clients (even the business owner) are blocked from writing those
// three fields directly.
//
// Namespaced with a "bizcheck-" prefix — see bizcheck-create-checkout-
// session.js for why (Netlify Functions are site-wide, not scoped to
// /bizcheck/).
//
// Configure this URL (https://ignitewebdev.com/.netlify/functions/
// bizcheck-stripe-webhook) in the Stripe dashboard under Developers >
// Webhooks, subscribed to: checkout.session.completed,
// customer.subscription.updated, customer.subscription.deleted.
// -----------------------------------------------------------------------

const Stripe = require("stripe");
// firebase-admin v12+ uses this modular form (submodule imports) instead
// of the old monolithic `admin.initializeApp()`/`admin.firestore()`
// namespace — the top-level `require("firebase-admin")` export no longer
// carries .apps/.firestore/.credential.
const { initializeApp, getApps, cert } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");

const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

// Netlify Functions can reuse the same warm container across invocations,
// and initializeApp() throws if called more than once in the same
// process — guard against re-initializing on a warm start.
if (!getApps().length) {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
  initializeApp({
    credential: cert(serviceAccount),
  });
}

const db = getFirestore();

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const signature = event.headers["stripe-signature"];
  let stripeEvent;

  try {
    stripeEvent = stripe.webhooks.constructEvent(
      event.body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error("Stripe webhook signature verification failed:", err.message);
    return {
      statusCode: 400,
      body: `Webhook signature verification failed: ${err.message}`,
    };
  }

  try {
    switch (stripeEvent.type) {
      case "checkout.session.completed": {
        const session = stripeEvent.data.object;
        const businessId = session.client_reference_id;

        if (!businessId) {
          console.error(
            "checkout.session.completed had no client_reference_id — cannot map to a business."
          );
          break;
        }

        await db.collection("businesses").doc(businessId).set(
          {
            subscription_status: "active",
            stripe_customer_id: session.customer,
            stripe_subscription_id: session.subscription,
          },
          { merge: true }
        );
        break;
      }

      case "customer.subscription.updated": {
        const subscription = stripeEvent.data.object;
        const businessId = await findBusinessIdByCustomerId(subscription.customer);

        if (!businessId) {
          console.error(
            `customer.subscription.updated: no business found for Stripe customer ${subscription.customer}`
          );
          break;
        }

        await db.collection("businesses").doc(businessId).set(
          { subscription_status: subscription.status },
          { merge: true }
        );
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = stripeEvent.data.object;
        const businessId = await findBusinessIdByCustomerId(subscription.customer);

        if (!businessId) {
          console.error(
            `customer.subscription.deleted: no business found for Stripe customer ${subscription.customer}`
          );
          break;
        }

        await db.collection("businesses").doc(businessId).set(
          { subscription_status: "cancelled" },
          { merge: true }
        );
        break;
      }

      default:
        // Ignore every other event type — Stripe sends far more than this
        // app cares about; only the three above touch Firestore.
        break;
    }
  } catch (err) {
    // Log for manual follow-up but still return 200 below. Stripe retries
    // non-2xx responses, and retrying a write that failed for a code
    // reason (not a transient one) just burns retries without fixing
    // anything — the Netlify function logs are the place to catch this.
    console.error(`Error handling Stripe event ${stripeEvent.type}:`, err);
  }

  // Stripe requires a fast 2xx response to stop retrying. The work above
  // is a single Firestore write, so there's nothing worth deferring.
  return { statusCode: 200, body: JSON.stringify({ received: true }) };
};

// --- internal helpers -----------------------------------------------------

/**
 * customer.subscription.updated/deleted events only carry the Stripe
 * customer id, not our businessId — checkout.session.completed is the
 * only event with client_reference_id. Look up which business doc has
 * this stripe_customer_id stamped on it (written during
 * checkout.session.completed above). Firestore auto-indexes single-field
 * equality queries, so this doesn't need any manual index setup.
 */
async function findBusinessIdByCustomerId(customerId) {
  const snapshot = await db
    .collection("businesses")
    .where("stripe_customer_id", "==", customerId)
    .limit(1)
    .get();
  return snapshot.empty ? null : snapshot.docs[0].id;
}
