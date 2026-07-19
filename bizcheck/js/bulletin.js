// bulletin.js
// -----------------------------------------------------------------------
// Create/read/delete company-wide Bulletin Board posts, scoped to a
// business (not a job — this is the one feature every role sees the same
// version of, regardless of which job they're on). Mirrors expenses.js's
// structure.
// -----------------------------------------------------------------------

import { db, paths } from "./firebase-config.js";
import {
  collection,
  doc,
  addDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

/**
 * Creates a new bulletin post. postedByName is denormalized at post time
 * (not looked up live) so the feed keeps showing the right name even if
 * that team member is later deactivated or renamed.
 */
export async function createPost(businessId, { text, photoUrl, postedBy, postedByName }) {
  const postsRef = collection(db, paths.bulletinPosts(businessId));
  const docRef = await addDoc(postsRef, {
    text: text || null,
    photo_url: photoUrl || null,
    posted_by: postedBy,
    posted_by_name: postedByName,
    date: serverTimestamp(),
  });
  return docRef.id;
}

/** Fetches all bulletin posts for a business, newest first. */
export async function getPosts(businessId) {
  const q = query(collection(db, paths.bulletinPosts(businessId)), orderBy("date", "desc"));
  return docsToArray(await getDocs(q));
}

/** Applies a partial update to a post (used right now only to attach a
 * photo_url once the Cloudinary upload finishes after the post doc is
 * already created — see bulletin-screen.js's two-step post flow). */
export function updatePost(businessId, postId, updates) {
  return updateDoc(doc(db, paths.bulletinPost(businessId, postId)), updates);
}

/** Deletes a bulletin post. Firestore rules are the real enforcement here —
 * this just performs the delete once the UI has already decided it's allowed. */
export function deletePost(businessId, postId) {
  return deleteDoc(doc(db, paths.bulletinPost(businessId, postId)));
}

// --- internal helpers -----------------------------------------------------

function docsToArray(querySnapshot) {
  const results = [];
  querySnapshot.forEach((docSnap) => results.push({ id: docSnap.id, ...docSnap.data() }));
  return results;
}
