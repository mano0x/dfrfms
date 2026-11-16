# DFRMMS

Dormitory Fault Reporting and Maintenance Management System (DFRMMS) is a role-based web app for reporting dormitory issues, tracking repairs, and coordinating work between students, technicians, and administrators.

The app is built with Next.js App Router, React, TypeScript, Tailwind CSS, and Firebase. Authentication, database reads/writes, and file uploads are handled by Firebase services directly from the client.

## What This App Does

DFRMMS lets students submit fault reports, technicians work through assigned and unassigned issues, and admins manage the overall workflow. The core idea is simple: a problem is reported once, then tracked until it is resolved.

## Main Roles

### Student

Students can:

- Sign in with email and password.
- Submit new fault reports.
- Attach an optional photo of the issue.
- See a personal history of their own reports.
- Filter their reports by status.
- Review the calculated priority assigned to each report.

### Technician

Technicians can:

- Sign in and open the technician dashboard.
- View reports assigned to them.
- Switch between assigned reports and all reports.
- Filter reports by status.
- Expand a report to see the full description and photo.
- Update a report’s status.
- Add resolution notes.
- Save a resolution note entry to the `status_log` collection.

### Admin

Admins can:

- Review all submitted fault reports.
- Search and filter reports by title, student, room, status, and priority.
- Change a report’s status.
- Assign a technician to a report.
- View all registered users.
- Create new users for students, technicians, or admins.

## Tech Stack

- Next.js 16 App Router
- React 19
- TypeScript
- Tailwind CSS 4
- Firebase Authentication
- Cloud Firestore
- Firebase Storage
- Zod is included in dependencies for validation use cases

## App Architecture

The app is structured as a small role-based workspace:

- `app/layout.tsx` wraps the entire app with the authentication context provider and loads the Geist font.
- `lib/AuthContext.tsx` listens to Firebase auth state and looks up the current user role in Firestore.
- `lib/firebase.ts` initializes the Firebase client using environment variables.
- `app/login/page.tsx` handles sign-in and redirects users based on their role.
- `app/student/page.tsx` contains the student report submission and history experience.
- `app/technician/page.tsx` contains the technician work queue and resolution tools.
- `app/admin/page.tsx` contains the admin console for report and user management.

There is no traditional API layer in this project. The browser talks directly to Firebase services.

## Data Model

The app expects these Firestore collections.

### `users`

Used for authentication profile lookup and role routing.

Common fields:

- `name`
- `email`
- `role` with values like `student`, `technician`, or `admin`
- `dormitory` for students
- `roomNumber` for students
- `specialization` for technicians
- `createdAt`

### `fault_reports`

Stores each maintenance issue reported by students.

Common fields:

- `title`
- `category`
- `urgency`
- `priority`
- `description`
- `photoURL`
- `status`
- `studentId`
- `studentName`
- `dormitory`
- `roomNumber`
- `assignedTo`
- `createdAt`
- `updatedAt`
- `resolutionNote`

### `status_log`

Stores technician note activity when a resolution note is saved.

Common fields:

- `reportId`
- `technicianName`
- `note`
- `timestamp`

## Firebase Services Used

### Authentication

Firebase Authentication is used for email and password sign-in. After login, the app reads the matching user record from Firestore and routes the user to the correct dashboard.

### Firestore

Firestore is the primary database for user profiles and fault reports.

### Storage

Firebase Storage stores uploaded report photos. The current upload path format is:

- `fault-photos/{userId}/{timestamp}_{filename}`

## Role Flow

1. A user signs in on the login page.
2. The app authenticates the user through Firebase Auth.
3. The app fetches the user’s record from Firestore.
4. The user’s `role` determines which route they are redirected to.
5. The dashboard only renders if the role matches the route.

This means the app relies on client-side route checks plus the stored role in Firestore.

## Report Flow

### Student report submission

