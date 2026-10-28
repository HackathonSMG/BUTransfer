# End-to-End Transfer Credit Demo

This walks through the full Boston University transfer credit story, as the Problem 1 statement describes it:

> A student opens the landing page, starts a transfer credit evaluation, enters their information and uploads their transcripts. The system reads the courses and checks each against BU's equivalency database. Established equivalencies are applied straight away; the other courses go to department evaluators. The evaluators decide, asking for a syllabus where needed. The Credit Evaluation Office does the final review and posts the credit. The student signs in and sees exactly what was awarded.

Every step below changes the database, and the next person sees the change. Nothing is staged.

The demo student uses the sample transcripts for STU-001 (two colleges, six courses). That is the problem statement's suggested demo: three courses with existing equivalencies, two "maybe" courses and one quarter-system course.

---

## Before you start

**One-time setup on the deployed app:**
1. Run migrations `009_credit_lifecycle.sql` and `010_final_review.sql` in Supabase.
2. As the administrator, open **Evaluators** and click **Import roster**. Enter the initial password you want, and remember it. This creates the evaluators, the Credit Office account and the demo student account. Existing accounts keep their passwords.
3. As the administrator or the Credit Office, open the **Credit Office** dashboard and click **Process existing applications** once.

**Files to have ready**, both in the repository:
- `4_Sample_Transcripts/Transcript_STU-001_Maya_Ortiz_Riverside_Community_College.pdf`
- `4_Sample_Transcripts/Transcript_STU-001_Maya_Ortiz_Pacific_Coast_State_University.pdf`
- `5_Demo_Documents/CSC_220_Syllabus_Riverside.pdf` (a synthetic syllabus for the "request more information" step)

## Accounts

Every person signs in at **/login**. There is no role selector; the account decides where each person lands.

The password is the one entered at **Import roster**. On a local test database seeded with `npm run db:seed:workflow` it is `Demo@1234`.

| Role | Login | Lands on | Used for |
|---|---|---|---|
| Student (you create it) | Any new email, e.g. `jamie.rivera@students.example.org`, with your own password | Student Portal | The live demo below |
| Student (pre-loaded) | `maya.ortiz@students.example.org` | Student Portal | Maya's sample application APP-2026-0003, already in evaluation |
| Evaluator: Computer Science | `evaluator.cs@bu-transfer.local` (Dr. Michael Smith) | Evaluator Dashboard | CSC 220 |
| Evaluator: Mathematics | `evaluator.math@bu-transfer.local` (Dr. Anita Rao) | Evaluator Dashboard | MATH 22 (quarter system) |
| Evaluator: Psychology | `evaluator.psych@bu-transfer.local` (Dr. Laura Bennett) | Evaluator Dashboard | PSY 210 |
| Credit Evaluation Office | `credit.office@bu-transfer.local` (Jordan Ellis) | Credit Evaluation Office | Final review and posting |
| Administrator (optional) | `admin@bu-transfer.local` (Avery Collins) | Admin Dashboard | Not needed for the story |

**Tip:** use a private browser window per role, or sign out between roles.

---

## Part 1: Student applies

1. Open the landing page (`/`) and click **Start Transfer Credit Evaluation**.
2. You are asked to sign in. Choose **Create an account**, enter a name, a new email and a password, then click **Create account**. You return to the application automatically.
3. **Student Information:** your name is filled in from the account, and the email is the account email. Phone and date of birth are optional. Click **Next**.
4. **Academic Information:**
   - Most recent college: `Riverside Community College`
   - Current program: `Computer Science`
   - GPA: `3.5`, Credits earned: `23`
   - BU Program: **Computer Science**
   - BU Start Term: **Fall 2027**
   
   Click **Next**.
5. **Documents:**
   - *Official Transcript (Required):* select **both** STU-001 transcript PDFs, one per college.
   - *Supporting Documents (Optional):* leave empty. The syllabus is requested later, only if a department needs it.
   
   Click **Next**.
