# End-to-End Transfer Credit Demo

This walks through the Boston University transfer credit process (Problem 1), from the applicant's first click to posted credit:

> An applicant opens the landing page and starts a **Transfer Credit Eligibility** application. No account is needed. They enter their details, upload their transcripts and any supporting documents, and submit. They receive an **application number** on screen and by email.
>
> The system reads the courses and checks each against BU's equivalency records. Established equivalencies are applied straight away; the other courses go to department evaluators, who may ask for a syllabus. The Credit Evaluation Office does the final review and posts the credit.
>
> Throughout, the applicant follows progress on **Track Application** (application number + email) and receives an email at each important stage.

Every step below changes the database, and the next person sees the change. Nothing is staged.

The live applicant uses the sample transcripts for STU-001 (two colleges, six courses), the problem statement's suggested demo case:
- three courses with existing equivalencies;
- two "maybe" courses;
- one quarter-system course.

---

## 1. Public landing flow

The public site has two actions and needs no account:

| Page | Route | Purpose |
|---|---|---|
| Landing | `/` | **Start Transfer Credit Eligibility** (primary) and **Track Application** |
| Application | `/apply` | Four-step Transfer Credit Eligibility Application |
| Confirmation | `/apply/submitted` | Application number, email, status, Track Application |
| Track Application | `/track` (optionally `?application=APP-2026-0012`) | Application number + email, then the tracking page |
| Self-check / eligibility (unchanged) | `/self-check`, `/eligibility` | Previews before applying; nothing is stored |
| Older private links (unchanged) | `/status/:token` | Links from emails sent before this release keep working |

The top bar on public pages offers **Start Application**, **Track Application** and **Staff Sign In**. Applicants are never asked to create an account or sign in.

## 2. Start Transfer Credit Eligibility

Clicking **Start Transfer Credit Eligibility** opens `/apply` directly, with no login. The page explains:
- what the service is ("Submit your previous coursework for transfer credit evaluation");
- that the applicant uploads a transcript and supporting documents;
- that they track the application with the number they receive after submitting.

## 3. Application submission (four steps)

| Step | Content |
|---|---|
| 1. Applicant Information | First and last name, email address and confirmation, previous college or university, intended BU program, intended start term |
| 2. Academic Documents | **Academic Transcript** (required, one or more) and **Supporting Documents** (optional, multiple) |
| 3. Additional Information | "Is there anything else you would like the transfer credit team to know?" (optional, up to 5,000 characters) |
| 4. Review & Submit | Summary with **Edit** links per section, "what happens next", confirmation checkbox, **Submit Application** |

How it works with the existing pipeline:
- Leaving step 1 saves the application as a **draft** (`POST /api/student/applications` with `draft: true`).
- Documents upload to that draft as they are chosen, and transcripts are read on upload, as before.
- Going back and changing details updates the draft (`PATCH /api/student/applications/:token`).
- Submitting (`POST /api/student/applications/:token/submit`, with the comments) runs the existing submission:
  - status `submitted`;
  - the confirmation notification and email;
  - the duplicate check;
  - background processing on the server, which continues even if the browser is closed.
- A refresh during the form keeps the applicant's place for that browser tab.

The applicant's comments are stored on the application (`applications.applicant_comments`). Staff see them on the Credit Office application page and the evaluation report.

## 4. Duplicate application handling

**Rule** (an assumption; the problem statement does not define one):
- An applicant may submit more than one application. Legitimate reasons include coursework from another institution, a different start term, or coursework taken after an earlier evaluation finished.
- While an earlier application with the same email is still **active** (not completed or closed), the new one is accepted but flagged **Potential duplicate**.
- The Credit Evaluation Office is notified. It chooses **Keep separate** or **Close as duplicate** before anything on the new application can be posted.
- Nothing is ever deleted.
- An application whose evaluation is **finished** (posted, decided or closed) is not a duplicate candidate.

**What the applicant sees.** When they continue from step 1 with an email that already has a submitted application, the form shows **"We found an existing transfer credit application"**. It lists, for each application:
- the application number, **partly masked** (e.g. `APP-2026-••12`);
- the submitted date;
- the current status.

Then it offers:
- **Track Existing Application**;
- **Email me my application number**, which sends the full numbers to that address only;
- **Submit Another Application**, with an explanation that depends on whether the earlier application is still active.

The number is masked because number + email opens an application. Showing the full number to anyone who types an email would let them open someone else's application.

## 5. Application number generation

