# BizCheck

A plain HTML/CSS/JS progressive web app for job costing at trade and service
businesses (moving, HVAC, construction, landscaping, general). No React, no
build step, no bundler — every file runs as-is in the browser.

## Tech stack

- **Firebase Auth + Firestore** — login and the entire database. Loaded
  straight from the CDN as native ES modules (`js/firebase-config.js`).
- **Cloudinary** — receipt photo hosting. Firebase Storage was the original
  plan, but it requires Firebase's paid Blaze billing plan, which hit an
  account-level hold during setup (see `js/photos.js` for the full story).
  Cloudinary's free tier needs no credit card, so that's what's actually
  wired in. Uploads happen straight from the browser via an unsigned
  upload preset — no backend server involved.
- **Tesseract.js** — client-side OCR on receipt photos, used to guess an
  expense's dollar amount automatically (`js/ocr.js`). Runs entirely in
  the browser, no API key or billing account needed.
- **Netlify** — static hosting (`netlify.toml`, no build command needed).

Firebase Cloud Functions are not used anywhere in this project.

## Project structure

```
/index.html            Login/signup page
/app.html               Authenticated app shell — nav + role-based screen routing
/css/
  styles.css            Shared dark-theme styles for the whole app
/fonts/                 Alumni Sans SC (brand font)
/icons/                 PWA icons (192px, 512px)
/js/
  firebase-config.js    Firebase init, Firestore path helpers, full data-model
                         schema as reference comments
  auth.js               signUpOwner, createTeamMember, logIn, logOut,
                         observeAuthState, getUserProfile, getBusinessIdForUser
  jobs.js                createJob, getJob, getAllJobs, getActiveJobs,
                         getCompletedJobs, updateJob, completeJob, cancelJob,
                         setCustomField
  expenses.js            addExpense, getExpense, getExpensesForJob,
                         getExpensesByCategory, updateExpense, sumExpenses
  labor.js                addLaborEntry, getLaborEntry, getLaborEntriesForJob,
                         getLaborEntriesByUser, updateLaborEntry, sumLaborCost,
                         sumLaborHours
  revenue-entries.js     addRevenueEntry, getRevenueEntry,
                         getRevenueEntriesForJob, updateRevenueEntry,
                         sumRevenueEntries — revenue as a running log, not a
                         single static number (see data model below)
  categories.js          createCategory, getCategory, getCategories,
                         renameCategory, deleteCategory
  dashboard.js            getJobProfitability, getAllJobsProfitability,
                         getActiveJobsSummary, getBusinessSummary — all
                         live calculations, nothing cached/stored
  job-notes.js            addJobNote, getJobNote, getJobNotesForJob,
                         updateJobNote — free-form jobsite photos/notes,
                         open to every role (no dollar figure to protect)
  photos.js               uploadReceiptPhoto, uploadJobNotePhoto — shared
                         Cloudinary upload core + client-side image
                         compression before sending
  ocr.js                  extractTotalFromReceipt — best-guess receipt total
                         via Tesseract.js
  screens/
    jobs-screen.js        Jobs list + "New Job" form
    job-detail-screen.js  Single job: custom fields, revenue log, job
                         notes/photos, expenses (with photo + OCR), labor
    categories-screen.js  Add/list/delete expense categories
    team-screen.js        Invite team members, set roles/rates, deactivate
    dashboard-screen.js   Owner-only business summary
/manifest.json          PWA manifest
/service-worker.js       Offline caching — network-first for page navigation,
                         cache-first for static assets, never intercepts
                         Firebase/Cloudinary requests
/firestore.rules         Firestore security rules (see below — must be
                         manually published in the Firebase console)
/netlify.toml            Netlify static-site config
```

Every module exports small, single-purpose functions and imports shared
`db`/`auth`/`paths` from `firebase-config.js`. Nothing is scattered inline
in the HTML.

## Screens (all built)

- **Jobs** — list of active jobs, create new jobs (with an optional initial
  price, logged as the first revenue entry), mark complete/cancel.
- **Job Detail** — custom fields (tap a value to copy it, e.g. paste a site
  address into a maps app), revenue history + a guided "Log Revenue Change"
  tap flow, job notes/photos (open to every role — progress photos, site
  conditions, anything worth flagging), expenses (snap a photo → OCR
  guesses the total → save), labor hours.
