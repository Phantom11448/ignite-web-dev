// job-detail-screen.js
// -----------------------------------------------------------------------
// Renders a single job's detail view: profitability summary, expenses,
// and labor entries. This is where expenses.js, labor.js, categories.js,
// and dashboard.js all come together for one job.
//
// Role gates (see firestore.rules for the enforced backstop — this is
// just the UI side):
//   owner       — sees everything: revenue, profit, full expense/labor
//                 history, can set hourly rates.
//   supervisor  — sees expense/labor totals and history (needed to review
//                 what crew logged) but never revenue or profit, since
//                 profit would leak revenue by subtraction. CAN log a
//                 revenue change (change order/discount) despite not
//                 seeing revenue figures — logs it "blind," the same way
//                 crew logs an expense amount without seeing job totals.
//   crew        — no dollar figures anywhere. Can log a new expense
//                 (has to enter the amount they spent — unavoidable) and
//                 their own hours, but never sees hourly rate, totals, or
//                 anyone else's entries. Cannot log revenue at all.
// -----------------------------------------------------------------------

import { getJob, setCustomField } from "../jobs.js";
import { getCategories } from "../categories.js";
import { addExpense, updateExpense, getExpensesForJob } from "../expenses.js";
import { addLaborEntry, getLaborEntriesForJob, updateLaborEntry } from "../labor.js";
import { addRevenueEntry, getRevenueEntriesForJob } from "../revenue-entries.js";
import { addJobNote, getJobNotesForJob, updateJobNote } from "../job-notes.js";
import { getJobProfitability } from "../dashboard.js";
import { getUserProfile, getTeamMembers } from "../auth.js";
import { uploadReceiptPhoto, uploadJobNotePhoto } from "../photos.js";
import { extractTotalFromReceipt } from "../ocr.js";

/**
 * Renders the job detail screen into `container`.
 * onBack is called (no args) when the user wants to return to the Jobs list.
 */
