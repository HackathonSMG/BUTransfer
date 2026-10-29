# Hackathon AI Innovation Audit

Read-only audit of the BU Transfer Credit Portal (`2_Code/transfer-app`) before the innovation pass, measured against *FDE AI Hackathon 5.0, Problem 1 · Transfer credit evaluation* (`Hackathon'26/Boston University.docx`).

No code was changed during this audit. The implementation that followed is described in `HACKATHON_AI_INNOVATION.md`.

---

## 0. What the problem statement actually asks for

These are the parts of the sponsor brief that should drive any AI work:

- **For evaluators:** "Evaluators review syllabi one by one, which means repeated manual comparison of course descriptions, learning outcomes and credit hours."
- **For students:** they "cannot tell what is happening while their courses sit at zero units", "have to chase down old syllabi", and "do not know how much of their degree progress is secure".
- **Constraint:** "Academic departments make the final decision. Your solution must leave that decision with them."
- **Measurable outcome:** define one and show how you would prove it.

So the useful AI work is anything that cuts down the evaluator's repeated comparison and searching, or reduces how often and how vaguely students are asked for syllabi, without taking the decision away from the department.

---

## 1. Current architecture

| Layer | Technology | Notes |
|---|---|---|
| Frontend | React 18 + Vite + Tailwind | Public pages (`/apply`, `/track`, `/self-check`) and staff portal (evaluator, Credit Office, admin) |
| Backend | Node.js / Express (ES modules) | Routes → controllers → services; zod validation; role middleware |
| Database | Supabase Postgres (11 additive migrations) | Courses, evaluations, reviews, decisions, postings, audit, notifications |
| Storage / Auth | Supabase Storage + Auth (local providers for development) | Document access is scoped by role and assignment |
| AI | Microsoft Foundry agent (`services/ai/agent.service.js`), optional | Phase 1 validation plus Phase 2 recommendations for open courses. Also an Azure OpenAI fallback for unknown transcript layouts |
| Matching | Deterministic engine (`services/credit/engine.js`) | Policy rules, equivalencies, past decisions, TF-IDF content similarity |
| Email | Outbox on `notifications` (SMTP or log) | Retries; applicant templates |

Key services:

| Service | Role |
|---|---|
| `credit/transcript-parser.js` | PDF to courses and header (pdfjs); AI fallback for other layouts |
| `credit/engine.js` | Path and outcome for every course (pure, versioned) |
| `credit/comparison.js` | Covered, partial or not-evident BU outcomes and topics |
| `credit/memory.service.js` | Decision memory: a decision becomes a precedent; when evaluators agree it is promoted to an equivalency |
| `workflow/knowledge.service.js` | Established equivalency, previous decisions, similar decisions to the same BU course, conflicts |
| `workflow/assignment.service.js` | Explainable evaluator scoring, capacity, Credit Office queue, hand-offs |
| `workflow/review.service.js` | Evaluator package, decision model, information requests, escalation |
| `workflow/lifecycle.service.js` | Established outcomes, course states, posting, deadline, duplicates, student view |
| `workflow/impact.service.js` | Measured outcome (automation rate, median times) |

---

## 2. Current workflow

```
Student (no account)
  /apply → upload transcript(s) → read immediately (nothing stored) → confirm detected details → submit
     ↓
Document processing      transcript-parser (structured layout; AI fallback if Foundry is configured)
     ↓
Course evaluation        engine: grade/W/repeat rules → equivalency → combined/past decisions → content similarity
     ↓ (optional)        Foundry agent reviews courses the engine left open (recommendation only)
Established outcomes     lifecycle.applyEstablished: equivalencies and deterministic policy outcomes settled
     ↓                   without department work (held back if earlier decisions conflict)
Assignment               chooseEvaluator: course expertise (3) + subject (2) + experience (1) + department (1),
     ↓                   capacity-aware; no specialist → general evaluator → Credit Office queue
Evaluator review         ReviewDetail: comparison, evidence, previous decisions, conflicts → decision
     ↓                   (equivalent / different course / elective / no credit / request information)
Credit Evaluation Office final review: accept for posting or return; deadline and duplicate guards
     ↓
Posting                  credit_postings (grade T, not in GPA, 0 Hub units)
     ↓
Student tracking         /track: six-stage progress, per-course results, plain explanations, syllabus upload
```

