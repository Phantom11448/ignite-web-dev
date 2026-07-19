// test.mjs
// -----------------------------------------------------------------------
// Local-only Firestore Rules test suite for bizcheck/firestore.rules'
// subscription/trial access gating (businessDoc/isInTrial/hasActiveAccess).
// This folder is NOT deployed with the site — see .netlifyignore at the
// repo root.
//
// SETUP (one time):
//   cd firestore-rules-tests
//   npm install
//   (requires Java 21+ on your machine — the Firestore emulator needs it;
//   firebase-tools will download the emulator itself on first run)
//
// RUN:
//   npm test
//
// IMPORTANT CONTEXT FOR WHOEVER RUNS THIS: this suite was written and
// syntax/import-checked against the real @firebase/rules-unit-testing and
// firebase packages, but could NOT actually be executed end-to-end in the
// sandboxed environment it was built in — that environment only has Java
// 11 (the emulator requires 21+) and its network allowlist blocks every
// host that serves the emulator/JDK binaries (storage.googleapis.com,
// api.adoptium.net, download.oracle.com, and even GitHub's release-asset
// CDN were all tried and blocked; only the npm registry was reachable).
// Run this yourself once locally — with real network access and a real
// JDK — to get the actual pass/fail confirmation on the deployed rules.
// -----------------------------------------------------------------------

import { test, before, after, beforeEach } from "node:test";
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} from "@firebase/rules-unit-testing";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  doc,
  setDoc,
  getDoc,
  getDocs,
  addDoc,
  collection,
  Timestamp,
} from "firebase/firestore";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DAY_MS = 24 * 60 * 60 * 1000;

let testEnv;

before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: "bizcheck-rules-test",
    firestore: {
      rules: readFileSync(path.resolve(__dirname, "../bizcheck/firestore.rules"), "utf8"),
    },
  });
});

after(async () => {
  await testEnv.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
});

/**
 * Seeds one business + its owner profile, bypassing rules entirely
 * (this is test setup being verified, not itself under test), with
 * created_at set to `daysAgo` days in the past and an optional
 * subscription_status.
 */
async function seedBusiness({ businessId, ownerUid, daysAgo, subscriptionStatus }) {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    const createdAt = Timestamp.fromMillis(Date.now() - daysAgo * DAY_MS);

    await setDoc(doc(db, `businesses/${businessId}`), {
      name: "Test Business",
      trade_type: "general",
      created_at: createdAt,
      ...(subscriptionStatus ? { subscription_status: subscriptionStatus } : {}),
    });

    await setDoc(doc(db, `businesses/${businessId}/users/${ownerUid}`), {
      name: "Test Owner",
      role: "owner",
      email: "owner@test.com",
      active: true,
    });
  });
}

// --- Core trial/subscription gating -----------------------------------

test("owner CAN read jobs while inside the 30-day trial (created_at = 5 days ago, no subscription)", async () => {
  await seedBusiness({ businessId: "biz-trial", ownerUid: "owner1", daysAgo: 5 });
  const ownerDb = testEnv.authenticatedContext("owner1").firestore();
  await assertSucceeds(getDocs(collection(ownerDb, "businesses/biz-trial/jobs")));
});

test("owner CANNOT read jobs once the trial has expired (created_at = 35 days ago, no subscription)", async () => {
  await seedBusiness({ businessId: "biz-expired", ownerUid: "owner1", daysAgo: 35 });
  const ownerDb = testEnv.authenticatedContext("owner1").firestore();
  await assertFails(getDocs(collection(ownerDb, "businesses/biz-expired/jobs")));
});

test("owner CAN read jobs past 30 days if subscription_status is active", async () => {
  await seedBusiness({
    businessId: "biz-subscribed",
    ownerUid: "owner1",
    daysAgo: 90,
    subscriptionStatus: "active",
  });
  const ownerDb = testEnv.authenticatedContext("owner1").firestore();
  await assertSucceeds(getDocs(collection(ownerDb, "businesses/biz-subscribed/jobs")));
});

// --- Boundary math — the part most likely to be subtly wrong -----------

