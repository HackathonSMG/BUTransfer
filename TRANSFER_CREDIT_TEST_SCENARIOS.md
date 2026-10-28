# Transfer Credit Test Scenarios

A hackathon test kit for the BU transfer-credit portal. Each scenario has a synthetic transcript built to exercise one or more rules that the application implements from the Problem 1 statement. The kit covers the full chain:

**upload → processing → course extraction → matching → assignment → evaluator review → Credit Office → final result → applicant tracking → email.**

- **Files:** `5_Test_Cases/transcripts/` holds 17 PDFs in the sample transcript layout the portal reads.
- **Regenerating the PDFs:**
  - `python generate_transcripts.py` writes the HTML;
  - `powershell -ExecutionPolicy Bypass -File print_pdfs.ps1` prints the PDFs with headless Edge;
  - `transcripts.json` lists every course in every file.
- **Data:**
  - Courses come from the sponsor course data (`3_Data/sponsor`) and the synthetic equivalency, past-decision and catalog data (`3_Data/BU_Synthetic_Transfer_Data_csv`).
  - Invented courses appear only where a scenario needs a course the data does not have: CS 4973 (unknown course), PHIL 101 and MUS 110 (no subject specialist).
  - Students and student IDs (`TST-1xx`) are fictional.
- **Observed results:** every "Observed" value below comes from an automated run against the current code on a freshly seeded database (section 4). It is not an estimate.

**How to run a scenario by hand:**
1. Go to `/apply` and use your own email address, so you receive the emails.
2. Upload the transcript(s) listed and submit.
3. Track the application at `/track` with the application number and that email.
4. Sign in as staff for the review steps. Evaluator logins are listed in `END_TO_END_TRANSFER_CREDIT_DEMO.md`.

**Status words used below:**

| What the applicant sees | Internal stage (staff) | Application status |
|---|---|---|
| Submitted / Processing | Processing | `submitted`, `under_evaluation` |
| Department Review | Pending Evaluator Review, In Review | `under_evaluator_review` |
| Action Required | Waiting for Applicant | `information_required` |
| Final Review | Credit Office Review | `ready_for_posting` |
| Completed | Completed | `credit_posted` |

**Email events** (sent to the applicant):

| Event | When |
|---|---|
| `application_received` | On submission |
| `department_review` | The first time courses go to evaluators |
| `information_required` | For each syllabus or information request |
| `final_review` | Every course decided |
| `decision_available` | Credit posted |

---

## 1. Test matrix

