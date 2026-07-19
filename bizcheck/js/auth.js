// auth.js
// -----------------------------------------------------------------------
// Login / signup logic. Handles Firebase Auth accounts and the matching
// business/user records in Firestore. No UI rendering here — call these
// functions from your screen scripts and handle the DOM yourself.
// -----------------------------------------------------------------------

import { auth, db, paths, getSecondaryAuth } from "./firebase-config.js";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence,
  browserSessionPersistence,
  sendPasswordResetEmail,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  updateDoc,
  orderBy,
  query,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

/**
 * Creates a brand-new business + owner account.
 * Use this for the very first signup for a company (the owner).
 * To add crew/supervisor accounts under an existing business, use
 * createTeamMember() instead.
 */
export async function signUpOwner({ email, password, businessName, tradeType, name, phone }) {
  const credential = await createUserWithEmailAndPassword(auth, email, password);
  const userId = credential.user.uid;
  const businessId = userId; // owner's uid doubles as the businessId for simplicity

  await setDoc(doc(db, paths.business(businessId)), {
    name: businessName,
    trade_type: tradeType, // "moving" | "hvac" | "construction" | "landscaping" | "general"
    created_at: serverTimestamp(),
  });

  await setDoc(doc(db, paths.user(businessId, userId)), {
    name: name || "",
    role: "owner",
    phone: phone || "",
    email,
    active: true,
  });

  await setDoc(doc(db, paths.userBusinessMap(userId)), { business_id: businessId });

  return { userId, businessId };
}

/**
 * Adds a supervisor/crew account under an existing business. Called by an
 * owner from the Team screen while the owner stays logged in.
 *
 * Uses an isolated secondary Firebase app instance (see
 * firebase-config.js's getSecondaryAuth) to create the new Auth account,
 * so this does NOT sign the owner out of their own session — only the
 * secondary instance's session is briefly touched, then signed out.
 * The Firestore profile doc itself is written using the owner's own
 * (primary) session, which is what Firestore rules require for one
 * business member to create another member's profile doc.
 */
export async function createTeamMember({ businessId, email, password, name, role, phone, hourlyRate }) {
  const secondaryAuth = getSecondaryAuth();
  const credential = await createUserWithEmailAndPassword(secondaryAuth, email, password);
  const userId = credential.user.uid;
  await signOut(secondaryAuth); // done with the secondary session, doesn't touch the owner's

  await setDoc(doc(db, paths.user(businessId, userId)), {
    name: name || "",
    role, // "supervisor" | "crew"
    phone: phone || "",
    email,
    active: true,
    default_hourly_rate: hourlyRate ?? null,
  });

  await setDoc(doc(db, paths.userBusinessMap(userId)), { business_id: businessId });

  return { userId };
}

/**
 * Logs an existing user in.
 * rememberMe (default true) keeps the session alive across browser restarts —
 * uncheck it on shared/kiosk devices (e.g. a crew tablet) so the session ends
 * when the browser closes instead of staying logged in indefinitely.
 */
export async function logIn(email, password, rememberMe = true) {
  await setPersistence(auth, rememberMe ? browserLocalPersistence : browserSessionPersistence);
  const credential = await signInWithEmailAndPassword(auth, email, password);
  return credential.user;
}

/** Logs the current user out. */
export function logOut() {
  return signOut(auth);
}

/**
 * Sends a password reset email via Firebase Auth's built-in hosted flow —
 * Firebase handles the actual password-change step securely on its own
 * hosted page; this only triggers the email. Works for owner, supervisor,
 * or crew accounts alike (they're all just Firebase Auth users).
 *
 * Throws the same way logIn/signUpOwner do on failure (a malformed email,
 * a network error, rate limiting). IMPORTANT: depending on the Firebase
 * project's email enumeration protection setting, this may also throw
 * auth/user-not-found for an email with no account — callers MUST treat
 * that specific error identically to success (same generic on-screen
 * message) rather than surfacing it, or this becomes an account
 * enumeration vector. See index.html's reset-password submit handler for
 * where that's handled.
 */
export function sendPasswordReset(email) {
  return sendPasswordResetEmail(auth, email);
}

/** Subscribes to auth state changes. Returns the unsubscribe function. */
export function observeAuthState(callback) {
  return onAuthStateChanged(auth, callback);
}

/**
 * Looks up which business a logged-in user belongs to. Call this first,
 * right after login, to get the businessId needed by every other function
 * in the app — do NOT assume uid === businessId (only true for owners).
 * Returns null if this uid has no business mapping (shouldn't normally
 * happen, but treat it as "not part of any business" if it does).
 */
export async function getBusinessIdForUser(userId) {
  const snapshot = await getDoc(doc(db, paths.userBusinessMap(userId)));
  return snapshot.exists() ? snapshot.data().business_id : null;
}

/**
 * Looks up the business/user profile doc for a given user + business.
 * Needed because Firebase Auth alone doesn't know the role/businessId.
 */
export async function getUserProfile(businessId, userId) {
  const snapshot = await getDoc(doc(db, paths.user(businessId, userId)));
  return snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null;
}

/** Fetches every team member profile for a business, alphabetically by name. */
export async function getTeamMembers(businessId) {
  const q = query(collection(db, paths.users(businessId)), orderBy("name"));
  const snapshot = await getDocs(q);
  const results = [];
  snapshot.forEach((docSnap) => results.push({ id: docSnap.id, ...docSnap.data() }));
  return results;
}

/** Applies a partial update to a team member's profile (role, active, phone, name). */
export function updateTeamMember(businessId, userId, updates) {
  return updateDoc(doc(db, paths.user(businessId, userId)), updates);
}