test("boundary: 29 days 23 hours old (just inside the 30-day window) still has access", async () => {
  await seedBusiness({
    businessId: "biz-boundary-inside",
    ownerUid: "owner1",
    daysAgo: 29 + 23 / 24,
  });
  const ownerDb = testEnv.authenticatedContext("owner1").firestore();
  await assertSucceeds(getDocs(collection(ownerDb, "businesses/biz-boundary-inside/jobs")));
});

test("boundary: 30 days 1 hour old (just past the 30-day window) is denied", async () => {
  await seedBusiness({
    businessId: "biz-boundary-outside",
    ownerUid: "owner1",
    daysAgo: 30 + 1 / 24,
  });
  const ownerDb = testEnv.authenticatedContext("owner1").firestore();
  await assertFails(getDocs(collection(ownerDb, "businesses/biz-boundary-outside/jobs")));
});

// --- Gating applies on top of role checks, not instead of them ---------

test("crew CANNOT create an expense once locked out, even though the role check alone would allow it", async () => {
  await seedBusiness({ businessId: "biz-expired2", ownerUid: "owner1", daysAgo: 40 });
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, "businesses/biz-expired2/users/crew1"), {
      name: "Crew",
      role: "crew",
      email: "crew@test.com",
      active: true,
    });
    await setDoc(doc(db, "businesses/biz-expired2/jobs/job1"), {
      customer_name: "Test Job",
      status: "active",
    });
  });
  const crewDb = testEnv.authenticatedContext("crew1").firestore();
  await assertFails(
    addDoc(collection(crewDb, "businesses/biz-expired2/jobs/job1/expenses"), {
      amount: 10,
      logged_by: "crew1",
    })
  );
});

test("categories are gated the same way as jobs", async () => {
  await seedBusiness({ businessId: "biz-expired3", ownerUid: "owner1", daysAgo: 40 });
  const ownerDb = testEnv.authenticatedContext("owner1").firestore();
  await assertFails(getDocs(collection(ownerDb, "businesses/biz-expired3/categories")));
});

test("bulletin_posts are gated the same way as jobs", async () => {
  await seedBusiness({ businessId: "biz-expired4", ownerUid: "owner1", daysAgo: 40 });
  const ownerDb = testEnv.authenticatedContext("owner1").firestore();
  await assertFails(
    addDoc(collection(ownerDb, "businesses/biz-expired4/bulletin_posts"), {
      text: "hello",
      posted_by: "owner1",
      posted_by_name: "Test Owner",
    })
  );
});

// --- Explicitly NOT gated — the app needs these even while locked out --

test("the business doc itself stays readable even after lockout (needed to show the locked-out screen)", async () => {
  await seedBusiness({ businessId: "biz-expired5", ownerUid: "owner1", daysAgo: 40 });
  const ownerDb = testEnv.authenticatedContext("owner1").firestore();
  await assertSucceeds(getDoc(doc(ownerDb, "businesses/biz-expired5")));
});

test("the owner's own user profile doc stays readable even after lockout", async () => {
  await seedBusiness({ businessId: "biz-expired6", ownerUid: "owner1", daysAgo: 40 });
  const ownerDb = testEnv.authenticatedContext("owner1").firestore();
  await assertSucceeds(getDoc(doc(ownerDb, "businesses/biz-expired6/users/owner1")));
});

// --- Field-shape validation (amount/hours numeric checks, system-field
// reassignment protection) added alongside the security-audit fix that
// closed "no server-side validation on Firestore writes" ------------------
//
// All businesses below are seeded 5 days old (well inside the trial
// window) so hasActiveAccess() is never the reason a write passes or
// fails in these tests — only the new validation logic is under test.

/** Adds one team member + one job doc to an already-seeded business. */
async function seedJobAndMember({ businessId, memberUid, role, jobId = "job1" }) {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, `businesses/${businessId}/users/${memberUid}`), {
      name: `Test ${role}`,
      role,
      email: `${memberUid}@test.com`,
      active: true,
    });
    await setDoc(doc(db, `businesses/${businessId}/jobs/${jobId}`), {
      customer_name: "Test Job",
      status: "active",
    });
  });
}

// expenses ------------------------------------------------------------

