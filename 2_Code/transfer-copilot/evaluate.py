"""Step 6 - Prove it works: score the engine against the answer key.

Run:  python evaluate.py
"""
import re
from collections import Counter
from engine.pipeline import Pipeline, STATUS_REVIEW

p = Pipeline()
s = p.store

# 1) Routing accuracy: does each transcript course go down the expected path?
PATH_MAP = {"Existing equivalency": "Auto-applied", "Maybe": "Needs review", "Rule": "Rule",
            "Elective (past": "Precedent", "No credit (past": "Precedent"}
ok = total = 0
for sid in s.students.student_id:
    for r, (_, t) in zip(p.evaluate_student(sid), s.transcripts[s.transcripts.student_id == sid].iterrows()):
        exp = next(v for k, v in PATH_MAP.items() if t.expected_path.startswith(k))
        total += 1
        # a "maybe" that already has a past decision is fast-tracked as a precedent - still evaluator-confirmed
        if exp == "Needs review" and r.path == "Precedent":
            exp = "Precedent"
        ok += r.path == exp
        if r.path != exp:
            print(f"  path mismatch {t.row_id} {r.course}: got {r.path}, expected {exp}")
print(f"Routing accuracy: {ok}/{total} = {ok/total:.0%}")

# 2) Matching accuracy on "maybe" cases: is the right BU course in the top-1 / top-3?
cases = []
for _, t in s.transcripts.iterrows():
    m = re.match(r"(CAS [A-Z]{2} \d{3})", t.expected_bu)
    if t.expected_path.startswith("Maybe") and m:
        cases.append((t.institution, t.course, m.group(1)))
for _, d in s.past.iterrows():
    if d.proposed_bu.startswith("CAS") and "+" not in d.course:
        cases.append((d.institution, d.course, d.proposed_bu))
top1 = top3 = 0
for inst, code, truth in cases:
    c = s.course(inst, code)
    cands = [x["bu_course"] for x in p.matcher.top_k(c, s.syllabus_for(inst, code))]
    top1 += cands[0] == truth
    top3 += truth in cands
n = len(cases)
print(f"Matcher on {n} 'maybe' cases: top-1 {top1/n:.0%}, top-3 {top3/n:.0%}")

# 3) Workload: how many courses still need a human from scratch?
allr = [r for sid in s.students.student_id for r in p.evaluate_student(sid)]
c = Counter(r.path for r in allr)
print("Paths:", dict(c))
print(f"Resolved without a from-scratch review: {1 - c['Needs review']/len(allr):.0%}")
