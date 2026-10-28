# Transfer Credit: Implementation Summary

What changed in the BU Transfer Portal (`2_Code/transfer-app`) to close the gaps found in `TRANSFER_CREDIT_RULE_AND_EDGE_CASE_REVIEW.md`, measured against *FDE AI Hackathon 5.0, Problem 1 · Transfer credit evaluation* (`Hackathon'26/Boston University.docx`). Branch `feature/credit-lifecycle`, not yet merged or deployed.

The application now runs the whole process in the problem statement, from self-check to posted credit. Each course moves through these steps, and the state after each one is stored in the database:

```
Self-check → transcript → courses read → equivalency check ─┬─ established equivalency → applied by the Credit Evaluation Office
                                                            ├─ policy outcome (grade below C, W, repeat) → applied
                                                            └─ maybe → syllabus requested if needed → department evaluator decides
   → BU equivalent / different BU course / elective credit / no credit → posted with grade T → student sees it
```

---

## 1. Problem statement coverage

| | Requirements | ✅ | 🟡 | ❌ | Coverage* |
|---|---|---|---|---|---|
| Original audit | 22 | 7 | 12 | 3 | 59% |
| After this work | 22 | 20 | 2 | 0 | **95%** |

\* Coverage counts a partial requirement as half.

**Remaining gaps (both 🟡).**
- *PS-20, measurable outcome.* The app now records the numbers needed to prove improvement: time from submission to posting, the share of courses settled without department work, and credits posted. Proving improvement still needs BU's current turnaround times as a baseline.
- *PS-22, data volume.* The sponsor supplied 41 BU courses, 76 peer courses and 33 past decisions; the plan was about 150, 200 and 100. Matching quality on a full catalog is unproven.

---

## 2. Changes made

### Student
- **Per-course results** on the status page, from the database. Each course shows:
  - its source course, institution, credits and grade;
  - a status in plain language;
  - the BU course or elective credit, and BU units (0 while pending);
  - a grade of T once posted;
  - a one-line explanation.
- **Summary tiles:** courses submitted, evaluated, pending, credits posted, and credits being posted. The one-year deadline is shown next to them.
- **Syllabus upload on the course that needs it.** The upload is linked to that course's request, and the student sees "Received, under department review".
- **Policy notes:** grade T, external grades not in the BU GPA, no Hub units, pending courses show 0 units.
- **Self-check page** (`/self-check`, linked from the home page). It labels each course: established equivalency, evaluated before, likely match, department review, or syllabus needed. It also explains quarter conversion and grade issues, and lists what to send. It is labelled "not an official decision" and stores nothing.
- Wording that mentioned AI on the home and status pages was replaced with plain process wording. The browser no longer applies its own 80% / 60% thresholds to a score.

### Evaluator
- **Full decision model on the review page.** Options are revealed one at a time:
  - Equivalent BU course;
  - Different BU course, using a BU catalog search with one or more courses for a combined award;
  - Elective credit, with an optional label;
  - No credit, which requires a reason.
- **BU units:**
  - shown as calculated, including quarter conversion;
  - required when the transcript has no credits.
- **Request information:** choose *Course syllabus* or *Other information*. The student's answer returns the course to the evaluator with a notification. The banner shows "Syllabus received" with the date and the reply.
- **View syllabus** opens the student's file. The *Matching evidence* section records when the syllabus was compared with the catalog.
- **Attention notes:**
  - Pass grade to confirm;
  - unreadable grade;
  - missing credits;
  - "evaluated together with" for a lecture and lab or a course sequence.
- **Potential equivalency conflict** section: shows the institution, the course, the established equivalency, and every earlier decision with its evaluator and date. Actions:
  - *Use established equivalency*;
  - *Override earlier decisions*, which notifies the Credit Evaluation Office;
  - *Request additional review*.
- **Previous decisions** shows how many times the established equivalency was applied.
- **Assignment context** is a list of reasons. Reassignment history appears in *Evaluation history*.
- **Honest match display:** a percentage appears only for a computed content similarity. A catalog match level or an approved equivalency is shown by its name, without a percentage.

### Credit Evaluation Office (new role `credit_office`)
- **Dashboard** (`/office`) with these sections:
  - ready to post;
  - courses with departments;
  - courses settled without department work;
  - credits posted;
  - decided courses to post;
  - courses waiting for an evaluator, with *Assign where possible*;
  - possible duplicates;
  - deadline issues;
  - syllabi pending and received;
  - recent activity.
