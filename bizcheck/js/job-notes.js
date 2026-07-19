// job-notes.js
// -----------------------------------------------------------------------
// Create/read Job Note records, scoped to a business + job. Mirrors
// expenses.js's structure — free-form jobsite documentation (a photo, a
// text note, or both) instead of a financial entry. Open to every role,
// including crew: there's no dollar figure here to restrict.
// -----------------------------------------------------------------------

import { db, paths } from "./firebase-config.js";
import {
  collection,
  doc,
  addDoc,
  getDoc,
  getDocs,
  updateDoc,
  query,
  orderBy,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

/**
 * Logs a new jobsite note. At least one of text/photoUrl should be
 * provided (enforced in the UI, not here) — a note with neither wouldn't
 * mean anything.
 */
export async function addJobNote(businessId, jobId, { text, photoUrl, loggedBy }) {
  const notesRef = collection(db, paths.jobNotes(businessId, jobId));
  const docRef = await addDoc(notesRef, {
    text: text || null,
    photo_url: photoUrl || null,
    logged_by: loggedBy,
    date: serverTimestamp(),
  });
  return docRef.id;
}

/** Fetches a single job note by id. */
export async function getJobNote(businessId, jobId, noteId) {
  const snapshot = await getDoc(doc(db, paths.jobNote(businessId, jobId, noteId)));
  return snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null;
}

/** Fetches all notes logged against a job, newest first. */
export async function getJobNotesForJob(businessId, jobId) {
  const q = query(collection(db, paths.jobNotes(businessId, jobId)), orderBy("date", "desc"));
  return docsToArray(await getDocs(q));
}

/** Applies a partial update to a job note (e.g. attaching a photo_url after upload). */
export function updateJobNote(businessId, jobId, noteId, updates) {
  return updateDoc(doc(db, paths.jobNote(businessId, jobId, noteId)), updates);
}

// --- internal helpers -----------------------------------------------------

function docsToArray(querySnapshot) {
  const results = [];
  querySnapshot.forEach((docSnap) => results.push({ id: docSnap.id, ...docSnap.data() }));
  return results;
}