test("expenses: crew CAN create an expense with a valid non-negative amount", async () => {
  await seedBusiness({ businessId: "biz-exp1", ownerUid: "owner1", daysAgo: 5 });
  await seedJobAndMember({ businessId: "biz-exp1", memberUid: "crew1", role: "crew" });
  const crewDb = testEnv.authenticatedContext("crew1").firestore();
  await assertSucceeds(
    addDoc(collection(crewDb, "businesses/biz-exp1/jobs/job1/expenses"), {
      category_id: null,
      amount: 42.5,
      logged_by: "crew1",
      notes: null,
    })
  );
});

test("expenses: crew CANNOT create an expense with a negative amount", async () => {
  await seedBusiness({ businessId: "biz-exp2", ownerUid: "owner1", daysAgo: 5 });
  await seedJobAndMember({ businessId: "biz-exp2", memberUid: "crew1", role: "crew" });
  const crewDb = testEnv.authenticatedContext("crew1").firestore();
  await assertFails(
    addDoc(collection(crewDb, "businesses/biz-exp2/jobs/job1/expenses"), {
      amount: -5,
      logged_by: "crew1",
    })
  );
});

test("expenses: crew CANNOT create an expense with a non-numeric amount", async () => {
  await seedBusiness({ businessId: "biz-exp3", ownerUid: "owner1", daysAgo: 5 });
  await seedJobAndMember({ businessId: "biz-exp3", memberUid: "crew1", role: "crew" });
  const crewDb = testEnv.authenticatedContext("crew1").firestore();
  await assertFails(
    addDoc(collection(crewDb, "businesses/biz-exp3/jobs/job1/expenses"), {
      amount: "fifty",
      logged_by: "crew1",
    })
  );
});

test("expenses: supervisor CAN correct an existing expense's amount without touching logged_by", async () => {
  await seedBusiness({ businessId: "biz-exp4", ownerUid: "owner1", daysAgo: 5 });
  await seedJobAndMember({ businessId: "biz-exp4", memberUid: "sup1", role: "supervisor" });
  let expenseRef;
  await testEnv.withSecurityRulesDisabled(async (context) => {
    expenseRef = doc(collection(context.firestore(), "businesses/biz-exp4/jobs/job1/expenses"));
    await setDoc(expenseRef, { amount: 10, logged_by: "crew1" });
  });
  const supDb = testEnv.authenticatedContext("sup1").firestore();
  await assertSucceeds(
    setDoc(doc(supDb, expenseRef.path), { amount: 15, logged_by: "crew1" })
  );
});

test("expenses: supervisor CANNOT reassign logged_by on an existing expense", async () => {
  await seedBusiness({ businessId: "biz-exp5", ownerUid: "owner1", daysAgo: 5 });
  await seedJobAndMember({ businessId: "biz-exp5", memberUid: "sup1", role: "supervisor" });
  let expenseRef;
  await testEnv.withSecurityRulesDisabled(async (context) => {
    expenseRef = doc(collection(context.firestore(), "businesses/biz-exp5/jobs/job1/expenses"));
    await setDoc(expenseRef, { amount: 10, logged_by: "crew1" });
  });
  const supDb = testEnv.authenticatedContext("sup1").firestore();
  await assertFails(
    setDoc(doc(supDb, expenseRef.path), { amount: 10, logged_by: "sup1" })
  );
});

// labor_entries ---------------------------------------------------------

test("labor_entries: crew CAN create a labor entry with valid non-negative hours and no rate set", async () => {
  await seedBusiness({ businessId: "biz-lab1", ownerUid: "owner1", daysAgo: 5 });
  await seedJobAndMember({ businessId: "biz-lab1", memberUid: "crew1", role: "crew" });
  const crewDb = testEnv.authenticatedContext("crew1").firestore();
  await assertSucceeds(
    addDoc(collection(crewDb, "businesses/biz-lab1/jobs/job1/labor_entries"), {
      user_id: "crew1",
      hours: 8,
      hourly_rate: null,
    })
  );
});

