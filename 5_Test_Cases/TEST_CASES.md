# Test cases and end-to-end transcripts

Generated from the prototype's *Test cases* tab. Each transcript is produced by running the same functions the Student and Evaluator screens use, on a fresh copy of the data. Source labels: **Worksheet** = sponsor workbook, **Synthetic** = written for the demo, **System** = computed by the engine.

Result: 6 of 6 cases pass their expected outcome.

## TC-01 · Fully successful transfer  (PASS)

Every course is a worksheet “Likely equivalent” pair already in the equivalency database, so the agent marks all of them as pre-approved. The evaluator scans the list and approves everything in one click.

### Test case information

- **Test case ID:** TC-01
- **Scenario:** Fully successful transfer
- **Student:** Ethan Brooks (STU-007) Synthetic
- **Previous university:** New York University Worksheet
- **Target university:** Boston University Worksheet
- **Program:** Economics (BA) → BA in Economics Worksheet
- **Source of data:** Mixed: worksheet courses, credits, programs and match levels; synthetic student, grades and descriptions
- **Expected outcome:** Completed · 24 cr accepted · 0 cr rejected

### Data traceability

| Field | Value | Source |
|---|---|---|
| Student name and ID | Ethan Brooks · STU-007 | Synthetic |
| Previous university | New York University | Worksheet |
| Previous program | Economics (BA) | Worksheet |
| Target university and program | Boston University · BA in Economics | Worksheet |
| Course codes, titles, credits | ECON-UA 2, ECON-UA 1, ECON-UA 10, ECON-UA 12, ECON-UA 18, MATH-UA 121 | Worksheet |
| Target BU courses and credits | CAS EC 101, CAS EC 102, CAS EC 201, CAS EC 202, CAS EC 203, CAS MA 123 | Worksheet |
| Worksheet match levels | Likely equivalent | Worksheet |
| Grades and terms | ECON-UA 2 A, ECON-UA 1 A-, ECON-UA 10 B+, ECON-UA 12 B, ECON-UA 18 A, MATH-UA 121 B+ | Synthetic |
| Course descriptions and syllabi | Written for the demo | Synthetic |
| Equivalency IDs, dates and past decisions | EQ-xxx approval dates, PD-xxx decisions | Synthetic |
| Match %, confidence, recommendation | Computed by the engine | System |

### Transcript

```
Student:
I want to transfer my credits from New York University to Boston University (BA in Economics).

System:
Transcript received for request TCR-26-007. 6 courses identified (24 credits). Your request is under review.

System (internal):
Automated matching, not shown to the student: 6 matched to approved equivalencies (ECON-UA 2 → CAS EC 101, ECON-UA 1 → CAS EC 102, ECON-UA 10 → CAS EC 201, ECON-UA 12 → CAS EC 202, ECON-UA 18 → CAS EC 203, MATH-UA 121 → CAS MA 123). 0 recommended for rejection. 0 need review. Every course waits for an evaluator's final decision.

Student:
View transfer evaluation.

System:
Status: With the department. 0 accepted (0 cr), 6 pending (24 cr), 0 not transferable.
  • ECON-UA 2 Introduction to Microeconomics → CAS EC 101 (4 cr) · Likely
  • ECON-UA 1 Introduction to Macroeconomics → CAS EC 102 (4 cr) · Likely
  • ECON-UA 10 Intermediate Microeconomics → CAS EC 201 (4 cr) · Likely
  • ECON-UA 12 Intermediate Macroeconomics → CAS EC 202 (4 cr) · Likely
  • ECON-UA 18 Statistics → CAS EC 203 (4 cr) · Likely
  • MATH-UA 121 Calculus I → CAS MA 123 (4 cr) · Likely

Evaluator:
Opens Ethan Brooks (TCR-26-007).

System:
Category: Waiting for Confirmation. ECON-UA 2 → CAS EC 101: Accept, 100% match (High). Why: Approved equivalency EQ-011 already maps it to CAS EC 101; Grade A meets the C minimum
ECON-UA 1 → CAS EC 102: Accept, 91% match (High). Why: Approved equivalency EQ-013 already maps it to CAS EC 102; Grade A- meets the C minimum
ECON-UA 10 → CAS EC 201: Accept, 89% match (High). Why: Approved equivalency EQ-015 already maps it to CAS EC 201; Grade B+ meets the C minimum
ECON-UA 12 → CAS EC 202: Accept, 100% match (High). Why: Approved equivalency EQ-017 already maps it to CAS EC 202; Grade B meets the C minimum
ECON-UA 18 → CAS EC 203: Accept, 100% match (High). Why: Approved equivalency EQ-019 already maps it to CAS EC 203; Grade A meets the C minimum
MATH-UA 121 → CAS MA 123: Accept, 100% match (High). Why: Approved equivalency EQ-043 already maps it to CAS MA 123; Grade B+ meets the C minimum

Evaluator:
Reviews the pre-approved matches and clicks Accept recommended matches.

System:
Accepted 6 recommended matches: ECON-UA 2 → CAS EC 101, ECON-UA 1 → CAS EC 102, ECON-UA 10 → CAS EC 201, ECON-UA 12 → CAS EC 202, ECON-UA 18 → CAS EC 203, MATH-UA 121 → CAS MA 123.

Evaluator:
Completes the evaluation.

System:
Evaluation completed. 24 credits posted to Ethan's BU record (6 accepted, 0 not transferable). 6 new decisions saved to the equivalency database.

Student:
View transfer evaluation.

System:
Status: Completed. 6 accepted (24 cr), 0 pending (0 cr), 0 not transferable.
  • ECON-UA 2 Introduction to Microeconomics → CAS EC 101 (4 cr) · Confirmed
  • ECON-UA 1 Introduction to Macroeconomics → CAS EC 102 (4 cr) · Confirmed
  • ECON-UA 10 Intermediate Microeconomics → CAS EC 201 (4 cr) · Confirmed
  • ECON-UA 12 Intermediate Macroeconomics → CAS EC 202 (4 cr) · Confirmed
  • ECON-UA 18 Statistics → CAS EC 203 (4 cr) · Confirmed
  • MATH-UA 121 Calculus I → CAS MA 123 (4 cr) · Confirmed

```

