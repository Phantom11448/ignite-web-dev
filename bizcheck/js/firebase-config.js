// firebase-config.js
// -----------------------------------------------------------------------
// Firebase initialization for BizCheck.
// Uses the Firebase Modular (v10) SDK loaded directly from the CDN as
// native ES modules — no bundler required. Every other JS module imports
// `db`, `auth`, and `paths` from this file.
// -----------------------------------------------------------------------

import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// -----------------------------------------------------------------------
// >>> MANUAL STEP <<<
// Replace every value below with the config from your Firebase project:
// Firebase Console > Project Settings > General > Your apps > SDK setup and configuration
// -----------------------------------------------------------------------
const firebaseConfig = {
  apiKey: "AIzaSyAyaP6scwSUp2lsTU_T_TbKvhV-y1A_IMo",
  authDomain: "bizcheck-19d9c.firebaseapp.com",
  projectId: "bizcheck-19d9c",
  // storageBucket intentionally omitted — Firebase Storage was never
  // enabled for this project (billing hold; see photos.js). Receipt
  // photos go to Cloudinary instead, which doesn't need anything here.
  messagingSenderId: "246679911633",
  appId: "1:246679911633:web:3a93c770a21ea30d2b99f0",
  measurementId: "G-VMQDB25V7F",
};
// -----------------------------------------------------------------------

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);

// -----------------------------------------------------------------------
// Secondary app instance, used ONLY when an owner/supervisor creates a new
// team member's account. Firebase's client SDK only tracks one signed-in
// user per app instance — calling createUserWithEmailAndPassword on the
// PRIMARY auth would sign the owner out and sign them in as the new hire.
// Running that call against this isolated secondary app instead leaves the
// owner's own session (on `auth` above) completely untouched. See
// auth.js's createTeamMember for how this gets used.
// -----------------------------------------------------------------------
const SECONDARY_APP_NAME = "BizCheckSecondary";

export function getSecondaryAuth() {
  const existing = getApps().find((a) => a.name === SECONDARY_APP_NAME);
  const secondaryApp = existing || initializeApp(firebaseConfig, SECONDARY_APP_NAME);
  return getAuth(secondaryApp);
}