1. The student opens the submit form.
2. The student enters a title, category, maintenance classification, and description.
3. The student may upload a photo.
4. The app calculates a priority value from the maintenance classification.
5. The report is written to Firestore with status `open`.
6. The report appears in the student’s history tab.

### Technician handling

1. The technician opens the dashboard.
2. The technician views assigned or all reports.
3. The technician updates status as work progresses.
4. The technician may add a resolution note.
5. The note is saved to the report and logged in `status_log`.

### Admin management

1. The admin opens the admin dashboard.
2. The admin filters and reviews all reports.
3. The admin can assign a technician to a report.
4. The admin can update report status.
5. The admin can create new user records.

## Business Rules Implemented In Code

- Students can only work with their own report history.
- Technicians are redirected away from student/admin views if their role does not match.
- Admins are redirected away from non-admin views if their role does not match.
- Report priority is derived from the maintenance classification (stored in the `urgency` field):
  - Routine Maintenance (`normal`) → `low`
  - Priority Maintenance (`urgent`) → `high`
  - Emergency Maintenance (`emergency`) → `critical`

## Maintenance Workflow (bachelor's thesis extension)

The coursework version of this project is tagged `coursework-baseline`. The
functionality below was added afterwards.

### Status workflow

A report moves `open` → `in-progress` → `resolved` → `closed`. Allowed changes depend on the role:

| Role | Allowed status changes |
| --- | --- |
| Technician (assigned reports only) | open → in-progress, in-progress → resolved, resolved → in-progress |
| Administrator | the above, plus close from any status, return in-progress → open, reopen closed → open |

### Assignment

Reports store the assigned technician's account ID (`assignedToId`) together
with the name (`assignedTo`) for display. Reports assigned before this field
existed are matched by name. Assigning an open report moves it to `in-progress`.

### Triage

The initial priority comes from the resident's classification. An administrator
can override it with a recorded reason (`priorityOverridden`, `priorityReason`).
A resident can no longer edit a report once it has been triaged or assigned.

### Target resolution times

| Priority | Target |
| --- | --- |
| Critical | 4 hours |
| High | 24 hours |
| Medium | 72 hours |
| Low | 168 hours (7 days) |

An active report past its target is shown as overdue. The targets are defined in
`lib/maintenance.ts` (`TARGET_HOURS`).

### History (audit trail)

Every change is written to `status_log` in the same batch as the change itself.
Entry fields: `reportId`, `type` (`created`, `edited`, `status`, `assignment`,
`priority`, `note`), `from`, `to`, `note`, `actorId`, `actorName`, `actorRole`,
`timestamp`. The history is shown as a timeline to residents, technicians and
administrators.

### Input validation

Report input, resolution notes, priority overrides and new users are validated
with Zod schemas in `lib/maintenance.ts`. Photos must be JPG, PNG or WebP and at
most 5 MB.

### Code structure

- `lib/maintenance.ts` — domain rules (priority, status workflow, targets, validation); no Firebase or React.
- `lib/reports.ts` — data operations that change a report and write its history entry atomically.
- `components/Timeline.tsx` — history timeline and target-time indicator.
- `tests/maintenance.test.ts` — unit tests of the domain rules.

## Appwrite Backend (branch `appwrite-migration`)

On this branch the application uses Appwrite (Auth, Databases, Storage) instead
of Firebase. The Firebase sections below describe the version that is still
live on `main` until the migration is verified.

### Architecture

```text
Browser (pages) --fetch /api/*--> Next.js route handlers --API key--> Appwrite
                 httpOnly cookie    authorise, validate, write          (Frankfurt)
```

- **The browser never talks to Appwrite.** It calls the application's own
  routes under `/api`. The Appwrite tables and the photo bucket grant no access
  to browsers at all; only the server's API key can reach them.
- **Session:** after sign-in the Appwrite session secret is kept in an
  `httpOnly`, `SameSite=Strict` cookie (`Secure` in production). Page scripts
  cannot read it. Sign-out revokes the session in Appwrite.