### Validation

| Check | Expected | Actual | Result |
|---|---|---|---|
| Final status | Completed | Completed | Pass |
| Credits accepted | 24 | 24 | Pass |
| Credits pending | 0 | 0 | Pass |
| Credits rejected | 0 | 0 | Pass |
| ECON-UA 2 outcome | CAS EC 101 | CAS EC 101 | Pass |
| ECON-UA 1 outcome | CAS EC 102 | CAS EC 102 | Pass |
| ECON-UA 10 outcome | CAS EC 201 | CAS EC 201 | Pass |
| ECON-UA 12 outcome | CAS EC 202 | CAS EC 202 | Pass |
| ECON-UA 18 outcome | CAS EC 203 | CAS EC 203 | Pass |
| MATH-UA 121 outcome | CAS MA 123 | CAS MA 123 | Pass |

## TC-02 · Evaluator confirmation required  (PASS)

Northeastern splits BU's CS 112 across two courses, and CS 3800 matches a BU-only course. These ambiguous matches wait for confirmation.

### Test case information

- **Test case ID:** TC-02
- **Scenario:** Evaluator confirmation required
- **Student:** Daniel Kim (STU-002) Synthetic
- **Previous university:** Northeastern University Worksheet
- **Target university:** Boston University Worksheet
- **Program:** Computer Science, BSCS (Boston) (BS) → BA in Computer Science Worksheet
- **Source of data:** Mixed: worksheet courses, credits, programs and match levels; synthetic student, grades and descriptions
- **Expected outcome:** Completed · 31 cr accepted · 4 cr rejected

### Data traceability

| Field | Value | Source |
|---|---|---|
| Student name and ID | Daniel Kim · STU-002 | Synthetic |
| Previous university | Northeastern University | Worksheet |
| Previous program | Computer Science, BSCS (Boston) (BS) | Worksheet |
| Target university and program | Boston University · BA in Computer Science | Worksheet |
| Course codes, titles, credits | CS 2000, CS 1800, CS 2100, CS 2700, CS 3800, MATH 1341, ECON 1116, DS 3000 | Worksheet |
| Target BU courses and credits | CAS CS 111, CAS CS 131, CAS CS 112, CAS CS 332, CAS MA 123, CAS EC 101, CAS CS 132 | Worksheet |
| Worksheet match levels | Likely equivalent, Partial - syllabus review, Must be taken at BU | Worksheet |
| Grades and terms | CS 2000 A, CS 1800 B, CS 2100 B+, CS 2700 B, CS 3800 A-, MATH 1341 C-, ECON 1116 B, DS 3000 A | Synthetic |
| Course descriptions and syllabi | Written for the demo | Synthetic |
| Equivalency IDs, dates and past decisions | EQ-xxx approval dates, PD-xxx decisions | Synthetic |
| Match %, confidence, recommendation | Computed by the engine | System |

### Transcript

