"""Step 5b - Explainable recommendations on top of the pipeline.

For every course this adds:
  * match %  - weighted score with the criteria shown to the evaluator
  * confidence (High / Medium / Low)
  * recommendation: Accept | Accept as elective | Partial credit | Reject | Needs info
  * exceptions that force manual review (missing description, conflicting precedents, ...)
  * data provenance for every field: Worksheet | Synthetic Data | System-generated

Worksheet = the sponsor's BU_Transfer_Program_Course_Match.xlsx (courses, credits, programs,
course-match levels). Students, grades, terms, descriptions, syllabi and past decisions are
Synthetic Data because the worksheet does not contain them.
"""
import pandas as pd
from sklearn.metrics.pairwise import cosine_similarity
from . import rules
from .data import DATA_DIR

WORKSHEET_SCHOOLS = {"Boston University", "Northeastern University", "New York University"}
WEIGHTS = {"content": 0.50, "credits": 0.20, "level": 0.15, "worksheet": 0.15}
LEVELS = ["Introductory", "Intermediate", "Advanced"]
WS_SCORE = {"Likely equivalent": 1.0, "Partial - syllabus review": 0.6, "No equivalent found": 0.2, "Must be taken at BU": 1.0}

# Courses whose description/syllabus is NOT on file when the request arrives (TC-05).
# The text below is what the student uploads after the evaluator asks for it.
MISSING_INFO = {
    ("New York University", "MATH-UA 235"): (
        "Week 1-2 Probability axioms, counting, conditional probability. Week 3-4 Discrete and continuous random "
        "variables. Week 5 Expectation and variance. Week 6 Midterm. Week 7 Sampling distributions and the central "
        "limit theorem. Week 8-9 Point estimation and confidence intervals. Week 10-11 Hypothesis testing. "
        "Week 12-13 Simple linear regression. Week 14 Review. Assessment: problem sets 30%, midterm 30%, final 40%.")
}


def src_of(inst: str) -> str:
    return "Worksheet" if inst in WORKSHEET_SCHOOLS else "Synthetic Data"