test("labor_entries: crew CANNOT create a labor entry with negative hours", async () => {
  await seedBusiness({ businessId: "biz-lab2", ownerUid: "owner1", daysAgo: 5 });
  await seedJobAndMember({ businessId: "biz-lab2", memberUid: "crew1", role: "crew" });
  const crewDb = testEnv.authenticatedContext("crew1").firestore();
  await assertFails(
    addDoc(collection(crewDb, "businesses/biz-lab2/jobs/job1/labor_entries"), {
      user_id: "crew1",
      hours: -2,
      hourly_rate: null,
    })
  );
});

test("labor_entries: crew CANNOT create a labor entry with a negative hourly_rate", async () => {
  await seedBusiness({ businessId: "biz-lab3", ownerUid: "owner1", daysAgo: 5 });
  await seedJobAndMember({ businessId: "biz-lab3", memberUid: "crew1", role: "crew" });
  const crewDb = testEnv.authenticatedContext("crew1").firestore();
  await assertFails(
    addDoc(collection(crewDb, "businesses/biz-lab3/jobs/job1/labor_entries"), {
      user_id: "crew1",
      hours: 8,
      hourly_rate: -25,
    })
  );
});

test("labor_entries: supervisor CAN correct hours on an existing entry without touching user_id", async () => {
  await seedBusiness({ businessId: "biz-lab4", ownerUid: "owner1", daysAgo: 5 });
  await seedJobAndMember({ businessId: "biz-lab4", memberUid: "sup1", role: "supervisor" });
  let entryRef;
  await testEnv.withSecurityRulesDisabled(async (context) => {
    entryRef = doc(collection(context.firestore(), "businesses/biz-lab4/jobs/job1/labor_entries"));
    await setDoc(entryRef, { user_id: "crew1", hours: 8, hourly_rate: null });
  });
  const supDb = testEnv.authenticatedContext("sup1").firestore();
  await assertSucceeds(
    setDoc(doc(supDb, entryRef.path), { user_id: "crew1", hours: 6, hourly_rate: null })
  );
});

test("labor_entries: supervisor CANNOT reassign user_id on an existing entry", async () => {
  await seedBusiness({ businessId: "biz-lab5", ownerUid: "owner1", daysAgo: 5 });
  await seedJobAndMember({ businessId: "biz-lab5", memberUid: "sup1", role: "supervisor" });
  let entryRef;
  await testEnv.withSecurityRulesDisabled(async (context) => {
    entryRef = doc(collection(context.firestore(), "businesses/biz-lab5/jobs/job1/labor_entries"));
    await setDoc(entryRef, { user_id: "crew1", hours: 8, hourly_rate: null });
  });
  const supDb = testEnv.authenticatedContext("sup1").firestore();
  await assertFails(
    setDoc(doc(supDb, entryRef.path), { user_id: "sup1", hours: 8, hourly_rate: null })
  );
});

// revenue_entries ---------------------------------------------------------

test("revenue_entries: supervisor CAN create an entry with a negative amount (discount is valid)", async () => {
  await seedBusiness({ businessId: "biz-rev1", ownerUid: "owner1", daysAgo: 5 });
  await seedJobAndMember({ businessId: "biz-rev1", memberUid: "sup1", role: "supervisor" });
  const supDb = testEnv.authenticatedContext("sup1").firestore();
  await assertSucceeds(
    addDoc(collection(supDb, "businesses/biz-rev1/jobs/job1/revenue_entries"), {
      amount: -250,
      reason: "Customer Discount",
      logged_by: "sup1",
    })
  );
});

test("revenue_entries: supervisor CANNOT create an entry with a non-numeric amount", async () => {
  await seedBusiness({ businessId: "biz-rev2", ownerUid: "owner1", daysAgo: 5 });
  await seedJobAndMember({ businessId: "biz-rev2", memberUid: "sup1", role: "supervisor" });
  const supDb = testEnv.authenticatedContext("sup1").firestore();
  await assertFails(
    addDoc(collection(supDb, "businesses/biz-rev2/jobs/job1/revenue_entries"), {
      amount: "fifty",
      reason: null,
      logged_by: "sup1",
    })
  );
});