```
Student:
I want to transfer my credits from Northeastern University to Boston University (BA in Computer Science).

System:
Transcript received for request TCR-26-002. 8 courses identified (35 credits). Your request is under review.

System (internal):
Automated matching, not shown to the student: 3 matched to approved equivalencies (CS 2000 → CAS CS 111, CS 1800 → CAS CS 131, ECON 1116 → CAS EC 101). 1 recommended for rejection (MATH 1341: Grade C- is below the C minimum.). 4 need review (CS 2100, CS 2700, CS 3800, DS 3000). Every course waits for an evaluator's final decision.

Student:
View transfer evaluation.

System:
Status: With the department. 0 accepted (0 cr), 8 pending (35 cr), 0 not transferable.
  • CS 2000 Introduction to Program Design and Implementation → CAS CS 111 (5 cr) · Likely
  • CS 1800 Discrete Structures → CAS CS 131 (4 cr) · Likely
  • CS 2100 Program Design and Implementation 1 → CS elective (CAS CS 1XX) (5 cr) · Likely
  • CS 2700 Data Structures and Analysis → CAS CS 112 (5 cr) · Under review
  • CS 3800 Theory of Computation → CS elective (CAS CS 3XX) (4 cr) · Likely
  • MATH 1341 Calculus 1 for Science and Engineering → No credit (likely) (0 cr) · Under review
  • ECON 1116 Principles of Microeconomics → CAS EC 101 (4 cr) · Likely
  • DS 3000 Mathematical Foundations of Artificial Intelligence → CS elective (CAS CS 2XX) (4 cr) · Likely

Evaluator:
Opens Daniel Kim (TCR-26-002).

System:
Category: Waiting for Confirmation. CS 2000 → CAS CS 111: Accept, 83% match (Medium). Why: Approved equivalency EQ-001 already maps it to CAS CS 111; Grade A meets the C minimum
CS 1800 → CAS CS 131: Accept, 100% match (High). Why: Approved equivalency EQ-004 already maps it to CAS CS 131; Grade B meets the C minimum
CS 2100 → CS elective (CAS CS 1XX): Accept as elective, 73% match (Medium). Why: Matches past decision PD-001: CS elective (CAS CS 1XX); Grade B+ meets the C minimum
CS 2700 → CAS CS 112: Accept, 83% match (Medium). Why: Closest BU course by content: CAS CS 112 (83% match); Grade B meets the C minimum; Not listed in the worksheet's Course Match sheet
CS 3800 → CS elective (CAS CS 3XX): Accept as elective, 100% match (High). Why: Closest BU course CAS CS 332 must be taken at BU (Group C); Grade A- meets the C minimum
MATH 1341 → No credit: Reject. Why: Grade C- is below the C minimum
ECON 1116 → CAS EC 101: Accept, 100% match (High). Why: Approved equivalency EQ-010 already maps it to CAS EC 101; Grade B meets the C minimum
DS 3000 → CS elective (CAS CS 2XX): Accept as elective, 78% match (Medium). Why: Matches past decision PD-023: CS elective (CAS CS 2XX); Grade A meets the C minimum

Evaluator:
Reviews the pre-approved matches and clicks Accept recommended matches.

System:
Accepted 4 recommended matches: CS 2000 → CAS CS 111, CS 1800 → CAS CS 131, CS 3800 → CS elective (CAS CS 3XX), ECON 1116 → CAS EC 101.

Evaluator:
Accepts CS 2700 → CAS CS 112. Comment: “Together with CS 2100 this covers CS 112.”

System:
CS 2700 accepted → CAS CS 112, 5 credits.

Evaluator:
Accepts CS 2100 → CS elective (CAS CS 1XX). Comment: “Program design only; CS 112 credit comes via CS 2700.”

System:
CS 2100 accepted → CS elective (CAS CS 1XX), 5 credits.

Evaluator:
Accepts DS 3000 → CS elective (CAS CS 2XX)

System:
DS 3000 accepted → CS elective (CAS CS 2XX), 4 credits.

Evaluator:
Agrees with the recommendation and rejects MATH 1341: “Grade C- is below the C minimum.”

System:
MATH 1341 rejected. Reason recorded and shown to the student.

Evaluator:
Completes the evaluation.

System:
Evaluation completed. 31 credits posted to Daniel's BU record (7 accepted, 1 not transferable). 7 new decisions saved to the equivalency database.

Student:
View transfer evaluation.

System:
Status: Completed. 7 accepted (31 cr), 0 pending (0 cr), 1 not transferable.
  • CS 2000 Introduction to Program Design and Implementation → CAS CS 111 (5 cr) · Confirmed
  • CS 1800 Discrete Structures → CAS CS 131 (4 cr) · Confirmed
  • CS 2100 Program Design and Implementation 1 → CS elective (CAS CS 1XX) (5 cr) · Confirmed
  • CS 2700 Data Structures and Analysis → CAS CS 112 (5 cr) · Confirmed
  • CS 3800 Theory of Computation → CS elective (CAS CS 3XX) (4 cr) · Confirmed
  • MATH 1341 Calculus 1 for Science and Engineering → Not transferable · Not transferable — Your grade (C-) is below the minimum grade of C needed for transfer credit.
  • ECON 1116 Principles of Microeconomics → CAS EC 101 (4 cr) · Confirmed
  • DS 3000 Mathematical Foundations of Artificial Intelligence → CS elective (CAS CS 2XX) (4 cr) · Confirmed

```

### Validation

| Check | Expected | Actual | Result |
|---|---|---|---|
| Final status | Completed | Completed | Pass |
| Credits accepted | 31 | 31 | Pass |
| Credits pending | 0 | 0 | Pass |
| Credits rejected | 4 | 4 | Pass |
| CS 2700 outcome | CAS CS 112 | CAS CS 112 | Pass |
| CS 2100 outcome | CS elective (CAS CS 1XX) | CS elective (CAS CS 1XX) | Pass |
| CS 3800 outcome | CS elective (CAS CS 3XX) | CS elective (CAS CS 3XX) | Pass |
| MATH 1341 outcome | No credit | No credit | Pass |

## TC-03 · Rejected course  (PASS)

BIOL-UA 11 has a grade of D, below the C minimum, so the system rejects it before any matching. The student sees exactly why.

### Test case information

- **Test case ID:** TC-03
- **Scenario:** Rejected course
- **Student:** Priya Shah (STU-003) Synthetic
- **Previous university:** New York University Worksheet
- **Target university:** Boston University Worksheet
- **Program:** Psychology (BA) → BA in Psychology Worksheet
- **Source of data:** Mixed: worksheet courses, credits, programs and match levels; synthetic student, grades and descriptions
- **Expected outcome:** Completed · 24 cr accepted · 4 cr rejected

### Data traceability