- **Application page** (`/office/applications/:id`). Courses are grouped by institution, each with its state, decision, who decided it, units and grade T. It also has:
  - *Post decided courses*;
  - a duplicate comparison with *Keep separate* or *Close as duplicate*;
  - a deadline panel with *Record exception*;
  - *Assign / Reassign* per course, listing eligible evaluators ranked with reasons;
  - requests to the student, documents and history.
- Access to the applications list, course equivalencies and equivalency conflicts. *Mark as resolved* was added to conflicts.
- **Process existing applications:** applies the new lifecycle to applications evaluated before this release. It is safe to run more than once.
- All of this is enforced by the API (`/api/office/*`, admin and credit office only), not just hidden in the menu.

### Admin
- Sidebar link to the Credit Office. Needs-attention items for ready to post, possible duplicates and syllabus requests.
- The Completed metric shows credits posted and courses settled by established equivalency.
- **Evaluators page:**
  - an availability control (*Mark unavailable until …* / *Mark available*);
  - deactivating or marking unavailable reassigns open courses automatically, and the count is shown.

### Matching
- **Course-code normalisation.** CS1800, CS 1800, CS-1800 and cs 1800 match as the same course; different codes still do not. The transcript keeps the code as written, and the catalog spelling is stored next to it (`catalog_code`).
- **Grade normalisation.** Letter grades A+ to F (any case, spaces), P / Pass / CR, F / Fail / NC, W / Withdrawn, I / IP, missing and unreadable grades are all handled.
- **Missing credits stay missing.** They used to become 0 in two places; that is fixed.
- **Repeated courses earn credit once**, for the best grade (latest on a tie). Every attempt stays on the transcript.
- **Content suggestions need a credible match** (similarity ≥ 0.25). Without one, no BU course is invented and no "must be taken at BU" rule is inferred from an unrelated course.
- **Combined awards keep every BU course,** e.g. CAS CH 101 + CAS CH 102, through recommendation, decision and posting.
- **A syllabus received is read and the course is compared again,** with the result stored on the course's evaluation.

### Equivalency
- **Step 4 implemented:** an established equivalency is applied by the Credit Evaluation Office without department work (`decided_via = established_equivalency`). It goes to an evaluator instead when earlier decisions conflict with it, and the reason is shown.
- **Conflicts can be marked resolved** (`conflict_resolutions`). A later disagreeing decision reopens the conflict. Evaluator actions on conflicts are recorded too.
- **Match-divergence conflicts compare only computed similarities,** not catalog levels against scores.

### Assignment
- **Only active, available evaluators are assigned.** Unavailable is a new state for leave; inactive already existed.
- **The subject comes from the BU target or the source course's own program,** never the student's major. With no subject specialist, a course goes to a general credit evaluator with capacity. Otherwise it waits in the Credit Evaluation Office queue for manual assignment.
- **Each assignment stores its context:** expertise, availability and workload, including who was passed over for capacity.
- **Reassignment:**
  - manual: a chosen evaluator, the best eligible one, or the office queue;
  - automatic: when an evaluator is deactivated or marked unavailable.
  - Full history is kept in `review_assignments`.
- **No hand-off can stall:** if the open courses are settled automatically, the next evaluator's courses open.
- **"Needs attention" ordering:** handed-over courses now rank before other new work, as documented.

### Documents
- **Syllabi are linked to the course and to the request that asked for them.**
- **Evaluators can no longer upload application documents** (403).
- **Document access is scoped:** an evaluator can open documents only for applications with a course assigned to them.

### Final posting
- **`credit_postings` stores one row per course.** Each row holds the outcome, BU course(s), units, grade T (none for no credit), the source grade, `counts_in_gpa = false` and `hub_units = 0`. The last two are enforced by database checks.
- **Posting is blocked:**
  - after the one-year deadline, unless an exception is recorded;
  - while a duplicate is unresolved;
  - on a closed application.
- **A posted decision cannot be changed.**
- **Application statuses are derived from the courses:**
  - *information required* while the student owes something;
  - *under evaluator review* while courses are undecided;
  - *ready for posting* when every course is decided (the office is notified);
  - *credit posted* when every course is posted (the student is notified, and the decision date is set).

