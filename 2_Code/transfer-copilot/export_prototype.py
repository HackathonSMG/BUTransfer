"""Export everything the HTML prototype needs as one JSON file.

Run:  python export_prototype.py out.json
"""
import json, sys
import openpyxl
from engine.pipeline import Pipeline, to_dicts
from engine.recommend import Recommender, MISSING_INFO, src_of, WORKSHEET_SCHOOLS

p = Pipeline(); s = p.store; rec = Recommender(s, p.matcher)
SUBMITTED = {"STU-001": "2026-10-19", "STU-002": "2026-10-14", "STU-003": "2026-10-08", "STU-004": "2026-10-21",
             "STU-005": "2026-10-12", "STU-006": "2026-10-22", "STU-007": "TODAY", "STU-008": "2026-10-23",
             "STU-009": "2026-10-20", "STU-010": "TODAY", "STU-011": "TODAY"}

out = dict(students=[], results={}, courses={}, eq_count=len(s.equivalency),
           avg_days=round(float(s.past.days_to_decision.mean()), 1))
for st in s.students.to_dict("records"):
    sid = st["student_id"]
    insts = [x.strip() for x in st["prior_institutions"].split(";")]
    prev_prog, bu_prog = rec.program(insts[0], st["intended_major"])
    st.update(
        submitted=SUBMITTED.get(sid, "2026-07-15"),
        target_university="Boston University", target_program=bu_prog or f"BA in {st['intended_major']}",
        previous_program=prev_prog if (prev_prog and len(insts) == 1) else
        ("; ".join(filter(None, [rec.program(i, st["intended_major"])[0] for i in insts])) or f"{st['intended_major']} coursework"),
        src=dict(name="Synthetic Data", previous_university=" + ".join(sorted({src_of(i) for i in insts})),
                 previous_program="Worksheet" if all(i in WORKSHEET_SCHOOLS for i in insts) else
                 ("Worksheet + Synthetic Data" if any(i in WORKSHEET_SCHOOLS for i in insts) else "Synthetic Data"),
                 target_university="Worksheet", target_program="Worksheet"))
    if not all(i in WORKSHEET_SCHOOLS for i in insts):
        st["previous_program"] = st["previous_program"] if any(i in WORKSHEET_SCHOOLS for i in insts) else f"{st['intended_major']} transfer coursework"
    out["students"].append(st)

    rows = s.transcripts[s.transcripts.student_id == sid].to_dict("records")
    rs = to_dicts(p.evaluate_student(sid))
    for r, row in zip(rs, rows):
        r["term"] = row["term"]
        r["rec"] = rec.recommend(r)
        r["src"] = dict(course=src_of(r["institution"]), title=src_of(r["institution"]), credits=src_of(r["institution"]),
                        grade="Synthetic Data", term="Synthetic Data",
                        description="Missing" if (r["institution"], r["course"]) in MISSING_INFO else "Synthetic Data",
                        target="Worksheet", match="System-generated")
        if (r["institution"], r["course"]) in MISSING_INFO:
            r["after_upload"] = rec.recommend(r, missing_resolved=True)
        out["courses"][r["institution"] + "|" + r["course"]] = {"d": r["rec"]["description"], "o": r["rec"]["outcomes"], "syl": r["rec"]["syllabus"]}
        for cd in r["candidates"]:
            b = s.course("Boston University", cd["bu_course"])
            out["courses"]["Boston University|" + cd["bu_course"]] = {"d": b["description"], "o": b["learning_outcomes"], "syl": ""}
        for cd in (r.get("after_upload") or {}).get("candidates", []):
            b = s.course("Boston University", cd["bu_course"])
            out["courses"]["Boston University|" + cd["bu_course"]] = {"d": b["description"], "o": b["learning_outcomes"], "syl": ""}
    out["results"][sid] = rs

wb = openpyxl.load_workbook(sys.argv[2] if len(sys.argv) > 2 else
                            "/root/.claude/uploads/d33c118f-eefa-51c8-97fe-38b6110aa1ef/ee57e6fa-BU_Transfer_Program_Course_Match.xlsx")
out["bu"] = [dict(code=r[0], title=r[1], program=r[2], req=r[3]) for r in wb["BU Courses"].iter_rows(min_row=2, values_only=True) if r[0]]
past = []
for d in s.past.to_dict("records"):
    d["days_to_decision"] = int(d["days_to_decision"])
    c = s.course(d["institution"], d["course"].split("+")[0])
    if c and d["proposed_bu"].startswith("CAS") and "+" not in d["course"]:
        d["ai_top1"] = p.matcher.top_k(c, s.syllabus_for(d["institution"], d["course"]))[0]["bu_course"]
    past.append(d)
out["past"] = past
import pandas as _pd
out["ws_match"] = _pd.read_csv("data/worksheet_course_match.csv").fillna("").to_dict("records")
json.dump(out, open(sys.argv[1] if len(sys.argv) > 1 else "prototype_data.json", "w"), separators=(",", ":"), default=str)
print("students", len(out["students"]), "courses", sum(len(v) for v in out["results"].values()))