| Field | Value | Source |
|---|---|---|
| Student name and ID | Priya Shah · STU-003 | Synthetic |
| Previous university | New York University | Worksheet |
| Previous program | Psychology (BA) | Worksheet |
| Target university and program | Boston University · BA in Psychology | Worksheet |
| Course codes, titles, credits | PSYCH-UA 1, PSYCH-UA 10, PSYCH-UA 25, PSYCH-UA 32, PSYCH-UA 30, BIOL-UA 11, MATH-UA 121 | Worksheet |
| Target BU courses and credits | CAS PS 101, CAS EC 203, CAS PS 336, CAS PS 261, CAS PS 251, CAS BI 107, CAS MA 123 | Worksheet |
| Worksheet match levels | Likely equivalent | Worksheet |
| Grades and terms | PSYCH-UA 1 A, PSYCH-UA 10 B, PSYCH-UA 25 B+, PSYCH-UA 32 A-, PSYCH-UA 30 C, BIOL-UA 11 D, MATH-UA 121 B | Synthetic |
| Course descriptions and syllabi | Written for the demo | Synthetic |
| Equivalency IDs, dates and past decisions | EQ-xxx approval dates, PD-xxx decisions | Synthetic |
| Match %, confidence, recommendation | Computed by the engine | System |

### Transcript

```
Student:
I want to transfer my credits from New York University to Boston University (BA in Psychology).

System:
Transcript received for request TCR-26-003. 7 courses identified (28 credits). Your request is under review.

System (internal):
Automated matching, not shown to the student: 4 matched to approved equivalencies (PSYCH-UA 1 → CAS PS 101, PSYCH-UA 32 → CAS PS 261, PSYCH-UA 30 → CAS PS 251, MATH-UA 121 → CAS MA 123). 1 recommended for rejection (BIOL-UA 11: Grade D is below the C minimum.). 2 need review (PSYCH-UA 10, PSYCH-UA 25). Every course waits for an evaluator's final decision.

Student:
View transfer evaluation.

System:
Status: With the department. 0 accepted (0 cr), 7 pending (28 cr), 0 not transferable.
  • PSYCH-UA 1 Intro to Psychology → CAS PS 101 (4 cr) · Likely
  • PSYCH-UA 10 Statistics for the Behavioral Sciences → Psych elective (CAS PS 2XX) (4 cr) · Likely
  • PSYCH-UA 25 Cognitive Neuroscience → Psych elective (CAS PS 2XX) (4 cr) · Likely
  • PSYCH-UA 32 Social Psychology → CAS PS 261 (4 cr) · Likely
  • PSYCH-UA 30 Personality → CAS PS 251 (4 cr) · Likely
  • BIOL-UA 11 Principles of Biology I → No credit (likely) (0 cr) · Under review
  • MATH-UA 121 Calculus I → CAS MA 123 (4 cr) · Likely

Evaluator:
Opens Priya Shah (TCR-26-003).

System:
Category: Waiting for Confirmation. PSYCH-UA 1 → CAS PS 101: Accept, 97% match (High). Why: Approved equivalency EQ-021 already maps it to CAS PS 101; Grade A meets the C minimum
PSYCH-UA 10 → Psych elective (CAS PS 2XX): Accept as elective, 72% match (Medium). Why: Matches past decision PD-013: Psych elective (CAS PS 2XX); Grade B meets the C minimum
PSYCH-UA 25 → Psych elective (CAS PS 2XX): Accept as elective, 93% match (High). Why: Matches past decision PD-015: Psych elective (CAS PS 2XX); Grade B+ meets the C minimum
PSYCH-UA 32 → CAS PS 261: Accept, 100% match (High). Why: Approved equivalency EQ-029 already maps it to CAS PS 261; Grade A- meets the C minimum
PSYCH-UA 30 → CAS PS 251: Accept, 100% match (High). Why: Approved equivalency EQ-027 already maps it to CAS PS 251; Grade C meets the C minimum
BIOL-UA 11 → No credit: Reject. Why: Grade D is below the C minimum
MATH-UA 121 → CAS MA 123: Accept, 100% match (High). Why: Approved equivalency EQ-043 already maps it to CAS MA 123; Grade B meets the C minimum

Evaluator:
Reviews the pre-approved matches and clicks Accept recommended matches.

System:
Accepted 5 recommended matches: PSYCH-UA 1 → CAS PS 101, PSYCH-UA 25 → Psych elective (CAS PS 2XX), PSYCH-UA 32 → CAS PS 261, PSYCH-UA 30 → CAS PS 251, MATH-UA 121 → CAS MA 123.

Evaluator:
Accepts PSYCH-UA 10 → Psych elective (CAS PS 2XX). Comment: “Statistics only, no lab component; counts as a psychology elective.”

System:
PSYCH-UA 10 accepted → Psych elective (CAS PS 2XX), 4 credits.

Evaluator:
Agrees with the recommendation and rejects BIOL-UA 11: “Grade D is below the C minimum.”

System:
BIOL-UA 11 rejected. Reason recorded and shown to the student.

Evaluator:
Completes the evaluation.

System:
Evaluation completed. 24 credits posted to Priya's BU record (6 accepted, 1 not transferable). 6 new decisions saved to the equivalency database.

Student:
View transfer evaluation.

System:
Status: Completed. 6 accepted (24 cr), 0 pending (0 cr), 1 not transferable.
  • PSYCH-UA 1 Intro to Psychology → CAS PS 101 (4 cr) · Confirmed
  • PSYCH-UA 10 Statistics for the Behavioral Sciences → Psych elective (CAS PS 2XX) (4 cr) · Confirmed
  • PSYCH-UA 25 Cognitive Neuroscience → Psych elective (CAS PS 2XX) (4 cr) · Confirmed
  • PSYCH-UA 32 Social Psychology → CAS PS 261 (4 cr) · Confirmed
  • PSYCH-UA 30 Personality → CAS PS 251 (4 cr) · Confirmed
  • BIOL-UA 11 Principles of Biology I → Not transferable · Not transferable — Your grade (D) is below the minimum grade of C needed for transfer credit.
  • MATH-UA 121 Calculus I → CAS MA 123 (4 cr) · Confirmed

```