### Data / database
- **Migration `009_credit_lifecycle.sql`** (section 3), additive and idempotent.
- **Synthetic scenarios** grew from 5 to 11 applications and from 2 to 3 past decisions (section 3).
- **Roster:** adds one Credit Evaluation Office account, `credit.office@bu-transfer.local` (Jordan Ellis).

### Rules (policy module `services/credit/policy.js`)
Every rule cites the problem statement. Values the statement doesn't define are configurable and marked ASSUMPTION (section 7).

---

## 3. Database changes

**Migration `009_credit_lifecycle.sql`.** No data is removed.

| Object | Change |
|---|---|
| `user_role` enum | + `credit_office` |
| `application_status` enum | + `ready_for_posting`, `credit_posted` |
| `transcript_courses` | + `catalog_code`, `repeat_of`, `syllabus_document_id`, `syllabus_text`, `syllabus_received_at` |
| `course_evaluations` | + `missing_information[]`, `combined_with[]`, `syllabus_compared` |
| `information_requests` | + `transcript_course_id`, `kind` (`information` / `syllabus`), `document_id`, `responded_at` |
| `application_documents` | + `transcript_course_id`, `information_request_id` |
| `course_decisions` | + `decision_type`, `bu_units` (≥ 0), `decided_via` (`evaluator` / `established_equivalency` / `policy_rule`), `conflict_action`. Existing rows backfilled. |
| `credit_postings` (new) | One row per posted course. Checks: `counts_in_gpa = false`, `hub_units = 0`, no credit means 0 units and no grade. Unique per course. |
| `applications` | + `duplicate_status` (`suspected` / `not_duplicate` / `confirmed`), `duplicate_reason`, `deadline_exception`, `deadline_exception_by`, `posted_at`. Index on `LOWER(student_email)`. |
| `course_reviews` | + `queue` (`evaluator` / `credit_office`), `assignment_context`. Status adds `withdrawn`. |
| `review_assignments` (new) | Assignment history. Existing reviews backfilled. |
| `evaluators` | + `availability` (`available` / `unavailable`), `unavailable_until` |
| `conflict_resolutions` (new) | Resolution actions on equivalency conflicts |

**Records added.**
- One `credit_office` staff account, through the roster import.
- No sponsor data was changed or replaced.

**Synthetic records (`supabase/seed/synthetic_audit_scenarios.sql`, all `data_source = 'synthetic'`).**

| Application | Scenario |
|---|---|
| APP-2026-9101 | Pass grade on an established equivalency; A+ |
| APP-2026-9102 | Repeated course; "CS1800"; missing credits |
| APP-2026-9103 | Unknown course with no subject specialist |
| APP-2026-9104 | Second application from the same student (duplicate) |
| APP-2026-9105 | Conflicting earlier decisions; start term long past |
| APP-2026-9106 | F, "fail", " b+ ", D, W |
| APP-2026-9107 | Four institutions, one on the quarter system |
| APP-2026-9108 | Combined lecture + lab course awarded as two BU courses; "maybe" courses |
| APP-2026-9109 | Started just over a year ago |
| APP-2026-9110 | Started within the last year |
| APP-2026-9111 | "Pass", missing, unreadable ("Z") and "P/F" grades |

Past decisions: PD-S001 and PD-S002 (a conflict), PD-S003 (a combined award).

---

## 4. API and service changes

### New services

| Service | Responsibility |
|---|---|
| `services/credit/policy.js` | Grades, course keys, unit conversion, deadline, and every policy constant |
| `services/workflow/lifecycle.service.js` | Established outcomes, course states, application status, posting, deadline, duplicates, student view |
| `services/workflow/information.service.js` | Course-level requests and the student's answers (syllabus loop) |
| `services/selfcheck.service.js` | Student self-check |

### Changed services

| Service | Change |
|---|---|
| `engine.js` | Grade and missing-credit holds, normalised keys, repeats, similarity floor |
| `credit.service.js` | Missing credits kept, catalog code and repeat stored, `rematchCourse` |
| `assignment.service.js` | Availability, office queue, context, history, reassignment, `placeOfficeQueue`, idle hand-off |
| `review.service.js` | Decision model, units, conflict actions, syllabus, status refresh |
| `knowledge.service.js` | Conflict resolutions, reuse count, normalised codes |
| `memory.service.js` | Decision type, units, posted-decision lock |
| `application.service.js` | Duplicate check, established outcomes before assignment, eligibility wording from the API |
| `document.service.js` | Scoped access |
| `notification.service.js` | New notification types |
| `roster.service.js` | Credit office accounts, office queue placement |