// -----------------------------------------------------------------------
// FIRESTORE DATA MODEL (reference only — Firestore is schemaless, this
// comment documents the shape every module reads/writes so the structure
// stays consistent across jobs.js, expenses.js, labor.js, categories.js,
// auth.js, and dashboard.js).
// -----------------------------------------------------------------------
/*
businesses/{businessId}
  - name: string
  - trade_type: string          ("moving" | "hvac" | "construction" | "landscaping" | "general")
  - created_at: timestamp

businesses/{businessId}/users/{userId}
  - name: string
  - role: string                ("owner" | "supervisor" | "crew")
  - phone: string
  - email: string
  - active: boolean
  - default_hourly_rate: number | null   (set by owner/supervisor; auto-applied
                                           to labor entries this person logs so
                                           nobody has to re-enter it every time)

businesses/{businessId}/jobs/{jobId}
  - customer_name: string
  - status: string               ("active" | "complete" | "cancelled")
  - start_date: timestamp
  - end_date: timestamp | null
  - revenue_amount: number       (DEPRECATED — no longer written. Left in the
                                   schema only because pre-existing jobs may
                                   still have it. Revenue now lives entirely in
                                   the revenue_entries subcollection below; see
                                   dashboard.js's getJobProfitability, which
                                   sums revenue_entries instead of reading this
                                   field.)
  - custom_fields: map           (flexible key/value pairs — e.g. origin/destination
                                   for moving, site_address for construction/HVAC/
                                   landscaping. Never hardcode these keys in app logic.)
  - created_by: userId
  - created_at: timestamp

businesses/{businessId}/categories/{categoryId}
  - name: string
  - created_at: timestamp

businesses/{businessId}/jobs/{jobId}/expenses/{expenseId}
  - category_id: string
  - amount: number
  - date: timestamp
  - photo_url: string | null
  - logged_by: userId
  - notes: string | null

businesses/{businessId}/jobs/{jobId}/labor_entries/{laborEntryId}
  - user_id: string
  - date: timestamp
  - hours: number
  - hourly_rate: number | null

businesses/{businessId}/jobs/{jobId}/revenue_entries/{revenueEntryId}
  - amount: number                (positive = price increase/change order,
                                    negative = discount/reduction)
  - date: timestamp
  - reason: string | null         (optional note, e.g. "added extra room")
  - logged_by: userId
  A running log instead of a single static number, so change orders,
  negotiated increases, and discounts are all visible over time. A job's
  revenue is always sum(revenue_entries.amount) — see revenue-entries.js
  and dashboard.js. The job's very first agreed price is just the first
  entry in this log (written at job creation — see jobs-screen.js), not a
  special case.

businesses/{businessId}/jobs/{jobId}/job_notes/{noteId}
  - text: string | null           (at least one of text/photo_url is always
  - photo_url: string | null       set — the UI won't save a totally empty note)
  - logged_by: userId
  - date: timestamp
  Free-form jobsite documentation — progress photos, site conditions,
  anything worth noting that isn't an expense or a work hour. Unlike
  revenue, this is open to every role including crew: there's no dollar
  figure here to protect. See job-notes.js.

user_business_map/{userId}   (top-level collection, NOT under businesses/)
  - business_id: string
  Lets the app find which business a logged-in user belongs to. The owner's
  own uid happens to equal their businessId (see signUpOwner), but
  supervisor/crew accounts do NOT — their uid is unrelated to the
  businessId they were invited into. Every account gets one of these docs
  at creation time (signUpOwner and createTeamMember both write it) so
  app.html can look up the right businessId for ANY logged-in user the
  same way, instead of assuming uid === businessId.

RECEIPT PHOTOS — uploaded to Cloudinary, NOT Firebase Storage (Firebase
Storage requires the Blaze billing plan, which hit an account-level hold
during setup — see photos.js for the full story and the Cloudinary
upload function). The resulting URL gets written onto the matching
expense doc's photo_url field via updateExpense().
*/

// -----------------------------------------------------------------------
// Collection/document path helpers. Every module builds Firestore paths
// through these so the structure only changes in one place if it ever does.
// -----------------------------------------------------------------------
export const paths = {
  business: (businessId) => `businesses/${businessId}`,
  users: (businessId) => `businesses/${businessId}/users`,
  user: (businessId, userId) => `businesses/${businessId}/users/${userId}`,
  jobs: (businessId) => `businesses/${businessId}/jobs`,
  job: (businessId, jobId) => `businesses/${businessId}/jobs/${jobId}`,
  categories: (businessId) => `businesses/${businessId}/categories`,
  category: (businessId, categoryId) => `businesses/${businessId}/categories/${categoryId}`,
  expenses: (businessId, jobId) => `businesses/${businessId}/jobs/${jobId}/expenses`,
  expense: (businessId, jobId, expenseId) =>
    `businesses/${businessId}/jobs/${jobId}/expenses/${expenseId}`,
  laborEntries: (businessId, jobId) => `businesses/${businessId}/jobs/${jobId}/labor_entries`,
  laborEntry: (businessId, jobId, laborEntryId) =>
    `businesses/${businessId}/jobs/${jobId}/labor_entries/${laborEntryId}`,
  revenueEntries: (businessId, jobId) => `businesses/${businessId}/jobs/${jobId}/revenue_entries`,
  revenueEntry: (businessId, jobId, revenueEntryId) =>
    `businesses/${businessId}/jobs/${jobId}/revenue_entries/${revenueEntryId}`,
  jobNotes: (businessId, jobId) => `businesses/${businessId}/jobs/${jobId}/job_notes`,
  jobNote: (businessId, jobId, noteId) => `businesses/${businessId}/jobs/${jobId}/job_notes/${noteId}`,
  userBusinessMap: (userId) => `user_business_map/${userId}`,
};