- **Categories** — business-defined expense categories (never hardcoded —
  works the same for a moving company or a landscaping crew).
- **Team** — owner invites supervisor/crew accounts, sets roles and hourly
  rates, deactivates people.
- **Dashboard** — owner-only. Active jobs summary, all-time summary,
  per-job profitability breakdown.

## Role-based permissions

|                          | Owner | Supervisor | Crew |
|--------------------------|:-----:|:----------:|:----:|
| See revenue/profit       |  Yes  |     No     |  No  |
| Log a revenue change     |  Yes  |    Yes*    |  No  |
| Manage jobs/categories   |  Yes  |    Yes     |  No  |
| See expense/labor totals |  Yes  |    Yes     |  No  |
| Log expenses/hours       |  Yes  |    Yes     | Yes  |
| Manage team              |  Yes  |     No     |  No  |

\* Supervisor logs revenue changes "blind" — same as crew logging an
expense without seeing job totals. The UI never shows supervisor the
revenue history or profit numbers, even though they can add to it.

Enforced in two places for every restriction above: the UI hides/disables
the action, and `firestore.rules` independently rejects the write
server-side. See the comments at the top of `firestore.rules` for the
full reasoning, including its documented limitations (Firestore can't
redact individual fields from a read a role is otherwise allowed to make).

## Firestore data model

```
businesses/{businessId}
  name, trade_type, created_at

businesses/{businessId}/users/{userId}
  name, role (owner|supervisor|crew), phone, email, active,
  default_hourly_rate (auto-applied to labor entries this person logs)

businesses/{businessId}/jobs/{jobId}
  customer_name, status (active|complete|cancelled), start_date, end_date,
  revenue_amount (DEPRECATED — no longer written, see revenue_entries),
  custom_fields (flexible map), created_by, created_at

businesses/{businessId}/categories/{categoryId}
  name, created_at

businesses/{businessId}/jobs/{jobId}/expenses/{expenseId}
  category_id, amount, date, photo_url, logged_by, notes

businesses/{businessId}/jobs/{jobId}/labor_entries/{laborEntryId}
  user_id, date, hours, hourly_rate

businesses/{businessId}/jobs/{jobId}/revenue_entries/{revenueEntryId}
  amount (positive = increase/change order, negative = discount),
  date, reason, logged_by
  A running log, not a static field — a job's revenue is always
  sum(revenue_entries.amount), computed live, never cached.

businesses/{businessId}/jobs/{jobId}/job_notes/{noteId}
  text, photo_url, logged_by, date
  Free-form jobsite documentation. Unlike revenue_entries, open to every
  role including crew — no dollar figure here to protect.

user_business_map/{userId}   (top-level, not nested under businesses/)
  business_id
  Lets the app find which business a logged-in user belongs to (needed
  because a supervisor/crew account's uid is unrelated to the businessId
  they were invited into — only the owner's uid happens to equal it).
```

Categories and `custom_fields` are intentionally not hardcoded anywhere —
they're entirely business-defined data pulled from Firestore.

## Manual setup steps

1. **Create the Firebase project** at the
   [Firebase console](https://console.firebase.google.com/), add a Web app.
2. **Enable Auth + Firestore.** Authentication > Sign-in method > enable
   Email/Password. Firestore Database > Create database.
3. **Drop in your config values** into `/js/firebase-config.js` (Project
   Settings > General > Your apps > SDK setup and configuration).
4. **Publish `firestore.rules`** — copy its contents into the Firebase
   console's Firestore > Rules tab and Publish. Nothing is locked down
   until you do this.
5. **Set up Cloudinary** for photos (receipts and jobsite notes both use
   it): sign up free at
   [cloudinary.com](https://cloudinary.com) (no credit card), grab your
   Cloud Name from the dashboard, then create an **unsigned** upload
   preset (Settings > Upload > Upload presets). Paste both values into
   the `CLOUD_NAME`/`UPLOAD_PRESET` constants at the top of `js/photos.js`.
6. **Deploy to Netlify.** Static site, no build command needed —
   `publish = "."` is already set in `netlify.toml`. Connect the repo and
   deploy.

## What's not done yet

- Actual live deployment (pushing to a GitHub repo and connecting it to
  Netlify hasn't happened — the app currently only runs from a local dev
  server).
- Password reset flow (Firebase's `sendPasswordResetEmail` isn't wired up).
- A way for employees to change their owner-assigned temporary password
  themselves.
