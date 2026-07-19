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

export function renderDashboardScreen(container, { businessId }) {
  container.innerHTML = `<p class="placeholder">Loading dashboard&hellip;</p>`;
  load();

  async function load() {
    const [activeSummary, businessSummary, jobProfitabilities] = await Promise.all([
      getActiveJobsSummary(businessId),
      getBusinessSummary(businessId),
      getAllJobsProfitability(businessId),
    ]);
    render(activeSummary, businessSummary, jobProfitabilities);
  }

  function render(activeSummary, businessSummary, jobProfitabilities) {
    container.innerHTML = `
      <div class="screen-header">
        <h2>Dashboard</h2>
      </div>

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