export function renderJobDetailScreen(container, { businessId, jobId, userId, role, onBack }) {
  const canSeeRevenue = role === "owner";
  const canManageRevenue = role === "owner" || role === "supervisor";
  const canSeeCosts = role === "owner" || role === "supervisor";
  const canManageJobs = role === "owner" || role === "supervisor";

  container.innerHTML = `<p class="placeholder">Loading job&hellip;</p>`;
  load();

  async function load() {
    const [
      job,
      categories,
      expenses,
      laborEntries,
      revenueEntries,
      jobNotes,
      profitability,
      ownProfile,
      teamMembers,
    ] = await Promise.all([
      getJob(businessId, jobId),
      getCategories(businessId),
      getExpensesForJob(businessId, jobId),
      getLaborEntriesForJob(businessId, jobId),
      // Only fetched for display when canSeeRevenue — supervisor can
      // still log entries via the form below without ever loading this
      // list (mirrors how the profitability panel hides its own totals).
      canSeeRevenue ? getRevenueEntriesForJob(businessId, jobId) : Promise.resolve([]),
      // Unlike revenue, job notes have no dollar figure to protect, so
      // every role fetches and sees the full list — no gating.
      getJobNotesForJob(businessId, jobId),
      canSeeCosts ? getJobProfitability(businessId, jobId) : Promise.resolve(null),
      getUserProfile(businessId, userId),
      // Only needed to label labor entries with who logged them — same
      // canSeeCosts gate as the labor list itself, no point fetching the
      // whole team roster for a role that never sees the list anyway.
      canSeeCosts ? getTeamMembers(businessId) : Promise.resolve([]),
    ]);
    render(job, categories, expenses, laborEntries, revenueEntries, jobNotes, profitability, ownProfile, teamMembers);
  }

  function render(
    job,
    categories,
    expenses,
    laborEntries,
    revenueEntries,
    jobNotes,
    profitability,
    ownProfile,
    teamMembers
  ) {
    // Maps a userId to a display name for labeling labor entries — falls
    // back to email, then to a placeholder if the member was removed
    // from the team after logging hours (their old entries still exist).
    const memberNameById = {};
    teamMembers.forEach((member) => {
      memberNameById[member.id] = member.name || member.email || "Unknown";
    });
    const ownDefaultRate = ownProfile?.default_hourly_rate ?? null;
    const categoryOptions = categories
      .map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`)
      .join("");

    container.innerHTML = `
      <button type="button" id="back-to-jobs" class="secondary-btn back-btn">&larr; Back to Jobs</button>

      <div class="screen-header">
        <h2>${escapeHtml(job?.customer_name || "Job")}</h2>
        <span class="status-badge status-${escapeHtml(job?.status || "active")}">${escapeHtml(job?.status || "")}</span>
      </div>

      <div class="custom-fields-display" id="custom-fields-display">
        ${Object.entries(job?.custom_fields || {})
          .map(
            ([key, value]) => `<span class="custom-field-tag">
              <strong>${escapeHtml(key)}:</strong>
              <button type="button" class="custom-field-value" data-copy-value="${escapeHtml(String(value))}">${escapeHtml(String(value))} 📋</button>
            </span>`
          )
          .join("")}
      </div>

      ${
        canManageJobs
          ? `<form id="add-field-form" class="panel-form panel-form-inline">
              <div class="inline-field">
                <label class="label-required" for="new-field-key">Field Name</label>
                <input type="text" id="new-field-key" placeholder="e.g. Site Address" required />
              </div>
              <div class="inline-field">
                <label class="label-required" for="new-field-value">Value</label>
                <input type="text" id="new-field-value" required />
              </div>
              <button type="submit">Add</button>
            </form>`
          : ""
      }

      ${canSeeCosts ? profitabilityPanel(profitability) : ""}

      ${
        canManageRevenue || canSeeRevenue
          ? `<section class="detail-column">
              <div class="screen-header">
                <h3>Revenue</h3>
                ${canManageRevenue ? `<button type="button" id="log-revenue-btn" class="secondary-btn">+ Log Revenue Change</button>` : ""}
              </div>

              ${
                canManageRevenue
                  ? `<div id="revenue-flow" class="panel-form" hidden>
                      <div class="revenue-flow-header">
                        <p class="field-hint">Did the price go up or down?</p>
                        <button type="button" id="cancel-revenue-entry" class="secondary-btn">Cancel</button>
                      </div>

                      <div class="revenue-direction-buttons">
                        <button type="button" class="revenue-direction-btn" data-direction="up">➕ Price Went Up</button>
                        <button type="button" class="revenue-direction-btn" data-direction="down">➖ Gave a Discount</button>
                      </div>

                      <div id="revenue-step-amount" class="revenue-step" hidden>
                        <label class="label-required" for="revenue-amount">Amount ($)</label>
                        <input type="number" id="revenue-amount" min="0" step="0.01" inputmode="decimal"
                          placeholder="0.00" class="revenue-amount-input" />
                      </div>

                      <div id="revenue-step-reason" class="revenue-step" hidden>
                        <p class="field-hint">Why? (optional)</p>
                        <div class="chip-row">
                          <button type="button" class="chip-btn" data-reason="Added Scope">Added Scope</button>
                          <button type="button" class="chip-btn" data-reason="Customer Discount">Customer Discount</button>
                          <button type="button" class="chip-btn" data-reason="Price Match">Price Match</button>
                          <button type="button" class="chip-btn" data-reason="Other">Other</button>
                        </div>
                        <input type="text" id="revenue-reason-other" placeholder="Enter a reason" hidden />
                      </div>

                      <div class="form-actions" id="revenue-save-actions" hidden>
                        <button type="button" id="save-revenue-entry">Save</button>
                      </div>
                    </div>`
                  : ""
              }

              ${
                canSeeRevenue
                  ? `<div id="revenue-list" class="job-list">
                      ${revenueEntries.length === 0 ? '<p class="placeholder">No revenue logged yet.</p>' : ""}
                    </div>`
                  : ""
              }
            </section>`
          : ""
      }

      <section class="detail-column">
        <h3>Job Notes &amp; Photos</h3>
        <p class="field-hint">Progress photos, site conditions, anything worth flagging — open to everyone on the job.</p>
        <form id="new-job-note-form" class="panel-form">
          <label for="job-note-photo">Photo</label>
          <input type="file" id="job-note-photo" accept="image/*" capture="environment" />

          <label for="job-note-text">Note</label>
          <input type="text" id="job-note-text" placeholder="e.g. Ceiling damage near the vent" />

          <p class="field-hint error" id="job-note-error" hidden>Add a photo or a note before saving.</p>

          <div class="form-actions">
            <button type="submit" id="job-note-submit-btn">Add Note</button>
          </div>
          <p class="field-hint" id="job-note-upload-status" hidden></p>
        </form>

        <div id="job-notes-list" class="job-list">
          ${jobNotes.length === 0 ? '<p class="placeholder">No notes or photos yet.</p>' : ""}
        </div>
      </section>

      <div class="detail-columns">
        <section class="detail-column">
          <h3>Expenses</h3>
          <form id="new-expense-form" class="panel-form">
            <label class="label-emphasis" for="expense-photo">Receipt Photo</label>
            <p class="field-hint">Snap the receipt first — we'll try to read the total for you.</p>
            <input type="file" id="expense-photo" accept="image/*" capture="environment" />
            <p class="field-hint" id="ocr-status" hidden></p>

            <label for="expense-amount">Amount ($)</label>
            <input type="number" id="expense-amount" min="0" step="0.01" placeholder="0.00" />

            ${
              categories.length > 0
                ? `<label for="expense-category">Category (optional)</label>
                   <select id="expense-category">
                     <option value="">Uncategorized</option>
                     ${categoryOptions}
                   </select>`
                : ""
            }

            <label for="expense-date">Date</label>
            <input type="date" id="expense-date" value="${todayInputValue()}" />

            <label for="expense-notes">Notes (optional)</label>
            <input type="text" id="expense-notes" />

            <div class="form-actions">
              <button type="submit" id="expense-submit-btn">Add Expense</button>
            </div>
            <p class="field-hint" id="expense-upload-status" hidden></p>
          </form>
          ${
            canSeeCosts
              ? `<div id="expenses-list" class="job-list">
                  ${expenses.length === 0 ? '<p class="placeholder">No expenses logged yet.</p>' : ""}
                </div>`
              : `<p class="placeholder">Expenses you log are saved — history is visible to supervisors and the owner.</p>`
          }
        </section>

        <section class="detail-column">
          <h3>Labor</h3>
          <form id="new-labor-form" class="panel-form">
            <label class="label-required" for="labor-hours">Hours</label>
            <input type="number" id="labor-hours" min="0" step="0.25" required />

            <label class="label-required" for="labor-date">Date</label>
            <input type="date" id="labor-date" required />

            ${
              canSeeCosts
                ? `<p class="job-meta">
                    ${
                      ownDefaultRate != null
                        ? `Logged at your rate: $${ownDefaultRate}/hr`
                        : `No hourly rate set on your profile yet — ask the owner to set one on the Team screen.`
                    }
                  </p>`
                : ""
            }

            <div class="form-actions"><button type="submit">Add Labor Entry</button></div>
          </form>
          ${
            canSeeCosts
              ? `<div id="labor-list" class="job-list">
                  ${laborEntries.length === 0 ? '<p class="placeholder">No labor entries yet.</p>' : ""}
                </div>`
              : `<p class="placeholder">Your hours are saved — history is visible to supervisors and the owner.</p>`
          }
        </section>
      </div>
    `;

    container.querySelector("#back-to-jobs").addEventListener("click", () => onBack());

    // Tap a custom field's value (e.g. a site address) to copy it —
    // saves a crew member from retyping it into a maps app by hand.
    container.querySelectorAll(".custom-field-value").forEach((btn) => {
      btn.addEventListener("click", () => copyCustomFieldValue(btn));
    });

    const addFieldForm = container.querySelector("#add-field-form");
    if (addFieldForm) {
      addFieldForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        const key = container.querySelector("#new-field-key").value.trim();
        const value = container.querySelector("#new-field-value").value.trim();
        if (!key) return;
        await setCustomField(businessId, jobId, key, value);
        await load();
      });
    }

    if (canSeeCosts) {
      const expensesListEl = container.querySelector("#expenses-list");
      expenses.forEach((expense) => expensesListEl.appendChild(buildExpenseRow(expense, categories)));

      const laborListEl = container.querySelector("#labor-list");
      laborEntries.forEach((entry) => laborListEl.appendChild(buildLaborRow(entry, memberNameById)));
    }

    if (canSeeRevenue) {
      const revenueListEl = container.querySelector("#revenue-list");
      revenueEntries.forEach((entry) => revenueListEl.appendChild(buildRevenueEntryRow(entry)));
    }

    // Job notes are visible to every role — no gating, unlike revenue.
    const jobNotesListEl = container.querySelector("#job-notes-list");
    jobNotes.forEach((note) => jobNotesListEl.appendChild(buildJobNoteRow(note)));

    const logRevenueBtn = container.querySelector("#log-revenue-btn");
    const revenueFlow = container.querySelector("#revenue-flow");
    if (logRevenueBtn && revenueFlow) {
      const cancelRevenueBtn = container.querySelector("#cancel-revenue-entry");
      const directionButtons = container.querySelectorAll(".revenue-direction-btn");
      const amountStep = container.querySelector("#revenue-step-amount");
      const amountInput = container.querySelector("#revenue-amount");
      const reasonStep = container.querySelector("#revenue-step-reason");
      const reasonChips = container.querySelectorAll(".chip-btn");
      const reasonOtherInput = container.querySelector("#revenue-reason-other");
      const saveActions = container.querySelector("#revenue-save-actions");
      const saveBtn = container.querySelector("#save-revenue-entry");

      // Guided tap flow, not a traditional form: direction is a toggle
      // (tap either button anytime before Save to change your mind), the
      // amount is always typed as a plain positive number, and the sign
      // only gets applied right before addRevenueEntry is called. Each
      // later step reveals itself once the step before it has something
      // usable in it — no "Next" buttons.
      let direction = null; // "up" | "down"
      let selectedReasonKey = null; // "Added Scope" | "Customer Discount" | "Price Match" | "Other" | null

      function resetRevenueFlow() {
        direction = null;
        selectedReasonKey = null;
        directionButtons.forEach((btn) => btn.classList.remove("selected"));
        reasonChips.forEach((chip) => chip.classList.remove("selected"));
        amountInput.value = "";
        reasonOtherInput.value = "";
        reasonOtherInput.hidden = true;
        amountStep.hidden = true;
        reasonStep.hidden = true;
        saveActions.hidden = true;
      }

      logRevenueBtn.addEventListener("click", () => {
        const opening = revenueFlow.hidden;
        revenueFlow.hidden = !revenueFlow.hidden;
        if (opening) resetRevenueFlow();
      });

      cancelRevenueBtn.addEventListener("click", () => {
        resetRevenueFlow();
        revenueFlow.hidden = true;
      });

      directionButtons.forEach((btn) => {
        btn.addEventListener("click", () => {
          direction = btn.dataset.direction;
          directionButtons.forEach((b) => b.classList.toggle("selected", b === btn));
          amountStep.hidden = false;
        });
      });

      amountInput.addEventListener("input", () => {
        // Reveal the rest of the flow the moment there's a usable amount —
        // reason stays visibly optional (Save works with no chip picked).
        if (parseFloat(amountInput.value) > 0) {
          reasonStep.hidden = false;
          saveActions.hidden = false;
        }
      });

      reasonChips.forEach((chip) => {
        chip.addEventListener("click", () => {
          selectedReasonKey = chip.dataset.reason;
          reasonChips.forEach((c) => c.classList.toggle("selected", c === chip));
          reasonOtherInput.hidden = selectedReasonKey !== "Other";
          if (selectedReasonKey === "Other") reasonOtherInput.focus();
        });
      });

      saveBtn.addEventListener("click", async () => {
        if (!direction) return; // amount step (and therefore Save) is hidden until a direction is picked
        const rawAmount = Math.abs(parseFloat(amountInput.value) || 0);
        const signedAmount = direction === "down" ? -rawAmount : rawAmount;
        const reason =
          selectedReasonKey === "Other" ? reasonOtherInput.value.trim() || null : selectedReasonKey;

        saveBtn.disabled = true;
        await addRevenueEntry(businessId, jobId, {
          amount: signedAmount,
          date: new Date(),
          reason,
          loggedBy: userId,
        });

        resetRevenueFlow();
        revenueFlow.hidden = true;
        await load();
      });
    }

    const jobNoteForm = container.querySelector("#new-job-note-form");
    if (jobNoteForm) {
      const jobNotePhotoInput = container.querySelector("#job-note-photo");
      const jobNoteTextInput = container.querySelector("#job-note-text");
      const jobNoteErrorEl = container.querySelector("#job-note-error");
      const jobNoteStatusEl = container.querySelector("#job-note-upload-status");
      const jobNoteSubmitBtn = container.querySelector("#job-note-submit-btn");

      jobNoteForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        const text = jobNoteTextInput.value.trim();
        const photoFile = jobNotePhotoInput.files[0] || null;

        // A note with neither a photo nor text wouldn't mean anything —
        // require at least one before saving.
        if (!text && !photoFile) {
          jobNoteErrorEl.hidden = false;
          return;
        }
        jobNoteErrorEl.hidden = true;
        jobNoteSubmitBtn.disabled = true;

        // Same pattern as expense receipts: create the note doc first to
        // get a noteId to scope the Cloudinary folder under, then attach
        // the photo URL afterward if one was picked.
        const noteId = await addJobNote(businessId, jobId, {
          text: text || null,
          photoUrl: null,
          loggedBy: userId,
        });

        if (photoFile) {
          jobNoteStatusEl.textContent = "Uploading photo…";
          jobNoteStatusEl.hidden = false;
          try {
            const photoUrl = await uploadJobNotePhoto(businessId, jobId, noteId, photoFile);
            await updateJobNote(businessId, jobId, noteId, { photo_url: photoUrl });
          } catch (err) {
            // Same reasoning as the expense photo failure path — don't
            // reload here, the note itself already saved fine.
            console.error("Job note photo upload failed:", err);
            jobNoteStatusEl.textContent = "Note saved, but the photo failed to upload.";
            jobNoteSubmitBtn.disabled = false;
            return;
          }
        }

        jobNoteSubmitBtn.disabled = false;
        await load();
      });
    }

    const expenseForm = container.querySelector("#new-expense-form");
    if (expenseForm) {
      const photoInput = container.querySelector("#expense-photo");
      const ocrStatusEl = container.querySelector("#ocr-status");
      const amountInput = container.querySelector("#expense-amount");

      // Tracks the in-flight OCR read so the submit handler can wait for
      // it below — otherwise a fast "snap photo, immediately tap submit"
      // could beat the OCR result to the amount field.
      let pendingOcr = null;

      photoInput.addEventListener("change", () => {
        const file = photoInput.files[0];
        if (!file) return;

        ocrStatusEl.hidden = false;
        ocrStatusEl.textContent = "Reading receipt…";

        pendingOcr = extractTotalFromReceipt(file)
          .then((amount) => {
            if (amount != null) {
              amountInput.value = amount.toFixed(2);
              ocrStatusEl.textContent = `Found total: $${amount.toFixed(2)} — double check before saving.`;
            } else {
              ocrStatusEl.textContent = "Couldn't find a total on this receipt — enter the amount manually.";
            }
          })
          .catch((err) => {
            console.error("Receipt OCR failed:", err);
            ocrStatusEl.textContent = "Couldn't read the receipt automatically — enter the amount manually.";
          });
      });

      expenseForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        const submitBtn = container.querySelector("#expense-submit-btn");
        const statusEl = container.querySelector("#expense-upload-status");
        const photoFile = photoInput.files[0] || null;

        submitBtn.disabled = true;

        // If a photo was just picked, let OCR finish filling the amount
        // field before reading it below — otherwise a very fast submit
        // click could grab the amount before the guess lands.
        if (pendingOcr) {
          submitBtn.textContent = "Reading receipt…";
          await pendingOcr;
          submitBtn.textContent = "Add Expense";
        }

        const categoryInput = container.querySelector("#expense-category");
        const dateInput = container.querySelector("#expense-date");

        // Photo needs an expenseId to be scoped under in Storage, so the
        // expense doc is created first, then (if a photo was picked)
        // uploaded and patched onto that same doc as photo_url.
        const expenseId = await addExpense(businessId, jobId, {
          categoryId: categoryInput ? categoryInput.value || null : null,
          amount: parseFloat(amountInput.value) || 0,
          date: dateInput.value ? new Date(dateInput.value) : new Date(),
          loggedBy: userId,
          notes: container.querySelector("#expense-notes").value || null,
        });

        if (photoFile) {
          statusEl.textContent = "Uploading photo…";
          statusEl.hidden = false;
          try {
            const photoUrl = await uploadReceiptPhoto(businessId, jobId, expenseId, photoFile);
            await updateExpense(businessId, jobId, expenseId, { photo_url: photoUrl });
          } catch (err) {
            // Don't reload here — reload rebuilds the form and wipes this
            // message instantly. The expense itself already saved fine;
            // only the photo attach failed, so leave the form as-is with
            // the error visible instead of hiding it behind a fresh render.
            console.error("Receipt photo upload failed:", err);
            statusEl.textContent = "Expense saved, but the photo failed to upload. You can leave it as-is — the amount and category were recorded.";
            submitBtn.disabled = false;
            return;
          }
        }

        submitBtn.disabled = false;
        await load();
      });
    }

    const laborForm = container.querySelector("#new-labor-form");
    laborForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      await addLaborEntry(businessId, jobId, {
        userId,
        hours: parseFloat(container.querySelector("#labor-hours").value) || 0,
        // Every entry is logged for yourself, so it always uses your own
        // profile's default_hourly_rate — nobody manually types a rate in.
        // If it's null (not set yet), owner/supervisor can fill it in later
        // via the "Set Rate" button on the entry itself.
        hourlyRate: ownDefaultRate,
        date: new Date(container.querySelector("#labor-date").value),
      });
      await load();
    });
  }

  function profitabilityPanel(profitability) {
    return `
      <div class="profitability-panel">
        ${
          canSeeRevenue
            ? `<div class="profit-stat">
                <span class="profit-label">Revenue</span>
                <span class="profit-value">$${profitability.revenue.toFixed(2)}</span>
              </div>`
            : ""
        }
        <div class="profit-stat">
          <span class="profit-label">Expenses</span>
          <span class="profit-value">$${profitability.expenseTotal.toFixed(2)}</span>
        </div>
        <div class="profit-stat">
          <span class="profit-label">Labor Cost</span>
          <span class="profit-value">$${profitability.laborCost.toFixed(2)}</span>
        </div>
        ${
          canSeeRevenue
            ? `<div class="profit-stat profit-stat-highlight">
                <span class="profit-label">Profit</span>
                <span class="profit-value">$${profitability.profit.toFixed(2)}</span>
              </div>`
            : ""
        }
      </div>
    `;
  }

  function buildExpenseRow(expense, categories) {
    const row = document.createElement("div");
    row.className = "job-card";
    const category = categories.find((c) => c.id === expense.category_id);
    const date = toDate(expense.date);
    row.innerHTML = `
      <div class="job-card-main">
        <h3>${escapeHtml(category?.name || "Uncategorized")}</h3>
        <p class="job-meta">
          ${date ? date.toLocaleDateString() : ""} &middot; $${Number(expense.amount || 0).toFixed(2)}
          ${expense.notes ? ` &middot; ${escapeHtml(expense.notes)}` : ""}
        </p>
      </div>
      ${
        expense.photo_url
          ? `<div class="job-card-actions">
              <a href="${escapeHtml(expense.photo_url)}" target="_blank" rel="noopener" class="secondary-btn receipt-link">View Receipt</a>
            </div>`
          : ""
      }
    `;
    return row;
  }

  function buildRevenueEntryRow(entry) {
    const row = document.createElement("div");
    row.className = "job-card";
    const date = toDate(entry.date);
    const amount = Number(entry.amount || 0);
    const isReduction = amount < 0;
    row.innerHTML = `
      <div class="job-card-main">
        <h3 class="${isReduction ? "revenue-negative" : "revenue-positive"}">
          ${isReduction ? "-" : "+"}$${Math.abs(amount).toFixed(2)}
        </h3>
        <p class="job-meta">
          ${date ? date.toLocaleDateString() : ""}
          ${entry.reason ? ` &middot; ${escapeHtml(entry.reason)}` : ""}
        </p>
      </div>
    `;
    return row;
  }

  function buildJobNoteRow(note) {
    const row = document.createElement("div");
    row.className = "job-card";
    const date = toDate(note.date);
    row.innerHTML = `
      <div class="job-card-main">
        <h3>${date ? date.toLocaleDateString() : ""}</h3>
        ${note.text ? `<p class="job-meta">${escapeHtml(note.text)}</p>` : ""}
      </div>
      ${
        note.photo_url
          ? `<div class="job-card-actions">
              <a href="${escapeHtml(note.photo_url)}" target="_blank" rel="noopener" class="secondary-btn receipt-link">View Photo</a>
            </div>`
          : ""
      }
    `;
    return row;
  }

  function buildLaborRow(entry, memberNameById) {
    const row = document.createElement("div");
    row.className = "job-card";
    const date = toDate(entry.date);
    const hasRate = entry.hourly_rate != null;
    const cost = hasRate ? entry.hours * entry.hourly_rate : null;
    const loggedByName = memberNameById[entry.user_id] || "Unknown";
    row.innerHTML = `
      <div class="job-card-main">
        <h3>${entry.hours} hrs</h3>
        <p class="job-meta">
          ${date ? date.toLocaleDateString() : ""} &middot; ${escapeHtml(loggedByName)}
          ${hasRate ? ` &middot; $${entry.hourly_rate}/hr &middot; $${cost.toFixed(2)}` : " &middot; no rate set"}
        </p>
      </div>
      <div class="job-card-actions">
        <button type="button" class="secondary-btn edit-rate-btn">
          ${hasRate ? "Edit Rate" : "Set Rate"}
        </button>
      </div>
    `;

    const editBtn = row.querySelector(".edit-rate-btn");
    editBtn.addEventListener("click", () => {
      // Swap the row for a tiny inline rate-entry form. Kept minimal —
      // this is a correction tool, not a full edit screen.
      row.innerHTML = `
        <div class="job-card-main rate-edit-form">
          <label for="rate-input-${entry.id}">Hourly Rate ($) for ${entry.hours} hrs on ${
            date ? date.toLocaleDateString() : "this entry"
          }</label>
          <input type="number" id="rate-input-${entry.id}" min="0" step="0.01"
            value="${hasRate ? entry.hourly_rate : ""}" />
        </div>
        <div class="job-card-actions">
          <button type="button" class="save-rate-btn">Save</button>
          <button type="button" class="secondary-btn cancel-rate-btn">Cancel</button>
        </div>
      `;

      row.querySelector(".save-rate-btn").addEventListener("click", async () => {
        const value = row.querySelector(`#rate-input-${entry.id}`).value;
        await updateLaborEntry(businessId, jobId, entry.id, {
          hourly_rate: value ? parseFloat(value) : null,
        });
        await load();
      });

      row.querySelector(".cancel-rate-btn").addEventListener("click", async () => {
        await load();
      });
    });

    return row;
  }
}