### Validation

| Check | Expected | Actual | Result |
|---|---|---|---|
| Final status | Completed | Completed | Pass |
| Credits accepted | 24 | 24 | Pass |
| Credits pending | 0 | 0 | Pass |
| Credits rejected | 4 | 4 | Pass |
| BIOL-UA 11 outcome | No credit | No credit | Pass |
| PSYCH-UA 10 outcome | Psych elective (CAS PS 2XX) | Psych elective (CAS PS 2XX) | Pass |

## TC-04 · Partial credit transfer  (PASS)

Northeastern CHEM 1161 is a 5-credit accelerated course. It fully covers BU CH 101 but only part of CH 102, and past decisions disagree, so the system recommends partial credit.

### Test case information

- **Test case ID:** TC-04
- **Scenario:** Partial credit transfer
- **Student:** Sofia Martinez (STU-008) Synthetic
- **Previous university:** Northeastern University Worksheet
- **Target university:** Boston University Worksheet
- **Program:** Biology, BS → BA in Biology Worksheet
- **Source of data:** Mixed: worksheet courses, credits, programs and match levels; synthetic student, grades and descriptions
- **Expected outcome:** Completed · 28 cr accepted · 0 cr rejected

### Data traceability

| Field | Value | Source |
|---|---|---|
| Student name and ID | Sofia Martinez · STU-008 | Synthetic |
| Previous university | Northeastern University | Worksheet |
| Previous program | Biology, BS | Worksheet |
| Target university and program | Boston University · BA in Biology | Worksheet |
| Course codes, titles, credits | BIOL 1107, BIOL 1113, CHEM 1161, CHEM 2311, BIOL 2301, MATH 1341 | Worksheet |
| Target BU courses and credits | CAS BI 107, CAS BI 108, CAS CH 101, CAS CH 203, CAS BI 206, CAS MA 123 | Worksheet |
| Worksheet match levels | Likely equivalent, Partial - syllabus review | Worksheet |
| Grades and terms | BIOL 1107 A-, BIOL 1113 B+, CHEM 1161 B, CHEM 2311 B, BIOL 2301 A-, MATH 1341 B | Synthetic |
| Course descriptions and syllabi | Written for the demo | Synthetic |
| Equivalency IDs, dates and past decisions | EQ-xxx approval dates, PD-xxx decisions | Synthetic |
| Match %, confidence, recommendation | Computed by the engine | System |

### Transcript

```
Student:
I want to transfer my credits from Northeastern University to Boston University (BA in Biology).

System:
Transcript received for request TCR-26-008. 6 courses identified (28 credits). Your request is under review.

System (internal):
Automated matching, not shown to the student: 4 matched to approved equivalencies (BIOL 1107 → CAS BI 107, BIOL 1113 → CAS BI 108, CHEM 2311 → CAS CH 203, MATH 1341 → CAS MA 123). 0 recommended for rejection. 2 need review (CHEM 1161, BIOL 2301). Every course waits for an evaluator's final decision.

Student:
View transfer evaluation.

System:
Status: With the department. 0 accepted (0 cr), 6 pending (28 cr), 0 not transferable.
  • BIOL 1107 Foundations of Biology → CAS BI 107 (5 cr) · Likely
  • BIOL 1113 General Biology 2 → CAS BI 108 (4 cr) · Likely
  • CHEM 1161 General Chemistry for Science Majors → CAS CH 101 + CAS CH 102 (5 cr) · Likely
  • CHEM 2311 Organic Chemistry 1 → CAS CH 203 (5 cr) · Likely
  • BIOL 2301 Genetics and Molecular Biology → CAS BI 206 (5 cr) · Likely
  • MATH 1341 Calculus 1 for Science and Engineering → CAS MA 123 (4 cr) · Likely

Evaluator:
Opens Sofia Martinez (TCR-26-008).

System:
Category: Rejected / Needs Review. BIOL 1107 → CAS BI 107: Accept, 82% match (Medium). Why: Approved equivalency EQ-031 already maps it to CAS BI 107; Grade A- meets the C minimum
BIOL 1113 → CAS BI 108: Accept, 100% match (High). Why: Approved equivalency EQ-033 already maps it to CAS BI 108; Grade B+ meets the C minimum
CHEM 1161 → CAS CH 101 + 1 cr elective: Partial credit, 90% match (High) — exceptions: Conflicting precedents, Credit hours differ. Why: Grade B meets the C minimum; Past decisions disagree: PD-018 → CAS CH 101; PD-031 → CAS CH 101 + CAS CH 102; 5 credits vs 4 for CAS CH 101; content covers CAS CH 101 fully and the next course only in part
CHEM 2311 → CAS CH 203: Accept, 96% match (High). Why: Approved equivalency EQ-038 already maps it to CAS CH 203; Grade B meets the C minimum
BIOL 2301 → CAS BI 206: Accept, 86% match (High). Why: Matches past decision PD-017: CAS BI 206; Grade A- meets the C minimum
MATH 1341 → CAS MA 123: Accept, 100% match (High). Why: Approved equivalency EQ-042 already maps it to CAS MA 123; Grade B meets the C minimum

Evaluator:
Reviews the pre-approved matches and clicks Accept recommended matches.

System:
Accepted 5 recommended matches: BIOL 1107 → CAS BI 107, BIOL 1113 → CAS BI 108, CHEM 2311 → CAS CH 203, BIOL 2301 → CAS BI 206, MATH 1341 → CAS MA 123.

Evaluator:
Accepts CHEM 1161 → CAS CH 101 + 1 cr elective. Comment: “CH 102 electrochemistry and thermodynamics not covered; take CH 102 at BU.”

System:
CHEM 1161 accepted → CAS CH 101 + 1 cr elective, 5 credits.

Evaluator:
Completes the evaluation.

System:
Evaluation completed. 28 credits posted to Sofia's BU record (6 accepted, 0 not transferable). 6 new decisions saved to the equivalency database.

Student:
View transfer evaluation.

System:
Status: Completed. 6 accepted (28 cr), 0 pending (0 cr), 0 not transferable.
  • BIOL 1107 Foundations of Biology → CAS BI 107 (5 cr) · Confirmed
  • BIOL 1113 General Biology 2 → CAS BI 108 (4 cr) · Confirmed
  • CHEM 1161 General Chemistry for Science Majors → CAS CH 101 + 1 cr elective (5 cr) · Confirmed
  • CHEM 2311 Organic Chemistry 1 → CAS CH 203 (5 cr) · Confirmed
  • BIOL 2301 Genetics and Molecular Biology → CAS BI 206 (5 cr) · Confirmed
  • MATH 1341 Calculus 1 for Science and Engineering → CAS MA 123 (4 cr) · Confirmed

```

