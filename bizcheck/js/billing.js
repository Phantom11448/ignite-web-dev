// billing.js
// -----------------------------------------------------------------------
// Client-side helpers for Stripe subscription billing.
//
// getBusiness() reads subscription_status/stripe_customer_id/
// stripe_subscription_id off the business doc — all three are written
// ONLY by netlify/functions/bizcheck-stripe-webhook.js via the Firebase
// Admin SDK. firestore.rules blocks every client write to them, even from
// the owner (see subscriptionFields() in firestore.rules) — this module
// only ever reads them.
//
// createCheckoutSession() is the one client-side action that touches
// Stripe at all, and it never talks to Stripe directly: it POSTs to a
// Netlify Function (netlify/functions/bizcheck-create-checkout-session.js)
// that holds the actual Stripe secret key server-side, and gets back a
// Checkout URL to redirect the browser to.
// -----------------------------------------------------------------------

import { db, paths } from "./firebase-config.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

/** Fetches the business doc, including its (read-only, server-managed) subscription fields. */
export async function getBusiness(businessId) {
  const snapshot = await getDoc(doc(db, paths.business(businessId)));
  return snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null;
}

/**
 * Starts a Stripe Checkout session for a subscription and returns the
 * Checkout URL to redirect the browser to. businessId becomes the
 * session's client_reference_id, which is how
 * bizcheck-stripe-webhook.js later knows which business just paid.
 */
export async function createCheckoutSession(businessId, email) {
  const response = await fetch("/.netlify/functions/bizcheck-create-checkout-session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ businessId, email }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Checkout session creation failed (${response.status}): ${errorBody}`);
  }

  const data = await response.json();
  return data.url;
}
