// dashboard.js
// -----------------------------------------------------------------------
// Owner dashboard queries/rendering. Query + calculation logic lives here;
// the actual dashboard screen UI is NOT built yet (scaffolding phase only).
// -----------------------------------------------------------------------

import { getAllJobs, getActiveJobs, getJob } from "./jobs.js";
import { getExpensesForJob, sumExpenses } from "./expenses.js";
import { getLaborEntriesForJob, sumLaborCost } from "./labor.js";
import { getRevenueEntriesForJob, sumRevenueEntries } from "./revenue-entries.js";

/**
 * Computes profitability for a single job:
 * revenue - (total expenses + total labor cost).
 * revenue is ALWAYS a live sum of revenue_entries — never a cached/stored
 * value — the same way expenseTotal and laborCost are live sums, not a
 * field read off the job doc. This is what makes change orders and
 * discounts logged after the fact actually show up here.
 */
export async function getJobProfitability(businessId, jobId) {
  const [job, revenueEntries, expenses, laborEntries] = await Promise.all([
    getJob(businessId, jobId),
    getRevenueEntriesForJob(businessId, jobId),
    getExpensesForJob(businessId, jobId),
    getLaborEntriesForJob(businessId, jobId),
  ]);

  const revenue = sumRevenueEntries(revenueEntries);
  const expenseTotal = sumExpenses(expenses);
  const laborCost = sumLaborCost(laborEntries);

  return {
    jobId,
    customerName: job?.customer_name || "",
    revenue,
    expenseTotal,
    laborCost,
    profit: revenue - expenseTotal - laborCost,
  };
}

/** Computes profitability for every job in the business (active + complete + cancelled). */
export async function getAllJobsProfitability(businessId) {
  const jobs = await getAllJobs(businessId);
  return Promise.all(jobs.map((job) => getJobProfitability(businessId, job.id)));
}

/** Summarizes just the currently active jobs: count + combined revenue/cost/profit. */
export async function getActiveJobsSummary(businessId) {
  const activeJobs = await getActiveJobs(businessId);
  const profitabilities = await Promise.all(
    activeJobs.map((job) => getJobProfitability(businessId, job.id))
  );
  return aggregateProfitabilities(profitabilities);
}

/** Summarizes the whole business across every job regardless of status. */
export async function getBusinessSummary(businessId) {
  const profitabilities = await getAllJobsProfitability(businessId);
  return aggregateProfitabilities(profitabilities);
}

// --- internal helpers -----------------------------------------------------

function aggregateProfitabilities(profitabilities) {
  return profitabilities.reduce(
    (summary, p) => ({
      jobCount: summary.jobCount + 1,
      totalRevenue: summary.totalRevenue + p.revenue,
      totalExpenses: summary.totalExpenses + p.expenseTotal,
      totalLaborCost: summary.totalLaborCost + p.laborCost,
      totalProfit: summary.totalProfit + p.profit,
    }),
    { jobCount: 0, totalRevenue: 0, totalExpenses: 0, totalLaborCost: 0, totalProfit: 0 }
  );
}

// -----------------------------------------------------------------------
// TODO (future screen work, not part of scaffolding):
// A renderDashboard(containerEl, summary) function belongs here once the
// dashboard screen is designed. Keeping this file query/calculation-only
// for now so it's easy to slot rendering in later without touching the
// data logic above.
// -----------------------------------------------------------------------
