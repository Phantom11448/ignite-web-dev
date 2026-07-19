// jobs.js
// -----------------------------------------------------------------------
// Create/read/update Job records. Each function is small and
// single-purpose so pieces can be found/replaced independently later.
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
 * Creates a new job under a business. Does NOT set any revenue — a job
 * starts with zero revenue_entries, and its initial agreed price gets
 * logged as the first entry by the caller (see jobs-screen.js), the same
 * way every later change order or discount gets logged. This keeps
 * createJob single-purpose and revenue entirely owned by
 * revenue-entries.js.
 *
 * customFields is a flexible map — e.g. { origin, destination } for moving,
 * or { site_address } for construction/HVAC/landscaping. Never hardcode
 * trade-specific keys here; the caller decides what goes in custom_fields.
 */
export async function createJob(businessId, { customerName, startDate, customFields, createdBy }) {
  const jobsRef = collection(db, paths.jobs(businessId));
  const docRef = await addDoc(jobsRef, {
    customer_name: customerName,
    status: "active",
    start_date: startDate,
    end_date: null,
    custom_fields: customFields || {},
    created_by: createdBy,
    created_at: serverTimestamp(),
  });
  return docRef.id;
}

/** Fetches a single job by id. */
export async function getJob(businessId, jobId) {
  const snapshot = await getDoc(doc(db, paths.job(businessId, jobId)));
  return snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null;
}

/** Fetches all jobs for a business, newest first. */
export async function getAllJobs(businessId) {
  const q = query(collection(db, paths.jobs(businessId)), orderBy("created_at", "desc"));
  return docsToArray(await getDocs(q));
}

/** Fetches only jobs with status "active". */
export function getActiveJobs(businessId) {
  return getJobsByStatus(businessId, "active");
}

/** Fetches only jobs with status "complete". */
export function getCompletedJobs(businessId) {
  return getJobsByStatus(businessId, "complete");
}

/** Fetches jobs filtered by an arbitrary status value. */
export async function getJobsByStatus(businessId, status) {
  const q = query(
    collection(db, paths.jobs(businessId)),
    where("status", "==", status),
    orderBy("created_at", "desc")
  );
  return docsToArray(await getDocs(q));
}

/** Applies a partial update to a job (e.g. { revenue_amount: 500 }). */
export function updateJob(businessId, jobId, updates) {
  return updateDoc(doc(db, paths.job(businessId, jobId)), updates);
}

/** Marks a job complete and stamps its end_date. */
export function completeJob(businessId, jobId, endDate) {
  return updateJob(businessId, jobId, { status: "complete", end_date: endDate || new Date() });
}

/** Marks a job cancelled. */
export function cancelJob(businessId, jobId) {
  return updateJob(businessId, jobId, { status: "cancelled" });
}

/** Merges one key into a job's custom_fields map without wiping existing ones. */
export async function setCustomField(businessId, jobId, key, value) {
  const job = await getJob(businessId, jobId);
  const customFields = { ...(job?.custom_fields || {}), [key]: value };
  return updateJob(businessId, jobId, { custom_fields: customFields });
}

// --- internal helpers -----------------------------------------------------

function docsToArray(querySnapshot) {
  const results = [];
  querySnapshot.forEach((docSnap) => results.push({ id: docSnap.id, ...docSnap.data() }));
  return results;
}
