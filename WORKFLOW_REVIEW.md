# Workflow, Evaluator Experience and Performance Review

A review of the BU Transfer Credit Portal (`2_Code/transfer-app`) as it is on `main` after PRs #6–#8. Every finding was traced through frontend, API, service and database, and checked against the running app where possible. **No code was changed for this review.**

Each item covers how it works today, what to change and why, the impact on existing behaviour, and the size of the change.

## Implementation status (branch `feature/workflow-improvements`)

| # | Item | Status |
|---|---|---|
| 1 | Reassign | **Done.** Evaluators: *Request reassignment* with four reasons (`POST /api/my/reviews/:id/reassign`). Department or expertise reasons go to the best eligible evaluator, never back to the requester, else the office queue; additional review or correction go to the office queue and notify the office. History keeps the earlier holder with the reason. Office/admin: **Reassign** on the evaluation report's course table |
| 2 | Staff on public pages | **Done.** Public bar shows who is signed in, **My workspace** and **Sign out**; `/apply` offers *Go to my workspace* / *Sign out and continue as a student*; an expired session clears the in-memory user; `/self-check` is a public page for the 401 handler |
| 3 | Parallel evaluation | **Done (recommended default).** Every evaluator's courses open at assignment; *Process existing applications* opens courses queued under the old hand-off; the application-status race is fixed (one status change and one set of notices when evaluators finish together) |
| 4 | Grouped list | **Done.** *My Evaluations* shows one record per Transfer Credit ID with per-course progress counted in SQL; each course is still opened and counted on its own |
| 5 | Performance | **Done.** Confirm decision runs independent steps together; the consistency check reuses the loaded review (1 query instead of 18); transcripts are parsed once (cached by file hash); every API response carries `Server-Timing`, and requests over 1.5 s are logged |
| 6 | Toasts | **Done.** All 73 pop-ups replaced: successes appear in place at the top of the page, errors inside the open dialog; sign-in has no pop-up; sign-out confirms on the page you land on |
| 7 | Period and term counts | **Done (term = BU start term).** Evaluator and admin dashboards gain a filter bar: BU start term, Today, This week, This month, All time, Custom range. Counts come from SQL (`GET /api/my/counts`, `GET /api/admin/counts`) |
| 8 | Transcript wording | **Done.** Green check with "From your transcript" for screen readers and on hover; "courses found" |
| 9 | Data sharing | **Not changed.** It was a review question; the recommendations below stay open for a decision |

Verified on a local database rebuilt from all migrations and seeds:
- workflow checks, 25/25;
- existing scenario suite, 24/24;
- credit engine answer key, 76/76;
- AI-feature API checks, 12/12;
- browser sweep of 75 pages across every role: no errors (the only flags were the word "unavailable" in a filter description);
- frontend build and undefined-reference scan clean.

---

## Summary

