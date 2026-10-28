# Transfer Credit: Rule and Edge Case Review

Audit of the BU Transfer Portal (`2_Code/transfer-app`) against the official problem statement, *FDE AI Hackathon 5.0, Problem 1 · Transfer credit evaluation* (`Hackathon'26/Boston University.docx`).

This file has two parts. **Part 1** is the original audit (28 October 2026, before any change), kept unchanged as the audit history. **Part 2** is the re-audit after the changes on branch `feature/credit-lifecycle`. It gives *Before → After* for every requirement, rule and test case. What changed is described in `TRANSFER_CREDIT_IMPLEMENTATION_SUMMARY.md`.

| | Before (Part 1) | After (Part 2) |
|---|---|---|
| Problem statement coverage | 59% (✅ 7 · 🟡 12 · ❌ 3) | **95%** (✅ 20 · 🟡 2 · ❌ 0) |
| Business rules | 39: 22 ✅ · 8 🟡 · 9 ❌ | 50: 48 ✅ · 2 🟡 · 0 ❌ (11 new rules) |
| Edge-case audit scenarios (AUD-01 to AUD-22) | 7 pass · 14 fail | 21 pass · 0 fail (AUD-15 is the demo, HP-06) |
| Automated checks | Audit suite 8 / 22 | Lifecycle suite 67 / 67; earlier suites 22 / 20 / 16 all pass; engine 76 / 76 |

---

# Part 1: Original audit (before implementation)

Audit only: no application code was changed. The only additions were this file and synthetic test records in `2_Code/transfer-app/backend/supabase/seed/synthetic_audit_scenarios.sql`.

**How it was tested.** Scenarios ran against the real backend (Express API, credit engine, assignment and review services) on a local Postgres engine (PGlite) loaded with the same migrations and data as production: sponsor workbook, 3_Data sample data, the 11 sample students, the staff roster. Results come from four automated suites run on 28 October 2026:

| Suite | What it covers | Result |
|---|---|---|
| `credit:eval` (repo script) | Engine routing and awards against the 76-row answer key in 3_Data | 76/76 path, 76/76 award |
| Role and access suite | Sign-in, roles, admin vs evaluator APIs, data scoping | 22/22 pass |
| Review workflow suite | Review package, start, request info, accept, reject, hand-off, history | 23/23 pass |
| Knowledge suite | Previous decisions, conflicts, escalation, standard equivalency, profiles | 17/17 pass |
| Audit suite (this review) | 22 rule and edge-case scenarios, including the synthetic ones | 8 pass, 14 fail |

Not tested: real Supabase Auth and storage (a stand-in was used), the external Foundry agent (not configured locally), and production data.

Status keys: ✅ Fully covered · 🟡 Partially covered · ❌ Not covered · ⚠️ Cannot verify.

---

## A. Problem statement requirements

The problem statement asks for "a tool that makes transfer credit evaluation faster, more transparent and less stressful" that "must still respect the rule that academic departments make the final decision". The documented process has seven steps and five rules. The figure "Decision paths for a single transfer course" defines three outcomes: BU equivalent (specific course), elective credit (counts as units), no credit (0 units).

| ID | Requirement (source) | Application implementation | Status | Evidence | Gap |
|---|---|---|---|---|---|
| PS-01 | Each transcript course is processed against the equivalency database (step 3) | Credit engine runs on every course after evaluation; checks approved equivalencies, policy rules, precedents, then content similarity | ✅ | `services/credit/engine.js`, `credit.service.js evaluateApplicationCredits` | None for exact matches |
| PS-02 | Already-evaluated course: existing equivalency applied, result is a specific BU course (step 4) | Engine applies the equivalency (path `equivalency`) | 🟡 | engine.js; AUD-15 | Course codes are matched exactly ("CS1800" ≠ "CS 1800", AUD-04). Applied equivalencies still become a course review for a **department** evaluator, which adds work the process says the Credit Evaluation Department handles |
| PS-03 | No match: course listed as "maybe", student must send a syllabus (step 5) | Engine marks `review` / `needs_information`; the evaluator can request information; the student can reply and upload | 🟡 | engine.js; `review.service requestInformation`; `student.controller respondToInfoRequest` | Syllabus is not requested automatically; an uploaded syllabus is not linked to the course, not used by the engine and not shown on the review page; the evaluator is not notified of the reply; the application stays "information required" (AUD-17) |
| PS-04 | Department evaluator decides BU equivalent, elective credit or no credit (step 6) | Review page: Accept (recommended outcome) or Reject (no credit) | 🟡 | `pages/evaluator/ReviewDetail.jsx`; `POST /api/my/reviews/:id/decision` | Evaluator cannot award elective credit or a different BU course from the review page (AUD-20). The API supports it (`recordCourseDecision` action `change`), but only the older application page uses it |
| PS-05 | Reduce manual comparison of course descriptions, learning outcomes, credit hours | Side-by-side course comparison, descriptions, learning outcomes, credits, matching evidence, previous decisions | ✅ | ReviewDetail.jsx; `review.service getReview` | Descriptions and learning outcomes are synthetic; the sponsor workbook has none |
| PS-06 | Outcome posted to the student record with grade "T"; pending credit shows 0 units (step 7, rule) | Nothing posts per-course results; no "T"; the student view shows no per-course status or units | ❌ | `student.controller getApplicationStatus` returns only code, title, term per course | AUD-16, AUD-18 |
| PS-07 | Academic departments make the final decision | No course is decided without an evaluator; recommendations never auto-approve; conflict standards apply to future transcripts only | ✅ | review.service; knowledge.service `recordStandard` | Standards are recorded by administrators; whether BU wants department sign-off on standards is unconfirmed |
| PS-08 | Quarter credits × 2/3 (4 → 2.66) | Engine rule R2 | ✅ | engine.js `buCredits`; AUD-10 | — |
| PS-09 | Grade C or higher required | Engine rule R1 | 🟡 | engine.js `PASSING_GRADES` | "A+" and "P" are treated as below C (AUD-01, AUD-02) |
| PS-10 | External grades do not count toward the BU GPA | Not modelled (no BU GPA is computed) | ❌ | — | Low impact; nothing displays a BU GPA |
| PS-11 | Transfer courses earn no BU Hub units | Reason text on elective equivalencies only | 🟡 | engine.js (R3 note) | Not modelled as data |
| PS-12 | All credits transferred within one year of starting at BU | Not implemented | ❌ | — | AUD-09 |
| PS-13 | Students can tell what is happening; know how much degree progress is secure | Student status page shows application status, documents, information requests and the courses read | 🟡 | `pages/student/ApplicationStatus.jsx` | No per-course progress, credits secured or pending units |
| PS-14 | Less syllabus chasing for students | Syllabus needed only where no equivalency or precedent exists | 🟡 | engine paths | Requests are manual per course; the reply loop is incomplete (PS-03) |
| PS-15 | Faster evaluation; reuse earlier work | Automatic evaluation, assignment, precedents, promotion to equivalency, conflict detection, previous-decision context | ✅ | credit, memory, assignment, knowledge services | — |
| PS-16 | Self-check preview of likely equivalencies (step 1, Transferology) | Eligibility pre-check (GPA and credit criteria) | 🟡 | `pages/student/EligibilityCheck.jsx` | No course-level equivalency preview for students |
| PS-17 | Transcripts from every college attended | Several institutions and documents per application | ✅ | sample student STU-001 (two colleges) | — |
| PS-18 | Suggested demo: community-college student, 6 courses (3 existing, 2 maybe, 1 quarter), upload to final posting | Upload, parsing, evaluation, assignment and review work; quarter converted | 🟡 | AUD-15 (Maya Ortiz) | "Final posting" does not exist (PS-06) |
| PS-19 | Use only supplied or synthetic data; student records private | Sponsor and synthetic data only, tagged `data_source` | ✅ | migration 008; data README | — |
| PS-20 | Define one measurable outcome and show how to prove it worked | Engine accuracy script (76/76); Reports page | 🟡 | `scripts/eval-credit-engine.js` | No turnaround-time or time-saved measure is captured |
| PS-21 | Credit Evaluation Department and department evaluators are separate actors | One evaluator role; a general evaluator approximates the department | 🟡 | staff roster | No distinct Credit Evaluation step (applying equivalencies, posting) |
| PS-22 | Planned data: ~150 BU courses, ~200 other-university courses, ~100 past decisions | 41 BU and 76 peer courses (sponsor) plus 25 synthetic; 33 past decisions | 🟡 | 3_Data, sponsor workbook | Supplied data is smaller than planned; matching quality on a full catalog is unproven |