| Scenario | Transcript | Rule(s) exercised | Expected result | Evaluator | Status after processing | Final status | Automated |
|---|---|---|---|---|---|---|---|
| TC01 · S1, S6 | TC01_Established_Equivalencies_Northeastern | Established equivalency reused | 3 × BU equivalent, applied automatically | None | Final Review | Completed (13 units) | ✅ |
| TC02 · S2 | TC02_Elective_Equivalency_Riverside | R3 elective equivalency | ENG 101 → Elective credit; CSC 110 → CS 111 | None | Final Review | Completed (7 units) | ✅ |
| TC03 · S2, S3 | TC03_Elective_and_Different_Course_Northeastern | Elective precedent; R6 (must be taken at BU); evaluator picks a different BU course | DS 3000, CS 3800 → elective; PSYC 2320 → CAS PS 211 | CS (×2), Psychology | Department Review | Completed (12 units) | ✅ |
| TC04 · S4, S10 | TC04_No_Credit_Rules_NYU | R1 grade below C (D, C-); W | 3 × no credit, 1 × PS 101 | None | Final Review | Completed (4 units) | ✅ to Final Review |
| TC05 · S5, S20 | TC05_Information_Required_NYU | No description on file → syllabus requested; information loop | MATH-UA 235 → syllabus → elective; MATH-UA 122 → MA 124 | Mathematics | Action Required | Completed (8 units) | ✅ |
| TC07 · S7 | TC07_Conflicting_Precedents_Northeastern | Past decisions disagree → department decides | 3 courses held for review, listed on Equivalency Conflicts | Chemistry, Mathematics, Economics | Department Review | Evaluator decides | ✅ to review |
| TC08 · S8, S9, S10 | TC08_Grade_Rules_Northeastern | A+ meets minimum; Pass → department confirms (PASS); C- → R1 | CS 1800 A+ → CS 131 (auto); MATH 1341 P → review; ECON 1116 C- → no credit | Mathematics | Department Review | Evaluator decides | ✅ to review |
| TC11 · S11 | TC11_Repeated_Course_Northeastern | REPEAT: credit once, best grade | CS 2000 A- → CS 111; CS 2000 C+ → no credit | None | Final Review | Completed (9 units) | ✅ to Final Review |
| TC12 · S12 | TC12_Course_Code_Formats_Northeastern | Course-code normalization | CS2000, cs-1800, ECON1116, math 1341 all match | None | Final Review | Completed (17 units) | ✅ to Final Review |
| TC13 · S13 | TC13_Missing_Credits_Northeastern | CREDITS: missing credits never read as 0 | CS 2000 held for the department to confirm credits | CS | Department Review | Evaluator records units | ✅ to review |
| TC14 · S14 | TC14_Unknown_Course_Northeastern | Unknown course → syllabus needed | CS 4973 → syllabus requested | General credit evaluator | Action Required | Evaluator decides | ✅ to request |
| TC15 · S15 | TC15_No_Subject_Specialist_Riverside | No subject specialist → general evaluator; no-credit precedent | PHIL 101, MUS 110 → general evaluator; KIN 105 → no credit recommended | General credit evaluator | Action Required | Evaluator decides | ✅ to review |
| TC16 · S16 | TC16_…_Riverside + TC16_…_PacificCoast | Two institutions; R2 quarter conversion | 4 courses, 2 institutions; 5 qtr → 3.33 BU | None | Final Review | Completed (14.66 units) | ✅ to Final Review |
| TC17 · S17, S18, S21, S24 | TC17_Multiple_Evaluators_Northeastern | Several subject evaluators in sequence; combined precedent (CS 2100 + CS 2700); partial results; reassignment | CS 2100 + CS 2700 → CS 112; BIOL 2301 → BI 206; PSYC 2320 → PS 211; MATH 2331 → MA 242 | CS, Biology, Psychology (reassigned) | Department Review | Completed (23 units) | ✅ |
| TC19 · S19, S25 | TC01 after posting | Final posting: grade T, not in GPA, 0 Hub units | Completed; awarded = accepted; pending 0 | None | n/a | Completed | ✅ |
| TC22 · S22 | TC01 again, same email | Duplicate application rule | Finished earlier application → new evaluation; active earlier application → flagged duplicate | None | Final Review | Office resolves duplicate | ✅ |
| TC23 · S23 | TC01 with BU start Fall 2024 | One-year transfer deadline | Posting blocked until an exception is recorded | None | Final Review | Completed after exception | ✅ |
| TC26 · extra | TC26_…_PacificCoast + TC26_…_Northeastern | R7 cap on upper-level economics | 5th upper-level econ course → no credit | Economics | Department Review | Evaluator decides | ✅ to review |

Scenario numbers S1–S25 refer to the numbered scenarios in the test request. Scenario S24 (combined courses) is covered by TC17. Scenario S25 (Hub and special credit) is covered by TC01, TC02 and TC19.

---

## 2. Scenario catalog

Each entry gives the purpose, the student, the courses with the expected matching behaviour, the evaluator, the outcome and the emails. **Observed** lines are from the automated run.

### TC01 — Straightforward matches / established equivalency (S1, S6, S19, S25)
- **File:** `TC01_Established_Equivalencies_Northeastern.pdf`
- **Student:** Elena Park (TST-101), Computer Science, BU start Fall 2027
- **Institution:** Northeastern University (semester)
- **Purpose:** Every course already has an approved equivalency, so none needs an evaluator.

