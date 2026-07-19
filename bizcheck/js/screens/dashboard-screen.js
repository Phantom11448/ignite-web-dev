// dashboard-screen.js
// -----------------------------------------------------------------------
// Owner dashboard: rolls up profitability across jobs using the
// aggregation functions in dashboard.js. Two views — currently active
// jobs, and the whole business to date — plus a per-job breakdown table.
// -----------------------------------------------------------------------

import {
  getActiveJobsSummary,
  getBusinessSummary,
  getAllJobsProfitability,
} from "../dashboard.js";
import { getBusiness, createCheckoutSession } from "../billing.js";

/**
 * userEmail is only used to start a Stripe Checkout session (Stripe wants
 * an email to pre-fill on the hosted checkout page) — this screen is
 * already owner-only (see app.html's routing), so no extra role check is
 * needed here for the billing panel.
 */
export function renderDashboardScreen(container, { businessId, userEmail }) {
  container.innerHTML = `<p class="placeholder">Loading dashboard&hellip;</p>`;
  load();

  async function load() {
    const [activeSummary, businessSummary, jobProfitabilities, business] = await Promise.all([
      getActiveJobsSummary(businessId),
      getBusinessSummary(businessId),
      getAllJobsProfitability(businessId),
      getBusiness(businessId),
    ]);
    render(activeSummary, businessSummary, jobProfitabilities, business);
  }

  function render(activeSummary, businessSummary, jobProfitabilities, business) {
    container.innerHTML = `
      <div class="screen-header">
        <h2>Dashboard</h2>
      </div>

      ${billingPanel(business)}

      <h3 class="dashboard-subhead">Active Jobs (${activeSummary.jobCount})</h3>
      ${summaryPanel(activeSummary)}

      <h3 class="dashboard-subhead">All Jobs to Date (${businessSummary.jobCount})</h3>
      ${summaryPanel(businessSummary)}

      <h3 class="dashboard-subhead">Per-Job Breakdown</h3>
      <div id="job-breakdown-list" class="job-list">
        ${
          jobProfitabilities.length === 0
            ? '<p class="placeholder">No jobs yet.</p>'
            : ""
        }
      </div>
    `;

    const listEl = container.querySelector("#job-breakdown-list");
    jobProfitabilities.forEach((p) => listEl.appendChild(buildJobRow(p)));

    wireBillingButton(business);
  }

  function billingPanel(business) {
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
    // Only one server action exists right now (create a Checkout Session),
    // so an already-subscribed owner clicking "Manage Billing" starts a
    // brand-new subscription checkout rather than opening a Stripe Billing
    // Portal — there's no portal-session function built yet. The label
    // still changes contextually so it doesn't say "Subscribe" to someone
    // who already is; a real "Manage Billing" experience would need a
    // second Netlify Function (a Billing Portal session) wired up the same
    // way as bizcheck-create-checkout-session.js, which wasn't part of
    // this build.
    const buttonLabel = status === "active" || status === "past_due" ? "Manage Billing" : "Subscribe";

    return `
      <div class="panel-form billing-panel">
        <div class="screen-header">
          <h3>Billing</h3>
          <span class="status-badge ${statusClass}">${statusLabel}</span>
        </div>
        <button type="button" id="billing-btn">${buttonLabel}</button>
        <p class="field-hint error" id="billing-error" hidden></p>
      </div>
    `;
  }

  function wireBillingButton(business) {
    const billingBtn = container.querySelector("#billing-btn");
    const billingErrorEl = container.querySelector("#billing-error");
    if (!billingBtn) return;

    billingBtn.addEventListener("click", async () => {
      billingBtn.disabled = true;
      billingErrorEl.hidden = true;
      try {
        const url = await createCheckoutSession(businessId, userEmail);
        window.location.href = url;
      } catch (err) {
        console.error("Could not start Stripe Checkout:", err);
        billingErrorEl.textContent = "Couldn't start checkout — try again in a moment.";
        billingErrorEl.hidden = false;
        billingBtn.disabled = false;
      }
    });
  }

  function summaryPanel(summary) {
    return `
      <div class="profitability-panel">
        <div class="profit-stat">
          <span class="profit-label">Revenue</span>
          <span class="profit-value">$${summary.totalRevenue.toFixed(2)}</span>
        </div>
        <div class="profit-stat">
          <span class="profit-label">Expenses</span>
          <span class="profit-value">$${summary.totalExpenses.toFixed(2)}</span>
        </div>
        <div class="profit-stat">
          <span class="profit-label">Labor Cost</span>
          <span class="profit-value">$${summary.totalLaborCost.toFixed(2)}</span>
        </div>
        <div class="profit-stat profit-stat-highlight">
          <span class="profit-label">Profit</span>
          <span class="profit-value">$${summary.totalProfit.toFixed(2)}</span>
        </div>
      </div>
    `;
  }

  function buildJobRow(p) {
    const row = document.createElement("div");
    row.className = "job-card";
    const profitClass = p.profit >= 0 ? "profit-positive" : "profit-negative";
    row.innerHTML = `
      <div class="job-card-main">
        <h3>${escapeHtml(p.customerName || "Untitled job")}</h3>
        <p class="job-meta">
          Revenue $${p.revenue.toFixed(2)} &middot; Expenses $${p.expenseTotal.toFixed(2)} &middot; Labor $${p.laborCost.toFixed(2)}
        </p>
      </div>
      <div class="job-card-actions">
        <span class="profit-tag ${profitClass}">$${p.profit.toFixed(2)}</span>
      </div>
    `;
    return row;
  }
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}