- **Roles** are Appwrite account labels (`student`, `technician`, `admin`),
  which only the server can set. A role sent by the browser is never trusted.
- **Authorisation** rules are pure functions in `lib/access.ts`; every route
  applies them on the server. The pages use the same functions only to decide
  which controls to show.
- **Atomic writes:** a report change and its history entry are written in one
  Appwrite transaction (`lib/server/reports.ts`).
- **Brute-force protection:** 5 failed sign-ins in 15 minutes lock the address
  for 15 minutes (`lib/auth-rules.ts`, table `auth_attempts`).
- **Cross-site requests:** every state-changing route requires the request to
  come from this site (Origin check) in addition to the SameSite cookie.
- **Photos:** resized in the browser (this also removes hidden data such as GPS
  position), checked on the server by content rather than file name, stored in
  the private bucket `dormitory-fault-photos`, and served by `/api/photos/[id]`
  only to people who may see the report.

### Routes

| Route | Method | Who | Purpose |
| --- | --- | --- | --- |
| `/api/auth/login` | POST | anyone | Sign in under a chosen role |
| `/api/auth/logout` | POST | signed in | Sign out and revoke the session |
| `/api/auth/me` | GET | anyone | Who is signed in |
| `/api/auth/recovery` | POST, PUT | anyone | Request / complete a password reset |
| `/api/users` | GET, POST | administrator | List users; create account, role and profile |
| `/api/reports` | GET | signed in | Own reports (resident) or all reports (staff) |
| `/api/reports` | POST | resident | Submit a report |
| `/api/reports/[id]` | GET, PATCH | by rule | View; edit, status, assign, priority, note |
| `/api/reports/[id]/history` | GET | by rule | History of one report |
| `/api/photos` | POST | resident | Upload a photo |
| `/api/photos/[id]` | GET | by rule | View a photo |

### Data

Database `dfrmms`: tables `users`, `fault_reports`, `status_log` (same fields
as the Firestore collections; `photoURL` became `photoFileId`) and
`auth_attempts`. Created by `npm run appwrite:setup` (repeatable, never deletes).

### Configuration

Copy `.env.example` to `.env.local` and fill it in. `APPWRITE_API_KEY` is a
secret: it has no `NEXT_PUBLIC_` prefix, is never sent to the browser, and must
never be committed.

### Commands

| Command | Purpose |
| --- | --- |
| `npm run appwrite:check` | Report what is missing in Appwrite, change nothing |
| `npm run appwrite:setup` | Create the database, tables, indexes and bucket |
| `npm run appwrite:verify` | Check the structure, transactions and visitor access |
| `npm run appwrite:test-users` | Create the test accounts (`-- --remove` deletes them) |
| `npm run migrate:export` | Read the existing Firestore data (read-only) into `migration-data/` (ignored by git) |
| `npm run migrate:dry` | Show what the migration would copy into Appwrite; change nothing |
| `npm run migrate:run` | Copy the data into Appwrite and verify it by reading it back (repeatable) |
| `npm run migrate:check` | With `npm run dev` running: check that migrated accounts sign in and see the right data |
| `npm test` | Unit tests (domain, access, authentication and image rules) |
| `npm run test:api` | HTTP-level authentication, workflow and security tests; needs `npm run dev` running and the test accounts |

## Security Rules (Firebase version)

Access is enforced on the server by `firestore.rules` and `storage.rules`
(least privilege); the checks in the pages are only for usability.