| Course | Credits | Grade | Expected matching | Expected outcome |
|---|---:|---|---|---|
| CS 2000 Introduction to Program Design and Implementation | 5 | A | Equivalency EQ-001 | CAS CS 111, 5 units |
| CS 1800 Discrete Structures | 4 | B+ | Equivalency | CAS CS 131, 4 units |
| ECON 1116 Principles of Microeconomics | 4 | A- | Equivalency | CAS EC 101, 4 units |

- **Expected evaluator:** none. The Credit Evaluation Office applies the established equivalencies.
- **Expected status:** after processing, **Final Review** (Credit Office Review). After the Credit Office clicks **Finalize and post**, **Completed**.
- **Expected final credits:** accepted 13, awarded 13, pending 0. Every posting has grade T, is not in the GPA and earns 0 Hub units.
- **Rules exercised:** established equivalency (problem step 4), posting rules (grade T, GPA, Hub).
- **Emails:** `application_received` → `final_review` → `decision_available`.
- **Observed:** as expected. The applicant timeline shows Department Review as **Not needed**.

### TC02 — Elective credit by equivalency (S2, S25)
- **File:** `TC02_Elective_Equivalency_Riverside.pdf`
- **Student:** Jonah Castillo (TST-102), Computer Science
- **Institution:** Riverside Community College

| Course | Credits | Grade | Expected matching | Expected outcome |
|---|---:|---|---|---|
| ENG 101 English Composition I | 3 | B+ | Equivalency EQ-060 has no BU course, so it is elective (R3) | Elective credit, 3 units, 0 Hub units |
| CSC 110 Programming Fundamentals with Python | 4 | A | Equivalency | CAS CS 111, 4 units |

- **Expected evaluator:** none.
- **Expected status:** Final Review, then Completed.
- **Expected final credits:** 7 accepted and awarded. The applicant summary shows 1 elective and 1 equivalent course.
- **Rules exercised:** R3 (elective credit earns no Hub units).
- **Emails:** received → final review → decision available.
- **Observed:** as expected.

### TC03 — Elective by precedent and by rule; evaluator picks a different BU course (S2, S3)
- **File:** `TC03_Elective_and_Different_Course_Northeastern.pdf`
- **Student:** Priya Natarajan (TST-103), Computer Science
- **Institution:** Northeastern University

| Course | Credits | Grade | Expected matching | Expected outcome |
|---|---:|---|---|---|
| DS 3000 Mathematical Foundations of AI | 4 | A | Past decision PD-023 recommends elective | Evaluator confirms elective |
| PSYC 2320 Statistics in Psychological Research | 4 | B+ | Precedent PD-012 suggests a psych elective | Evaluator chooses **Different BU course: CAS PS 211** |
| CS 3800 Theory of Computation | 4 | A- | R6: CS 332 must be taken at BU, so elective only | CS elective (CAS CS 3XX) |

- **Expected evaluators:** CS (DS 3000, then CS 3800 after the hand-off) and Psychology (PSYC 2320).
- **Expected status:** Department Review → Final Review → Completed.
- **Expected final credits:** 12.
- **Manual steps:** each evaluator decides. For PSYC 2320 choose **Different BU course** and enter `CAS PS 211` with a reason.
- **Emails:** received → department review → final review → decision available.
- **Observed:** as expected. The evaluators were Dr. Kevin Liu and Dr. Priya Raman (CS) and Dr. Laura Bennett (Psychology).

### TC04 — Reject / no transfer credit (S4, S10)
- **File:** `TC04_No_Credit_Rules_NYU.pdf`
- **Student:** Daniel Okoro (TST-104), Psychology
- **Institution:** New York University

| Course | Credits | Grade | Expected matching | Expected outcome |
|---|---:|---|---|---|
| BIOL-UA 11 Principles of Biology I | 4 | D | R1, even though equivalency BI 107 exists | No credit |
| MATH-UA 121 Calculus I | 4 | C- | R1 (C- is below the C minimum) | No credit |
| CHEM-UA 125 General Chemistry I | 5 | W | Withdrawn | No credit |
| PSYCH-UA 1 Intro to Psychology | 4 | A | Equivalency | CAS PS 101, 4 units |