---

## B. Business rules

| Rule | Description | Preconditions / input | Expected behaviour | Current implementation | Test data | Test status |
|---|---|---|---|---|---|---|
| BR-01 | Equivalency lookup | Course with an active equivalency (institution + code) | Recommend the BU course | engine.js | Sample (46 rows) | ✅ Pass (credit:eval, AUD-15) |
| BR-02 | Course code normalisation | "CS1800", "cs 1800" | Treated as "CS 1800" | Exact string match | Synthetic 9102 | ❌ Fail (AUD-04) |
| BR-03 | Grade C or higher (R1) | Letter grade | A+ to C pass; C- and below fail; P/F needs a policy | Fixed list A, A-, B+, B, B-, C+, C | Sample + synthetic 9101 | 🟡 C-/D pass; A+ and P fail (AUD-01, AUD-02, AUD-11) |
| BR-04 | Withdrawn course | Grade W | No credit, 0 units | engine.js | Sample | ✅ Pass (AUD-12) |
| BR-05 | Quarter conversion (R2) | Quarter credit system | × 2/3, truncated | engine.js `buCredits` | Sample | ✅ Pass (AUD-10) |
| BR-06 | No Hub units (R3) | Any transfer | No Hub units recorded | Note on elective equivalencies | — | 🟡 Not modelled |
| BR-07 | One-year deadline (R4) | BU start term | Flag courses still pending a year after start | None | Synthetic 9105 | ❌ Fail (AUD-09) |
| BR-08 | External GPA excluded (R5) | Grades | Never added to a BU GPA | No BU GPA exists | — | ❌ Not modelled |
| BR-09 | Group C BU-only (R6) | Maps to CS 320/332/350 | Elective at most | engine.js | Sample | ✅ Pass (AUD-13) |
| BR-10 | Economics 200+ cap (R7) | More than 4 upper-level EC | Extras get no credit | engine.js | Sample (Jordan Lee) | ✅ Pass (AUD-14) |
| BR-11 | Biology residency (R8) | BI courses beyond 107/108 | At least 5 taken at BU | Reason note only | Sample (Leah Chen) | 🟡 Not enforced |
| BR-12 | Substitutions (R9) | MA 242 etc. | Counts toward the substituted course | Reason note | Sample | 🟡 Informational only |
| BR-13 | Departments decide (R10) | Any course | No final outcome without an evaluator | Every course needs an evaluator decision | All | ✅ Pass (review suite) |
| BR-14 | Pending shows 0 units (R11) | Undecided course | Student sees 0 units pending | Student view has no units | — | ❌ Fail (AUD-16) |
| BR-15 | "Maybe" needs a syllabus | Course without match | Syllabus requested, received, linked, review resumes | Manual request; reply not linked; no evaluator notification | Sample | 🟡 Fail (AUD-17) |
| BR-16 | Three decision outcomes | Evaluator decision | BU equivalent / elective / no credit | Accept recommended or reject | Sample | 🟡 Fail (AUD-20) |
| BR-17 | Precedent reuse | Course with past decisions | Recommendation uses them | engine.js precedent path | Sample (33) | ✅ Pass (credit:eval) |
| BR-18 | Promotion to equivalency | Two evaluators agree on one BU course | New equivalency auto-applies | `memory.service promoteIfAgreed` | Needs two evaluators deciding | ✅ Implemented (not re-run in this audit) |
| BR-19 | Conflict detection | Disagreeing decisions or scores 25+ apart | Conflict flagged | knowledge.service | Sample + synthetic PD-S001/2 | ✅ Pass (AUD-08, knowledge suite) |
| BR-20 | Standard equivalency | Admin records a standard | Resolves conflict; future transcripts only | knowledge.service `recordStandard` | Sample | ✅ Pass (knowledge suite) |
| BR-21 | Expertise-based assignment | Course with a BU target | Evaluator with that course or subject | assignment.service | Roster | ✅ Pass (review suite, seeds) |
| BR-22 | Workload-aware assignment | Best evaluator at ≥ 80% capacity | Next qualified evaluator | assignment.service | Roster | ✅ Pass (AUD-21) |
| BR-23 | Prior-experience preference | Evaluator decided the course before | +1 point, shown in context | assignment.service | Created in test | ✅ Pass (knowledge suite) |
| BR-24 | No specialist available | Unknown subject | General credit evaluator | Falls back to the student's major department first | Synthetic 9103 | 🟡 Fail (AUD-06) |
| BR-25 | Sequential hand-off | Application spans subjects | Next evaluator gets a transfer request | review.service `handOffIfDone` | Sample | ✅ Pass (review suite, TRF-1001) |
| BR-26 | Reassignment | Evaluator inactive or unavailable | Open courses reassigned | None | Test only | ❌ Fail (AUD-19) |
| BR-27 | Evaluators see only their own work | Any evaluator API call | Scoped to the signed-in evaluator | `/api/my/*` | Roster | ✅ Pass (role suite) |
| BR-28 | Role separation | Admin vs evaluator | Separate screens and APIs; 403 otherwise | `requireRole`, ProtectedRoute | Roster | ✅ Pass (role suite) |
| BR-29 | Inactive evaluator access | Deactivated evaluator | Cannot sign in; loses session | auth controller, middleware | Roster | ✅ Pass (role suite) |
| BR-30 | Rejection needs a reason | Reject | Refused without a reason | review.service | — | ✅ Pass (review suite) |
| BR-31 | Information request persisted and student notified | Request info | Status "Waiting on student"; application "information required"; student notified | review.service + `createInfoRequest` | — | ✅ Pass (review suite) |
| BR-32 | Duplicate application | Same student applies twice | Detected and linked | `duplicate_of` column unused | Synthetic 9101/9104 | ❌ Fail (AUD-07) |
| BR-33 | Repeated course | Same course twice on a transcript | Credit once | Each row evaluated separately | Synthetic 9102 | ❌ Fail (AUD-03) |
| BR-34 | Missing credits | Transcript row without credits | Flagged | Treated as 0 credits | Synthetic 9102 | ❌ Fail (AUD-05) |
| BR-35 | One source → several BU courses | e.g. CHEM 1161 → CH 101 + CH 102 | Both BU courses kept | Engine keeps the text; review target keeps only the first code | Sample | 🟡 Fail (AUD-22) |
| BR-36 | Several sources → one BU course | CS 2100 + CS 2700 → CS 112 | Combined award suggested | engine.js combined precedent | Sample (Daniel Kim) | ✅ Pass (credit:eval) |
| BR-37 | Application final outcome | All courses decided | Credits posted ("T"), application completed, student informed | None | Created in test | ❌ Fail (AUD-18) |
| BR-38 | Escalation | Evaluator flags a conflict | Admins notified; visible on the conflict | review.service `escalate` | Sample | ✅ Pass (knowledge suite) |
| BR-39 | Sponsor data precedence | Sponsor and synthetic rows overlap | Sponsor values win | import scripts | Sponsor workbook | ✅ Pass (import tests) |

