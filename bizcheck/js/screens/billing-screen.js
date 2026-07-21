// billing-screen.js
// 2026-07-19: forcing fresh deploy — see bizcheck-create-checkout-session.js's DEPLOY NOTE comment for why this is needed.
// -----------------------------------------------------------------------
// Owner-only screen for viewing/managing the business's Stripe
// subscription. Previously a panel embedded at the top of the Dashboard;
// pulled out into its own nav item so billing status/actions aren't
// tangled with profitability reporting, and so the trial-countdown
// banner in app.html has a dedicated screen to link to.
// -----------------------------------------------------------------------

import { getBusiness, createCheckoutSession, createPortalSession } from "../billing.js";
import { exportAllBusinessData } from "../export.js";

/**
 * userEmail is only used to start a Stripe Checkout session (Stripe wants
 * an email to pre-fill on the hosted checkout page) — this screen is
 * already owner-only (see app.html's routing), so no extra role check is
 * needed here.
 */
export function renderBillingScreen(container, { businessId, userEmail }) {
  container.innerHTML = `<p class="placeholder">Loading billing&hellip;</p>`;
  load();

  async function load() {
    const business = await getBusiness(businessId);
    render(business);
  }

  function render(business) {
    const status = business?.subscription_status || null;
    const statusLabel =
      status === "active"
        ? "Active"
        : status === "past_due"
        ? "Past Due"
        : status === "cancelled"
        ? "Cancelled"
        : "Not subscribed";
    const statusClass =
      status === "active"
        ? "billing-status-active"
        : status === "past_due"
        ? "billing-status-past-due"
        : status === "cancelled"
        ? "billing-status-cancelled"
        : "billing-status-none";
    const buttonLabel = status === "active" || status === "past_due" ? "Manage Billing" : "Subscribe";

    container.innerHTML = `
      <div class="screen-header">
        <h2>Billing</h2>
        <span class="status-badge ${statusClass}">${statusLabel}</span>
      </div>

      <div class="panel-form billing-panel">
        <button type="button" id="billing-btn">${buttonLabel}</button>
        <p class="field-hint error" id="billing-error" hidden></p>
      </div>

      <div class="panel-form export-panel">
        <h3 class="export-heading">Export My Data</h3>
        <p class="field-hint">Download every job, expense, labor entry, revenue entry, job note, category, and bulletin post as CSV files — for your own backup, or in case you ever want to leave the platform.</p>
        <button type="button" id="export-btn">Export My Data</button>
        <p class="field-hint" id="export-status" hidden></p>
        <p class="field-hint error" id="export-error" hidden></p>
      </div>
    `;

    wireBillingButton(status);
    wireExportButton();
  }

  function wireBillingButton(status) {
    const billingBtn = container.querySelector("#billing-btn");
    const billingErrorEl = container.querySelector("#billing-error");
    if (!billingBtn) return;

    billingBtn.addEventListener("click", async () => {
      billingBtn.disabled = true;
      billingErrorEl.hidden = true;
      try {
        const url =
          status === "active" || status === "past_due"
            ? await createPortalSession(businessId)
            : await createCheckoutSession(businessId, userEmail);
        window.location.href = url;
      } catch (err) {
        console.error("Could not start Stripe Checkout:", err);
        billingErrorEl.textContent = "Couldn't start checkout — try again in a moment.";
        billingErrorEl.hidden = false;
        billingBtn.disabled = false;
      }
    });
  }

  function wireExportButton() {
    const exportBtn = container.querySelector("#export-btn");
    const exportStatusEl = container.querySelector("#export-status");
    const exportErrorEl = container.querySelector("#export-error");
    if (!exportBtn) return;

    exportBtn.addEventListener("click", async () => {
      exportBtn.disabled = true;
      exportErrorEl.hidden = true;
      exportStatusEl.hidden = false;
      exportStatusEl.textContent = "Preparing your export — this can take a few seconds for a business with a lot of jobs…";

      try {
        await exportAllBusinessData(businessId);
        exportStatusEl.textContent = "Export complete — 7 CSV files were downloaded.";
      } catch (err) {
        console.error("Data export failed:", err);
        exportStatusEl.hidden = true;
        exportErrorEl.textContent = "Export failed partway through — some files may not have downloaded. Try again in a moment.";
        exportErrorEl.hidden = false;
      } finally {
        exportBtn.disabled = false;
      }
    });
  }
}