- **Expected evaluator:** none. Grade and withdrawal rules are applied automatically.
- **Expected status:** Final Review, then Completed after posting.
- **Expected final credits:** 4 accepted. The applicant sees 3 courses **Not Accepted** with the policy reason (for example, "grade D is below the C minimum").
- **Emails:** received → final review (→ decision available after posting).
- **Observed:** as expected.

### TC05 — Maybe / additional information loop (S5, S20)
- **File:** `TC05_Information_Required_NYU.pdf`
- **Student:** Sofia Lindqvist (TST-105), Mathematics
- **Institution:** New York University

| Course | Credits | Grade | Expected matching | Expected outcome |
|---|---:|---|---|---|
| MATH-UA 122 Calculus II | 4 | B+ | Equivalency | CAS MA 124 |
| MATH-UA 235 Probability & Statistics | 4 | A- | No description or syllabus on file, so it needs information | Syllabus requested; evaluator decides |

- **Expected evaluator:** Mathematics (Dr. Anita Rao).
- **Expected status:** **Action Required** (Waiting for Applicant). After the syllabus arrives, Department Review → Final Review → Completed.
- **Manual steps:**
  1. The applicant opens Track Application. MATH-UA 235 shows **Action Needed**; they upload the syllabus there.
  2. The evaluator sees "Syllabus received" and decides. The test chose elective credit.
  3. The Credit Office posts.
- **Expected final credits:** 8.
- **Emails:** received → information required → department review → final review → decision available.
- **Observed:** as expected.
  - The syllabus request was raised automatically when the course was assigned.
  - The test uploaded the CSC 220 sample syllabus as a stand-in. Re-comparing it against the catalog changed the suggestion to CAS CS 112, which shows that uploaded syllabi are really compared. Use a probability syllabus for a realistic demo.

### TC07 — Equivalency conflict (S7)
- **File:** `TC07_Conflicting_Precedents_Northeastern.pdf`
- **Student:** Mateus Ribeiro (TST-107), Biology
- **Institution:** Northeastern University

| Course | Credits | Grade | Past decisions that disagree | Expected outcome |
|---|---:|---|---|---|
| CHEM 1161 General Chemistry for Science Majors | 5 | B | PD-018 → CH 101 vs PD-031 → CH 101 + CH 102 | Held for the Chemistry evaluator; suggestion "CAS CH 101 (partial)" |
| MATH 1365 Introduction to Mathematical Reasoning | 4 | A- | PD-020 → math elective vs PD-033 → MA 293 | Held for the Mathematics evaluator |
| ECON 2560 Applied Econometrics | 4 | A- | PD-010 → econ elective vs PD-032 → EC 204 | Held for the Economics evaluator |

- **Expected:**
  - None of the courses is decided automatically.
  - All three appear on **Equivalency Conflicts** (Credit Office / admin).
  - The evaluator's review page shows the disagreeing precedents; they decide and can record a standard.
- **Expected status:** Department Review.
- **Emails:** received → department review.
- **Observed:** as expected; all three were on the conflicts list.
- **Note:** the request's example (BI 203 → BI 206 vs BI 203 → BI 203) is not in the data. These are the real conflicting precedents in the data.

### TC08 — Grade rules: A+, Pass, below minimum (S8, S9, S10)
- **File:** `TC08_Grade_Rules_Northeastern.pdf`
- **Student:** Hannah Weiss (TST-108), Mathematics
- **Institution:** Northeastern University

| Course | Credits | Grade | Expected matching | Expected outcome |
|---|---:|---|---|---|
| CS 1800 Discrete Structures | 4 | **A+** | A+ (4.3) meets the C minimum; equivalency | CAS CS 131, applied automatically |
| MATH 1341 Calculus 1 | 4 | **P** | PASS rule: the department confirms a Pass meets the minimum (assumption, `TRANSFER_PASS_GRADE_POLICY=review`) | To the Mathematics evaluator, suggestion CAS MA 123 |
| ECON 1116 Principles of Microeconomics | 4 | **C-** | R1 | No credit, applied automatically |
| MATH 2341 Differential Equations and Linear Algebra | 4 | B | Precedent PD-019 → MA 226 | To the Mathematics evaluator |