---

## 3. Existing AI capabilities

| Capability | Where | Type | Status |
|---|---|---|---|
| Course recommendation for open courses | `agent.service.js` (Foundry; tools: precedents, BU catalog, course verification) | LLM agent with tools, recommendation only | Optional; **not configured locally** |
| Institution and course validation | Same agent, Phase 1 | LLM with web search | Optional |
| Transcript extraction for unknown layouts | `transcript-parser.js` → Azure OpenAI JSON mode | LLM | Optional; only when the structured parser finds nothing |
| Content similarity to the BU catalog | `engine.js` + `tfidf.js` | Deterministic IR (TF-IDF cosine) | Always on |
| Outcome and topic coverage | `comparison.js` | Deterministic term coverage | Always on |
| Agent calibration feedback | `agent_feedback` table | Stored agreement per institution | Always on (when the agent runs) |

Safety already in place: the agent never sees student identity (`assertNoStudentDetails`), BU codes it invents are discarded, and evaluator reasons are scrubbed before they become precedents.

## 4. Existing automation

- Grade normalisation (A+ to F, P/Pass/CR, F/Fail/NC, W, I/IP, missing, unreadable); grades below C, W and repeats are settled by policy.
- Course-code normalisation (CS1800 = CS 1800 = CS-1800).
- Quarter-to-semester conversion (R2) and the one-year deadline (R4).
- Established equivalencies applied without department work. They are held for an evaluator if earlier decisions conflict.
- **Institutional memory:** every department decision becomes a precedent. When `PROMOTION_MIN_EVALUATORS` (2) different evaluators agree on the same BU course, the precedent is promoted to an equivalency automatically.
- Conflict detection (different BU course, different outcome, diverging match scores) with resolution tracking.
- Explainable assignment with capacity, availability and leave, hand-offs and automatic reassignment.
- Automatic syllabus request when no content can be compared.
- Duplicate-application flagging, applicant email outbox, status derivation and posting guards.

## 5. Where humans are required (by design)

| Step | Who | Why it must stay human |
|---|---|---|
| Course decision (equivalent / different / elective / no credit) | Department evaluator | Problem-statement constraint |
| Pass-grade and unreadable-grade confirmation | Department evaluator | Policy not defined (configurable) |
| Conflict resolution and standard equivalency | Credit Office / admin | Sets precedent for future students |
| Final review, return and posting | Credit Office | Owns the record |
| Deadline exceptions, duplicate resolution | Credit Office | Judgement calls |
| Manual assignment from the office queue | Credit Office | No qualified evaluator |

## 6. Where AI or automation could safely assist

Assistance is safe when the output is evidence or a draft, never a recorded outcome:

1. **Before the decision:** putting the evidence the evaluator would otherwise gather into one summary.
2. **At the decision:** checking the chosen outcome against precedent and policy (a guardrail, never a block).
3. **When asking the student:** turning gaps in the comparison into a specific request.
4. **At intake:** flagging transcript data that will slow evaluation, in plain language.
5. **Across institutions:** finding how *similar* courses elsewhere were decided, when this exact course has never been seen.

## 7. Where agents could orchestrate work

`runEvaluation` already behaves like an orchestrator: eligibility, then engine, then the optional agent, then the report, then established outcomes, then assignment. What is missing is **visibility**. Nothing records what each stage did, how long it took or what it handed to the next stage. So the "intelligent process" story cannot be shown or measured per application.

A full agent framework is not justified: the stages are deterministic, run in order and complete in milliseconds. A **recorded pipeline trace** gives the agent-architecture story with no new infrastructure.

## 8. Performance bottlenecks found