---

## C. Happy path test cases

| ID | Scenario | Student / application | Source → BU course | Evaluator | Expected | Result |
|---|---|---|---|---|---|---|
| HP-01 | Existing equivalency, evaluator accepts | Daniel Kim (sample) | Northeastern CS 2000 → CAS CS 111 | Dr. Michael Smith | Recommended CS 111 (100%), accept, decision recorded through `recordCourseDecision` | ✅ Pass (review suite) |
| HP-02 | Partial catalog match, evaluator accepts | Daniel Kim | CS 2100 → CAS CS 112 (65%, syllabus review advised) | Dr. Michael Smith | Accept records `change` to CS 112; precedent stored | ✅ Pass |
| HP-03 | Evaluator rejects with reason | Daniel Kim | CS 1800 | Dr. Michael Smith | Reject requires a reason; no credit | ✅ Pass |
| HP-04 | Request more information | Daniel Kim | CS 2000 | Dr. Michael Smith | Status "Waiting on student"; application "information required"; student notified | ✅ Pass |
| HP-05 | Sequential review | Daniel Kim | Remaining CS 3800 → next evaluator | Dr. Smith → Dr. Priya Raman | Transfer request TRF-1001, notification, accepted on open | ✅ Pass |
| HP-06 | Suggested demo scenario | Maya Ortiz (STU-001, Riverside + Pacific Coast) | 6 courses | CS evaluator | 3 equivalencies applied, rest to department review, quarter converted (2.66) | ✅ Pass up to review (AUD-15); final posting not available |
| HP-07 | Role separation | Admin, evaluators | — | — | Separate portals; evaluator blocked from admin APIs | ✅ Pass (22 checks) |

---

## D. Edge case test cases

Synthetic records are in `supabase/seed/synthetic_audit_scenarios.sql` (applications `APP-2026-9101`–`9105`, past decisions `PD-S001`, `PD-S002`, all `data_source = 'synthetic'`). In production, run the file, then click **Run Evaluation** on each application.

