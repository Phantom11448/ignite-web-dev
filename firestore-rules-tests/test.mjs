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
