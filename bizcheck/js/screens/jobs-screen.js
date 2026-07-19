// jobs-screen.js
// -----------------------------------------------------------------------
// Renders the Jobs screen into a container element. Pure DOM + data-layer
// calls — no framework. Keeps its own small render/reload loop so it can
// be dropped into #app-content by app.html.
//
// Role gates (see firestore.rules for the enforced backstop — this is
// just the UI side): crew cannot create jobs, cannot mark them complete
// or cancel them, and never sees or logs revenue. Supervisor/owner get
// full job management and can both LOG revenue (the job's initial price
// here, or a change order later on the job detail screen) — but only
// owner can actually SEE revenue figures anywhere in the UI. Supervisor
// logs it "blind," the same way crew logs expenses without seeing job
// totals.
// -----------------------------------------------------------------------

import { createJob, getActiveJobs, completeJob, cancelJob } from "../jobs.js";
import { addRevenueEntry, getRevenueEntriesForJob, sumRevenueEntries } from "../revenue-entries.js";

/**
 * Renders the Jobs screen (list of active jobs + a "new job" form) into
 * `container`. businessId scopes all reads/writes; userId is stamped onto
 * new jobs as created_by; role controls which controls are shown.
 */
export function renderJobsScreen(container, { businessId, userId, role, onSelectJob }) {
  const canManageJobs = role === "owner" || role === "supervisor";
  const canManageRevenue = role === "owner" || role === "supervisor";
  const canSeeRevenue = role === "owner";

  container.innerHTML = `
    <div class="screen-header">
      <h2>Jobs</h2>
      ${canManageJobs ? `<button id="new-job-btn" type="button">+ New Job</button>` : ""}
    </div>

    ${
      canManageJobs
        ? `<form id="new-job-form" class="panel-form" hidden>
            <label class="label-required" for="job-customer-name">Customer Name</label>
            <input type="text" id="job-customer-name" required />

            <label class="label-required" for="job-start-date">Start Date</label>
            <input type="date" id="job-start-date" required />

            ${
              canManageRevenue
                ? `<label for="job-revenue">Initial Price ($)</label>
                   <p class="field-hint">This becomes the first entry in the job's revenue log — you can add change orders or discounts later from the job detail screen.</p>
                   <input type="number" id="job-revenue" min="0" step="0.01" placeholder="0.00" />`
                : ""
            }

            <label>Job Details (optional)</label>
            <p class="field-hint">
              Add whatever fields fit this job — origin/destination for a move,
              a site address for a build, anything. Nothing here is fixed.
            </p>
            <div id="custom-fields-container"></div>
            <button type="button" id="add-field-btn" class="secondary-btn">+ Add Field</button>

            <div class="form-actions">
              <button type="submit">Create Job</button>
              <button type="button" id="cancel-new-job" class="secondary-btn">Cancel</button>
            </div>
          </form>`
        : ""
    }

    <div id="jobs-list" class="job-list">
      <p class="placeholder">Loading jobs&hellip;</p>
    </div>
  `;

  const newJobBtn = container.querySelector("#new-job-btn");
  const form = container.querySelector("#new-job-form");
  const cancelNewJobBtn = container.querySelector("#cancel-new-job");
  const listEl = container.querySelector("#jobs-list");
  const customFieldsContainer = container.querySelector("#custom-fields-container");
  const addFieldBtn = container.querySelector("#add-field-btn");

  function addCustomFieldRow() {
    const row = document.createElement("div");
    row.className = "custom-field-row";
    row.innerHTML = `
      <input type="text" class="custom-field-label" placeholder="Field name (e.g. Origin)" />
      <input type="text" class="custom-field-value" placeholder="Value" />
      <button type="button" class="secondary-btn remove-field-btn">&times;</button>
    `;
    row.querySelector(".remove-field-btn").addEventListener("click", () => row.remove());
    customFieldsContainer.appendChild(row);
  }

  function collectCustomFields() {
    const fields = {};
    customFieldsContainer.querySelectorAll(".custom-field-row").forEach((row) => {
      const key = row.querySelector(".custom-field-label").value.trim();
      const value = row.querySelector(".custom-field-value").value.trim();
      if (key) fields[key] = value;
    });
    return fields;
  }

  if (newJobBtn && form) {
    newJobBtn.addEventListener("click", () => {
      form.hidden = !form.hidden;
    });

    addFieldBtn.addEventListener("click", addCustomFieldRow);

    cancelNewJobBtn.addEventListener("click", () => {
      form.reset();
      customFieldsContainer.innerHTML = "";
      form.hidden = true;
    });

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const customerName = container.querySelector("#job-customer-name").value.trim();
      const startDateValue = container.querySelector("#job-start-date").value;
      const startDate = startDateValue ? new Date(startDateValue) : new Date();
      const revenueInput = container.querySelector("#job-revenue");
      const initialRevenue = revenueInput && revenueInput.value ? parseFloat(revenueInput.value) : 0;

      const jobId = await createJob(businessId, {
        customerName,
        startDate,
        customFields: collectCustomFields(),
        createdBy: userId,
      });

      // The job's initial agreed price is just the first revenue_entries
      // doc, not a special field — same log a change order or discount
      // gets added to later. Only bother writing an entry if a price was
      // actually given (an entry of $0 wouldn't mean anything).
      if (initialRevenue) {
        await addRevenueEntry(businessId, jobId, {
          amount: initialRevenue,
          date: startDate,
          reason: "Initial job price",
          loggedBy: userId,
        });
      }

      form.reset();
      customFieldsContainer.innerHTML = "";
      form.hidden = true;
      await loadJobs();
    });
  }

  async function loadJobs() {
    listEl.innerHTML = `<p class="placeholder">Loading jobs&hellip;</p>`;
    const jobs = await getActiveJobs(businessId);

    if (jobs.length === 0) {
      listEl.innerHTML = `<p class="placeholder">No active jobs yet.</p>`;
      return;
    }

    // Revenue is a live sum of revenue_entries now, not a stored field on
    // the job doc, so it's fetched per job here (only bother for owner,
    // the only role that ever sees it) — same principle dashboard.js
    // already uses for profitability totals.
    const revenueByJobId = {};
    if (canSeeRevenue) {
      await Promise.all(
        jobs.map(async (job) => {
          const entries = await getRevenueEntriesForJob(businessId, job.id);
          revenueByJobId[job.id] = sumRevenueEntries(entries);
        })
      );
    }

    listEl.innerHTML = "";
    jobs.forEach((job) => listEl.appendChild(buildJobCard(job, revenueByJobId[job.id] || 0)));
  }

  function buildJobCard(job, revenue) {
    const card = document.createElement("div");
    card.className = "job-card";

    const startDate = toDate(job.start_date);

    card.innerHTML = `
      <div class="job-card-main">
        <h3>${escapeHtml(job.customer_name || "Untitled job")}</h3>
        <p class="job-meta">
          ${startDate ? `Started ${startDate.toLocaleDateString()}` : "No start date"}
          ${canSeeRevenue ? `&nbsp;&middot;&nbsp; $${revenue.toFixed(2)} revenue` : ""}
        </p>
      </div>
      <div class="job-card-actions">
        <button type="button" class="secondary-btn view-details-btn">View Details</button>
        ${canManageJobs ? `<button type="button" class="secondary-btn complete-btn">Mark Complete</button>` : ""}
        ${canManageJobs ? `<button type="button" class="secondary-btn cancel-job-btn">Cancel Job</button>` : ""}
      </div>
    `;

    card.querySelector(".view-details-btn").addEventListener("click", () => {
      if (onSelectJob) onSelectJob(job.id);
    });

    const completeBtn = card.querySelector(".complete-btn");
    if (completeBtn) {
      completeBtn.addEventListener("click", async () => {
        await completeJob(businessId, job.id);
        await loadJobs();
      });
    }

    const cancelBtn = card.querySelector(".cancel-job-btn");
    if (cancelBtn) {
      cancelBtn.addEventListener("click", async () => {
        await cancelJob(businessId, job.id);
        await loadJobs();
      });
    }

    return card;
  }

  loadJobs();
}

// --- internal helpers -----------------------------------------------------

function toDate(value) {
  if (!value) return null;
  if (typeof value.toDate === "function") return value.toDate(); // Firestore Timestamp
  return new Date(value);
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}
