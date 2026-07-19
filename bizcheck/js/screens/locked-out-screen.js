// locked-out-screen.js
// -----------------------------------------------------------------------
// Shown instead of ANY normal screen when the current business has failed
// its access check (see app.html's hasActiveAccess() — a client-side
// mirror of firestore.rules' hasActiveAccess()/isInTrial() functions).
// This is a UX convenience only: firestore.rules is the real enforcement
// either way, this just keeps the UI from showing screens whose reads
// would fail anyway once the trial's expired and there's no active
// subscription.
// -----------------------------------------------------------------------

import { createCheckoutSession } from "../billing.js";

/**
 * subscriptionStatus is the business doc's raw subscription_status
 * (null/undefined if never subscribed) — used only to pick a more
 * specific heading; the underlying situation (no access) is the same
 * either way.
 */
export function renderLockedOutScreen(container, { businessId, role, userEmail, subscriptionStatus }) {
  const isOwner = role === "owner";
  const heading =
    subscriptionStatus === "past_due"
      ? "Your Subscription Payment Is Past Due"
      : subscriptionStatus === "cancelled"
      ? "Your Subscription Was Cancelled"
      : "Your Free Trial Has Ended";

  container.innerHTML = `
    <div class="locked-out-panel">
      <h2>${heading}</h2>
      ${
        isOwner
          ? `<p>This business isn't subscribed and its 30-day free trial is over. Your data is all still here — subscribe to keep using BizCheck.</p>
             <button type="button" id="locked-out-subscribe-btn">Subscribe</button>
             <p class="field-hint error" id="locked-out-error" hidden></p>`
          : `<p>This business's subscription needs attention. Contact the account owner to resolve billing.</p>`
      }
    </div>
  `;

  const subscribeBtn = container.querySelector("#locked-out-subscribe-btn");
  if (subscribeBtn) {
    const errorEl = container.querySelector("#locked-out-error");
    subscribeBtn.addEventListener("click", async () => {
      subscribeBtn.disabled = true;
      errorEl.hidden = true;
      try {
        const url = await createCheckoutSession(businessId, userEmail);
        window.location.href = url;
      } catch (err) {
        console.error("Could not start Stripe Checkout:", err);
        errorEl.textContent = "Couldn't start checkout — try again in a moment.";
        errorEl.hidden = false;
        subscribeBtn.disabled = false;
      }
    });
  }
}
