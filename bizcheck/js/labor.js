// labor.js
// -----------------------------------------------------------------------
// Create/read LaborEntry records, scoped to a business + job.
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
  where,
  orderBy,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

/**
 * Logs hours worked by a crew member on a job.
 * hourlyRate is optional — some owners may not track a per-entry rate.
 */
export async function addLaborEntry(businessId, jobId, { userId, date, hours, hourlyRate }) {
  const laborRef = collection(db, paths.laborEntries(businessId, jobId));
  const docRef = await addDoc(laborRef, {
    user_id: userId,
    date: date || serverTimestamp(),
    hours: hours || 0,
    hourly_rate: hourlyRate ?? null,
  });
  return docRef.id;
}

/** Fetches a single labor entry by id. */
export async function getLaborEntry(businessId, jobId, laborEntryId) {
  const snapshot = await getDoc(doc(db, paths.laborEntry(businessId, jobId, laborEntryId)));
  return snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null;
}

/** Fetches all labor entries logged against a job, newest first. */
export async function getLaborEntriesForJob(businessId, jobId) {
  const q = query(collection(db, paths.laborEntries(businessId, jobId)), orderBy("date", "desc"));
  return docsToArray(await getDocs(q));
}

/** Fetches labor entries for a job filtered to one crew member. */
export async function getLaborEntriesByUser(businessId, jobId, userId) {
  const q = query(
    collection(db, paths.laborEntries(businessId, jobId)),
    where("user_id", "==", userId),
    orderBy("date", "desc")
  );
  return docsToArray(await getDocs(q));
}

/** Applies a partial update to a labor entry. */
export function updateLaborEntry(businessId, jobId, laborEntryId, updates) {
  return updateDoc(doc(db, paths.laborEntry(businessId, jobId, laborEntryId)), updates);
}

/**
 * Computes total labor cost (hours * hourly_rate) across a list of entries.
 * Entries missing hourly_rate are skipped from the cost total.
 */
export function sumLaborCost(laborEntries) {
  return laborEntries.reduce((total, entry) => {
    if (entry.hourly_rate == null) return total;
    return total + entry.hours * entry.hourly_rate;
  }, 0);
}

/** Sums total hours across a list of labor entries, regardless of rate. */
export function sumLaborHours(laborEntries) {
  return laborEntries.reduce((total, entry) => total + (entry.hours || 0), 0);
}

// --- internal helpers -----------------------------------------------------

function docsToArray(querySnapshot) {
  const results = [];
  querySnapshot.forEach((docSnap) => results.push({ id: docSnap.id, ...docSnap.data() }));
  return results;
}
