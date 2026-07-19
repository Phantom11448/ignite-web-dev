// bulletin-screen.js
// -----------------------------------------------------------------------
// Renders the company-wide Bulletin Board: a simple feed of text/photo
// posts, newest first. Unlike every other screen in the app, this one has
// no role gating on who can see or post — owner, supervisor, and crew all
// get the exact same view. The only role-based UI decision here is who
// gets a Delete button on a given post, which mirrors firestore.rules'
// bulletin_posts delete condition: the post's own author, or anyone
// supervisor/owner. That match is enforced for real by the rules — this
// is just keeping the UI from showing a button that would fail anyway.
// -----------------------------------------------------------------------

import { createPost, getPosts, updatePost, deletePost } from "../bulletin.js";
import { uploadBulletinPhoto } from "../photos.js";

/**
 * Renders the Bulletin Board screen into `container`. userName is stamped
 * onto new posts as posted_by_name (denormalized at post time — see
 * bulletin.js) so the feed never needs to look up the poster's profile.
 */
export function renderBulletinScreen(container, { businessId, userId, userName, role }) {
  const canDeleteAny = role === "owner" || role === "supervisor";

  container.innerHTML = `
    <div class="screen-header">
      <h2>Bulletin Board</h2>
    </div>

    <form id="new-post-form" class="panel-form">
      <label for="post-text">Post something to the whole team (optional)</label>
      <input type="text" id="post-text" placeholder="e.g. Office closed Friday for the holiday" />

      <label for="post-photo">Photo (optional)</label>
      <input type="file" id="post-photo" accept="image/*" capture="environment" />

      <p class="field-hint error" id="post-error" hidden>Add a photo or a message before posting.</p>

      <div class="form-actions">
        <button type="submit" id="post-submit-btn">Post</button>
      </div>
      <p class="field-hint" id="post-upload-status" hidden></p>
    </form>

    <div id="bulletin-list" class="job-list">
      <p class="placeholder">Loading posts&hellip;</p>
    </div>
  `;

  const form = container.querySelector("#new-post-form");
  const textInput = container.querySelector("#post-text");
  const photoInput = container.querySelector("#post-photo");
  const errorEl = container.querySelector("#post-error");
  const statusEl = container.querySelector("#post-upload-status");
  const submitBtn = container.querySelector("#post-submit-btn");
  const listEl = container.querySelector("#bulletin-list");

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const text = textInput.value.trim();
    const photoFile = photoInput.files[0] || null;

    // Same rule as job notes: a post with neither a photo nor text
    // wouldn't mean anything to anyone reading the feed.
    if (!text && !photoFile) {
      errorEl.hidden = false;
      return;
    }
    errorEl.hidden = true;
    submitBtn.disabled = true;

    // Create the post doc first to get a postId to scope the Cloudinary
    // folder under, then attach the photo URL afterward if one was picked
    // — same two-step pattern as expenses and job notes.
    const postId = await createPost(businessId, {
      text: text || null,
      photoUrl: null,
      postedBy: userId,
      postedByName: userName,
    });

    if (photoFile) {
      statusEl.textContent = "Uploading photo…";
      statusEl.hidden = false;
      try {
        const photoUrl = await uploadBulletinPhoto(businessId, postId, photoFile);
        await updatePost(businessId, postId, { photo_url: photoUrl });
      } catch (err) {
        console.error("Bulletin photo upload failed:", err);
        statusEl.textContent = "Post saved, but the photo failed to upload.";
        submitBtn.disabled = false;
        return;
      }
    }

    form.reset();
    submitBtn.disabled = false;
    statusEl.hidden = true;
    await loadPosts();
  });

  async function loadPosts() {
    listEl.innerHTML = `<p class="placeholder">Loading posts&hellip;</p>`;
    const posts = await getPosts(businessId);

    if (posts.length === 0) {
      listEl.innerHTML = `<p class="placeholder">No posts yet. Be the first to share something with the team.</p>`;
      return;
    }

    listEl.innerHTML = "";
    posts.forEach((post) => listEl.appendChild(buildPostCard(post)));
  }

  function buildPostCard(post) {
    const card = document.createElement("div");
    card.className = "job-card bulletin-post";
    const date = toDate(post.date);
    const canDelete = canDeleteAny || post.posted_by === userId;

    card.innerHTML = `
      <div class="job-card-main">
        <p class="bulletin-post-meta">
          <strong>${escapeHtml(post.posted_by_name || "Unknown")}</strong>
          ${date ? ` &middot; ${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : ""}
        </p>
        ${post.text ? `<p class="bulletin-post-text">${escapeHtml(post.text)}</p>` : ""}
        ${post.photo_url ? `<img class="bulletin-post-photo" src="${escapeHtml(post.photo_url)}" alt="Bulletin post photo" />` : ""}
      </div>
      ${
        canDelete
          ? `<div class="job-card-actions">
              <button type="button" class="secondary-btn delete-post-btn">Delete</button>
            </div>`
          : ""
      }
    `;

    const deleteBtn = card.querySelector(".delete-post-btn");
    if (deleteBtn) {
      deleteBtn.addEventListener("click", async () => {
        await deletePost(businessId, post.id);
        await loadPosts();
      });
    }

    return card;
  }

  loadPosts();
}

// --- internal helpers -----------------------------------------------------

function toDate(value) {
  if (!value) return null;
  if (typeof value.toDate === "function") return value.toDate();
  return new Date(value);
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}
