// revenue-entries.js
// -----------------------------------------------------------------------
// Create/read Revenue Entry records, scoped to a business + job. Mirrors
// expenses.js's structure exactly — revenue is tracked the same way
// expenses are: a running log of entries instead of one static number,
// so change orders, negotiated price increases, and discounts are all
// visible over time instead of overwriting each other.
//
// Only owner/supervisor may create/update/delete entries here — see
// firestore.rules for the enforced backstop and job-detail-screen.js /
// jobs-screen.js for the UI-side gate. Crew never gets this action.
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
 * Logs a revenue change against a job. Use a positive amount for a price
 * increase (change order, upsell, the job's initial agreed price) and a
 * negative amount for a discount/reduction — unlike expenses/labor hours,
 * amount is intentionally NOT restricted to non-negative here. It's still
 * coerced to a number and validated as a real number (not just left to
 * `amount || 0`, which only catches falsy values — a truthy non-numeric
 * string would otherwise pass through unchanged and later silently corrupt
 * sumRevenueEntries() via NaN propagation). Throws instead of writing bad
 * data; callers should catch this and show the message inline.
 */
export async function addRevenueEntry(
  businessId,
  jobId,
  { amount, date, reason, loggedBy }
) {
  const numericAmount = Number(amount);
  if (isNaN(numericAmount)) {
    throw new Error("Amount must be a valid number.");
  }
  const revenueEntriesRef = collection(db, paths.revenueEntries(businessId, jobId));
  const docRef = await addDoc(revenueEntriesRef, {
    amount: numericAmount,
    date: date || serverTimestamp(),
    reason: reason || null,
    logged_by: loggedBy,
  });
  return docRef.id;
}

/** Fetches a single revenue entry by id. */
export async function getRevenueEntry(businessId, jobId, revenueEntryId) {
  const snapshot = await getDoc(doc(db, paths.revenueEntry(businessId, jobId, revenueEntryId)));
  return snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null;
}

/** Fetches all revenue entries logged against a job, newest first. */
export async function getRevenueEntriesForJob(businessId, jobId) {
  const q = query(collection(db, paths.revenueEntries(businessId, jobId)), orderBy("date", "desc"));
  return docsToArray(await getDocs(q));
}

/** Applies a partial update to a revenue entry (e.g. correcting the amount). */
export function updateRevenueEntry(businessId, jobId, revenueEntryId, updates) {
  return updateDoc(doc(db, paths.revenueEntry(businessId, jobId, revenueEntryId)), updates);
}

/** Sums the amount field across a list of revenue entries (e.g. from getRevenueEntriesForJob). */
export function sumRevenueEntries(revenueEntries) {
  return revenueEntries.reduce((total, entry) => total + (entry.amount || 0), 0);
}

// --- internal helpers -----------------------------------------------------

function docsToArray(querySnapshot) {
  const results = [];
  querySnapshot.forEach((docSnap) => results.push({ id: docSnap.id, ...docSnap.data() }));
  return results;
}