`transcript-parser.js` also gained `extractText`.

### New endpoints

| Endpoint | Purpose |
|---|---|
| `GET /api/office/overview` | Credit Office dashboard |
| `GET /api/office/applications/:id` | Office view of one application |
| `POST /api/office/applications/:id/post` | Post decided courses |
| `POST /api/office/applications/:id/deadline-exception` | Record a deadline exception |
| `POST /api/office/applications/:id/duplicate` | Resolve a suspected duplicate |
| `GET /api/office/reviews/:id/eligible-evaluators` | Ranked evaluators for a course |
| `POST /api/office/reviews/:id/assign` | Assign or reassign a course |
| `POST /api/office/queue/place` | Place office-queue courses where possible |
| `POST /api/office/process-existing` | Apply the lifecycle to earlier applications |
| `GET /api/office/evaluators` | Evaluators with availability and workload |
| `POST /api/office/evaluators/:id/availability` | Mark an evaluator available or unavailable |
| `POST /api/office/evaluators/:id/reassign-open` | Move an evaluator's open courses |
| `POST /api/admin/conflicts/resolve` | Mark a conflict resolved |
| `GET /api/my/bu-courses` | BU catalog search for evaluators |
| `GET /api/student/self-check/institutions`, `POST /api/student/self-check` | Self-check |

### Changed endpoints

| Endpoint | Change |
|---|---|
| `POST /api/my/reviews/:id/decision` | Decisions `equivalent`, `different_course`, `elective`, `no_credit` (plus the older `accept` / `reject`), with `bu_course`, `elective_label`, `units` and `conflict_action` |
| `POST /api/my/reviews/:id/request-info` | Adds `kind` (`syllabus` / `information`) |
| `GET /api/my/reviews/:id` | Adds syllabus, units, missing information, combined courses, assignment context and history, and the match kind |
| `GET /api/student/status/:token` | Adds `results` (summary, deadline, per-course state). The eligibility score is no longer sent. |
| `POST /api/student/status/:token/info-requests/:id/respond` | Also accepts a file (multipart) |
| `GET /api/admin/conflicts`, `POST /api/admin/conflicts/standard` | Also open to the Credit Office |
| `/api/applications/*` | Staff only. Evaluators read only applications with a course assigned to them; changes are for administrators and the Credit Office. |
| `PUT /api/evaluators/:id`, `DELETE /api/evaluators/:id` | Deactivation reassigns open courses |
| `GET /api/admin/overview` | Adds lifecycle counts |

---

## 5. UI changes

| Page / component | Change |
|---|---|
| `pages/student/ApplicationStatus.jsx` | Per-course results, summary, deadline, upload per request, policy notes, new timeline |
| `pages/student/SelfCheck.jsx` (new) | Course self-check |
| `pages/Home.jsx` | Self-check link; process steps match the problem statement |
| `pages/evaluator/ReviewDetail.jsx` | Decision model, BU course picker, units, syllabus, conflict actions, attention notes, honest match display |
| `pages/evaluator/MyEvaluations.jsx` | Match level without a fake percentage |
| `pages/office/OfficeDashboard.jsx`, `OfficeApplication.jsx` (new) | Credit Evaluation Office workspace |
| `pages/admin/Dashboard.jsx` | Lifecycle items and metrics |
| `pages/admin/UserManagement.jsx` | Availability control; reassignment counts |
| `pages/admin/Conflicts.jsx` | Mark as resolved |
| `pages/evaluator/Dashboard.jsx` (applications list) | Opens the office view; duplicate flag |
| `components/evaluator/AIEvaluationReport.jsx` | Eligibility wording comes from the API |
| `components/evaluator/CreditEvaluation.jsx` | Candidate ranking scores no longer shown as % |
| `App.jsx`, `Sidebar.jsx`, `StaffTopbar.jsx`, `ProtectedRoute.jsx`, `Login.jsx` | Credit Office role and routes |
| `StatusBadge`, `StatusPill`, `Badge`, `lib/reviews.js`, `lib/staffFormat.js` | New statuses, decision labels, activity labels |

The login page design is unchanged.

---

## 6. Test results

All suites ran on 28 October 2026 against the real backend. The local database (PGlite) was rebuilt from the migrations and every seed (sponsor workbook, 3_Data, 11 sample students, staff roster, workflow demo). Each suite ran on a fresh copy of the seeded database.