- **Expected status:** Department Review.
- **Emails:** received → department review.
- **Observed:** as expected.
- **Bug fixed during this work:** before the fix, the transcript reader silently dropped any **A+** row. See section 5.

### TC11 — Repeated course (S11)
- **File:** `TC11_Repeated_Course_Northeastern.pdf`
- **Student:** Theo Grant (TST-111)
- **Institution:** Northeastern University

| Course | Term | Grade | Expected outcome |
|---|---|---|---|
| CS 2000 | Fall 2024 | C+ | No credit (REPEAT: a better attempt exists) |
| CS 1800 | Fall 2024 | B | CAS CS 131 |
| CS 2000 | Spring 2025 | A- | CAS CS 111 (credit once, best grade) |

- **Expected:** Final Review; 9 units accepted. CS 2000 is never credited twice.
- **Emails:** received → final review.
- **Observed:** as expected.

### TC12 — Course-code formatting (S12)
- **File:** `TC12_Course_Code_Formats_Northeastern.pdf`
- **Student:** Aisha Bello (TST-112)
- **Institution:** Northeastern University
- **Courses as printed:** `CS2000` (A), `cs-1800` (B+), `ECON1116` (A-), `math 1341` (B).
- **Expected:** each normalizes and matches its equivalency (CS 111, CS 131, EC 101, MA 123), applied automatically. Final Review; 17 units.
- **Observed:** as expected. The codes are shown to staff and the applicant as printed on the transcript.

### TC13 — Missing credits (S13)
- **File:** `TC13_Missing_Credits_Northeastern.pdf`
- **Student:** Lucas Moreau (TST-113), Economics
- **Institution:** Northeastern University

| Course | Credits | Grade | Expected outcome |
|---|---:|---|---|
| CS 2000 | *(blank)* | A | Credits stay unknown (not 0); CREDITS rule; held for the CS evaluator, who records the BU units |
| ECON 1116 | 4 | B | CAS EC 101, automatic |

- **Expected status:** Department Review.
- **Applicant summary:** Credits Pending says "+ 1 course awaiting credit details". It is not shown as 0.
- **Observed:** as expected.
- **Bug fixed during this work:** before the fix, the transcript reader turned a blank credits cell into 0 credits. See section 5.

### TC14 — Unknown course (S14)
- **File:** `TC14_Unknown_Course_Northeastern.pdf`
- **Student:** Grace Adeyemi (TST-114)
- **Institution:** Northeastern University
- **Courses:**
  - CS 2000 (A): CAS CS 111, automatic.
  - **CS 4973 Topics in Quantum Software Engineering** (A): invented, so it is in neither the catalog nor the equivalency data.
- **Expected:** CS 4973 has no description on file → needs information → syllabus requested → **Action Required**.
- **Observed:** the course was routed to the general credit evaluator (Maria Santos). No CS specialist is qualified for an unknown target, so assignment follows the "no subject specialist" path.

### TC15 — No subject specialist (S15)
- **File:** `TC15_No_Subject_Specialist_Riverside.pdf`
- **Student:** Oliver Bennett (TST-115), Liberal Arts
- **Institution:** Riverside Community College
- **Courses:**
  - PHIL 101 Introduction to Philosophy (A-): invented.
  - MUS 110 Music Appreciation (B+): invented.
  - KIN 105 Fitness and Wellness (A): no-credit precedent PD-028.
- **Expected:**
  - No philosophy or music evaluator exists, so the courses go to the **general credit evaluator** (or to the Credit Office queue if none has capacity).
  - KIN 105 is recommended **no credit** from its precedent; an evaluator confirms.
- **Observed:**
  - All three went to Maria Santos (general credit evaluator).
  - PHIL 101 had a syllabus requested automatically, giving status **Action Required**.
  - MUS 110 waits with the evaluator, who can request its syllabus.
  - Two `information_required` emails were sent (see section 6).