| # | Item | Finding | Recommendation | Size | Needs your decision |
|---|---|---|---|---|---|
| 1 | Reassign | Exists only for the Credit Office and admin, per course, on the Office application page. Evaluators cannot hand a course back. Nothing was removed | Add **Request reassignment** for evaluators (reason required). Show the existing Reassign on the evaluation report for office and admin | Small–medium | No |
| 2 | Staff on public pages | `/apply` says "You are signed in as staff" with no way out; the public bar shows **Staff Sign In** although signed in. An expired session on a public page keeps a stale user until reload | Show who is signed in, **Go to my workspace** and **Sign out**; clear the in-memory session on any 401 | Small | No |
| 3 | Sequential vs parallel | **Sequential today**: the first evaluator's courses open, the others wait (`queued`) until a hand-off | **Parallel**: every evaluator's courses open at assignment. Smallest change: one condition in `assignApplication`, plus a one-time step to open courses already queued | Small code, **behaviour change** | **Yes** |
| 4 | Grouped evaluator list | My Evaluations is one row per course | Group by Transfer Credit ID in the UI only; counts stay per course | Small | No |
| 5 | Confirm/Submit speed | No single slow step. Time is many **sequential database round trips** that add up on a remote database, plus a full page reload after saving. The consistency check (PR #7) reloads the whole review package on every outcome change | Return the decision with what changed instead of reloading; give the check a light query; upload transcripts in parallel and stop parsing each PDF twice | Medium | No |
| 6 | Toast pop-ups | 73 toast calls in 20 files, top-right, 4 s | Inline confirmation on the section that changed; errors inside the form; keep one quiet notice for background events | Medium (many files) | Light: approve the pattern |
| 7 | Dashboard periods | Counts are all-time (one "this month" figure) | Period filter (Today, This week, This month, Custom range) and **BU start term** filter, computed in SQL | Medium | **Yes**: what "term" means |
| 8 | "Detected from transcript" | Literal label next to each field | Green check with an accessible label, "From your transcript" on hover/screen reader | Small | No |
| 9 | Data sharing | Any evaluator with one course on an application sees every course, other evaluators' decisions **and reasons**, and the audit trail. The API also lets the Credit Office record an academic decision directly (unused by the UI) | Evaluators keep the full transcript but see other departments' **outcomes only**; remove or lock down the direct-decision endpoints | Small | **Yes** |

Also found, not in your list:
- **Race condition:** finishing the last two courses at the same moment can send the student and the Credit Office duplicate notifications. Parallel review makes this likely. Fix with a conditional update.
- Several duplicate status fields; see "Architecture" below.

---

## 1. Reassign / transfer evaluation

**Today**
- **Reassignment exists, but only for the Credit Office and admin.** On the Credit Office application page, each open course has **Reassign**. It lists eligible evaluators ranked with reasons (expertise, workload, availability), or sends the course to the Office queue.
  - API: `GET /api/office/reviews/:id/eligible-evaluators`, `POST /api/office/reviews/:id/assign` → `assignment.service.reassignReview`.
- **History is preserved, not overwritten.** Every holder is a row in `review_assignments` (`assigned_at`, `ended_at`, `end_reason`, `assigned_by`). Reassignment closes the open row and adds a new one, and writes a `review_reassigned` audit entry. The review page's *Evaluation history* shows the chain.
- **Automatic reassignment** happens when an evaluator is deactivated or marked unavailable (`releaseEvaluator`).
- **Correction after a decision:** the Office's **Return** (`returnToEvaluator`) reopens a decided course with a reason.
- **Evaluators have no way to say "this isn't my department".** Their only option is *Request additional review*, which is about equivalency conflicts.
- Git history shows **no evaluator reassign option was ever removed**. What you remember was probably the sequential **hand-off** (item 3) or the Office's Reassign.

**Recommended change**
- Add **Request reassignment** to the evaluator's review page (next to *Request information*). The evaluator picks a reason: *different department*, *outside my expertise*, *needs additional review*, *needs correction*. A note is required for the last two.
- What happens next:
  - *Different department* / *outside my expertise*: the course goes to the best eligible evaluator, excluding the requester, using the same ranking the Office sees. If nobody qualifies, it goes to the Office queue.
  - *Additional review* / *correction*: the course goes to the Credit Office queue, where the Office chooses.
  - Either way it reuses `reassignReview`, so `review_assignments`, the audit log and notifications stay exactly as today. The reason is stored in `end_reason` and shown in the history.
- Admin and Office: add the existing **Reassign** action to the evaluation report page they reach from Evaluation Lookup, so they don't have to go through the Office page.

**Impact:** additive. One evaluator endpoint (`POST /api/my/reviews/:id/reassign`) and one dialog. No schema change.

## 2. Staff signed in on student pages

**Today**
- Public pages (`/`, `/apply`, `/track`, `/self-check`) always use the public top bar, whoever is signed in (`Layout isPublic`). That bar shows **Staff Sign In** unless the user is a student, **even when a staff member is already signed in**, and it has no Sign out for staff.
- `/apply` with a staff session shows *"You are signed in as staff — Students submit transcripts without an account…"* with no action.
- Stale session: the API client's 401 handler removes the token from storage but **does not clear the in-memory user**. On public pages (no redirect), the page keeps believing someone is signed in until a reload. `/self-check` is missing from the handler's public-page list, so an expired session there redirects to sign-in unnecessarily.
- Signing in as a different user overwrites the stored token and user correctly. There's no evaluator-specific state that survives a role switch. The confusing part is the UI, not leaked data.

**Recommended change**
- **Public top bar, signed-in staff:** "Signed in as *Dr. Michael Smith (Evaluator)*", **Go to my workspace** (the role's home) and **Sign out**, instead of *Staff Sign In*.
- **`/apply` for staff:** the same identity line plus **Go to my workspace** and **Sign out and continue as a student**.
- **401 handling:** clear the session in the auth context too (one event the context listens to), and add `/self-check` to the public list.

**Impact:** UI only, plus a small auth-context change. No API change.

## 3. Sequential vs parallel evaluation

**Today (sequential)**
- At assignment, `assignApplication` groups an application's courses by evaluator and gives each evaluator a `sequence`. The evaluator whose subject matches the student's major goes first.
- Only the first sequence starts as `new`; the others are created as `queued`.
- When the active evaluator has no open courses left, `handOffIfDone` creates a `transfer_requests` row and opens the next evaluator's courses. `openNextSequenceIfIdle` covers the case where automatic outcomes emptied the first batch.
- The Credit Office queue is never held back. The application becomes `ready_for_posting` when every course has a decision (`refreshApplicationStatus`), regardless of order.

**Assessment**

| | Sequential (today) | Parallel (recommended) |
|---|---|---|
| Turnaround | Sum of every department's time | Slowest department's time |
| Real-world fit | Departments rarely depend on each other's decisions | Departments review their own courses independently |
| Context for later evaluators | Can see earlier decisions | Can still see decided courses as they complete (read-only) |
| Combined courses (lecture + lab, sequences) | Same evaluator anyway | Same: grouped courses go to one evaluator |
| Duplicate evaluation | Prevented: one review per course | Same (`course_reviews` and `course_decisions` are unique per course) |

**Recommendation: parallel.** The architecture is already course-level: one review and one decision per course, application status derived from all courses, Office readiness independent of order. The sequence is a gate layered on top, so removing it is small:

1. In `assignApplication`, every planned course starts `new` with `assigned_at = now()`, and every assigned evaluator is notified. This replaces the `startsNow` condition.
2. One-time "open queued courses" step, idempotent: `UPDATE course_reviews SET status = 'new', assigned_at = NOW() WHERE status = 'queued'`, with an audit entry. It runs from the Office's existing *Process existing applications* action.
3. `handOffIfDone` / `openNextSequenceIfIdle` then never find queued courses. They stay in place, harmless, and can be removed later. `sequence` remains as a display order.
4. Fix the status race (below), because parallel finishing makes it real.

**What happens when…**
- *One evaluator gives no credit or flags a course:* only that course is affected. Others continue. The application reaches the Office when every course has a decision, and the Office sees the no-credit outcome and its reason.
- *An evaluator requests the syllabus:* that course waits for the student (`information_required` for the application). The other departments carry on.
- *Partial completion:* already shown per course and per department on the Office page (*Current Review Assignment*); with parallel it fills in faster.
- *When the Office receives it:* unchanged. `ready_for_posting` once every course has a decision. It can also already see decided courses in *Final review* earlier.

**Impact (behaviour change)**
- Evaluators receive work earlier, so workload counts rise sooner.
- The *Waiting for hand-off* / *Upcoming* labels and the `transfer_request` notification stop appearing for new applications.
- Scenario TC17 (multiple evaluators) and the demo script describe a hand-off; both need updating.

**Race condition (fix with this change):** `refreshApplicationStatus` reads the status, then writes. Two evaluators finishing the last two courses together would both see the old status and both send the `ready_for_posting` notification and the student email. Fix: `UPDATE applications SET status = $new WHERE id = $id AND status = $old RETURNING id`; only the winner logs and notifies.

## 4. One grouped record per application for an evaluator

**Today:** *My Evaluations* lists one row per course review (`GET /api/my/reviews`). Each row already carries `application_id` and `reference_number`.

**Recommended change (UI only):**
- Group rows by Transfer Credit ID. Each group header shows the student, institution(s) and progress ("3 courses · 2 evaluated · 1 pending").
- Expand the group to see each course with its own status and **Open**.
- Tabs and dashboard counts stay **per course** from the API, so metrics are unchanged.

**Impact:** frontend only (`MyEvaluations.jsx`). No API or model change.

## 5. Confirm / Submit performance

Measured on the real services with every database query counted. *Local* = same machine. *25 ms* = each query delayed 25 ms to model the trip from Azure to a hosted database. Production latency is not known; Azure ↔ Supabase across regions is often 30–80 ms, which scales these numbers further.

| Operation | Queries | Local | 25 ms/query |
|---|---:|---:|---:|
| Evaluator opens a course (`GET /my/reviews/:id`) | 21 | 143 ms | 241 ms |
| Consistency check, each outcome change (`POST …/check`) | 18 | 38 ms | 155 ms |
| **Confirm decision** (`POST …/decision`) | ~19 (13 + 6 in a transaction), mostly sequential | 109 ms | **520 ms** |
| Page reload after the decision | 21 | 59 ms | 237 ms |
| Student: create draft | 3 | 27 ms | 96 ms |
| Student: upload each transcript (stored, **parsed again**, courses inserted) | 5–9 each | 60–452 ms | 202–516 ms |
| **Student: Submit for Credit Evaluation** | 10 | 66 ms | 329 ms |
| Background evaluation after submit (not waited on) | ~100 | 0.6 s | 2.1 s |

**Findings**
- **No step is slow on its own, and evaluation already runs in the background.** Course matching, the agent and assignment don't block Submit, and email is already sent asynchronously.
- **Evaluator Confirm** = about 19 database round trips, one after another, plus a full reload of the review (21 queries). At 25 ms per query that is about 0.75 s; at 60–80 ms it is 1.5–2.5 s. That matches "takes longer than expected".
  - The sequential steps: the decision transaction, recording any conflict resolution, the review status update, information-request closing, two audit rows, the transfer-request check, the hand-off check, and a full `courseStates` recalculation for the application status.
- **PR #7 added load:** the consistency check calls the full review package (18 queries) on every outcome change. If the evaluator confirms while a check is running, both compete for the database.
- **Student Submit, as the student experiences it**, is create draft + **each transcript uploaded one after another** (storage upload + PDF parsed again, although step 1 already read it) + submit. With three transcripts on a remote database and storage, that is several seconds.

**Recommendations (correctness unchanged)**
1. **Confirm:** return the decision, the review and the application status from `POST …/decision`, and update the page from that response instead of reloading the whole package. Run the independent writes (audit rows, information-request closing) in parallel inside the same request. The decision transaction and status update stay synchronous.
2. **Consistency check:** a dedicated light query (established equivalency, earlier decisions, BU course texts) instead of the full package; cancel an in-flight check when Confirm is pressed.
3. **Student submit:** upload transcripts in parallel. Cache the step-1 parse result by file hash for a few minutes so the upload doesn't parse the PDF again.
4. **Measure production:** add a `Server-Timing` header (or one log line per request with duration and query count) so the real latency is visible instead of estimated.

## 6. Toast pop-ups

**Today:** `react-hot-toast` in the top-right for 4 s: 31 success, 40 error and 2 neutral calls across 20 files (sign-in, sign-out, decisions, requests, uploads, Office actions).

**Assessment:** most success toasts repeat what the page already shows. After a decision, the review page shows a green *Department decision · name · date* banner. Errors in a toast disappear while the form that caused them stays open with no explanation.

**Recommended pattern**
- **Success on a record:** the section that changed shows it. For example, the decision banner briefly highlights "Saved just now", a course row's status updates with a short highlight, and a request shows "Sent to the student · just now". Remove the toast.
- **Errors:** shown inside the dialog or form, next to the button, which stays open with the user's input intact.
- **Navigation results** (sign-in, sign-out): no toast; the destination page is the confirmation.
- **Background events** (for example, the course handed to the next evaluator, or the application now ready for posting): one quiet notice at the bottom of the page, plus the existing notifications bell.

**Impact:** about 20 files touched with the same small pattern (a shared `InlineStatus` component). No API change.

## 7. Dashboard counts by period and term

**Today**
- *Evaluator dashboard:* course counts by status for the evaluator, all-time, plus "completed this month".
- *Admin overview:* all-time counts.
- All counts are computed in SQL (not in the browser), which stays.

**Data available for filtering:**
- `applications.submitted_at`;
- `applications.expected_start_term`: the student's **BU start term**, for example "Fall 2026";
- `course_reviews.assigned_at / started_at / completed_at`;
- `course_decisions.decided_at`;
- `credit_postings.posted_at`;
- `review_assignments` (reassignments).

**Recommended**
- A filter bar: **Term** (BU start term) | **Today · This week · This month · Custom range**.
- "Term" means the **student's BU start term**. That's the cohort the one-year deadline is based on, and the only term the data holds. The transcript term of each course would be a different, less useful filter.
- Period applies to the event behind each count:
  - Assigned: `assigned_at`; Completed: `completed_at`.
  - Received: `submitted_at`; Posted: `posted_at`.
  - Reassigned: `review_assignments` rows that ended with a reassignment.
- Open-work counts (pending, in progress, awaiting the Credit Office) are always "as of now". They are filtered by term only, because a period doesn't apply to a current state.
- Admin cards:
  - transcripts received;
  - courses;
  - pending / in progress / completed evaluations;
  - reassigned;
  - awaiting the Credit Office;
  - credit transfers completed.
- Evaluator cards: Assigned, In progress, Completed, Needs review (information received or returned).

**Impact:** `GET /api/my/dashboard` and `GET /api/admin/overview` accept `term`, `from` and `to` (defaults unchanged); the dashboard UI gains the filter bar.

## 8. "Detected from transcript"

**Today:** on *Review & Confirm*, each field read from the transcript shows a green check and the text **"Detected from transcript"**. Fields that weren't found ask for input.

**Recommended:**
- Keep the value and a **green check only**, with `aria-label` / tooltip *"From your transcript"*.
- One line above the group says "We filled these in from your transcript. Check they're right."
- Missing or conflicting fields keep their prompt.
- The upload list's "*N courses detected*" becomes "*N courses found*".

**Impact:** wording and markup only.

## 9. How data is shared between evaluators

| Question | Today |
|---|---|
| What does an evaluator see? | Their review: their course, the BU course, comparison, evidence, precedents, and the **student's full transcript** (all courses and grades), so sequences, repeats and lecture/lab pairs make sense |
| Other departments' courses? | **Yes.** Through the evaluation report (`/evaluator/applications/:id`, allowed if any course is theirs): every course with its outcome, **decision reason and decider**, plus the recent audit trail and all documents |
| Modify another evaluator's evaluation? | **No.** Decisions require owning the review (`ownReview`); applications are read-only for evaluators |
| Comments | The decision reason (`course_decisions.reason`) is visible to other evaluators on the application and to the Office. Reasons become precedents after names, emails and phone numbers are removed. There is no separate comment thread |
| Conflicts | Detected per source course across all decisions (`knowledge.service`). Evaluators choose *use established*, *override* or *request additional review*; the Office resolves and sets standards |
| Credit Office view | The combined record: every course with its state, decision, decider, units and grade T, grouped by institution (`courseStates`) |
| Central record | **Yes.** `applications` (one per student submission) → `transcript_courses` → one `course_reviews`, one `course_decisions` and one `credit_postings` row per course |
| Stored independently per course | **Yes.** Every decision is per course |
| Final decision | Derived: the application status follows its courses (`refreshApplicationStatus`); credit is the sum of posted course units. There is no separate overall decision to keep in sync |

**Gaps**
- Other evaluators' **reasons** and the audit trail are visible to any evaluator on the application. Realistically, departments see each other's *outcomes* but not internal notes.
- The API still lets the Credit Office and admin record an academic decision directly (`POST /api/applications/:id/courses/:courseId/decision` and `/courses/approve-automatic`). The UI never calls them, and they contradict "departments make the final decision".

**Recommended**
- Evaluators see other departments' courses with outcome and units, without the reason, decider or audit details.
- Remove the two direct-decision endpoints. Alternatively, keep them admin-only, require a reason, and label them *administrative override* in the audit trail.

---

## Architecture review

**Target model:** Student → Transcript submission → Extraction → Course identification → Department/evaluator assignment → **Parallel course evaluation** → Department completion → Credit Office review → Final credit.

**Already supported cleanly:**
- course-level model (one review, decision and posting per course);
- derived application status;
- Office final review and posting;
- assignment by expertise and workload with history;
- precedent memory and conflict detection;
- student transparency without internal data.

**Unnecessary coupling / duplicate data / inconsistent status**

| Issue | Where | Recommendation |
|---|---|---|
| Sequential gate on a course-level model | `sequence`, `queued`, `transfer_requests` | Item 3 |
| Two status systems for the same thing | `applications.status` (stored) and the ownership *stage* (derived) | Keep both, but document that status is for the student and the lifecycle, stage for staff |
| Legacy fields still written or read | `applications.assigned_evaluator_id` ("first evaluator owns the application"), `final_decision`, `approved` / `rejected` statuses | Stop using `assigned_evaluator_id` for ownership (the per-course owner is authoritative); keep the legacy statuses read-only |
| Review status repeats the decision outcome | `course_reviews.status` approved/rejected vs `course_decisions.outcome` | Keep (the queue needs it); always set both in one transaction |
| Concurrent evaluations of one application | Submit plus an explicit trigger start two `ai_evaluations` (seen in the seed) | Skip starting an evaluation when one is pending or running for the application |

**Race conditions**
- Application status on simultaneous completion: fix in item 3.
- Double-clicking Confirm: protected by the unique decision row and the disabled button. Make it airtight by moving the review to decided with `WHERE status IN (open)` before writing.

**Authorization / roles**
- Direct-decision endpoints for the Office: item 9.
- Other evaluators' reasons visible: item 9.
- Staff session on public pages: item 2.

**Performance bottlenecks:** item 5, plus the per-course `courseKnowledge` loops on the Conflicts page and the evaluator dashboard (documented in the AI innovation audit, P4/P5).

**AI / agent opportunities**
- **Reassignment suggestion:** when an evaluator says "not my department", show the ranked eligible evaluators with reasons. This is already computed by `chooseEvaluator`.
- **Department completion summary for the Office:** per department, what was decided, which outcomes differ from precedent (the consistency check result stored with each decision), and what needs a closer look. This turns final review into exception review.
- **Store the consistency-check result with each decision**, so the Office and Reports can show "decided against precedent" counts.

**Demo improvements:** parallel review makes the multi-department story visual. Three evaluators work at once; the Office page shows departments completing; the student's tracker moves when the last one finishes.

---

## Proposed implementation order

Small, safe items first; each is independently shippable.

1. **No decision needed:** item 2 (staff session), item 8 (wording), item 4 (grouped list), the status race fix.
2. **Item 1:** evaluator *Request reassignment*, and Reassign on the evaluation report.
3. **Item 5:** Confirm returns what changed (no full reload); light consistency check; parallel uploads with the cached parse; request timing.
4. **Item 3 (after confirmation):** parallel evaluation, the one-time opening of queued courses, test and demo updates.
5. **Item 9 (after confirmation):** evaluator visibility of other departments' reasons; remove or restrict direct-decision endpoints.
6. **Item 7 (after confirmation of "term"):** period and term filters on both dashboards.
7. **Item 6:** replace toasts with inline status, page by page.

## Decisions needed

1. **Parallel evaluation** (item 3): switch to parallel, including opening courses that are queued today?
2. **Term filter** (item 7): is "term" the student's **BU start term** (recommended), or the term each course was taken?
3. **Other departments' reasons** (item 9): hide them from other evaluators (outcome only)?
4. **Direct-decision endpoints** (item 9): remove (recommended), or keep as an admin-only audited override?