| Suite | Result |
|---|---|
| `npm run credit:eval` (76-row answer key) | 76/76 path, 76/76 award |
| Lifecycle suite (new, 67 checks) | **67/67 pass** |
| Role and access suite | 22/22 pass |
| Review workflow suite | 20/20 pass |
| Knowledge suite | 16/16 pass |
| Frontend production build | Builds without errors |

**The 33 required test cases.**

| # | Case | Check(s) | Result |
|---|---|---|---|
| 1 | Standard transfer | LC-01 | Pass |
| 2 | Exact equivalency | LC-02 | Pass |
| 3 | Maybe match | LC-03 | Pass |
| 4 | Syllabus request | LC-04, LC-04b | Pass |
| 5 | Syllabus response | LC-05, LC-05b, LC-05c | Pass |
| 6 | Elective credit | LC-06 | Pass |
| 7 | Different BU course | LC-07, LC-07b | Pass |
| 8 | Reject (no credit) | LC-08, LC-08b | Pass |
| 9 | Established equivalency | LC-09 | Pass |
| 10 | Equivalency conflict | LC-10, LC-10b, LC-10c | Pass |
| 11 | Previous evaluator decision | LC-11 | Pass |
| 12 | Multiple evaluators | LC-12, LC-12b | Pass |
| 13 | Workload assignment | LC-13 | Pass |
| 14 | Inactive evaluator | LC-14, LC-14b | Pass |
| 15 | No subject specialist | LC-15 | Pass |
| 16 | A+ | LC-16 | Pass |
| 17 | Pass | LC-17, LC-17b | Pass |
| 18 | Fail | LC-18, LC-18b–e | Pass |
| 19 | Repeat course | LC-19 | Pass |
| 20 | Missing credits | LC-20, LC-20b, LC-20c | Pass |
| 21 | Unknown course | LC-21 | Pass |
| 22 | Duplicate application | LC-22, LC-22b, LC-22c | Pass |
| 23 | Multiple institutions | LC-23 | Pass |
| 24 | Multiple transcripts | LC-24 (four institutions, incl. quarter) | Pass |
| 25 | Partial application | LC-25 | Pass |
| 26 | One-year deadline | LC-26, LC-26b–d | Pass |
| 27 | Hub units | LC-27, LC-27b | Pass |
| 28 | External grade / GPA | LC-28, LC-27b | Pass |
| 29 | Final posting | LC-29, LC-29b, LC-29c | Pass |
| 30 | Student transparency | LC-30 | Pass |
| 31 | Pending course | LC-31 | Pass |
| 32 | Combined lecture / lab | LC-32, LC-32b, LC-32c | Pass |
| 33 | Request-more-information workflow | LC-33 | Pass |

**Additional checks:**
- course-code normalisation (LC-CODE, LC-CODE-b);
- role security, 11 checks (SEC);
- self-check (LC-SELF);
- dashboard numbers match the database (LC-DASH);
- suggested demo scenario (LC-DEMO);
- processing existing applications is safe to repeat (LC-BACKFILL, LC-BACKFILL-b).

**Requires an external dependency (not run):**
- scanned or image transcripts and agent validation (the Foundry agent is not configured locally);
- real Supabase Auth and storage (a stand-in was used).

**Not applicable:**
- lab-bundled credit policy (needs BU policy);
- evaluator conflict of interest (no such data).

---

## 7. Assumptions and policy configuration

The problem statement does not define these. Each one is isolated in `policy.js` or the engine and can be changed without code changes where noted.

| Assumption | Default | Where | Change with |
|---|---|---|---|
| Minimum grade ("many BU schools require C") | C | `policy.js` | `TRANSFER_MIN_GRADE` |
| Pass/Fail grades | `review`: the department confirms (never automatically no credit) | `policy.js` | `TRANSFER_PASS_GRADE_POLICY` = `review` / `accept` / `reject` |
| BU term start dates, used to turn a start term into the one-year deadline | Fall 09-01, Spring 01-15, Summer 05-15 | `policy.js` | `TRANSFER_TERM_STARTS` |
| Deadline length | 12 months | `policy.js` | `TRANSFER_DEADLINE_MONTHS` |
| Deadline warning | 60 days | `policy.js` | `TRANSFER_DEADLINE_WARNING_DAYS` |
| Which repeat attempt counts | Best grade, latest on a tie | `policy.js` | Code |
| Established equivalencies applied without department work | On | `lifecycle.service.js` | `AUTO_APPLY_ESTABLISHED=false` |
| Grade below the minimum, W and repeats applied as policy outcomes without department work | On (deterministic rules only; the R6/R7/R8 rules still go to departments) | `lifecycle.service.js` | Code |
| Credible content match | Similarity ≥ 0.25 (calibrated on the sample data: genuine matches 0.28–0.85, an unrelated course 0.19) | `engine.js` | Code |
| A suspected duplicate | Same email, or same name and date of birth, as an earlier open application | `lifecycle.service.js` | Code |

