// export.js
// -----------------------------------------------------------------------
// Client-side data export: lets an owner download all of a business's
// data as CSV files, for backup or portability. Deliberately reuses the
// existing data-layer functions (jobs.js, expenses.js, labor.js,
// revenue-entries.js, categories.js, bulletin.js, job-notes.js) rather
// than writing new Firestore query logic here — this file's job is only
// to shape already-fetched data into CSV and trigger downloads.
// -----------------------------------------------------------------------

import { getAllJobs } from "./jobs.js";
import { getExpensesForJob, sumExpenses } from "./expenses.js";
import { getLaborEntriesForJob, sumLaborCost } from "./labor.js";
import { getRevenueEntriesForJob, sumRevenueEntries } from "./revenue-entries.js";
import { getCategories } from "./categories.js";
import { getPosts } from "./bulletin.js";
import { getJobNotesForJob } from "./job-notes.js";

// --- CSV helpers -----------------------------------------------------

/**
 * Escapes a single field value per standard CSV rules: any value
 * containing a comma, double quote, or newline gets wrapped in double
 * quotes, with internal double quotes doubled. null/undefined become an
 * empty field rather than the literal strings "null"/"undefined".
 */
export function csvEscape(value) {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/** Builds one CSV row from an array of raw field values. */
function csvRow(fields) {
  return fields.map(csvEscape).join(",");
}

/**
 * Builds a full CSV string (header + data rows) and triggers a browser
 * download via a Blob + object URL. headerRow and each entry in dataRows
 * are arrays of raw values — escaping happens here, callers should never
 * pre-escape.
 */
export function downloadCsv(filename, headerRow, dataRows) {
  const lines = [csvRow(headerRow), ...dataRows.map((row) => csvRow(row))];
  // \r\n is the CSV-spec line ending and what Excel expects; plain \n
  // renders fine in most spreadsheet apps too, but \r\n avoids any doubt.
  const csvString = lines.join("\r\n");

  const blob = new Blob([csvString], { type: "text/csv" });
  const url = URL.createObjectURL(blob);

  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);

  // Deferred slightly so the browser has a chance to actually start the
  // download before the object URL backing it is revoked.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// --- date helper (mirrors job-detail-screen.js's toDate()) -----------

/** Converts a Firestore Timestamp, JS Date, ISO string, or null into a
 * plain "YYYY-MM-DD"-ish local date string for CSV output. Mirrors the
 * toDate() convention used throughout the screens for Firestore
 * timestamp fields. */
function csvDate(value) {
  if (!value) return "";
  const date = typeof value.toDate === "function" ? value.toDate() : new Date(value);
  if (isNaN(date.getTime())) return "";
  return date.toLocaleDateString();
}

// --- main export ------------------------------------------------------

/**
 * Fetches every piece of a business's data (reusing the existing
 * data-layer functions exclusively) and downloads it as 7 separate CSV
 * files: jobs, expenses, labor_entries, revenue_entries, job_notes,
 * categories, bulletin_posts.
 *
 * Per-job subcollections (expenses/labor/revenue/notes) are fetched once
 * per job and reused both for the job's row in jobs.csv (via
 * sumExpenses/sumLaborCost/sumRevenueEntries — the same functions the
 * Dashboard and job detail screens use, so the totals match exactly) and
 * for that job's rows in the four flattened per-job CSVs, tagged with the
 * parent job's id/customer_name for context.
 */
export async function exportAllBusinessData(businessId) {
  const jobs = await getAllJobs(businessId);

  const jobRows = [];
  const allExpenses = [];
  const allLaborEntries = [];
  const allRevenueEntries = [];
  const allJobNotes = [];

  await Promise.all(
    jobs.map(async (job) => {
      const [expenses, laborEntries, revenueEntries, jobNotes] = await Promise.all([
        getExpensesForJob(businessId, job.id),
        getLaborEntriesForJob(businessId, job.id),
        getRevenueEntriesForJob(businessId, job.id),
        getJobNotesForJob(businessId, job.id),
      ]);

      // Same calculation functions the Dashboard/job detail screens use,
      // and the same revenue - expenses - labor formula dashboard.js's
      // getJobProfitability uses — fetched once here rather than calling
      // getJobProfitability separately, which would re-fetch these same
      // four subcollections a second time per job.
      const revenue = sumRevenueEntries(revenueEntries);
      const expenseTotal = sumExpenses(expenses);
      const laborCost = sumLaborCost(laborEntries);
      const profit = revenue - expenseTotal - laborCost;

      jobRows.push({
        id: job.id,
        customer_name: job.customer_name || "",
        status: job.status || "",
        start_date: csvDate(job.start_date),
        end_date: csvDate(job.end_date),
        revenue,
        expenseTotal,
        laborCost,
        profit,
      });

      expenses.forEach((e) =>
        allExpenses.push({
          job_id: job.id,
          job_customer_name: job.customer_name || "",
          id: e.id,
          category_id: e.category_id || "",
          amount: e.amount,
          date: csvDate(e.date),
          logged_by: e.logged_by || "",
          notes: e.notes || "",
          photo_url: e.photo_url || "",
        })
      );

      laborEntries.forEach((l) =>
        allLaborEntries.push({
          job_id: job.id,
          job_customer_name: job.customer_name || "",
          id: l.id,
          user_id: l.user_id || "",
          date: csvDate(l.date),
          hours: l.hours,
          hourly_rate: l.hourly_rate == null ? "" : l.hourly_rate,
        })
      );

      revenueEntries.forEach((r) =>
        allRevenueEntries.push({
          job_id: job.id,
          job_customer_name: job.customer_name || "",
          id: r.id,
          amount: r.amount,
          date: csvDate(r.date),
          reason: r.reason || "",
          logged_by: r.logged_by || "",
        })
      );

      jobNotes.forEach((n) =>
        allJobNotes.push({
          job_id: job.id,
          job_customer_name: job.customer_name || "",
          id: n.id,
          text: n.text || "",
          photo_url: n.photo_url || "",
          logged_by: n.logged_by || "",
          date: csvDate(n.date),
        })
      );
    })
  );

  const [categories, bulletinPosts] = await Promise.all([
    getCategories(businessId),
    getPosts(businessId),
  ]);

  downloadCsv(
    "jobs.csv",
    ["id", "customer_name", "status", "start_date", "end_date", "revenue", "expenses", "labor_cost", "profit"],
    jobRows.map((j) => [j.id, j.customer_name, j.status, j.start_date, j.end_date, j.revenue, j.expenseTotal, j.laborCost, j.profit])
  );

  downloadCsv(
    "expenses.csv",
    ["job_id", "job_customer_name", "id", "category_id", "amount", "date", "logged_by", "notes", "photo_url"],
    allExpenses.map((e) => [e.job_id, e.job_customer_name, e.id, e.category_id, e.amount, e.date, e.logged_by, e.notes, e.photo_url])
  );

  downloadCsv(
    "labor_entries.csv",
    ["job_id", "job_customer_name", "id", "user_id", "date", "hours", "hourly_rate"],
    allLaborEntries.map((l) => [l.job_id, l.job_customer_name, l.id, l.user_id, l.date, l.hours, l.hourly_rate])
  );

  downloadCsv(
    "revenue_entries.csv",
    ["job_id", "job_customer_name", "id", "amount", "date", "reason", "logged_by"],
    allRevenueEntries.map((r) => [r.job_id, r.job_customer_name, r.id, r.amount, r.date, r.reason, r.logged_by])
  );

  downloadCsv(
    "job_notes.csv",
    ["job_id", "job_customer_name", "id", "text", "photo_url", "logged_by", "date"],
    allJobNotes.map((n) => [n.job_id, n.job_customer_name, n.id, n.text, n.photo_url, n.logged_by, n.date])
  );

  downloadCsv(
    "categories.csv",
    ["id", "name"],
    categories.map((c) => [c.id, c.name || ""])
  );

  downloadCsv(
    "bulletin_posts.csv",
    ["id", "text", "photo_url", "posted_by", "posted_by_name", "date"],
    bulletinPosts.map((p) => [p.id, p.text || "", p.photo_url || "", p.posted_by || "", p.posted_by_name || "", csvDate(p.date)])
  );
}