6. **Review & Submit:** tick the confirmation and click **Submit Application**. The page shows the steps as they happen: saving, uploading each file, submitting.
7. You land on the application page.
   - The progress bar shows **Submitted ✓ → Documents Processed → Course Evaluation → Evaluator Review → Final Review → Completed**.
   - While processing runs you see "We're reviewing your academic documents". Click **Refresh** after a few seconds.
8. When processing is done, check **Your Transfer Credit**:
   - **6 courses** from **two institutions**.
   - **3 evaluated** straight away by established equivalency: CSC 110 → CAS CS 111, MAT 151 → CAS MA 123, ECO 201 → CAS EC 101. Each shows "Decided, in final review" with its units.
   - **3 pending**, shown as **0 units**: CSC 220, PSY 210, and MATH 22 (a 4-credit quarter course, which will convert to 2.66).
9. Click **My Applications** at the top. The portal card shows the application number, status and course counts. Every number comes from the database.
10. Sign out.

**What happened behind the scenes:**
- The draft was saved, the transcripts were read as they uploaded (6 courses), and submitting started the evaluation.
- Course codes were matched against the equivalency database and three established equivalencies were applied by the Credit Evaluation Office, with no department work.
- The other three courses were assigned by subject expertise and workload. The CS evaluator goes first because the student's major is CS; the others wait for a hand-off.

## Part 2: Evaluator reviews, asking for a syllabus

11. Sign in as **`evaluator.cs@bu-transfer.local`**. The dashboard's *Needs your attention* list shows **CSC 220** for your new student.
12. Open it. Read the page from top to bottom:
    - **Assignment context:** why it came to you (CS 112 qualification, CS expertise, workload).
    - **Course evaluation:** the transfer course (Riverside, 4 credits, grade) next to the proposed BU course **CAS CS 112**, with the match and recommendation.
    - **View transcript** opens the courses as read, and the original PDFs.
    - Expand **Matching evidence** and **Previous decisions** for the supporting detail.
13. Click **Record decision** and choose **Request more information**, then **Course syllabus**. Add a note, e.g. "Please include weekly topics", and click **Send request**. The course now shows *Waiting on Student*.
14. Sign out.

## Part 3: Student provides the syllabus

15. Sign in as your student.
    - The portal card shows **Action needed: 1**.
    - Open the application. The status is **Information Required**, and **CSC 220** shows *Action needed*: "We need the syllabus for this course…".
16. Expand CSC 220, choose `5_Demo_Documents/CSC_220_Syllabus_Riverside.pdf`, and click **Send syllabus**. The course changes to *Received, under department review*.
17. Sign out.

## Part 4: Evaluators decide

18. Sign in as **`evaluator.cs@bu-transfer.local`**.
    - Your dashboard's recent activity shows the syllabus arrived.
    - Open CSC 220. The banner reads **Syllabus received**, **View syllabus** opens the file, and *Matching evidence* notes that the syllabus was compared with the BU catalog.
19. Click **Record decision** and choose **Equivalent BU course** (CAS CS 112). The credits show 4. Add a reason if you like, then **Confirm decision**. Because this was your last open course on the application, it is handed to the next evaluator with a transfer request.
20. Sign out. Sign in as **`evaluator.math@bu-transfer.local`**. **MATH 22** is now in *Needs your attention*, marked as handed over.
    - The transfer course shows **4 quarter credits**; the decision form shows **2.66 BU units (4 quarter credits × 2/3)**.
    - Choose **Equivalent BU course** (CAS MA 242) and **Confirm decision**.
    
    If MATH 22 isn't there yet, PSY 210 came first; do step 21 first.
21. Sign in as **`evaluator.psych@bu-transfer.local`** and open **PSY 210**.
    - Choose **Elective credit** and set the category to `Psychology elective`.
    - Give a reason, e.g. "Research methods content without a direct BU equivalent", and **Confirm decision**.

    To demonstrate the other outcomes instead, use **Different BU course** (search the BU catalog, e.g. "PS 211") or **No credit** (reason required).
