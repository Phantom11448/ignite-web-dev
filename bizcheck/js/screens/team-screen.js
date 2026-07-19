// team-screen.js
// -----------------------------------------------------------------------
// Owner-only screen: invite supervisor/crew accounts, see the team list,
// toggle active/inactive, change roles, set pay rates. Nothing here should
// be reachable by non-owners — app.html gates the nav item, and
// firestore.rules gates the underlying writes regardless.
// -----------------------------------------------------------------------

import { createTeamMember, getTeamMembers, updateTeamMember } from "../auth.js";

export function renderTeamScreen(container, { businessId }) {
  container.innerHTML = `
    <div class="screen-header">
      <h2>Team</h2>
    </div>

    <form id="new-member-form" class="panel-form">
      <label class="label-required" for="member-name">Name</label>
      <input type="text" id="member-name" required />

      <label class="label-required" for="member-email">Email</label>
      <input type="email" id="member-email" required />

      <label class="label-required" for="member-password">Temporary Password</label>
      <input type="password" id="member-password" required minlength="6" />

      <label class="label-required" for="member-role">Role</label>
      <select id="member-role" required>
        <option value="crew">Crew</option>
        <option value="supervisor">Supervisor</option>
      </select>

      <label for="member-rate">Hourly Rate ($, optional)</label>
      <input type="number" id="member-rate" min="0" step="0.01" placeholder="Applied automatically to hours they log" />

      <label for="member-phone">Phone (optional)</label>
      <input type="tel" id="member-phone" />

      <div class="form-actions">
        <button type="submit">Add Team Member</button>
      </div>
    </form>

    <p id="team-form-error" class="error" hidden></p>

    <div id="team-list" class="job-list">
      <p class="placeholder">Loading team&hellip;</p>
    </div>
  `;

  const form = container.querySelector("#new-member-form");
  const errorEl = container.querySelector("#team-form-error");
  const listEl = container.querySelector("#team-list");

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    errorEl.hidden = true;
    const rateValue = container.querySelector("#member-rate").value;

    try {
      await createTeamMember({
        businessId,
        name: container.querySelector("#member-name").value.trim(),
        email: container.querySelector("#member-email").value.trim(),
        password: container.querySelector("#member-password").value,
        role: container.querySelector("#member-role").value,
        phone: container.querySelector("#member-phone").value.trim(),
        hourlyRate: rateValue ? parseFloat(rateValue) : null,
      });
      form.reset();
      await loadTeam();
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.hidden = false;
    }
  });

  async function loadTeam() {
    listEl.innerHTML = `<p class="placeholder">Loading team&hellip;</p>`;
    const members = await getTeamMembers(businessId);

    if (members.length === 0) {
      listEl.innerHTML = `<p class="placeholder">No team members yet.</p>`;
      return;
    }

    listEl.innerHTML = "";
    members.forEach((member) => listEl.appendChild(buildMemberRow(member)));
  }

  function buildMemberRow(member) {
    const row = document.createElement("div");
    row.className = "job-card";
    const isOwner = member.role === "owner";
    const hasRate = member.default_hourly_rate != null;

    row.innerHTML = `
      <div class="job-card-main">
        <h3>${escapeHtml(member.name || member.email)}</h3>
        <p class="job-meta">
          ${escapeHtml(member.email)}${member.phone ? ` &middot; ${escapeHtml(member.phone)}` : ""}
          &middot; ${member.active ? "Active" : "Inactive"}
          ${!isOwner ? ` &middot; ${hasRate ? `$${member.default_hourly_rate}/hr` : "no rate set"}` : ""}
        </p>
      </div>
      <div class="job-card-actions">
        ${
          isOwner
            ? `<span class="status-badge status-active">Owner</span>`
            : `<select class="role-select">
                <option value="crew" ${member.role === "crew" ? "selected" : ""}>Crew</option>
                <option value="supervisor" ${member.role === "supervisor" ? "selected" : ""}>Supervisor</option>
              </select>
              <button type="button" class="secondary-btn edit-rate-btn">
                ${hasRate ? "Edit Rate" : "Set Rate"}
              </button>
              <button type="button" class="secondary-btn toggle-active-btn">
                ${member.active ? "Deactivate" : "Reactivate"}
              </button>`
        }
      </div>
    `;

    if (!isOwner) {
      row.querySelector(".role-select").addEventListener("change", async (event) => {
        await updateTeamMember(businessId, member.id, { role: event.target.value });
        await loadTeam();
      });

      row.querySelector(".toggle-active-btn").addEventListener("click", async () => {
        await updateTeamMember(businessId, member.id, { active: !member.active });
        await loadTeam();
      });

      row.querySelector(".edit-rate-btn").addEventListener("click", () => {
        showRateEditForm(row, member);
      });
    }

    return row;
  }

  function showRateEditForm(row, member) {
    const hasRate = member.default_hourly_rate != null;
    row.innerHTML = `
      <div class="job-card-main rate-edit-form">
        <label for="rate-input-${member.id}">Hourly Rate ($) for ${escapeHtml(member.name || member.email)}</label>
        <input type="number" id="rate-input-${member.id}" min="0" step="0.01"
          value="${hasRate ? member.default_hourly_rate : ""}" />
      </div>
      <div class="job-card-actions">
        <button type="button" class="save-rate-btn">Save</button>
        <button type="button" class="secondary-btn cancel-rate-btn">Cancel</button>
      </div>
    `;

    row.querySelector(".save-rate-btn").addEventListener("click", async () => {
      const value = row.querySelector(`#rate-input-${member.id}`).value;
      await updateTeamMember(businessId, member.id, {
        default_hourly_rate: value ? parseFloat(value) : null,
      });
      await loadTeam();
    });

    row.querySelector(".cancel-rate-btn").addEventListener("click", () => loadTeam());
  }

  loadTeam();
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}