The existing strategy is kept: `APP-YYYY-NNNN` (e.g. `APP-2026-0012`). It is:
- generated when the application is created;
- unique (database constraint);
- stored in `applications.reference_number`;
- used for tracking and in every email.

The internal GUID is never shown to applicants.

## 6. Document upload

The upload areas support:
- drag and drop or **Choose files**;
- PDF, Word (DOC, DOCX), JPG and PNG, up to 10 MB each (the limits the API enforces);
- per file: name, type, size and a progress bar;
- **Uploaded** state, **Remove** and **Retry**;
- clear messages for a wrong type, too large or empty file, or a failed upload.

Removing a file before submission deletes it and any courses read from it. After submission, documents can no longer be removed.

## 7. Document processing

Unchanged: transcript PDFs are read on upload into `transcript_courses`, one row per course with institution, term, credits, credit system and grade. Submitting starts the evaluation in the background (`triggerEvaluation` → `runEvaluation`). It runs independently of the browser.

If no course can be read from a transcript, the Credit Evaluation Office is notified. The applicant sees "We received your documents".

## 8. Course matching

Unchanged:
- Each course is matched against the sponsor equivalency data and the BU catalog.
- Established equivalencies, plus deterministic policy outcomes (grade below minimum, withdrawn, repeated course), are applied directly.
- An established equivalency that conflicts with past decisions is held for a department evaluator.

## 9. Evaluator assignment

Unchanged:
- The remaining courses are assigned by subject expertise, the student's major and workload.
- Several evaluators on one application review in sequence (hand-offs).

## 10. Evaluator review

Unchanged. Evaluators sign in and open a course from **Needs your attention**. They decide:
- equivalent course;
- different course;
- elective;
- no credit;
- or **Request more information** (syllabus or details).

The applicant answers from the tracking page. The course returns to the evaluator.

## 11. Credit Evaluation Office

Unchanged final review:
- every decided course is listed with who decided it;
- **Return** sends a decision back to its evaluator;
- **Finalize and post** posts the courses with grade **T**, the decided BU units, not counted in the BU GPA, and no BU Hub units.

New on the Credit Office application page:
- **Additional information from the applicant** (their comments);
- **Applicant updates**: every notification sent to the applicant, with its email delivery status (sent, logged, will retry, failed, or not sent for a test address).

### Where is an application, and who has it?

Staff never need the database for this:
- **Credit Office / admin:** **Applications**.
  - Each row shows the stage (e.g. *Pending Evaluator Review*), the current evaluator and department, the pending course, and how long it has been pending.
  - Filter by stage, evaluator, department or age.
  - **Needs attention** and **Unassigned reviews** show applications needing intervention.
- **Any application page:** **Current Review Assignment**.
  - Where it is, who has it, which course is blocking completion, and for how long.
  - Every course with its evaluator.
  - The full assignment history, including reassignments.
- **Evaluators:** **Application Lookup** in the left menu.
  - Search by application number, applicant name or email.
  - Covers applications they have, or had, a course on.

Try it after step 10 of the walkthrough:
1. Sign in as the Credit Office and find the new application in **Applications**. It shows *Pending Evaluator Review* with the CS evaluator and CSC 220.
2. Sign in as `evaluator.cs@bu-transfer.local`, open **Application Lookup** and search for the applicant's name.
3. After the CS decision, the application shows the next evaluator as the current owner.

## 12. Final decision

When every course is posted the application becomes **Completed** (`credit_posted`) and the applicant is emailed. If only some courses are posted, the others remain pending at 0 units, and the applicant is told which were posted.

## 13. Applicant tracking

**Track Transfer Credit Application** (`/track`) asks for the **Application Number** and **Email Address**. After verification it shows:

- **Header:**
  - application number (copyable);
  - applicant and submitted date;
  - status badge with a plain-language description.
- **Application Progress:**
  - six stages: Application Submitted → Documents Processing → Course Evaluation → Department Review → Credit Decision → Completed;
  - each stage is done, in progress or upcoming, with the date it was reached;
  - computed on the server from the application's status, its courses and its status history.
- **Action required** banner when a syllabus or other information is requested.
- **Final outcome**, once completed: BU credits awarded, courses accepted and courses not accepted.
- **Course Evaluation** table, grouped by institution:
  - previous course, evaluation status, transfer result, BU units;
  - expanding a row gives the explanation, or the upload/reply form for a request.
  - Accepted courses show the BU equivalent or elective credit, the credit type and the units.
  - Pending courses show **"Pending — 0 BU units currently awarded"**.
  - Not-accepted courses show **"Not accepted for transfer credit"** with an applicant-friendly explanation. An evaluator's internal reason is never shown; only policy-rule reasons are.