| ID | Scenario | Setup / data | Steps | Expected | Current result | Status |
|---|---|---|---|---|---|---|
| AUD-01 | Pass/Fail grade | 9101: Riverside CSC 110, grade P (has an equivalency) | Evaluate | Evaluator judgement under a P/F policy | Rule R1: "grade P is below the C minimum", no credit | ❌ Fail |
| AUD-02 | A+ grade | 9101: Northeastern CS 2000, A+ | Evaluate | Recommend CAS CS 111 | No credit (R1) | ❌ Fail |
| AUD-03 | Repeated course | 9102: CS 2000 in Fall 2024 (B) and Fall 2025 (A) | Evaluate | Credit once, repeat flagged | Both transfer as CAS CS 111 | ❌ Fail |
| AUD-04 | Code without a space | 9102: "CS1800" | Evaluate | Equivalency to CAS CS 131 | "Needs information", no target | ❌ Fail |
| AUD-05 | Missing credits | 9102: CS 3000, credits empty | Evaluate | Flag missing credits | Transfers as CAS CS 330 with 0 credits | ❌ Fail |
| AUD-06 | Unknown course, no specialist | 9103: Riverside ART 105 | Evaluate | General credit evaluator | Assigned to a CS evaluator via the student's major | ❌ Fail |
| AUD-07 | Duplicate application | 9101 and 9104, same student email | Inspect | Linked or flagged | No link, no flag | ❌ Fail |
| AUD-08 | Conflicting decisions | PD-S001 (BIOL-UA 21 → BI 203), PD-S002 (→ BI 206); 9105 | `GET /admin/conflicts` | Conflict detected | "Decisions award different BU courses: CAS BI 206 vs CAS BI 203." | ✅ Pass |
| AUD-09 | One-year deadline | 9105: start term Fall 2024 | Evaluate | Deadline risk flagged | No check | ❌ Fail |
| AUD-10 | Quarter conversion | Sample (Maya Ortiz MATH 22) | — | 2.66 credits | 2.66, rule R2 | ✅ Pass |
| AUD-11 | Grade below C | Sample (MATH 1341, C-) | — | No credit | No credit | ✅ Pass |
| AUD-12 | Withdrawn | Sample (MAT 210, W) | — | No credit, 0 units | No credit, 0 | ✅ Pass |
| AUD-13 | BU-only course | Sample (CS 3800) | — | Elective at most | CS elective (CAS CS 3XX) | ✅ Pass |
| AUD-14 | Economics cap | Sample (Alex Rivera ECON 136) | — | No credit beyond the cap | No credit | ✅ Pass |
| AUD-16 | Student per-course status | Any application | Student status API | Per-course status and units | Only code, title, term | ❌ Fail |
| AUD-17 | Student replies with the syllabus | Request info, then reply | Reply | Evaluator notified; back to review; syllabus linked | No notification; still "information required"; not linked | ❌ Fail |
| AUD-18 | All courses decided | 9104 fully decided in test | Decide all | Final outcome, credits posted | Status stays "evaluation completed" | ❌ Fail |
| AUD-19 | Evaluator deactivated with work | Deactivated in test | Deactivate | Courses reassigned or reassign action | 12 courses stuck; flag only | ❌ Fail |
| AUD-20 | Different BU course or elective | Any open review | Decide | Choose course / elective | Accept or reject only | ❌ Fail |
| AUD-21 | Best evaluator over capacity | CS evaluator capacity set to 1 in test | Evaluate CS 3000 | Next CS evaluator | Dr. Kevin Liu ("Lightest current workload") | ✅ Pass |
| AUD-22 | One course → two BU courses | Sample CHEM 1161 | Review | CH 101 + CH 102 kept | Review target CAS CH 101 only | ❌ Fail |
| EC-N1 | Lab-bundled credits | Northeastern 5-credit courses (lab included) | — | Policy unknown: 4 or 5 BU credits? | 5 credits awarded for a 4-credit BU course | ⚠️ Not testable (needs BU policy) |
| EC-N2 | Scanned / image transcript | JPG or scanned PDF | Upload | Courses read | Text PDFs only unless the Foundry agent is configured | ⚠️ Not testable locally |
| EC-N3 | Agent validation failure | Agent rejects institution | Evaluate | `validation_failed`, staff alerted | Needs the Foundry agent | ⚠️ Not testable locally |
| EC-N4 | Hub units | Any | — | No Hub units | Not modelled | ⚠️ Not testable |
| EC-N5 | Evaluator conflict of interest | — | — | — | No such concept or data | ⚠️ Not testable |

---

## E. Conflict scenarios

**CF-01: Same source course, different BU courses** (problem example). NYU BIOL-UA 21: decision PD-S001 → CAS BI 203; PD-S002 → CAS BI 206.

- **Detection.** `knowledge.service listConflicts` groups active `past_decisions` by institution + course code. Different BU courses awarded = conflict. Evaluator decisions are written to `past_decisions` by `recordCourseDecision`, so new disagreements appear automatically.
- **Storage.** Nothing extra: derived from `past_decisions`, `equivalencies` and `course_reviews` on read. Escalations are `audit_logs` rows (`conflict_escalated`) plus `notifications`.
- **Who sees it.** Administrators: *Equivalency Conflicts* page and a Needs attention item. Evaluators: "Earlier decisions disagree" on the review of that course, plus the *Equivalency conflicts* section.
- **What the evaluator does.** Decides their own course; may *Ask an administrator to review*.
- **Final behaviour.** An administrator records a standard equivalency. It applies to future transcripts; existing decisions are unchanged. The conflict is considered resolved when the standard is dated on or after the latest conflicting decision.
- **Verified.** AUD-08; the knowledge suite (ECON 2560 resolved).

**Other conflict scenarios.**

| ID | Scenario | Supported? |
|---|---|---|
| CF-02 | Same course: one decision grants a BU course, another elective or no credit (ECON 2560, MATH 1365 in sample data) | ✅ `different_outcome` |
| CF-03 | Later decision disagrees with the established equivalency | ✅ `different_bu_course` vs equivalency |
| CF-04 | Open reviews of the same course with match scores ≥ 25 points apart | ✅ rule exists. Rarely triggers: scores for a given course come from the same source, so they rarely differ |
| CF-05 | Evaluator disagrees with an established equivalency while deciding | 🟡 shown as context; the evaluator can only reject, not award another course (AUD-20) |
| CF-06 | Same-day decision after a standard | 🟡 not flagged until the next day (dates have no time) |
| CF-07 | Conflicting "partial" decisions that are both valid splits (CHEM 1161 → CH 101 vs CH 101 + CH 102) | 🟡 flagged as a conflict; whether BU sees this as a conflict is unconfirmed |