22. With all six courses decided, the application moves to **final review** and the Credit Evaluation Office is notified. Sign out.

## Part 5: Credit Evaluation Office final review

23. Sign in as **`credit.office@bu-transfer.local`**. The **Credit Evaluation Office** dashboard shows your application under **Final review**.
24. Open it. Every course shows its decision, who made it (an evaluator, or *Established equivalency*), units, and **Awaiting final review**. Expand a course for the reason, the assignment and any syllabus.
25. *Optional, to show the review step:*
    - Click **Return** on MATH 22 and enter a reason, e.g. "Please confirm the 2.66 units against CAS MA 242", then **Return decision**. The course goes back to Dr. Rao with the reason and the application leaves final review.
    - Sign in as Dr. Rao: the review shows **Returned by the Credit Evaluation Office** with the reason. Record the decision again.
    - Sign back in as the Credit Office.
26. Click **Finalize and post 6 courses**.
    - Each course is posted with a grade of **T**, its BU units, **not counted in the BU GPA** and **no BU Hub units**.
    - The application becomes **Credit Posted**, and the student is notified.
27. Sign out.

## Part 6: Student sees the result

28. Sign in as your student. The portal card shows **Credit Posted**, **6 courses**, **6 evaluated**, **0 pending**, and **credits awarded**: 21.66 if you made the decisions above.
29. Open the application.
    - The progress bar is complete.
    - *Your Transfer Credit* lists each course under its college with **Posted to your record**, the BU course or elective, its units and **grade T**. Expand a course for a one-line explanation.
    - The notes explain that transfer grades do not count toward the BU GPA, transfer courses earn no Hub units, and the one-year transfer deadline (Fall 2027 + 12 months).
    - A green banner confirms the evaluation is complete.

---

## Other things you can show

| What | Where |
|---|---|
| Self-check before applying | Landing page → **Preview Course Credit**. Enter Riverside courses (CSC 110, CSC 220, ART 105) to see established / department review / syllabus needed. Clearly marked "not an official decision". |
| Equivalency conflict | Credit Office → **Equivalency Conflicts**, or an evaluator opening a course whose earlier decisions disagree. Needs the synthetic scenarios: run `supabase/seed/synthetic_audit_scenarios.sql`, then **Run evaluation** on APP-2026-9105 (BIOL-UA 21). |
| Duplicate application, one-year deadline, grade rules | The synthetic scenarios APP-2026-9101 to 9111. See `TRANSFER_CREDIT_RULE_AND_EDGE_CASE_REVIEW.md`, Part 2. |
| Evaluator on leave | Admin → **Evaluators** → open an evaluator → **Mark unavailable**. Their open courses move to other qualified evaluators. |
| A pre-loaded student | Sign in as `maya.ortiz@students.example.org`: her sample application APP-2026-0003 is mid-evaluation. |

## Verified

This exact journey runs as an automated test against the real API on a freshly seeded database. It uses a new student account, the two STU-001 transcripts and the demo syllabus.

All 25 checks pass:
- registration;
- the draft and submission rules;
- extraction (6 courses, 2 colleges);
- three established equivalencies applied, three courses assigned;
- student isolation (students never reach staff functions);
- the syllabus request and response;
- evaluator decisions and hand-offs;
- the Credit Office returning one evaluator decision and one auto-settled course;
- re-decision;
- posting with grade T, not in the GPA, no Hub units;
- the student's final view.

The earlier suites also still pass:
- lifecycle, 67/67;
- roles, 22/22;
- review workflow, 20/20;
- knowledge, 16/16;
- course matching, 76/76.

## Known limits for the demo

- **Only PDF transcripts with a text layer and the sample layout are read automatically.** The STU-001 files work. A transcript the parser can't read is still stored; the student is told the Credit Evaluation Office will follow up, and the office is notified. There is no manual course-entry screen.
- **"Posted to MyBU Student"** is shown on the student's own status page; there is no real MyBU connection.
- **Email:** notifications are stored and shown in the app and on the student status page. Sending email depends on the deployment's email settings.