---

## 8. Deploying

1. Run `supabase/migrations/009_credit_lifecycle.sql`, then `010_final_review.sql`, then `011_applicant_experience.sql`, in the Supabase SQL editor. All three only add to the schema.
2. Merge and push. The GitHub Actions workflow builds and deploys as before.
3. As an administrator, import the staff roster again on the Evaluators page. This creates the Credit Evaluation Office account and the demo student account (`maya.ortiz@students.example.org`, linked to her sample application); existing accounts keep their passwords.
4. As an administrator or the Credit Office, open the Credit Office dashboard and click **Process existing applications** once. Established equivalencies are applied to applications evaluated earlier, and unopened reviews of those courses are withdrawn.
5. Optional: run `supabase/seed/synthetic_audit_scenarios.sql`, then click **Run evaluation** on APP-2026-9101 to 9111 to demonstrate the edge cases.

---

## 9. Remaining limitations

These can't be solved from the supplied requirements and data:

- **BU policy not in the problem statement:**
  - Pass/Fail grades;
  - the term start dates behind the one-year deadline;
  - lab-bundled credits;
  - which repeat attempt counts;
  - the minimum grade per school.
  
  Each is configurable (section 7) and needs BU's confirmation.
- **No real MyBU Student integration.** "Posted to MyBU Student" is modelled as the posting record shown on the student status page.
- **No Transferology integration.** The self-check uses the portal's own equivalency data.
- **The matching engine is only checked on a small catalog.** The data is smaller than planned (PS-22), so the content-match threshold is calibrated on few examples.
- **External dependencies are not verified locally:**
  - the external review agent and scanned-transcript reading need the Foundry agent;
  - document storage and authentication need the real Supabase.
- **Merging duplicate applications is not offered.** The Office can keep both applications or close one, because the problem statement doesn't describe a merge.
- **Degree-requirement rules in the sample data are notes, not enforced:**
  - R8, Biology residency;
  - R9, substitutions.
  
  They concern degree audit, not transfer posting.

---

## 10. Second round: the student journey and the Credit Office final review

Added on branch `feature/student-journey`. It makes the whole story run in one connected flow, from the landing page to the student seeing their awarded credits. `END_TO_END_TRANSFER_CREDIT_DEMO.md` walks through it.

### What changed

| Area | Change |
|---|---|
| Landing page | **Start Transfer Credit Evaluation** is the main action. *Track your application* now points to the student portal. |
| Sign-in | One split-layout sign-in page (BU red panel, form on the right) for every role; the account's role decides where each person lands. Students can create an account there. |
| Student accounts | `POST /api/auth/register` creates a `student` account and signs it in. Staff accounts are still created only by administrators. |
| Application | Four steps: student information (from the account), academic information, documents, review and submit. Unnecessary fields were removed: address, personal statement, ID. |
| Draft, upload, submit | The application is saved as a draft; transcripts (one per college, required) and supporting documents (optional) are attached and read on upload; **Submit** (`POST /api/student/applications/:token/submit`) refuses a draft without a transcript, then starts processing. This fixes an old race where evaluation could start before the transcript arrived. Unfinished drafts can be resumed. |
| Student portal | `/student` lists the student's own applications with database counts: courses, evaluated, pending, action needed, credits awarded (`GET /api/student/me/applications`). Each application opens its status page with the per-course results. |
| Status page | Progress: Submitted → Documents Processed → Course Evaluation → Evaluator Review → Final Review → Completed. "We're reviewing your academic documents" while processing; a notice if the transcript couldn't be read (the Credit Office is notified). |
| Evaluator | Decision options now include **Request more information**. Credits can be adjusted for any awarded outcome. Elective credit has a category. A **Returned by the Credit Evaluation Office** banner appears on a returned course. The dashboard adds workload and the number of open courses with a potential conflict. My Evaluations shows the assignment context. The transcript drawer also lists supporting documents. |
| Credit Evaluation Office final review | Each decided course shows *Awaiting final review* with who decided it. **Return** sends one decision back (`POST /api/office/courses/:id/return`, reason required): the decision is removed (kept in the audit trail, its precedent revoked) and the course reopens for its evaluator, or for an assigned evaluator if it was settled automatically. **Finalize and post** posts the reviewed courses. The dashboard adds an *Escalations* list. Posted courses cannot be returned. |
| Students and staff isolated | Students reach only their own applications; every staff API refuses them, and the student API refuses staff. |