---

## F. Evaluator assignment scenarios

| Scenario | Behaviour | Status |
|---|---|---|
| Expertise match | Points: named course 3, subject 2, prior decision 1, department 1 | ✅ |
| Several eligible evaluators | Under 80% capacity first, then points, then fewest open reviews | ✅ |
| Workload balancing | Over-capacity specialist passed over (AUD-21) | ✅ |
| No eligible evaluator | Unknown subject goes to the student's major department before the general evaluator (AUD-06); no evaluators at all leaves the course unassigned | 🟡 |
| Reassignment | No action; inactive evaluator keeps courses (AUD-19) | ❌ |
| Sequential evaluation | Major's evaluator first; others queued; transfer request on completion | ✅ |
| Escalation | Evaluator to administrators, with notification | ✅ |
| Reassignment after "request information" | Course stays with the same evaluator (correct) | ✅ |

---

## G. Data quality scenarios

| Scenario | Current behaviour | Status |
|---|---|---|
| Missing course description | `needs_information` path; syllabus request suggested (MATH-UA 235 in sample) | ✅ |
| Missing credits | Treated as 0 credits (AUD-05) | ❌ |
| Missing course code | Column is required; a parser row without a code is dropped | 🟡 Not tested |
| Course code formatting | Exact match only (AUD-04) | ❌ |
| Duplicate course on a transcript | Credited twice (AUD-03) | ❌ |
| Course not in any catalog | Content comparison only; no target (AUD-06) | ✅ (routing 🟡) |
| Missing institution | Parser sets the institution per transcript; unknown institutions are kept as text | 🟡 Not tested |
| Duplicate student / application | Not detected (AUD-07) | ❌ |
| Missing transcript | Evaluation report lists the transcript as a missing document; no courses, no reviews | ✅ |
| Incomplete evaluation | Application status stays "evaluation completed" while courses are open; no completion state (AUD-18) | ❌ |
| Unrecognised grade (A+, P) | Treated as failing (AUD-01, AUD-02) | ❌ |

---

## H. Automation and data provenance

| Field / decision | Source | Generated by | Persisted? | UI reads from |
|---|---|---|---|---|
| Transcript courses | Uploaded PDF | `transcript-parser.js` (agent fallback when configured) | `transcript_courses` | Review page transcript panel, student page |
| Engine path, outcome, award, reasons | Catalog, equivalencies, precedents, rules | `engine.js` | `course_evaluations` | Review page evidence |
| Agent recommendation and notes | Foundry agent (if configured) | `agent.service.js` | `course_evaluations.agent_*` | Review notes, missing information |
| Recommended BU course | Sponsor match, equivalency, engine suggestion | `assignment.service recommend` | `course_reviews.target_bu_course` | Review page, My Evaluations |
| Course match % | Sponsor match level (fixed: 90 / 65 / 20), equivalency (100), or engine / agent confidence | `assignment.service` | `course_reviews.match_score` | Review page, lists |
| Match label | Score bands (≥ 85 strong, ≥ 65 partial) | `knowledge.service matchLabel` (API) | Computed per request | Review page, lists |
| Evaluator assignment and reason | Evaluator master data, workload, prior decisions | `assignment.service chooseEvaluator` | `course_reviews.evaluator_id`, `assignment_reason` | Assignment context |
| Review status | Evaluator actions | `review.service` | `course_reviews.status` | Everywhere |
| Course decision | Evaluator | `memory.service recordCourseDecision` | `course_decisions`, `past_decisions` | Review page banner |
| Previous decisions, similar courses | Database | `knowledge.service courseKnowledge` | Derived | Review page |
| Conflicts | Database | `knowledge.service` rules | Derived | Conflicts page, review page |
| Standard equivalency | Administrator | `knowledge.service recordStandard` | `equivalencies` | Engine on future transcripts |
| Transfer request | Completion of an evaluator's courses | `review.service handOffIfDone` | `transfer_requests` | Dashboard, notifications |
| Dashboard counts, workload, attention flags | Database | `/api/my/dashboard`, `/api/admin/overview`, `/api/evaluators` | Derived | Dashboards, Evaluators page |
| Application eligibility score | Eligibility criteria | `eligibility.service` | `ai_evaluations.confidence_score` | Applications list ("Eligibility") |

**Frontend-generated values.**
- *Presentation only (acceptable).* Wording of the match basis, colours, the workload bar, transcript grouping.
- *Two items on the older admin application page.*
  - It shows engine candidate scores as percentages (`CreditEvaluation.jsx`). Those scores include ranking bonuses, so they are not true percentages.
  - It applies its own 80% / 60% confidence wording (`AIEvaluationReport.jsx`).
- *Nothing is hard-coded or mocked at runtime.*
- *Synthetic inputs, by design.* Course descriptions and learning outcomes, evaluators, students and the 62 approved equivalencies.

---

## I. Coverage summary

| Measure | Count |
|---|---|
| Problem statement requirements | 22: ✅ 7 · 🟡 12 · ❌ 3 · ⚠️ 0 |
| Business rules identified | 39 |
| Rules implemented | 22 |
| Rules partially implemented | 8 |
| Rules missing | 9 |
| Test cases (happy path + edge) | 33 (7 happy path, 26 edge) |
| Test cases with data | 28 |
| Test cases that needed synthetic data | 9 (AUD-01 to AUD-09) |
| Passed | 14 |
| Failed | 14 |
| Not testable | 5 |

The synthetic SQL was applied to the local test database only. It has **not** been run on the production Supabase database.

---

# Part 2: Re-audit after implementation

Re-audited on 28 October 2026 against the same problem statement. Every Part 1 item is listed with its status **Before** and **After**, and the evidence for the new status. Checks named `LC-…` are in the lifecycle suite; `SEC` is its access-control check.

