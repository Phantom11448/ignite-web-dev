// categories.js
// -----------------------------------------------------------------------
// Per-business Category management. Categories are entirely user-defined —
// this app never ships with preset trade-specific categories baked in.
// -----------------------------------------------------------------------

import { db, paths } from "./firebase-config.js";
import {
  collection,
  doc,
  addDoc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  orderBy,
  query,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

/** Creates a new expense category for a business (e.g. "Fuel", "Materials", "Permits"). */
export async function createCategory(businessId, name) {
  const categoriesRef = collection(db, paths.categories(businessId));
  const docRef = await addDoc(categoriesRef, {
    name,
    created_at: serverTimestamp(),
  });
  return docRef.id;
}

/** Fetches a single category by id. */
export async function getCategory(businessId, categoryId) {
  const snapshot = await getDoc(doc(db, paths.category(businessId, categoryId)));
  return snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null;
}

/** Fetches all categories for a business, alphabetically. */
export async function getCategories(businessId) {
  const q = query(collection(db, paths.categories(businessId)), orderBy("name"));
  return docsToArray(await getDocs(q));
}

/** Renames a category. */
export function renameCategory(businessId, categoryId, name) {
  return updateDoc(doc(db, paths.category(businessId, categoryId)), { name });
}

/** Deletes a category. Does not touch existing expenses that reference it. */
export function deleteCategory(businessId, categoryId) {
  return deleteDoc(doc(db, paths.category(businessId, categoryId)));
}

// --- internal helpers -----------------------------------------------------

function docsToArray(querySnapshot) {
  const results = [];
  querySnapshot.forEach((docSnap) => results.push({ id: docSnap.id, ...docSnap.data() }));
  return results;
}