// --- internal helpers -----------------------------------------------------

function toDate(value) {
  if (!value) return null;
  if (typeof value.toDate === "function") return value.toDate();
  return new Date(value);
}

/** Today's date as a "YYYY-MM-DD" string, in local time (not UTC — using
 * toISOString() here would roll over to tomorrow's date for anyone west
 * of UTC in the evening), for pre-filling a date input's default value. */
function todayInputValue() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

/**
 * Copies a custom field's value (e.g. a site address) to the clipboard
 * and briefly flashes the button to "Copied!" so tapping it feels like it
 * did something, even though nothing visibly changes on the page
 * otherwise. Falls back to a plain error message if the clipboard API is
 * unavailable or the user denies permission — this can happen on an
 * insecure (non-HTTPS) connection or an older browser.
 */
async function copyCustomFieldValue(button) {
  const value = button.dataset.copyValue;
  const originalText = button.textContent;

  try {
    await navigator.clipboard.writeText(value);
    button.textContent = "Copied! ✓";
    button.classList.add("copied");
  } catch (err) {
    console.error("Clipboard copy failed:", err);
    button.textContent = "Couldn't copy — press and hold to select instead";
  }

  setTimeout(() => {
    button.textContent = originalText;
    button.classList.remove("copied");
  }, 1500);
}
