# firestore-rules-tests

Local-only test suite for `bizcheck/firestore.rules`. Covers the
subscription/trial access gating (`businessDoc`, `isInTrial`,
`hasActiveAccess`) and, as of the "no server-side validation on Firestore
writes" security-audit fix, the field-shape validation added to
`expenses`, `labor_entries`, `revenue_entries`, `bulletin_posts`, and
`job_notes` (numeric type/range checks on `amount`/`hours`/`hourly_rate`,
and the `diff().affectedKeys()` checks that block `logged_by`/`user_id`/
`posted_by` from being reassigned on update). This folder is **not** part
of the deployed site — it's excluded from the Netlify deploy via
`.netlifyignore` at the repo root.

## Why this exists

`firestore.rules` blocks a business's operational data (jobs and
everything nested under a job, categories, and the bulletin board) unless
`subscription_status == 'active'` or the business is still within 30 days
of its `created_at`. That 30-day window is computed with:

```
request.time < businessDoc(businessId).data.created_at + duration.value(30, 'd')
```

Timestamp/duration arithmetic in Firestore rules is easy to get subtly
wrong (off-by-one on the boundary, wrong unit, comparing the wrong
direction), and rules only fail loudly in the Firebase console — not at
deploy time. This suite spins up the real Firestore emulator and actually
exercises the deployed rules against seeded businesses at known ages
(5 days old, 35 days old, exactly on the 29h23m/30h1m boundary, etc.) to
confirm access is granted/denied correctly, not just that the rules file
parses.

The same reasoning applies to the field-shape validation: a rules syntax
error or a wrong operator (`<=` instead of `<`, `has` instead of
`hasAny`, forgetting to split `create`/`update` from `delete` so
`request.resource.data` isn't referenced on a null `request.resource`)
can silently break a legitimate write or silently fail to block a bad
one. The new tests, one section per changed collection, each pair a
"valid write succeeds" case with an "invalid write is rejected" case —
seeing only the PASS case would not catch a rule that's accidentally too
strict (blocking real users) or too loose (still allowing the bad data).

## Setup (one time)

Requires **Java 21+** on your machine (the Firestore emulator needs it —
this is unrelated to the Node version) and normal internet access (the
emulator binary downloads on first run).

```
cd firestore-rules-tests
npm install
```

## Run

```
npm test
```

This starts the Firestore emulator, runs `test.mjs` against it via
Node's built-in test runner, and shuts the emulator down afterward.
Every test should pass — currently 13 trial/access-gating tests plus 16
field-shape-validation tests (2-3 per changed collection: one confirming
a legitimate write still succeeds, one or more confirming an invalid
write — negative amount, non-numeric amount, or an attempt to reassign a
system-managed field like `logged_by`/`user_id`/`posted_by` — is
rejected). If one fails, the failure message tells you exactly which
check (which business age/collection/role, or which field-shape rule)
didn't behave as expected — that's a real bug in `firestore.rules` to go
fix, not a flaky test.

## A note on where this was built

This suite was written and syntax/import-checked against the real
`@firebase/rules-unit-testing` and `firebase` packages, but could not be
executed end-to-end in the sandboxed environment it was built in — that
environment only had Java 11 (the emulator requires 21+), and its network
allowlist blocked every host that serves the emulator/JDK binaries.
Running `npm test` here, on your own machine, is what actually confirms
the rules work — not just that they deploy without a syntax error.
