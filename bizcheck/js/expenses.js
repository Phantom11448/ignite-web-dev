// expenses.js
// -----------------------------------------------------------------------
// Create/read Expense records, scoped to a business + job.
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
 * Logs a new expense against a job. categoryId refers to a categories/{id} doc.
 * amount is coerced to a number and validated here (not just left to
 * `amount || 0`, which only catches falsy values — a truthy non-numeric
 * string like "abc" would otherwise pass through unchanged and later
 * silently corrupt sumExpenses()'s running total). Throws instead of
 * writing bad data; callers should catch this and show the message inline
 * rather than letting a malformed request reach Firestore only to be
 * rejected by firestore.rules with a generic permission error.
 */
export async function addExpense(
  businessId,
  jobId,
  { categoryId, amount, date, photoUrl, loggedBy, notes }
) {
  const numericAmount = Number(amount);
  if (isNaN(numericAmount) || numericAmount < 0) {
    throw new Error("Amount must be a valid non-negative number.");
  }
  const expensesRef = collection(db, paths.expenses(businessId, jobId));
  const docRef = await addDoc(expensesRef, {
    category_id: categoryId,
    amount: numericAmount,
    date: date || serverTimestamp(),
    photo_url: photoUrl || null,
    logged_by: loggedBy,
    notes: notes || null,
  });
  return docRef.id;
}

/** Fetches a single expense by id. */
export async function getExpense(businessId, jobId, expenseId) {
  const snapshot = await getDoc(doc(db, paths.expense(businessId, jobId, expenseId)));
  return snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null;
}

/** Fetches all expenses logged against a job, newest first. */
export async function getExpensesForJob(businessId, jobId) {
  const q = query(collection(db, paths.expenses(businessId, jobId)), orderBy("date", "desc"));
  return docsToArray(await getDocs(q));
}

/** Fetches expenses for a job filtered to one category. */
export async function getExpensesByCategory(businessId, jobId, categoryId) {
  const q = query(
    collection(db, paths.expenses(businessId, jobId)),
    where("category_id", "==", categoryId),
    orderBy("date", "desc")
  );
  return docsToArray(await getDocs(q));
}

/** Applies a partial update to an expense (e.g. correcting the amount). */
export function updateExpense(businessId, jobId, expenseId, updates) {
  return updateDoc(doc(db, paths.expense(businessId, jobId, expenseId)), updates);
}

/** Sums the amount field across a list of expenses (e.g. from getExpensesForJob). */
export function sumExpenses(expenses) {
  return expenses.reduce((total, expense) => total + (expense.amount || 0), 0);
}

// --- internal helpers -----------------------------------------------------

function docsToArray(querySnapshot) {
  const results = [];
  querySnapshot.forEach((docSnap) => results.push({ id: docSnap.id, ...docSnap.data() }));
  return results;
}