| Data | Resident (student) | Technician | Administrator |
| --- | --- | --- | --- |
| User profiles | Own profile only | Own profile only | Read all; create, update, delete (not own) |
| Fault reports: read | Own reports only | All | All |
| Fault reports: create | For themselves; open, unassigned, valid content, priority matching the classification | No | No |
| Fault reports: update | Own report while open, unassigned and not triaged; content fields only | Assigned reports only; status (technician workflow) and resolution note only | Status (admin workflow), assignment, priority; never the reporter or submission time |
| Fault reports: delete | No | No | Yes |
| History (`status_log`) | Read own reports' history; add "created"/"edited" entries for own reports | Read all; add "status"/"note" entries for assigned reports | Read all; add any entry |
| Photos (Storage) | View; upload JPG/PNG/WebP up to 5 MB into own folder | View | View |

History entries must carry the writer's real account ID and role and the server
time, and can never be changed or deleted. Uploaded photos cannot be replaced or
deleted. Accounts without a profile have no access.

## Testing

| Command | What it runs | Needs |
| --- | --- | --- |
| `npm test` | Unit tests of the domain rules (`tests/unit`) | Node.js |
| `npm run test:rules` | Security rule tests for Firestore and Storage (`tests/rules`) on the local Firebase emulator | Node.js and Java 21+ |

The rule tests start the emulators, run, and stop them again. They never touch
the live Firebase project (they use the local-only project ID `demo-dfrmms`).

### Running the whole app against the emulator

For manual testing with made-up accounts instead of live data:

```bash
npm run emulators        # terminal 1: local Auth, Firestore and Storage
npm run seed:emulator    # terminal 2: test accounts and sample reports
npm run dev:emulator     # terminal 2: the app, connected to the emulators
```

The test accounts and their password are listed in `scripts/seed-emulator.mjs`.
They exist only inside the local emulator.

## Environment Variables

Create a `.env.local` file in the project root with the Firebase client configuration.

```bash
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
```

Without these values, Firebase initialization will fail.

## Getting Started

### Install dependencies

```bash
npm install
```

### Run the development server

```bash
npm run dev
```

Open the app at `http://localhost:3000`.

### Build for production

```bash
npm run build
```

### Start the production server

```bash
npm run start
```

### Run linting

```bash
npm run lint
```

## Project Structure

```text
app/
	layout.tsx          Global layout, font setup, auth provider wrapper
	page.tsx            Root route
	login/page.tsx      Email/password sign-in and role redirect
	student/page.tsx    Student report submission and history
	technician/page.tsx Technician dashboard and status management
	admin/page.tsx      Admin dashboard and user management
lib/
	AuthContext.tsx     Global auth state and role lookup
	firebase.ts         Firebase client initialization
public/               Static assets
```

## UI Notes

The interface uses a dark theme with Tailwind utility classes. The layout is intentionally compact and dashboard-oriented rather than marketing-style. Fonts are loaded through `next/font` using Geist.

## Current Limitations

- Access control is enforced in the client route components, so Firebase security rules still need to be configured properly in the backend.
- There is no dedicated server API layer in the current codebase.
- Validation is minimal in the current UI and can be expanded further.
- The app assumes user profile documents already exist in Firestore for login routing.

## Troubleshooting

### Login redirects to the wrong dashboard

Check the user’s Firestore document in `users` and confirm the `role` field is set correctly.

### Photo upload fails

Check the Firebase Storage configuration and make sure the app has valid upload permissions.

### The app loads but data does not appear

Confirm the Firestore collection names match the code exactly:

- `users`
- `fault_reports`
- `status_log`

### Firebase initialization errors

Verify every `NEXT_PUBLIC_FIREBASE_*` environment variable is set.

## Notes For Contributors

When adding new features, keep the role-based structure consistent:

- Put shared auth logic in `lib/AuthContext.tsx`.
- Put Firebase setup in `lib/firebase.ts`.
- Keep role-specific UI inside the route that owns it.
- Update this README whenever a new collection, route, or role flow is added.

## Summary

DFRMMS is a Firebase-backed dormitory maintenance system with three main experiences: students report issues, technicians resolve them, and admins coordinate the overall workflow. The current codebase focuses on a simple and direct client-side architecture backed by Firebase services.