- **Application Information:**
  - number, submitted date, applicant, email;
  - previous institution, intended program, start term;
  - current status and the applicant's comments.
- **Documents:** what was received and whether it has been processed, plus **Add a document**.
- **Updates:** every notification sent to the applicant.

While documents are processing, the page refreshes on its own.

## 14. Email notifications

**Architecture.** Business logic never sends email directly:
- `notifications/applicant-notification.service.js` is the single applicant notification service (`notifyApplicant`, `onStatusChange`). It records an in-app notification and queues its email on the same `notifications` row.
- `notifications/applicant-templates.js` holds the wording, one template per event. It is separate from the logic.
- `notifications/email-outbox.service.js` delivers queued emails:
  - immediately after the event;
  - then a background worker retries failures with backoff (2, 4, 8, 16 minutes, up to 5 attempts) and picks up anything interrupted;
  - rows are claimed atomically, so several app instances never send the same email twice.
- `email.service.js` is the transport, chosen by configuration:
  - `smtp`: any SMTP relay, such as Azure Communication Services Email, SendGrid, Microsoft 365 or Gmail;
  - `log`: development; the email is written to the server log and optionally to `EMAIL_OUTBOX_DIR` as an `.html` file.
- An email failure never affects submission, evaluation or status changes. It is logged and retried.

**Configuration** (environment variables, no secrets in code):