### Validation

| Check | Expected | Actual | Result |
|---|---|---|---|
| Final status | Completed | Completed | Pass |
| Credits accepted | 28 | 28 | Pass |
| Credits pending | 0 | 0 | Pass |
| Credits rejected | 0 | 0 | Pass |
| CHEM 1161 outcome | CAS CH 101 + 1 cr elective | CAS CH 101 + 1 cr elective | Pass |
| BIOL 2301 outcome | CAS BI 206 | CAS BI 206 | Pass |

## TC-05 · Missing information  (PASS)

NYU MATH-UA 235 is in the worksheet's NYU course list, but there is no description and no syllabus, so it cannot be scored. The evaluator requests the syllabus; the student uploads it; the system re-scores.

### Test case information

- **Test case ID:** TC-05
- **Scenario:** Missing information
- **Student:** Omar Haddad (STU-009) Synthetic
- **Previous university:** New York University Worksheet
- **Target university:** Boston University Worksheet
- **Program:** Mathematics (BA) → BA in Mathematics Worksheet
- **Source of data:** Mixed: worksheet courses, credits, programs and match levels; synthetic student, grades and descriptions
- **Expected outcome:** Completed · 20 cr accepted · 0 cr rejected

### Data traceability

| Field | Value | Source |
|---|---|---|
| Student name and ID | Omar Haddad · STU-009 | Synthetic |
| Previous university | New York University | Worksheet |
| Previous program | Mathematics (BA) | Worksheet |
| Target university and program | Boston University · BA in Mathematics | Worksheet |
| Course codes, titles, credits | MATH-UA 121, MATH-UA 122, MATH-UA 123, MATH-UA 140, MATH-UA 235 | Worksheet |
| Target BU courses and credits | CAS MA 123, CAS MA 124, CAS MA 225, CAS MA 242, CAS EC 203 | Worksheet |
| Worksheet match levels | Likely equivalent | Worksheet |
| Grades and terms | MATH-UA 121 A, MATH-UA 122 A-, MATH-UA 123 B+, MATH-UA 140 B, MATH-UA 235 A- | Synthetic |
| Course descriptions and syllabi | Missing for MATH-UA 235 until uploaded; others written for the demo | Synthetic |
| Equivalency IDs, dates and past decisions | EQ-xxx approval dates, PD-xxx decisions | Synthetic |
| Match %, confidence, recommendation | Computed by the engine | System |

### Transcript