test("revenue_entries: supervisor CAN update an entry's amount to another valid number (positive or negative)", async () => {
  await seedBusiness({ businessId: "biz-rev3", ownerUid: "owner1", daysAgo: 5 });
  await seedJobAndMember({ businessId: "biz-rev3", memberUid: "sup1", role: "supervisor" });
  let entryRef;
  await testEnv.withSecurityRulesDisabled(async (context) => {
    entryRef = doc(collection(context.firestore(), "businesses/biz-rev3/jobs/job1/revenue_entries"));
    await setDoc(entryRef, { amount: 500, reason: null, logged_by: "sup1" });
  });
  const supDb = testEnv.authenticatedContext("sup1").firestore();
  await assertSucceeds(
    setDoc(doc(supDb, entryRef.path), { amount: -100, reason: "Price Match", logged_by: "sup1" })
  );
});

// bulletin_posts ---------------------------------------------------------

test("bulletin_posts: author CAN edit their own post's text without touching posted_by", async () => {
  await seedBusiness({ businessId: "biz-bul1", ownerUid: "owner1", daysAgo: 5 });
  await seedJobAndMember({ businessId: "biz-bul1", memberUid: "crew1", role: "crew" });
  let postRef;
  await testEnv.withSecurityRulesDisabled(async (context) => {
    postRef = doc(collection(context.firestore(), "businesses/biz-bul1/bulletin_posts"));
    await setDoc(postRef, { text: "hello", posted_by: "crew1", posted_by_name: "Test crew" });
  });
  const crewDb = testEnv.authenticatedContext("crew1").firestore();
  await assertSucceeds(
    setDoc(doc(crewDb, postRef.path), { text: "hello (edited)", posted_by: "crew1", posted_by_name: "Test crew" })
  );
});

test("bulletin_posts: author CANNOT reassign posted_by on their own post", async () => {
  await seedBusiness({ businessId: "biz-bul2", ownerUid: "owner1", daysAgo: 5 });
  await seedJobAndMember({ businessId: "biz-bul2", memberUid: "crew1", role: "crew" });
  let postRef;
  await testEnv.withSecurityRulesDisabled(async (context) => {
    postRef = doc(collection(context.firestore(), "businesses/biz-bul2/bulletin_posts"));
    await setDoc(postRef, { text: "hello", posted_by: "crew1", posted_by_name: "Test crew" });
  });
  const crewDb = testEnv.authenticatedContext("crew1").firestore();
  await assertFails(
    setDoc(doc(crewDb, postRef.path), { text: "hello", posted_by: "owner1", posted_by_name: "Test crew" })
  );
});

// job_notes ---------------------------------------------------------

test("job_notes: supervisor CAN correct a note's text without touching logged_by", async () => {
  await seedBusiness({ businessId: "biz-note1", ownerUid: "owner1", daysAgo: 5 });
  await seedJobAndMember({ businessId: "biz-note1", memberUid: "sup1", role: "supervisor" });
  let noteRef;
  await testEnv.withSecurityRulesDisabled(async (context) => {
    noteRef = doc(collection(context.firestore(), "businesses/biz-note1/jobs/job1/job_notes"));
    await setDoc(noteRef, { text: "Ceiling damage", photo_url: null, logged_by: "crew1" });
  });
  const supDb = testEnv.authenticatedContext("sup1").firestore();
  await assertSucceeds(
    setDoc(doc(supDb, noteRef.path), { text: "Ceiling damage (fixed)", photo_url: null, logged_by: "crew1" })
  );
});

test("job_notes: supervisor CANNOT reassign logged_by on an existing note", async () => {
  await seedBusiness({ businessId: "biz-note2", ownerUid: "owner1", daysAgo: 5 });
  await seedJobAndMember({ businessId: "biz-note2", memberUid: "sup1", role: "supervisor" });
  let noteRef;
  await testEnv.withSecurityRulesDisabled(async (context) => {
    noteRef = doc(collection(context.firestore(), "businesses/biz-note2/jobs/job1/job_notes"));
    await setDoc(noteRef, { text: "Ceiling damage", photo_url: null, logged_by: "crew1" });
  });
  const supDb = testEnv.authenticatedContext("sup1").firestore();
  await assertFails(
    setDoc(doc(supDb, noteRef.path), { text: "Ceiling damage", photo_url: null, logged_by: "sup1" })
  );
});