| Variable | Purpose |
|---|---|
| `EMAIL_PROVIDER` | `smtp` or `log` (default: `smtp` when SMTP is configured, else `log`) |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` | SMTP relay (port 465 uses TLS, others STARTTLS) |
| `EMAIL_FROM`, `EMAIL_FROM_NAME` | Sender |
| `APP_URL` | Public site URL, used for the **Track Application** link in emails |
| `EMAIL_SUPPRESS_DOMAINS` | Reserved/test domains never emailed (default includes `example.org`), so synthetic applicants are never emailed |
| `EMAIL_OUTBOX_DIR` | Development only: also write each email to this folder |
| `TRACK_RATE_LIMIT_MAX` | Public lookups per IP per 15 minutes (default 30) |

Every applicant email contains:
- the application number;
- the current status;
- a short explanation;
- what the applicant needs to do, if anything;
- a **Track Application** button linking to `/track?application=<number>`.

The link opens the tracking page with the number filled in; the applicant enters their email.

## 15. Status transitions

**Applicant-visible events.** Only these send an email:

| Event | When | Email subject |
|---|---|---|
| `application_received` | The application is submitted | Transfer Credit Application Received — APP-… |
| `information_required` | An evaluator (or the evaluation) requests a syllabus or other information | Additional Information Required — APP-… |
| `department_review` | Courses first go to department evaluators (once) | Course Evaluation Update — APP-… |
| `final_review` | Every course has a decision; Credit Office final review (once) | Your Transfer Credit Is in Final Review — APP-… |
| `credit_posted` | Some courses posted while others are still pending | Transfer Credit Posted — APP-… |
| `decision_available` | Evaluation complete, credit posted | Your Transfer Credit Decision Is Available — APP-… |
| `application_closed` | The Credit Office closes the application (e.g. a confirmed duplicate) | Transfer Credit Application Closed — APP-… |
| `application_lookup` | The applicant asks for their application numbers | Your Transfer Credit Applications |

**Not emailed:**
- `submitted → under_evaluation → evaluation_completed`, which takes seconds; the confirmation email already says the application is being processed;
- decisions returned to an evaluator by the Credit Office;
- reassignments and hand-offs;
- repeated entries into a stage.

**Where status changes come from.** Status changes are made by the backend only, in two places: `application.service.updateApplicationStatus` and `lifecycle.refreshApplicationStatus` (plus closing a duplicate). Each:
1. persists the status;
2. records an audit `status_changed` row;
3. calls `onStatusChange`, which decides whether the transition is applicant-visible.

The audit rows are the persisted **status history** from which the tracking timeline is built.

**Applicant labels:**

| Internal status | Applicant label |
|---|---|
| submitted | Submitted |
| under_evaluation, evaluation_completed | Processing |
| under_evaluator_review | Department Review |
| information_required | Action Required |
| ready_for_posting | Final Review |
| credit_posted | Completed |
| validation_failed | Under Review (an internal problem the Credit Office resolves) |
| closed | Closed |

## 16. Security model

- **Tracking** requires the application number **and** the email it was submitted with.
  - Both are compared case-insensitively.
  - A wrong number and a wrong email give the same "not found" answer.
  - Drafts cannot be tracked.
  - `/track/APP-…` alone opens nothing; the number in `/track?application=` only pre-fills the form.
- After verification the API returns the application's random access token. The page keeps it in session storage for that browser tab only, never in the URL.
- **Existing-application check**:
  - shows masked numbers only;
  - the full numbers are only emailed to the address itself;
  - "Email me my application number" gives the same answer whether or not applications exist.
- **Rate limiting:** track, existing-application check and number reminder are limited per IP (`TRACK_RATE_LIMIT_MAX`, default 30 per 15 minutes), on top of the API-wide limit.
- **Public payload** contains applicant-facing data only. It has no:
  - internal application id or date of birth;
  - evaluator names, assignment data or workload;
  - evaluator notes or internal decision reasons;
  - match scores or confidence;
  - AI or engine details;
  - sponsor or synthetic provenance.
- **Draft-only operations:** editing details and removing documents are refused once the application is submitted.
- **Staff functions** stay behind sign-in and role checks on the server. An applicant's access token is not a staff login.

## 17. Staff authentication

- Staff sign in at **/login** ("Welcome back"): evaluators, the Credit Evaluation Office and administrators.
- The account's role decides where they land:

  | Role | Lands on |
  |---|---|
  | Evaluator | `/evaluator` |
  | Credit Office | `/office` |
  | Admin | `/admin` |

- Applicants never sign in. The sign-in page points them to Track Application.
- Self-registration has been removed from the sign-in page.
- Student accounts created before this release still sign in and see **My Applications** (`/student`).

## 18. Demo scenarios

Scenario data is created with the real services and uses `@students.example.org` addresses, so it is never emailed. To load it:

```
npm run db:seed:samples       # the 11 sample students (if not loaded yet)
npm run db:seed:workflow      # staff roster and workflow scenarios
npm run db:seed:applicants    # advances four sample applications to the states below
```

`db:seed:applicants` prints each application number. The numbers depend on the database, so use the printed ones.

| Scenario | Applicant | Email | What to show |
|---|---|---|---|
| **A** Normal successful application | You, live | Your own real email | Steps 1–30 below |
| **B** Existing application for the same email | Leah Chen | `leah.chen@students.example.org` | Enter this email in step 1 of `/apply`: the existing-application panel |
| **C** Additional information required | Daniel Kim | `daniel.kim@students.example.org` | Track: **Action Required**, a syllabus requested on one course, upload form on the course |
| **D** Multiple courses, mixed outcomes | Sofia Martinez | `sofia.martinez@students.example.org` | Track: accepted courses with BU equivalents, one not accepted, one pending at 0 units |
| **E** Completed, credit awarded | Priya Shah | `priya.shah@students.example.org` | Track: **Completed**, every stage done, credits awarded, course-by-course results |

On a fresh local database, for example: B = APP-2026-0008, C = APP-2026-0004, D = APP-2026-0010, E = APP-2026-0005.

### Live walkthrough (Scenario A)

**Before you start**

One-time setup on the deployed app:
1. Run migration `011_applicant_experience.sql` in Supabase. It is additive and safe to re-run.
2. Set `APP_URL` to the public site URL. To send real email, set the SMTP variables (section 14). Without them, emails are logged on the server and listed as "logged" under **Applicant updates**.
3. If not done already: **Evaluators → Import roster** as the administrator, and **Process existing applications** once on the Credit Office dashboard.

Files: `4_Sample_Transcripts/Transcript_STU-001_*.pdf` (two files) and `5_Demo_Documents/CSC_220_Syllabus_Riverside.pdf`.

**Applicant**
1. Open `/`. Click **Start Transfer Credit Eligibility**. The application opens with no sign-in.
2. Step 1: enter your name, **a real email address you can read**, Riverside Community College, **Computer Science**, **Fall 2027**. Click **Continue**.
   - If that email already has an application, the existing-application panel appears (Scenario B). Choose **Submit Another Application** to continue.
3. Step 2: drop both STU-001 transcripts on **Academic Transcript**. Watch the progress bars, then **Uploaded**.
4. Optionally add the CSC 220 syllabus under **Supporting Documents**. Remove it with ✕ to show removal.
5. Step 3: add a comment, e.g. "CSC 220 was renamed in 2025."
6. Step 4: review, tick the confirmation, click **Submit Application**.
7. The confirmation page shows the **application number**, your email, status **Submitted · Processing** and "We've sent a confirmation email".
8. Open your inbox: **Transfer Credit Application Received — APP-…** with a **Track Application** button.
9. Click **Track Application**. Enter the application number and email.
10. The tracking page shows **Processing**, then **Department Review**: three courses evaluated by established equivalency, three pending at 0 BU units. You receive **Course Evaluation Update**.

**Backend and staff** (sign-in at `/login`; passwords are those set at **Import roster**)

11. Sign in as `evaluator.cs@bu-transfer.local`. Open **CSC 220**. **Record decision → Request more information → Course syllabus → Send request**.
12. Applicant: you receive **Additional Information Required**. On the tracking page, CSC 220 shows **Action needed**. Upload `CSC_220_Syllabus_Riverside.pdf` there and click **Send syllabus**.
13. Evaluator: CSC 220 shows **Syllabus received**. Decide **Equivalent BU course** (CAS CS 112). The next evaluator receives the hand-off.
14. Sign in as `evaluator.math@bu-transfer.local`. **MATH 22** (4 quarter credits = 2.66 BU units) → **Equivalent BU course**.
15. Sign in as `evaluator.psych@bu-transfer.local`. **PSY 210** → **Elective credit**, or **No credit** with a reason to show a not-accepted course.
16. Every course is decided. The application enters **Final Review** and you receive **Your Transfer Credit Is in Final Review**.
17. Sign in as `credit.office@bu-transfer.local`. Open the application from **Final review**.
    - Show the applicant's comments and **Applicant updates** (each email and its delivery status).
    - Optionally **Return** a decision and have the evaluator decide again. The applicant gets no email for this internal step.
18. Click **Finalize and post**.

**Applicant**

19. You receive **Your Transfer Credit Decision Is Available**.
20. Track Application shows:
    - **Completed**, with every stage done;
    - BU credits awarded, courses accepted and courses not accepted;
    - each course with its BU equivalent or elective credit, credit type, units and grade T;
    - a not-accepted course with an applicant-friendly explanation.

## 19. Test credentials for staff

| Role | Login | Lands on |
|---|---|---|
| Evaluator: Computer Science | `evaluator.cs@bu-transfer.local` (Dr. Michael Smith) | Evaluator Dashboard |
| Evaluator: Mathematics | `evaluator.math@bu-transfer.local` (Dr. Anita Rao) | Evaluator Dashboard |
| Evaluator: Psychology | `evaluator.psych@bu-transfer.local` (Dr. Laura Bennett) | Evaluator Dashboard |
| Credit Evaluation Office | `credit.office@bu-transfer.local` (Jordan Ellis) | Credit Evaluation Office |
| Administrator | `admin@bu-transfer.local` (Avery Collins) | Admin Dashboard |

**Passwords:**
- Production: passwords are not stored in the code or the roster. Each account has the initial password entered at **Evaluators → Import roster**, and existing accounts keep theirs.
- Local test database seeded with `npm run db:seed:workflow`: `Demo@1234`.

**Applicants** have no credentials: application number + email.

## 20. Known assumptions

The problem statement does not define these. They are implementation choices, not official BU rules:

1. **No applicant account.**
   - The applicant is identified by email.
   - The application number + email is the credential for tracking.
   - The problem statement only says students see their status in MyBU Student; the tracking page stands in for that status view.
2. **Duplicates.** Multiple applications per email are allowed. While an earlier one is active, the new one is flagged for the Credit Evaluation Office, which decides (section 4).
3. **Required fields.**
   - Name, email, previous institution, intended program and start term are required. The start term is needed for the one-year transfer deadline.
   - GPA, credits, phone and date of birth are no longer asked of applicants; the transcript carries the coursework.
   - The staff eligibility report shows criteria that need these as "unable to determine".
4. **Documents.**
   - At least one transcript is required to submit.
   - Supporting documents are optional; a syllabus is requested per course only when a department needs one.
   - Accepted types and the 10 MB limit are the existing API limits.
5. **Which status changes are emailed** is the list in section 15. "Documents processing started" and "Course evaluation started" are covered by the confirmation email, because processing begins within seconds of submission.
6. **Each information request is emailed separately.** Two syllabus requests at once produce two emails.
7. **Email delivery:**
   - Up to five attempts with backoff, then marked failed and visible to the Credit Office.
   - Reserved/test domains are never emailed.
8. **Email links** pre-fill the application number only. The applicant types their email, so a forwarded email does not open the application.
9. **Course explanations.** For courses not accepted, applicants see a policy-rule reason (e.g. grade below the minimum) or a standard explanation. Evaluator reasons are treated as internal notes.
10. **Application numbers** continue the existing `APP-YYYY-NNNN` sequence.
