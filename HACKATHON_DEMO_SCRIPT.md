# Hackathon Demo Script: "The evaluator doesn't start from zero"

**Length:** about 7 minutes.
**Scenario:** the problem statement's suggested case. A student transfers from a community college with six courses: three have established equivalencies, two are "maybe" courses, and one comes from a quarter-system school.
**Data:** `4_Sample_Transcripts/Transcript_STU-001_*.pdf` (Riverside Community College, 5 courses; Pacific Coast State University, 1 quarter course) and `5_Demo_Documents/CSC_220_Syllabus_Riverside.pdf`.
**Accounts:** see `END_TO_END_TRANSFER_CREDIT_DEMO.md` §19. Local database password: `Demo@1234`.

> The one line to land: **AI does not replace the evaluator. It removes the repetitive work so the evaluator can focus on judgement, and every decision makes the next one faster.**

---

## Before you start (once)

1. Run migration `012_evaluation_trace.sql` (additive). Deployed: in the Supabase SQL editor. Local: `npm run db:migrate`.
2. Seed as usual: `db:seed:credit`, `db:import:sponsor`, `db:seed:workflow`. Skip `db:seed:samples` if you want Maya Ortiz to be submitted live.
3. Open three browser profiles to switch roles quickly: **Student** (no sign-in), **Evaluator**, **Credit Office**.
4. Keep `HACKATHON_AI_INNOVATION.md` §5 (the architecture diagram) open on a second screen. Show it once, in act 4.

---

## Act 1: The student (1 min). *"The system reads the transcript the moment it arrives"*

**Say:** "Maya was admitted to BU and attended two colleges. Today she'd post transcripts and wait, with every course at zero units."

1. `/` → **Submit Transcripts for Evaluation**.
2. Drop both STU-001 transcripts. Each is read as it lands: *Riverside, 5 courses*; *Pacific Coast, 1 course · Quarter*.
3. Point at the note under Pacific Coast:
   > *Your college uses the quarter system, so your credits are converted to BU semester credits (a 4-credit course becomes 2.66).*

   **Say:** "That is the transcript check. If a grade were unreadable, credits missing or a course new to us, she'd see *'We found information that may require additional review'* in plain words, now and not weeks later. Nothing is blocked."
   - *(Optional: drop `5_Test_Cases/transcripts/TC13_Missing_Credits_Northeastern.pdf` to show a flagged transcript, then remove it.)*
4. **Review details** shows the detected name, program and start term. Enter an email, tick the box and click **Submit for Credit Evaluation**. Note the **Transfer Credit ID**.

## Act 2: Behind the scenes (1 min). *"Before any human opens it, the work is prepared"*

Sign in as **Credit Office** (`credit.office@bu-transfer.local`) and open Maya's evaluation.

5. Scroll to **How this evaluation was prepared**. Read the stages top to bottom; each shows real counts and milliseconds:
   - **Transcripts read:** 6 courses from 2 transcripts.
   - **Transcript quality check.**
   - **Course matching:** checked against BU policy, approved equivalencies, past decisions and the BU catalog.
   - **Precedent search:** how many courses the institution has already seen, how many are new and how many new ones have similar decided courses elsewhere.
   - **Established outcomes:** 3 settled by established equivalencies, without department work.
   - **Evaluator routing:** the rest routed by expertise and workload, plus syllabus requests sent.

   **Say:** "That's the agent pipeline. Each stage is ordinary, explainable software. Together they take an evaluation from *nothing done* to *only judgement left* in under a second."
6. Point at the **Evaluation impact** tile (50% resolved without department intervention) and the course list: three *Awaiting final review* by **Established equivalency**, the rest with named evaluators. Hover an assignment reason ("Qualified for CAS CS 112 · CS subject expertise · Current workload: …").

## Act 3: The evaluator (2.5 min). *"The evaluator gets evidence, not a blank form"*

Sign in as **Evaluator: Computer Science** (`evaluator.cs@bu-transfer.local`) → **My Evaluations** → open **CSC 220** (Riverside).

7. **Evaluation context** is the first panel under the recommendation:
   - **Supporting evidence**, **Differences**, **Needs attention**: each line is a fact. Example: "2 of 4 BU learning outcomes evident", "Not evident: …", "Fewer credits: 3 BU units against 4".
   - The **precedent line** reads "This course: not evaluated before · Similar courses elsewhere: …".

   **Say:** "CSC 220 has never been evaluated at BU. Today the evaluator would start from scratch. Instead, the system found courses with similar content at *other* colleges that BU has already decided, and how they were decided."