### TC16 — Multiple institutions; quarter conversion (S16)
- **Files** (upload both on one application):
  - `TC16_Multiple_Institutions_Riverside.pdf`
  - `TC16_Multiple_Institutions_PacificCoast.pdf`
- **Student:** Nadia Haddad (TST-116)

| Institution | Course | Credits | Expected |
|---|---|---:|---|
| Riverside (semester) | CSC 110 | 4 | CAS CS 111, 4 units |
| Riverside | MAT 151 | 4 | CAS MA 123, 4 units |
| Pacific Coast (quarter) | PSYC 1 | 5 qtr | CAS PS 101, **3.33** units (R2) |
| Pacific Coast | MATH 19A | 5 qtr | CAS MA 123, **3.33** units (R2) |

- **Expected:** the courses are grouped by institution on the tracking page; Final Review; 14.66 units.
- **Observed:** as expected.

### TC17 — Multiple evaluators, combined courses, partial completion, reassignment (S17, S18, S21, S24)
- **File:** `TC17_Multiple_Evaluators_Northeastern.pdf`
- **Student:** Ethan Sato (TST-117), Computer Science
- **Institution:** Northeastern University

| Course | Grade | Expected matching | Expected evaluator |
|---|---|---|---|
| CS 2100 Program Design and Implementation 1 | B+ | Combined precedent PD-002: CAS CS 112 together with CS 2700 | CS |
| CS 2700 Data Structures and Analysis | B | Combined with CS 2100 | CS |
| BIOL 2301 Genetics and Molecular Biology | A- | Precedent PD-017 → BI 206 | Biology |
| MATH 2331 Linear Algebra | A | Equivalency → MA 242 | None (automatic) |
| PSYC 2320 Statistics in Psychological Research | B | Suggestion PS 211 | Psychology |

**Steps:**
1. **Multiple evaluators:** after processing, staff see the courses with three evaluators. CS holds the first courses; Biology and Psychology are queued for hand-off. Check the **Current Review Assignment** panel and **Application Lookup**.
2. **Partial completion (S18):** after the CS evaluator decides one course, the applicant sees some courses accepted with units and the rest **Pending — 0 BU units**. The summary shows Credits Accepted > 0 and Credits Pending > 0.
3. **Reassignment (S21):** the Credit Office marks the Psychology evaluator unavailable. PSYC 2320 is reassigned (to the general credit evaluator in the test run). The **Assignment history** keeps both rows.
4. All evaluators decide, then the Credit Office posts: **Completed**, 23 units.

- **Emails:** received → department review → final review → decision available.
- **Observed:** as expected for every step.

### TC19 — Final completed application (S19, S25)
Uses TC01 after **Finalize and post**.
- **Expected:**
  - status **Completed**;
  - every stage on the applicant timeline done (Department Review "Not needed");
  - Credits Accepted = Credits Awarded = 13, Credits Pending = 0;
  - every course posted with grade T, not counted in the BU GPA, 0 Hub units;
  - **Your Transfer Credit Evaluation Is Complete** email.
- **Observed:** as expected.

### TC22 — Duplicate application (S22)
- **Steps:** submit TC01 again with the **same email**.
- **Expected:** step 1 of `/apply` shows **We found an existing transfer credit application**, with masked numbers.
  - If the earlier application is finished (Completed): submitting another is a new evaluation and is not flagged.
  - If an earlier application is still active: the new one is flagged **Possible duplicate** for the Credit Office, which keeps both or closes one before anything posts.
- **Observed:** both cases behaved as expected. The email check listed all three applications, masked.

### TC23 — One-year deadline (S23)
- **Steps:** submit TC01 with BU start **Fall 2024**.
  - The public form only offers current terms, so the run used the API directly. Staff can also create it with **New Application**.
- **Expected:**
  - The deadline (Fall 2024 + 12 months) has passed, so **Finalize and post** is blocked with the deadline message.
  - After the Credit Office records an exception, posting succeeds.
  - A Fall 2027 start (TC01) shows "within" the deadline.