| # | Current | Problem | Proposed | Expected improvement | Risk |
|---|---|---|---|---|---|
| P1 | Agent `searchBuCatalog` builds a new TF-IDF index over the BU catalog on **every tool call** | 5–15 tool calls per agent run, each rebuilding the same index | Cache the index with the loaded reference data | Removes repeated index builds; O(1) per call after the first | Low (reference is loaded once per run) |
| P2 | Agent `searchPrecedents` builds a TF-IDF index over peer courses per call | Same as P1 | Same cache | Same | Low |
| P3 | `/apply` reads the transcript, then upload reads the same PDF again | Two full PDF parses per transcript | Hash-keyed parse cache | About 50% less parse work at intake | Low; not implemented (intake latency is not the bottleneck at this volume) |
| P4 | `listConflicts` runs `courseKnowledge` (6 queries) + 2 queries per candidate (N+1) | Grows with the number of decided courses | Batch query per institution | Fewer round-trips on the Conflicts page | Medium; documented only |
| P5 | Evaluator dashboard runs `courseKnowledge` per open course to count conflicts | N×6 queries per dashboard load | Same batching as P4 | Faster dashboard for heavy queues | Medium; documented only |
| P6 | `contextFor` re-queries `programSubjects()` for each review in `placeOfficeQueue` | One catalog scan per queued course | Load once per call | Linear → constant catalog scans | Low; documented only |
| P7 | `invalidateEngine()` on every decision rebuilds the engine on next use | A TF-IDF rebuild per decision | Acceptable at 41 BU courses; keep | None needed now | — |

## 9. Manual and repetitive work that remains

1. **Assembling the picture.** To decide one course the evaluator opens "Transfer course details", "BU course details", "Supporting evidence", "Similar past decisions", "Potential equivalency conflict" and the comparison, then forms the summary in their head. That is the "repeated manual comparison" the sponsor described.
2. **Precedent beyond the exact course.** If *this* course code has never been decided, the evaluator sees nothing, even when similar courses at other institutions have been decided many times. The cross-institution search exists only inside the optional Foundry agent.
3. **Self-checking consistency.** Nothing compares the evaluator's chosen outcome with precedent, the established equivalency, content coverage or the credit difference *before* it is recorded. Conflicts are shown, but not against the decision being made.
4. **Writing information requests.** The evaluator types a free-text request or clicks generic chips ("Learning outcomes", "Contact hours"). The comparison already knows *which* BU outcomes are not evident, but that is not used.
5. **Transcript problems found late.** Missing credits, unreadable grades, Pass grades, repeats and unknown courses are discovered course by course during evaluation. The student is not told at intake that anything may need more review.

## 10. Opportunities for differentiation

The strongest story is the one the code already half-tells: **institutional memory**. Every decision teaches the system, and agreeing decisions become equivalencies. What the demo lacks is the moment where a judge *sees* that memory working:

- a course never seen before, matched to how *similar* courses were decided elsewhere;
- a decision checked against that memory before it is recorded;
- a per-application trace showing how much work the system did before an evaluator opened it.

---

## Phase 2: AI opportunity evaluation