8. Click the precedent line. It opens **Similar past decisions → Courses with similar content at other institutions, already decided**: course, institution, outcome and similarity, all visible.
9. **Suggested next step** reads "Request the syllabus" (or "The evidence for … is mixed"). Click **Request information**.
   - The request is **already drafted** from the gaps: "To compare CSC 220 … with Boston University's CAS CS 112, please send the course syllabus with its weekly topics showing coverage of: …".
   - **Say:** "Not 'please send more information'. The student is told exactly what's missing. The evaluator can edit it. Nothing goes out without a click." Send it.
10. **Student:** `/track` → CSC 220 shows **Action needed**. Upload `CSC_220_Syllabus_Riverside.pdf` → **Send syllabus**.
11. **Evaluator:** reopen CSC 220. It shows *Syllabus received*; the comparison and context have been recomputed against the syllabus.
12. Click **Record department decision**. Watch the **Consistency check** under the form:
    - With **Equivalent BU course** selected: ✓ checks (content coverage, units, posted with grade T).
    - Switch to **No credit**: it notes the course shows most of the BU outcomes, and asks that the reason explain what's missing.
    - Switch to **Different BU course** and pick an unrelated course (e.g. CAS MA 123): ⚠ "Only 0 of N BU learning outcomes are evident in the transfer course".
    - **Say:** "This is a guardrail, not a gate. It checks the decision against the established equivalency, every earlier decision on this course, similar courses, conflicts, content, units and grade rules, *before* it becomes precedent for future students."
13. Choose **Equivalent BU course** → **Confirm decision**. The next evaluator receives the hand-off automatically.

*(Optional, 30 s, conflict story: open any review whose cues show **Potential equivalency conflict**. The seeded synthetic scenarios include one. Show "Earlier decisions on … differ" under *Needs attention*, the next step "Review the conflict", and in the decision dialog "This decision differs from 2 of 3 earlier decisions".)*

## Act 4: Human authority (1 min). *"The department decides; the Office is the final authority"*

14. Sign in as **Evaluator: Mathematics** → **MATH 22**: 4 quarter credits → 2.66 BU units, shown in the context and the check. Decide **Equivalent**. Then **Evaluator: Psychology** → **PSY 210** → **Elective credit**.
15. **Credit Office:** the application is in **Final review**. Show who decided each course and how. Optionally **Return** one decision with a reason, which shows the Office's authority. Then **Finalize and post**.
16. Show the architecture diagram once (`HACKATHON_AI_INNOVATION.md` §5): *AI = assist · Rules = govern · Evaluator = decide · Credit Office = final authority*.

## Act 5: The student, and the memory (1 min). *"Every evaluation strengthens the next one"*

17. **Student:** `/track` shows **Completed**, each course with its BU equivalent or elective credit, units and grade T, in plain language. No internal detail is exposed.
18. **Credit Office / Admin → Reports:** the impact panel's **Institutional knowledge** row lists established equivalencies, precedents recorded by evaluators in this system, and courses settled by reuse.
    - **Say:** "Today's CSC 220 decision is now a precedent. The next student from Riverside with CSC 220, or anyone with a similar course from another college, arrives with it already in their Evaluation Context. When a second evaluator agrees, it becomes an established equivalency, and the next one never needs a department review at all."

---

## Before vs after (one slide, or say it)

| Traditional | With the portal |
|---|---|
| Transcript arrives, waits | Read on upload; problems flagged to the student immediately |
| Clerk checks the equivalency database | Matching + established equivalencies applied automatically (3 of 6 here) |
| Evaluator searches for precedent | Same-course and **cross-institution** precedent shown, with similarity |
| Evaluator compares syllabus and catalog line by line | Evaluation Context: what supports, what differs, what needs attention |
| "Please send more information" | A request drafted from the actual gaps |
| Inconsistent decisions found later, if ever | Consistency check before saving |
| Knowledge lives in people's heads | Every decision is precedent; agreement becomes equivalency |

## If something goes wrong live

- **No trace panel:** the application was evaluated before migration 012. Click **Run evaluation** on the report page, or submit a new one.
- **No similar courses shown:** the course has distinctive content with no decided neighbour above 0.20 similarity. Say so; the threshold is deliberate so weak matches aren't shown as evidence.
- **Foundry agent not configured:** the trace shows "Additional course review: not configured". That is expected locally, and everything else is deterministic.