- **Observed:** as expected.

### TC26 — Economics cap (extra; R7)
- **Files** (both on one application):
  - `TC26_Economics_Cap_PacificCoast.pdf`: ECON 100A, 100B, 113, 136 (quarter);
  - `TC26_Economics_Cap_Northeastern.pdf`: ECON 2560.
- **Student:** Ivy Chen-Morales (TST-126), Economics
- **Expected:**
  - Five upper-level economics courses; at most four count. The fifth (ECON 2560) is recommended **no credit (R7)**.
  - The quarter courses convert to 3.33 units each.
  - All five go to the Economics evaluator.
- **Observed:** as expected. R7 is a recommendation the evaluator confirms; it is not applied automatically.

---

## 3. Scenarios from the request not separately testable

| Request | Why | Where it is covered |
|---|---|---|
| S24 Combined lecture/lab | The data has no lecture + lab pair. The implemented rule is combined courses from a past decision. | TC17 (CS 2100 + CS 2700 → CS 112) |
| S25 Hub / special credit | The statement's only Hub rule is that transfer courses earn 0 Hub units. It is enforced at posting. | TC01, TC02, TC17 postings (`hub_units = 0`) |
| S7 BI 203 example | Not in the data | TC07 uses the three real conflicting precedents |

## 4. End-to-end validation

An automated run (`t-scenarios.mjs`, in the local test environment) did the following for every transcript:
1. uploaded it through the public API;
2. waited for processing;
3. recorded extraction, matching path and rules, automatic decisions, evaluator and department, stage, the applicant's credit summary and the applicant emails;
4. performed the manual steps: evaluator decisions, the syllabus reply, reassignment, duplicate, deadline exception and Credit Office posting.

**Result: 24 of 24 checks passed** on a freshly seeded database.

| Flow | Scenarios run from upload to the final applicant result and email |
|---|---|
| Upload → processing → extraction → matching → **Credit Office → Completed → tracking → email** | TC01, TC02, TC19, TC23 |
| … → **evaluator review → Credit Office → Completed** | TC03, TC05 (with information loop), TC17 (with partial view and reassignment) |
| … → **evaluator review stage** (decision left to a live demo) | TC07, TC08, TC13, TC14, TC15, TC26 |
| … → **Final Review** (posting left to a live demo) | TC04, TC11, TC12, TC16 |

**Needs a person, or was done through the API in the test:**
- **Evaluator decisions:** the test called the same API the review page uses.
- **The applicant uploading a syllabus:** the test called the same tracking-page API.
- **Real email delivery:** in the test environment emails use the development log transport and are recorded as `logged`. Delivery to an inbox needs SMTP configured in Azure.
- **A start term in the past (TC23):** not selectable on the public form.

## 5. Bugs found and fixed while building the kit

Both were in the transcript reader. Each blocked a rule the policy layer already implements; the fixes are minimal.

| Bug | Effect before the fix | Fix |
|---|---|---|
| The grade pattern lacked `A+` | An A+ course was silently missing from the application | `A+` accepted (policy already scores it 4.3) |
| A blank credits cell became `0` | A course with missing credits looked like 0 credits | Kept as unknown (`null`); the engine holds it with the CREDITS rule and the department confirms the units |

## 6. Observations (not changed)

- **TC15:** two courses needing syllabi produced two separate `information_required` emails. This follows the documented rule: each information request is emailed.
- **TC15:** only one of the two courses without a description got an automatic syllabus request. The evaluator can request the other from the review page.
- **TC14:** an unknown course is assigned to the general credit evaluator rather than a CS specialist, because there is no BU target course to qualify a specialist against.
- **R7 (TC26):** applied as a recommendation for the evaluator, not automatically.
- **PSYC 2320:** recommended as a psych elective in TC03 (precedent PD-012 is the only one in play) but as PS 211 in TC17. The engine's content comparison gives different suggestions in context; the evaluator decides in both cases.