| # | Capability | Problem solved | Beneficiary | Data needed (have it?) | Deterministic or AI | If wrong | Human control | Cuts eval time | Consistency | Demo |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Transcript intelligence (normalise codes, grades, repeats) | Messy transcripts | Evaluator | Parsed rows (yes) | Deterministic. **Already done** | n/a | n/a | — | — | Low (exists) |
| 2 | Transcript quality check at intake | Problems found late | Student, office | Parsed rows, catalog (yes) | Deterministic | Extra note; nothing blocked | Advisory | Medium | — | Medium |
| 3 | Course-matching evidence | Manual comparison | Evaluator | Catalog, syllabus (yes) | Deterministic. **Exists** (`comparison.js`) | — | — | — | — | Exists |
| 4 | Evaluation brief (one-screen context) | Assembling the picture | Evaluator | All of the above (yes) | Deterministic synthesis | Brief omits something; full sections remain | Evidence only | **High** | Medium | **High** |
| 5 | Cross-institution precedent search | Never-seen courses get no precedent | Evaluator | Catalog descriptions and decisions (yes) | Deterministic IR (TF-IDF) | Weak neighbour shown; similarity is displayed | Evidence only | **High** | **High** | **High** |
| 6 | Conflict detection | Disagreeing decisions | Evaluator, office | Decisions (yes) | Deterministic. **Exists** | — | — | — | — | Exists |
| 7 | Smart assignment | Wrong or overloaded evaluator | Office | Roster (yes) | Deterministic. **Exists** with reasons | — | — | — | — | Exists |
| 8 | Workload balancing | Same as 7 | Office | Same | **Exists** (capacity share 80%) | — | — | — | — | Exists |
| 9 | Decision consistency check | Inconsistent outcomes | Evaluator, office | Decisions, equivalencies, comparison (yes) | Deterministic | False warning; never blocks | Evaluator proceeds | Medium | **High** | **High** |
| 10 | "What changed?" view | Returning evaluator | Evaluator | Info requests, returns (yes) | Deterministic. **Partly exists** (status banners) | — | — | Low | — | Low |
| 11 | Applicant explanations | Opaque results | Student | Decisions (yes) | Deterministic templates. **Exists** | — | — | — | — | Exists |
| 12 | Targeted information request | Vague syllabus requests | Student, evaluator | Comparison gaps (yes) | Deterministic | Request asks for one item too many; editable | Evaluator edits before sending | Medium | Medium | **High** |
| 13 | Duplicate detection | Duplicate submissions | Office | Applications (yes) | **Exists** | — | — | — | — | Exists |
| 14 | Status ETA | "When will I know?" | Student | Stage history (thin) | Statistical | **Would invent a number** | — | — | — | **Rejected:** too little history to estimate honestly; the stage tracker already shows the next step |
| 15 | LLM-written explanations | Wording | Student | Decisions | LLM | Could misstate a decision | — | — | — | **Rejected:** the templates are accurate and cannot invent a reason |
| 16 | Pipeline trace (agent orchestration) | Invisible automation | Office, judges | Stage outputs (yes) | Recording only | n/a | n/a | — | — | **High** |
| 17 | Knowledge growth metrics | Memory story not measurable | Office, admin | Equivalencies, precedents (yes) | Counting only | n/a | n/a | — | — | Medium |

**Why not more LLM?** The places where an LLM helps (unknown transcript layouts; judging content fit for courses with no precedent) already use one, behind the Foundry agent. Everything selected below works on structured data the institution already holds, where deterministic logic is faster, reproducible and cannot invent a BU course or a decision. That follows the brief: "Do not introduce AI if deterministic code is faster and more reliable."

---

## Phase 9: Ranking

Scale: 1 (low) to 5 (high). For Complexity and Risk, lower is better.

| Feature | Value | Hackathon impact | Complexity | Risk | Selected |
|---|---:|---:|---:|---:|:---:|
| Course precedent intelligence (cross-institution) | 5 | 5 | 2 | 1 | ✅ |
| Evaluation brief | 5 | 5 | 2 | 1 | ✅ |
| Decision consistency check | 4 | 5 | 3 | 1 | ✅ |
| Targeted information request | 4 | 4 | 2 | 1 | ✅ |
| Transcript quality check | 3 | 4 | 2 | 1 | ✅ |
| Evaluation pipeline trace | 3 | 5 | 2 | 1 | ✅ |
| Institutional knowledge metrics | 3 | 4 | 1 | 1 | ✅ (small) |
| Agent TF-IDF index caching (P1, P2) | 2 | 1 | 1 | 1 | ✅ (perf) |
| Course matching evidence | — | — | — | — | exists |
| Previous decisions / conflict detection | — | — | — | — | exists |
| Smart assignment / workload balancing | — | — | — | — | exists |
| Applicant explanation | — | — | — | — | exists |
| Knowledge graph visual | 2 | 4 | 4 | 2 | ❌ (recommended, not built) |
| Status ETA | 1 | 2 | 3 | 4 | ❌ (would fabricate) |
| "What changed?" view | 2 | 2 | 2 | 1 | ❌ (banners cover it) |

**Selected:** the five evaluator- and intake-side capabilities, the pipeline trace that makes the agent orchestration visible, a small knowledge-growth metric, and the agent caching fix. Together they make up one demo story: *the system reads, checks, remembers and routes; the evaluator decides.*