```
Student:
I want to transfer my credits from New York University to Boston University (BA in Mathematics).

System:
Transcript received for request TCR-26-009. 5 courses identified (20 credits). Your request is under review.

System (internal):
Automated matching, not shown to the student: 4 matched to approved equivalencies (MATH-UA 121 → CAS MA 123, MATH-UA 122 → CAS MA 124, MATH-UA 123 → CAS MA 225, MATH-UA 140 → CAS MA 242). 0 recommended for rejection. 1 need review (MATH-UA 235). Every course waits for an evaluator's final decision.

Student:
View transfer evaluation.

System:
Status: With the department. 0 accepted (0 cr), 5 pending (20 cr), 0 not transferable.
  • MATH-UA 121 Calculus I → CAS MA 123 (4 cr) · Likely
  • MATH-UA 122 Calculus II → CAS MA 124 (4 cr) · Likely
  • MATH-UA 123 Calculus III → CAS MA 225 (4 cr) · Likely
  • MATH-UA 140 Linear Algebra → CAS MA 242 (4 cr) · Likely
  • MATH-UA 235 Probability & Statistics → Not matched yet (4 cr) · Under review

Evaluator:
Opens Omar Haddad (TCR-26-009).

System:
Category: Rejected / Needs Review. MATH-UA 121 → CAS MA 123: Accept, 100% match (High). Why: Approved equivalency EQ-043 already maps it to CAS MA 123; Grade A meets the C minimum
MATH-UA 122 → CAS MA 124: Accept, 100% match (High). Why: Approved equivalency EQ-045 already maps it to CAS MA 124; Grade A- meets the C minimum
MATH-UA 123 → CAS MA 225: Accept, 100% match (High). Why: Approved equivalency EQ-047 already maps it to CAS MA 225; Grade B+ meets the C minimum
MATH-UA 140 → CAS MA 242: Accept, 100% match (High). Why: Approved equivalency EQ-049 already maps it to CAS MA 242; Grade B meets the C minimum
MATH-UA 235 → Request syllabus: Needs info — exceptions: Course description missing, Syllabus unavailable. Why: Grade A- meets the C minimum; No description or syllabus on file, so content cannot be compared

Evaluator:
Reviews the pre-approved matches and clicks Accept recommended matches.

System:
Accepted 4 recommended matches: MATH-UA 121 → CAS MA 123, MATH-UA 122 → CAS MA 124, MATH-UA 123 → CAS MA 225, MATH-UA 140 → CAS MA 242.

Evaluator:
Tries to accept MATH-UA 235.

System:
MATH-UA 235 cannot be accepted yet: the description and syllabus are missing. Request them from the student first.

Evaluator:
Requests information for MATH-UA 235: “Please upload the MATH-UA 235 syllabus with weekly topics and assessment.”

System:
Request sent to Omar. MATH-UA 235 is on hold until the student responds.

Student:
View transfer evaluation.

System:
Status: Action needed from you. 4 accepted (16 cr), 1 pending (4 cr), 0 not transferable.
  • MATH-UA 121 Calculus I → CAS MA 123 (4 cr) · Confirmed
  • MATH-UA 122 Calculus II → CAS MA 124 (4 cr) · Confirmed
  • MATH-UA 123 Calculus III → CAS MA 225 (4 cr) · Confirmed
  • MATH-UA 140 Linear Algebra → CAS MA 242 (4 cr) · Confirmed
  • MATH-UA 235 Probability & Statistics → Not matched yet (4 cr) · Info requested

Student:
Uploads MATH-UA-235_syllabus.pdf for MATH-UA 235.

System:
Re-evaluated MATH-UA 235 with the syllabus: Accept as elective → Math elective (CAS MA 1XX), 83% match (Medium confidence).

Evaluator:
Opens Omar Haddad (TCR-26-009).

System:
Category: Waiting for Confirmation. MATH-UA 235 → Math elective (CAS MA 1XX): Accept as elective, 83% match (Medium). Why: Closest BU course by content: CAS EC 203 (83% match); Grade A- meets the C minimum; Similar course Northeastern University MATH 3081 was awarded Math elective (CAS MA 1XX) (PD-005): Probability coverage too light for MA 581/CS 237; half the course is statistics.

Evaluator:
Accepts MATH-UA 235 → Math elective (CAS MA 1XX). Comment: “Combined probability and statistics course; counts as a math elective.”

System:
MATH-UA 235 accepted → Math elective (CAS MA 1XX), 4 credits.

Evaluator:
Completes the evaluation.

System:
Evaluation completed. 20 credits posted to Omar's BU record (5 accepted, 0 not transferable). 5 new decisions saved to the equivalency database.

Student:
View transfer evaluation.

System:
Status: Completed. 5 accepted (20 cr), 0 pending (0 cr), 0 not transferable.
  • MATH-UA 121 Calculus I → CAS MA 123 (4 cr) · Confirmed
  • MATH-UA 122 Calculus II → CAS MA 124 (4 cr) · Confirmed
  • MATH-UA 123 Calculus III → CAS MA 225 (4 cr) · Confirmed
  • MATH-UA 140 Linear Algebra → CAS MA 242 (4 cr) · Confirmed
  • MATH-UA 235 Probability & Statistics → Math elective (CAS MA 1XX) (4 cr) · Confirmed

```

### Validation

| Check | Expected | Actual | Result |
|---|---|---|---|
| Final status | Completed | Completed | Pass |
| Credits accepted | 20 | 20 | Pass |
| Credits pending | 0 | 0 | Pass |
| Credits rejected | 0 | 0 | Pass |
| MATH-UA 235 outcome | Math elective (CAS MA 1XX) | Math elective (CAS MA 1XX) | Pass |

## TC-06 · Evaluator override  (PASS)

For Northeastern ECON 2560 the system follows the most recent precedent and recommends CAS EC 204. The evaluator disagrees and overrides to elective credit, with a reason.

### Test case information

- **Test case ID:** TC-06
- **Scenario:** Evaluator override
- **Student:** Grace Liu (STU-010) Synthetic
- **Previous university:** Northeastern University Worksheet
- **Target university:** Boston University Worksheet
- **Program:** Economics, BS (combined majors shown) (BS) → BA in Economics Worksheet
- **Source of data:** Mixed: worksheet courses, credits, programs and match levels; synthetic student, grades and descriptions
- **Expected outcome:** Completed · 20 cr accepted · 0 cr rejected

