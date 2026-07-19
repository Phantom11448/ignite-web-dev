// categories-screen.js
// -----------------------------------------------------------------------
// Renders the Categories screen into a container element. Categories are
// entirely business-defined (no trade-specific presets baked in) — this
// screen is just add/list/delete against categories.js.
// -----------------------------------------------------------------------

import { createCategory, getCategories, deleteCategory } from "../categories.js";

export function renderCategoriesScreen(container, { businessId }) {
  container.innerHTML = `
    <div class="screen-header">
      <h2>Categories</h2>
    </div>

    <form id="new-category-form" class="panel-form panel-form-inline">
      <div class="inline-field">
        <label class="label-required" for="category-name">Category Name</label>
        <input type="text" id="category-name" placeholder="e.g. Fuel, Materials, Permits" required />
      </div>
      <button type="submit">Add Category</button>
    </form>

    <div id="categories-list" class="job-list">
      <p class="placeholder">Loading categories&hellip;</p>
    </div>
  `;

  const form = container.querySelector("#new-category-form");
  const nameInput = container.querySelector("#category-name");
  const listEl = container.querySelector("#categories-list");

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const name = nameInput.value.trim();
    if (!name) return;

    await createCategory(businessId, name);
    form.reset();
    await loadCategories();
  });

  async function loadCategories() {
    listEl.innerHTML = `<p class="placeholder">Loading categories&hellip;</p>`;
    const categories = await getCategories(businessId);

    if (categories.length === 0) {
      listEl.innerHTML = `<p class="placeholder">No categories yet. Add your first one above.</p>`;
      return;
    }

    listEl.innerHTML = "";
    categories.forEach((category) => listEl.appendChild(buildCategoryRow(category)));
  }

  function buildCategoryRow(category) {
    const row = document.createElement("div");
    row.className = "job-card category-row";
    row.innerHTML = `
      <div class="job-card-main">
        <h3>${escapeHtml(category.name)}</h3>
      </div>
      <div class="job-card-actions">
        <button type="button" class="secondary-btn delete-category-btn">Delete</button>
      </div>
    `;

    row.querySelector(".delete-category-btn").addEventListener("click", async () => {
      await deleteCategory(businessId, category.id);
      await loadCategories();
    });

    return row;
  }

  loadCategories();
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}