**How it was re-tested.** The local database (PGlite) was rebuilt from migrations 001–009 and every seed. The seeds are the sponsor workbook, 3_Data, the 11 sample students through PDF upload, the staff roster and the workflow demo. The synthetic scenarios were then applied and processed by the real pipeline. Each suite ran on a fresh copy of that database.

| Suite | Before | After |
|---|---|---|
| `credit:eval` (76-row answer key) | 76/76 | 76/76 |
| Role and access | 22/22 | 22/22 |
| Review workflow | 23/23 | 20/20 (one fixture made subject-neutral; no assertion removed) |
| Knowledge | 17/17 | 16/16 (one check needs an evaluator's earlier decision, absent on a fresh database) |
| Audit / lifecycle | 8 pass, 14 fail (22 scenarios) | **67/67 pass** (67 checks covering all 33 required cases) |

## J.1 Problem statement requirements

| ID | Requirement | Before | After | Evidence |
|---|---|---|---|---|
| PS-01 | Each course checked against the equivalency database | ✅ | ✅ | Codes are now normalised before lookup (LC-CODE) |
| PS-02 | Already-evaluated course: equivalency applied (step 4) | 🟡 | ✅ | Applied by the Credit Evaluation Office with no department review: 72 courses, 0 sent to evaluators (LC-09, LC-02). Held for an evaluator only when earlier decisions conflict |
| PS-03 | No match: "maybe", student sends a syllabus (step 5) | 🟡 | ✅ | Automatic syllabus request; upload linked to the course, read and compared; evaluator notified; course back in review (LC-04, LC-05, LC-05b, LC-05c) |
| PS-04 | Evaluator decides BU equivalent / elective / no credit (step 6) | 🟡 | ✅ | Equivalent, different BU course, elective, no credit (LC-06, LC-07, LC-08) |
| PS-05 | Less manual comparison | ✅ | ✅ | Plus the student's syllabus compared with the catalog, and combined-course context |
| PS-06 | Posted with grade "T"; pending shows 0 units (step 7) | ❌ | ✅ | `credit_postings`, grade T, units; pending 0 units (LC-29, LC-31) |
| PS-07 | Departments make the final decision | ✅ | ✅ | Content judgements stay with departments. Only established equivalencies (earlier department decisions) and deterministic grade, withdrawal and repeat outcomes are applied by the office |
| PS-08 | Quarter × 2/3 | ✅ | ✅ | LC-24 (5 → 3.33), LC-DEMO (4 → 2.66) |
| PS-09 | Grade C or higher | 🟡 | ✅ | A+ passes; P / "Pass" confirmed by the department, never automatically no credit; 19 grade formats (LC-16, LC-17, LC-18e) |
| PS-10 | External grades not in the BU GPA | ❌ | ✅ | `counts_in_gpa = false`, enforced by a database check and shown to the student (LC-28, LC-27b) |
| PS-11 | No BU Hub units | 🟡 | ✅ | `hub_units = 0`, enforced by a database check and shown to the student (LC-27, LC-27b) |
| PS-12 | Credits within one year of starting at BU | ❌ | ✅ | Deadline calculated, flagged and blocks posting unless an exception is recorded (LC-26 to LC-26d). Term start dates are a configurable assumption |
| PS-13 | Students can tell what is happening | 🟡 | ✅ | Per-course status, BU course, units, grade T, explanations, summary, deadline (LC-30, LC-31) |
| PS-14 | Less syllabus chasing | 🟡 | ✅ | Requested only when there is nothing to compare; upload on the course; acknowledged |
| PS-15 | Faster; reuse earlier work | ✅ | ✅ | Plus established equivalencies applied without review; earlier decisions surface in the self-check |
| PS-16 | Self-check preview (step 1) | 🟡 | ✅ | `/self-check`: established, evaluated before, likely, maybe, syllabus needed; clearly not official (LC-SELF) |
| PS-17 | Transcripts from every college | ✅ | ✅ | Four institutions on one application (LC-23) |
| PS-18 | Demo: 6 courses, upload to final posting | 🟡 | ✅ | Maya Ortiz: 3 applied, 3 with departments, quarter converted (LC-DEMO). Posting end to end verified on APP-2026-9107 (LC-29) |
| PS-19 | Only supplied or synthetic data | ✅ | ✅ | No sponsor row changed; new scenarios are `synthetic` |
| PS-20 | Measurable outcome | 🟡 | 🟡 | Time to posting, share settled without department work and credits posted are now recorded. A BU baseline is still needed |
| PS-21 | Credit Evaluation Department as a separate actor | 🟡 | ✅ | `credit_office` role, workspace and API enforced on the server (SEC) |
| PS-22 | Planned data volume | 🟡 | 🟡 | Unchanged: the supplied data is smaller than planned |

## J.2 Business rules

| Rule | Description | Before | After | Evidence |
|---|---|---|---|---|
| BR-01 | Equivalency lookup | ✅ | ✅ | LC-02 |
| BR-02 | Course code normalisation | ❌ | ✅ | LC-CODE, LC-CODE-b |
| BR-03 | Grade C or higher | 🟡 | ✅ | LC-16, LC-17, LC-18 |
| BR-04 | Withdrawn: no credit, 0 units | ✅ | ✅ | LC-18b |
| BR-05 | Quarter conversion | ✅ | ✅ | LC-24 |
| BR-06 | No Hub units | 🟡 | ✅ | LC-27, LC-27b |
| BR-07 | One-year deadline | ❌ | ✅ | LC-26 to LC-26d |
| BR-08 | External GPA excluded | ❌ | ✅ | LC-28 |
| BR-09 | Group C BU-only (R6) | ✅ | ✅ | credit:eval |
| BR-10 | Economics cap (R7) | ✅ | ✅ | credit:eval |
| BR-11 | Biology residency (R8) | 🟡 | 🟡 | Still a note: a degree-audit rule, not a transfer-posting rule |
| BR-12 | Substitutions (R9) | 🟡 | 🟡 | Still informational, for the same reason |
| BR-13 | Departments decide | ✅ | ✅ | See PS-07 |
| BR-14 | Pending shows 0 units | ❌ | ✅ | LC-31 |
| BR-15 | "Maybe" needs a syllabus | 🟡 | ✅ | LC-04, LC-05 |
| BR-16 | Three decision outcomes | 🟡 | ✅ | LC-06, LC-07, LC-08 |
| BR-17 | Precedent reuse | ✅ | ✅ | credit:eval; LC-SELF (a new decision is reused straight away) |
| BR-18 | Promotion to equivalency | ✅ | ✅ | Unchanged code path |
| BR-19 | Conflict detection | ✅ | ✅ | LC-10 |
| BR-20 | Standard equivalency | ✅ | ✅ | Knowledge suite |
| BR-21 | Expertise-based assignment | ✅ | ✅ | LC-03 |
| BR-22 | Workload-aware assignment | ✅ | ✅ | LC-13 (reason names the evaluator passed over) |
| BR-23 | Prior-experience preference | ✅ | ✅ | Knowledge suite |
| BR-24 | No specialist: general / office queue | 🟡 | ✅ | LC-15 |
| BR-25 | Sequential hand-off | ✅ | ✅ | LC-12b, review suite |
| BR-26 | Reassignment | ❌ | ✅ | LC-14, LC-14b |
| BR-27 | Evaluators see only their own work | ✅ | ✅ | SEC |
| BR-28 | Role separation | ✅ | ✅ | SEC (now three staff roles) |
| BR-29 | Inactive evaluator access | ✅ | ✅ | Role suite |
| BR-30 | Rejection needs a reason | ✅ | ✅ | LC-08b |
| BR-31 | Information request persisted and notified | ✅ | ✅ | LC-33 |
| BR-32 | Duplicate application | ❌ | ✅ | LC-22, LC-22b, LC-22c |
| BR-33 | Repeated course | ❌ | ✅ | LC-19 |
| BR-34 | Missing credits | ❌ | ✅ | LC-20, LC-20b, LC-20c |
| BR-35 | One source → several BU courses | 🟡 | ✅ | LC-32, LC-32b |
| BR-36 | Several sources → one BU course | ✅ | ✅ | LC-32c (now shown on the review page) |
| BR-37 | Application final outcome | ❌ | ✅ | LC-29, LC-25 |
| BR-38 | Escalation | ✅ | ✅ | Now also reaches the Credit Evaluation Office |
| BR-39 | Sponsor data precedence | ✅ | ✅ | Sponsor import unchanged |

**Rules added in this implementation.**

| Rule | Description | Status | Evidence |
|---|---|---|---|
| BR-40 | Pass/Fail policy is configurable; default: the department confirms | ✅ | LC-17 |
| BR-41 | Missing, unreadable or incomplete grade: held, never no credit | ✅ | LC-18d |
| BR-42 | Established equivalency applied by the office unless a conflict exists | ✅ | LC-09 |
| BR-43 | A posted decision cannot change | ✅ | LC-29b |
| BR-44 | Posting is blocked by the deadline (without an exception), a suspected duplicate or a closed application | ✅ | LC-22b, LC-26b |
| BR-45 | Match shown as a level or as a similarity, never a made-up percentage | ✅ | Review page, My Evaluations |
| BR-46 | No BU course suggested below a credible content match | ✅ | LC-05 (ceramics course: no target) |
| BR-47 | Documents scoped to the evaluator's applications | ✅ | SEC |
| BR-48 | Evaluators cannot upload application documents | ✅ | `routes/documents.js` |
| BR-49 | Conflicts can be marked resolved; a later disagreement reopens them | ✅ | LC-10c |
| BR-50 | Self-check is guidance only and stores nothing | ✅ | LC-SELF |

## J.3 Happy path

| ID | Scenario | Before | After |
|---|---|---|---|
| HP-01 | Existing equivalency | ✅ (evaluator accepts) | ✅ Applied without review; the evaluator sees the established equivalency and how often it was applied |
| HP-02 | Partial catalog match accepted | ✅ | ✅ |
| HP-03 | Rejection with reason | ✅ | ✅ |
| HP-04 | Request more information | ✅ | ✅ The answer returns the course to the evaluator (LC-33) |
| HP-05 | Sequential review | ✅ | ✅ |
| HP-06 | Suggested demo scenario | 🟡 up to review | ✅ Through posting (LC-DEMO, LC-29) |
| HP-07 | Role separation | ✅ | ✅ Plus the Credit Evaluation Office (SEC) |

## J.4 Edge cases

| ID | Scenario | Before | After | Now |
|---|---|---|---|---|
| AUD-01 | Pass/Fail grade | ❌ No credit (R1) | ✅ | Held for the department ("PASS"), suggestion CAS CS 111 (LC-17) |
| AUD-02 | A+ | ❌ No credit | ✅ | CAS CS 111 by established equivalency (LC-16) |
| AUD-03 | Repeated course | ❌ Credited twice | ✅ | Credit once (A attempt); repeat kept as "no credit (repeat)" (LC-19) |
| AUD-04 | "CS1800" | ❌ Not matched | ✅ | Read as CS 1800 → CAS CS 131; code kept as written (LC-CODE) |
| AUD-05 | Missing credits | ❌ 0 credits | ✅ | Held; evaluator must record units (LC-20 to LC-20c) |
| AUD-06 | Unknown course, no specialist | ❌ CS evaluator | ✅ | General credit evaluator, reason "No subject specialist" (LC-15) |
| AUD-07 | Duplicate application | ❌ Not detected | ✅ | Flagged, linked, posting blocked, resolved by the office (LC-22 to LC-22c) |
| AUD-08 | Conflicting decisions | ✅ | ✅ | Plus evaluator override and "mark resolved" (LC-10b, LC-10c) |
| AUD-09 | One-year deadline | ❌ No check | ✅ | LC-26 to LC-26d |
| AUD-10 | Quarter conversion | ✅ | ✅ | |
| AUD-11 | Grade below C | ✅ | ✅ | Applied as a policy outcome without review (LC-18) |
| AUD-12 | Withdrawn | ✅ | ✅ | LC-18b |
| AUD-13 | BU-only course | ✅ | ✅ | |
| AUD-14 | Economics cap | ✅ | ✅ | |
| AUD-16 | Student per-course status | ❌ | ✅ | LC-30, LC-31 |
| AUD-17 | Student sends the syllabus | ❌ | ✅ | LC-05 to LC-05c, LC-33 |
| AUD-18 | All courses decided | ❌ | ✅ | Ready for posting, then credit posted (LC-25, LC-29) |
| AUD-19 | Evaluator deactivated with work | ❌ 12 stuck | ✅ | 10 reassigned, 0 left, history kept (LC-14) |
| AUD-20 | Different BU course or elective | ❌ | ✅ | LC-06, LC-07 |
| AUD-21 | Best evaluator over capacity | ✅ | ✅ | LC-13 |
| AUD-22 | One course → two BU courses | ❌ | ✅ | Target "CAS CH 101 + CAS CH 102", decided and posted with 8 units (LC-32, LC-32b) |
| EC-N1 | Lab-bundled credits | ⚠️ | ⚠️ | Needs BU policy. Units can be overridden per decision |
| EC-N2 | Scanned transcript | ⚠️ | ⚠️ | Needs the Foundry agent (external dependency) |
| EC-N3 | Agent validation failure | ⚠️ | ⚠️ | Needs the Foundry agent (external dependency) |
| EC-N4 | Hub units | ⚠️ | ✅ | Modelled and enforced (LC-27, LC-27b) |
| EC-N5 | Evaluator conflict of interest | ⚠️ | ⚠️ | No such concept or data supplied |

## J.5 Conflict scenarios

| ID | Scenario | Before | After |
|---|---|---|---|
| CF-01 | Same course, different BU courses | ✅ | ✅ Shown as "Potential equivalency conflict" with institution, course, earlier decisions, evaluators and dates; evaluator can use the established equivalency, override, or request additional review; the office marks it resolved; every action is stored in `conflict_resolutions` |
| CF-02 | BU course vs elective / no credit | ✅ | ✅ |
| CF-03 | Later decision vs established equivalency | ✅ | ✅ The established equivalency is no longer applied automatically while this conflict stands |
| CF-04 | Match scores 25+ points apart | ✅ | ✅ Now compares computed similarities only, not catalog levels against scores |
| CF-05 | Evaluator disagrees with an established equivalency | 🟡 | ✅ Override records the action and notifies the office |
| CF-06 | Same-day decision after a standard | 🟡 | 🟡 Standards are dated; resolutions are timestamped and compared to the decision's record time |
| CF-07 | Partial splits (CH 101 vs CH 101 + CH 102) | 🟡 | 🟡 Still flagged; the office can mark it resolved if BU sees both as valid |

## J.6 Assignment scenarios

| Scenario | Before | After |
|---|---|---|
| Expertise match | ✅ | ✅ |
| Several eligible evaluators | ✅ | ✅ |
| Workload balancing | ✅ | ✅ Reason names who was passed over and the current workload |
| No eligible evaluator | 🟡 | ✅ General credit evaluator with capacity, otherwise the Credit Evaluation Office queue; never an unrelated subject |
| Reassignment | ❌ | ✅ Manual (chosen, best eligible, or office queue) and automatic (deactivated or unavailable); history kept |
| Unavailable evaluator (leave) | — | ✅ No new work; open courses moved; back on "available" |
| Sequential evaluation | ✅ | ✅ Plus the next sequence opens if the current one is settled automatically |
| Escalation | ✅ | ✅ |

## J.7 Data quality

| Scenario | Before | After |
|---|---|---|
| Missing course description | ✅ | ✅ Syllabus requested automatically |
| Missing credits | ❌ | ✅ |
| Course code formatting | ❌ | ✅ |
| Duplicate course on a transcript | ❌ | ✅ |
| Course not in any catalog | ✅ (routing 🟡) | ✅ |
| Duplicate student / application | ❌ | ✅ |
| Incomplete evaluation / completion state | ❌ | ✅ |
| Unrecognised grade (A+, P, lowercase, padded, missing, invalid) | ❌ | ✅ |

## J.8 Automation and data provenance

**The two frontend-generated values Part 1 found are fixed.**
- `CreditEvaluation.jsx` no longer shows engine ranking scores as percentages.
- `AIEvaluationReport.jsx` no longer applies its own 80% / 60% wording. The eligibility wording now comes from the API (`score_label`).
- The student status page no longer derives "Strong / Moderate" from the eligibility score.

**Match honesty.** A sponsor match level is shown as the level ("Likely equivalent"), and an established equivalency as "Approved equivalency". Only a computed content similarity is shown as a percentage. The fixed 90 / 65 / 20 values are kept internally only to order the levels.

**Dashboards.** The office overview numbers are checked against direct database counts (LC-DASH). The one display-capped number ("20 with decided courses") was replaced by a real count.

**New persisted state.** Postings, decision type, units and route, assignment history and context, conflict resolutions, syllabus links, duplicate status and deadline exceptions are all stored. Nothing on the student or office pages is computed in the browser beyond formatting.

## J.9 Coverage summary (after)

| Measure | Before | After |
|---|---|---|
| Problem statement requirements | 22: ✅ 7 · 🟡 12 · ❌ 3 (59%) | 22: ✅ 20 · 🟡 2 · ❌ 0 (**95%**) |
| Business rules | 39: ✅ 22 · 🟡 8 · ❌ 9 | 50: ✅ 48 · 🟡 2 · ❌ 0 |
| Required test cases (implementation brief) | — | 33 / 33 pass |
| Lifecycle checks | — | 67 / 67 pass |
| Synthetic scenarios | 5 applications, 2 past decisions | 11 applications, 3 past decisions |
| Not testable / external | 5 | 4 (EC-N1, EC-N2, EC-N3, EC-N5) |

The synthetic SQL and migration 009 were applied to the local test database only. They have **not** been run on the production Supabase database.