### Data traceability

| Field | Value | Source |
|---|---|---|
| Student name and ID | Grace Liu · STU-010 | Synthetic |
| Previous university | Northeastern University | Worksheet |
| Previous program | Economics, BS (combined majors shown) (BS) | Worksheet |
| Target university and program | Boston University · BA in Economics | Worksheet |
| Course codes, titles, credits | ECON 1116, ECON 1115, ECON 2316, ECON 2315, ECON 2560 | Worksheet |
| Target BU courses and credits | CAS EC 101, CAS EC 102, CAS EC 201, CAS EC 202, CAS EC 204 | Worksheet |
| Worksheet match levels | Likely equivalent, Partial - syllabus review | Worksheet |
| Grades and terms | ECON 1116 A, ECON 1115 B+, ECON 2316 B, ECON 2315 B+, ECON 2560 A- | Synthetic |
| Course descriptions and syllabi | Written for the demo | Synthetic |
| Equivalency IDs, dates and past decisions | EQ-xxx approval dates, PD-xxx decisions | Synthetic |
| Match %, confidence, recommendation | Computed by the engine | System |

### Transcript

```
Student:
I want to transfer my credits from Northeastern University to Boston University (BA in Economics).

System:
Transcript received for request TCR-26-010. 5 courses identified (20 credits). Your request is under review.

System (internal):
Automated matching, not shown to the student: 4 matched to approved equivalencies (ECON 1116 → CAS EC 101, ECON 1115 → CAS EC 102, ECON 2316 → CAS EC 201, ECON 2315 → CAS EC 202). 0 recommended for rejection. 1 need review (ECON 2560). Every course waits for an evaluator's final decision.

Student:
View transfer evaluation.

System:
Status: With the department. 0 accepted (0 cr), 5 pending (20 cr), 0 not transferable.
  • ECON 1116 Principles of Microeconomics → CAS EC 101 (4 cr) · Likely
  • ECON 1115 Principles of Macroeconomics → CAS EC 102 (4 cr) · Likely
  • ECON 2316 Microeconomic Theory → CAS EC 201 (4 cr) · Likely
  • ECON 2315 Macroeconomic Theory → CAS EC 202 (4 cr) · Likely
  • ECON 2560 Applied Econometrics → CAS EC 204 (4 cr) · Likely

Evaluator:
Opens Grace Liu (TCR-26-010).

System:
Category: Rejected / Needs Review. ECON 1116 → CAS EC 101: Accept, 100% match (High). Why: Approved equivalency EQ-010 already maps it to CAS EC 101; Grade A meets the C minimum
ECON 1115 → CAS EC 102: Accept, 100% match (High). Why: Approved equivalency EQ-012 already maps it to CAS EC 102; Grade B+ meets the C minimum
ECON 2316 → CAS EC 201: Accept, 100% match (High). Why: Approved equivalency EQ-014 already maps it to CAS EC 201; Grade B meets the C minimum
ECON 2315 → CAS EC 202: Accept, 100% match (High). Why: Approved equivalency EQ-016 already maps it to CAS EC 202; Grade B+ meets the C minimum
ECON 2560 → CAS EC 204: Accept, 91% match (High) — exceptions: Conflicting precedents. Why: Follows the most recent decision PD-032: CAS EC 204; Grade A- meets the C minimum; Past decisions disagree: PD-010 → Econ elective (CAS EC 3XX); PD-032 → CAS EC 204

Evaluator:
Reviews the pre-approved matches and clicks Accept recommended matches.

System:
Accepted 4 recommended matches: ECON 1116 → CAS EC 101, ECON 1115 → CAS EC 102, ECON 2316 → CAS EC 201, ECON 2315 → CAS EC 202.

Evaluator:
Overrides ECON 2560: system recommended CAS EC 204; awards Econ elective (CAS EC 3XX) (4 cr). Reason: “The syllabus has no instrumental-variables or panel-data units, which EC 204 requires.”

System:
ECON 2560 overridden → Econ elective (CAS EC 3XX), 4 credits. The system's recommendation is kept in the audit trail.

Evaluator:
Completes the evaluation.

System:
Evaluation completed. 20 credits posted to Grace's BU record (5 accepted, 0 not transferable). 5 new decisions saved to the equivalency database.

Student:
View transfer evaluation.

System:
Status: Completed. 5 accepted (20 cr), 0 pending (0 cr), 0 not transferable.
  • ECON 1116 Principles of Microeconomics → CAS EC 101 (4 cr) · Confirmed
  • ECON 1115 Principles of Macroeconomics → CAS EC 102 (4 cr) · Confirmed
  • ECON 2316 Microeconomic Theory → CAS EC 201 (4 cr) · Confirmed
  • ECON 2315 Macroeconomic Theory → CAS EC 202 (4 cr) · Confirmed
  • ECON 2560 Applied Econometrics → Econ elective (CAS EC 3XX) (4 cr) · Confirmed

```

### Validation

| Check | Expected | Actual | Result |
|---|---|---|---|
| Final status | Completed | Completed | Pass |
| Credits accepted | 20 | 20 | Pass |
| Credits pending | 0 | 0 | Pass |
| Credits rejected | 0 | 0 | Pass |
| ECON 2560 outcome | Econ elective (CAS EC 3XX) | Econ elective (CAS EC 3XX) | Pass |
| ECON 2560 decided by override | overridden | overridden | Pass |