### Database

Migration `010_final_review.sql` adds `course_reviews.returned_reason` and `returned_at`.

The roster adds a `students` list: one synthetic demo student, linked to her existing application by email.

### What the Credit Office can and cannot do

- **The office can return a decision; it cannot modify the academic outcome itself.** The problem statement says academic departments make the final decision, so the office's review step is to accept a decision for posting or return it to the evaluator.
- **"Request information" stays with the evaluator,** who owns the course. The office follows up on unreadable transcripts outside the app.

### Tests

| Suite | Result |
|---|---|
| Student journey (new, 25 checks) | **25/25**. Covers registration, draft rules, upload of the STU-001 transcripts, 6 courses extracted across 2 colleges, 3 established equivalencies applied, 3 courses assigned, student isolation, syllabus request and response, decisions and hand-offs, office return of an evaluator decision and of an auto-settled course, re-decision, posting with grade T, and the student's final view. |
| Lifecycle | 67/67 |
| Roles | 22/22 |
| Review workflow | 20/20 |
| Knowledge | 16/16 |
| Course matching (`credit:eval`) | 76/76 |
| Frontend production build | Passes |

### Still not covered

- **No manual course entry.** Transcripts must be PDFs with a text layer in the sample layout, unless the Foundry agent is configured. Otherwise the transcript is stored, the student is told, and the office is notified.
- **No real MyBU Student connection.** "Posted" is shown on the student's status page.
- **Email:** sending depends on the deployment's email settings; notifications are always stored and shown in the app.

## 11. Third round: applicant-first intake, tracking and email updates

The full walkthrough, routes, rules and assumptions are in `END_TO_END_TRANSFER_CREDIT_DEMO.md`.

### What changed
- **No applicant account.**
  - **Start Transfer Credit Eligibility** opens a four-step application (`/apply`): Applicant Information, Academic Documents, Additional Information, Review & Submit.
  - It reuses the existing draft → upload → submit pipeline.
  - Applicants track with application number + email at `/track`.
- **Duplicate emails.**
  - A masked existing-application panel offers Track Existing Application, Email me my application number, or Submit Another Application.
  - A second application while one is active is flagged for the Credit Evaluation Office (existing duplicate workflow).
  - Duplicate detection now ignores finished applications.
- **Applicant notifications.**
  - One service (`notifications/applicant-notification.service.js`) with separate templates and a retrying email outbox on the `notifications` table.
  - The transport is configured by environment (`smtp` or development `log`).
  - Only applicant-visible stages are emailed.
- **Tracking page.**
  - Server-computed six-stage progress from the status history (audit `status_changed` rows).
  - Course table with status, transfer result, credit type and units; final outcome summary.
  - No internal data. Evaluator reasons for "no credit" are no longer shown to applicants.
- **Staff.**
  - The sign-in page is staff-only ("Welcome back") and self-registration was removed.
  - The Credit Office page shows the applicant's comments and every applicant update with its email delivery status.

### Database
Migration `011_applicant_experience.sql` adds:
- `applications.applicant_comments`;
- email delivery columns on `notifications`: `email_status`, `email_attempts`, `email_error`, `email_next_attempt_at`, `emailed_at`;
- indexes.

### Configuration
- `APP_URL`: used for the Track Application links in emails.
- SMTP variables, to send real email; without them, emails are logged.
- Optional: `EMAIL_PROVIDER`, `EMAIL_FROM_NAME`, `EMAIL_SUPPRESS_DOMAINS`, `EMAIL_OUTBOX_DIR`, `TRACK_RATE_LIMIT_MAX`.

### Demo data
`npm run db:seed:applicants` advances four sample applications to:
- an existing application;
- additional information required;
- mixed outcomes;
- completed.