class Recommender:
    def __init__(self, store, matcher):
        self.s, self.m = store, matcher
        self.ws = pd.read_csv(DATA_DIR / "worksheet_course_match.csv").fillna("")
        self.programs = pd.read_csv(DATA_DIR / "worksheet_programs.csv").fillna("")

    # ---------- worksheet lookups ----------
    def ws_level(self, inst, code, bu):
        col = {"Northeastern University": ("nu_course", "nu_match_level"), "New York University": ("nyu_course", "nyu_match_level")}.get(inst)
        if not col:
            return None
        m = self.ws[(self.ws[col[0]] == code) & (self.ws.bu_course == bu)]
        if len(m):
            return m.iloc[0][col[1]]
        if len(self.ws[self.ws[col[0]] == code]) == 0:
            return "Not in worksheet match"
        return None

    def program(self, inst, major):
        p = self.programs[self.programs.program_area == major]
        if not len(p):
            return None, None
        p = p.iloc[0]
        fmtp = lambda prog, deg: prog if (not deg or deg == "See bulletin" or f"({deg})" in prog or prog.endswith(deg)) else f"{prog} ({deg})"
        prev = {"Northeastern University": fmtp(p.nu_program, p.nu_degree), "New York University": fmtp(p.nyu_program, p.nyu_degree)}.get(inst)
        return prev, p.bu_program

    def precedents(self, inst, code):
        return self.s.past[(self.s.past.institution == inst) & (self.s.past.course == code)].to_dict("records")

    def similar_precedent(self, text):
        """Closest past decision for a *different* course with similar content."""
        best, bp = 0, None
        q = self.m.vec.transform([text])
        for p in self.s.past.to_dict("records"):
            c = self.s.course(p["institution"], p["course"])
            if not c:
                continue
            sim = cosine_similarity(q, self.m.vec.transform([c["title"] + " " + c["description"]]))[0][0]
            if sim > best:
                best, bp = sim, p
        return (bp, round(float(best), 2)) if best >= 0.35 else (None, 0)

    # ---------- scoring ----------
    def score(self, course, src_credits, target_code, sim, ws_level):
        bu = self.s.course("Boston University", target_code) if target_code.startswith("CAS") else None
        crit = []
        content = min(1.0, sim / 0.5)
        crit.append(dict(key="content", name="Content similarity", value=f"{round(content*100)}%", score=content,
                         status="ok" if content >= .75 else "warn" if content >= .45 else "fail",
                         detail="Description, outcomes and syllabus compared with the BU course"))
        tgt_cr = 4.0
        diff = abs(src_credits - tgt_cr)
        cr = 1.0 if diff < 0.01 else 0.8 if diff <= 1 else 0.5
        crit.append(dict(key="credits", name="Credit hours", value=f"{src_credits:g} → {tgt_cr:g}", score=cr,
                         status="ok" if cr == 1 else "warn", detail="Transfer credits (after any quarter conversion) vs BU credits"))
        if bu:
            a, b = LEVELS.index(course.get("level", "Introductory")), LEVELS.index(bu["level"])
            lv = 1.0 if a == b else 0.6 if abs(a - b) == 1 else 0.3
            crit.append(dict(key="level", name="Course level", value=f"{course.get('level')} → {bu['level']}", score=lv,
                             status="ok" if lv == 1 else "warn", detail="Introductory / Intermediate / Advanced"))
        if ws_level and ws_level in WS_SCORE:
            crit.append(dict(key="worksheet", name="Worksheet match level", value=ws_level, score=WS_SCORE[ws_level],
                             status="ok" if WS_SCORE[ws_level] == 1 else "warn", detail="From the sponsor worksheet (Course Match sheet)"))
        tot = sum(WEIGHTS[c["key"]] for c in crit)
        pct = round(100 * sum(WEIGHTS[c["key"]] * c["score"] for c in crit) / tot)
        for c in crit:
            c["weight"] = round(WEIGHTS[c["key"]] / tot * 100)
        conf = "High" if pct >= 85 else "Medium" if pct >= 65 else "Low"
        return pct, conf, crit

    # ---------- main ----------
    def recommend(self, r: dict, missing_resolved=False) -> dict:
        s = self.s
        inst, code = r["institution"], r["course"]
        course = s.course(inst, code) or {}
        missing = (inst, code) in MISSING_INFO and not missing_resolved
        syllabus = MISSING_INFO[(inst, code)] if (inst, code) in MISSING_INFO and missing_resolved else s.syllabus_for(inst, code)
        cands = [] if missing else (self.m.top_k(course, syllabus) if course else [])
        out = dict(exceptions=[], reasons=[], criteria=[], pct=None, confidence="n/a", auto=False,
                   description="" if missing else course.get("description", ""),
                   outcomes="" if missing else course.get("learning_outcomes", ""),
                   syllabus="" if missing else syllabus, candidates=cands)
        sug = r["suggestion"]
        # target course for scoring = specific BU course in the suggestion, else top candidate
        tcode = next((w for w in [sug] if w.startswith("CAS")), None) or (cands[0]["bu_course"] if cands else "")
        tcode = tcode.split(" + ")[0]
        sim = next((c["score"] for c in cands if c["bu_course"] == tcode), cands[0]["score"] if cands else 0)
        wsl = self.ws_level(inst, code, tcode) if tcode else None
        out.update(target=tcode, target_title=(s.course("Boston University", tcode) or {}).get("title", ""), target_credits=4,
                   worksheet_level=wsl)
        grade_ok = rules.grade_ok(r["grade"])
        out["reasons"].append(("ok" if grade_ok else "fail", f"Grade {r['grade']} {'meets' if grade_ok else 'is below'} the C minimum"))
        if r["credit_system"] == "Quarter":
            out["reasons"].append(("ok", f"Quarter credits converted: {r['source_credits']:g} × 2/3 = {r['bu_credits']:g}"))

        def rec(decision, award, credits, auto=False):
            out.update(decision=decision, award=award, credits=credits, auto=auto)
            return out

        # 1. hard rules
        if rules.is_withdrawn(r["grade"]):
            out["exceptions"] = []
            out["reasons"] = [("fail", "Withdrawn (W): no credit was earned")]
            return rec("Reject", "No credit", 0, auto=True)
        if not grade_ok:
            out["exceptions"].append("Grade below C")
            return rec("Reject", "No credit", 0, auto=True)
        if r["status"] == "Not transferable" and "R7" in r.get("rules", []):
            out["reasons"].append(("fail", "Over the cap of 4 upper-level Economics courses"))
            return rec("Reject", "No credit", 0, auto=True)
        # 2. missing information
        if missing:
            out["exceptions"] += ["Course description missing", "Syllabus unavailable"]
            out["reasons"].append(("fail", "No description or syllabus on file, so content cannot be compared"))
            return rec("Needs info", "Request syllabus", r["bu_credits"])
        if tcode:
            pct, conf, crit = self.score(course, r["bu_credits"], tcode, sim, wsl)
            out.update(pct=pct, confidence=conf, criteria=crit)
            if cands:
                c0 = next((c for c in cands if c["bu_course"] == tcode), cands[0])
                out["covered"], out["missing"] = c0["covered"], c0["missing"]
        # 3. approved equivalency (worksheet "Likely equivalent" rows feed the equivalency database)
        if r["path"] == "Auto-applied":
            eq = s.equivalency_for(inst, code)
            out["eq_id"] = eq["eq_id"]
            out["eq_source"] = "Worksheet (Course Match: Likely equivalent)" if inst in WORKSHEET_SCHOOLS else "Synthetic Data"
            out["reasons"].insert(0, ("ok", f"Approved equivalency {eq['eq_id']} already maps it to {sug}"))
            if "R3" in r.get("rules", []):
                out["reasons"].append(("warn", "Elective credit only; transfer courses earn no BU Hub units"))
            return rec("Accept" if sug.startswith("CAS") else "Accept as elective", sug, r["bu_credits"], auto=True)
        if "R6" in r.get("rules", []):
            out["exceptions"].append("BU-only course")
            out["reasons"].insert(0, ("warn", f"Closest BU course {tcode} must be taken at BU (Group C)"))
            return rec("Accept as elective", r["suggestion"], r["bu_credits"])
        # 4. precedents
        pds = self.precedents(inst, code)
        awards = {p["bu_awarded"] for p in pds}
        if pds:
            last = pds[-1]
            if len(awards) > 1:
                out["exceptions"].append("Conflicting precedents")
                out["reasons"].append(("warn", "Past decisions disagree: " + "; ".join(f"{p['decision_id']} → {p['bu_awarded']}" for p in pds)))
                out["precedents"] = [p["decision_id"] for p in pds]
                # partial credit: more credits than the BU course and only partial worksheet match
                if r["bu_credits"] > 4 and wsl and wsl.startswith("Partial"):
                    out["exceptions"].append("Credit hours differ")
                    out["reasons"].append(("warn", f"{r['bu_credits']:g} credits vs 4 for {tcode}; content covers {tcode} fully and the next course only in part"))
                    out["partial"] = dict(applied=tcode, applied_credits=4, elective_credits=r["bu_credits"] - 4,
                                          note=f"{tcode} satisfied; the following course in the sequence is still required at BU")
                    return rec("Partial credit", f"{tcode} + {r['bu_credits'] - 4:g} cr elective", r["bu_credits"])
                out["reasons"].insert(0, ("warn", f"Follows the most recent decision {last['decision_id']}: {last['bu_awarded']}"))
            else:
                out["reasons"].insert(0, ("ok", f"Matches past decision {last['decision_id']}: {last['bu_awarded']}"))
            if last["decision"] == "No credit":
                return rec("Reject", "No credit", 0, auto=True)
            kind = "Accept" if last["bu_awarded"].startswith("CAS") else "Accept as elective"
            return rec(kind, last["bu_awarded"], r["bu_credits"])
        # 5. AI match
        if cands:
            out["reasons"].insert(0, ("ok" if out["pct"] >= 65 else "warn", f"Closest BU course by content: {tcode} ({out['pct']}% match)"))
        if missing_resolved:
            bp, bsim = self.similar_precedent(course.get("title", "") + " " + course.get("description", "") + " " + syllabus)
            if bp:
                out["reasons"].append(("warn", f"Similar course {bp['institution']} {bp['course']} was awarded {bp['bu_awarded']} ({bp['decision_id']}): {bp['reason']}"))
                out["similar_precedent"] = bp["decision_id"]
                if not bp["bu_awarded"].startswith("CAS"):
                    return rec("Accept as elective", bp["bu_awarded"], r["bu_credits"])
        if out["pct"] is not None and out["pct"] < 65:
            out["exceptions"].append("Low confidence")
        if wsl == "Not in worksheet match" and inst in WORKSHEET_SCHOOLS:
            out["reasons"].append(("warn", "Not listed in the worksheet's Course Match sheet"))
        return rec("Accept", tcode, r["bu_credits"])
