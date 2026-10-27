"""Step 5 - The pipeline: route every transcript course down the right path.

  withdrawn (W)        -> SKIPPED (rule)
  grade < C            -> NO CREDIT (rule R1)
  in equivalency DB    -> AUTO-APPLIED
  BU-only course       -> ELECTIVE (rule R6)
  past decision exists -> PRECEDENT (fast-track: evaluator confirms)
  otherwise            -> NEEDS REVIEW (AI suggestion + evaluator decides)
  then, per student    -> Economics cap (R7)

Every course carries a `trace`: the list of rule checks it went through, so the UI can
explain exactly why it ended up where it did.
"""
from dataclasses import dataclass, field, asdict
from . import rules, llm
from .data import Store
from .matcher import Matcher

STATUS_CONFIRMED, STATUS_LIKELY, STATUS_REVIEW, STATUS_NONE = "Confirmed", "Likely", "Under review", "Not transferable"


@dataclass
class Result:
    row_id: str
    student_id: str
    institution: str
    course: str
    title: str
    grade: str
    credit_system: str
    source_credits: float
    bu_credits: float
    path: str = ""            # Auto-applied | Precedent | Needs review | Rule
    status: str = ""          # what the student sees
    suggestion: str = ""      # BU course / elective / no credit
    confidence: float = 1.0
    reason: str = ""
    candidates: list = field(default_factory=list)
    llm: dict | None = None
    trace: list = field(default_factory=list)   # [{rule, check, result, detail}]
    rules: list = field(default_factory=list)   # rule ids that changed the outcome

    def t(self, rule, check, result, detail, fired=False):
        self.trace.append(dict(rule=rule, check=check, result=result, detail=detail))
        if fired and rule not in self.rules:
            self.rules.append(rule)

    def end(self, path, status, suggestion, reason, confidence=1.0, credits=None):
        self.path, self.status, self.suggestion, self.reason, self.confidence = path, status, suggestion, reason, confidence
        if credits is not None:
            self.bu_credits = credits
        return self


class Pipeline:
    def __init__(self, store: Store | None = None):
        self.store = store or Store()
        self.matcher = Matcher(self.store.bu)

    def evaluate_course(self, row: dict) -> Result:
        s = self.store
        inst, code = row["institution"], row["course"]
        course = s.course(inst, code) or dict(title=row.get("title", ""), description="", learning_outcomes="", program="")
        credits = rules.bu_credits(row["source_credits"], row["credit_system"])
        r = Result(row_id=row.get("row_id", ""), student_id=row["student_id"], institution=inst, course=code,
                   title=course["title"], grade=row["grade"], credit_system=row["credit_system"],
                   source_credits=float(row["source_credits"]), bu_credits=credits)

        # Withdrawn
        if rules.is_withdrawn(row["grade"]):
            r.t("W", "Withdrawn?", "fail", "Grade W: the student withdrew and earned 0 credits.", fired=True)
            return r.end("Rule", STATUS_NONE, "Skipped", "Withdrawn course (W). No credit was earned, so it is not evaluated.", credits=0)
        # R1 grade
        if not rules.grade_ok(row["grade"]):
            r.t("R1", "Grade C or higher?", "fail", f"Grade {row['grade']} is below C.", fired=True)
            return r.end("Rule", STATUS_NONE, "No credit", f"Grade {row['grade']} is below the C minimum.", credits=0)
        r.t("R1", "Grade C or higher?", "pass", f"Grade {row['grade']} meets the minimum.")
        # R2 quarter
        if row["credit_system"].lower() == "quarter":
            r.t("R2", "Quarter-system school?", "applied",
                f"{row['source_credits']} quarter units x 2/3 = {credits} BU credits.", fired=True)

        # Existing equivalency -> auto-apply
        eq = s.equivalency_for(inst, code)
        cands = []
        if eq:
            bu = eq["bu_course"] or "Elective credit"
            r.t("DB", "Already in the equivalency database?", "pass", f"{eq['eq_id']}: maps to {bu}.")
            if rules.is_bu_only(bu):
                r.t("R6", "Must the BU course be taken at BU?", "fail", f"{bu} is Group C.", fired=True)
                self._post(r, course)
                return r.end("Rule", STATUS_LIKELY, "CS elective", f"{bu} must be taken at BU (Group C); elective credit only.")
            self._post(r, course, bu)
            r.t("R10", "Department decision?", "pass", f"Approved by the department earlier ({eq['approved']}).")
            note = " " + rules.substitution_note(bu) if rules.substitution_note(bu) else ""
            return r.end("Auto-applied", STATUS_CONFIRMED, bu, f"Approved equivalency {eq['eq_id']} ({eq['approved']}).{note}")
        r.t("DB", "Already in the equivalency database?", "fail", "No approved equivalency yet.")

        # Precedent from a past decision on this exact course
        pd_ = s.precedent_for(inst, code)
        cands = self.matcher.top_k(course, s.syllabus_for(inst, code))
        r.candidates = cands
        if pd_ and rules.is_bu_only(pd_["proposed_bu"]):
            r.t("PD", "Past decision on this course?", "pass", f"{pd_['decision_id']}.")
            r.t("R6", "Must the BU course be taken at BU?", "fail", f"{pd_['proposed_bu']} is Group C.", fired=True)
            r.t("R10", "Department decision?", "pending", "Evaluator confirms the elective award.", fired=True)
            return r.end("Rule", STATUS_LIKELY, pd_["bu_awarded"],
                         f"{pd_['proposed_bu']} must be taken at BU (Group C); elective credit only ({pd_['decision_id']}).")
        if pd_:
            no_credit = pd_["decision"] == "No credit"
            r.t("PD", "Past decision on this course?", "pass", f"{pd_['decision_id']}: {pd_['decision']} ({pd_['bu_awarded']}).")
            if not no_credit:
                self._post(r, course, pd_["bu_awarded"])
            r.t("R10", "Department decision?", "pending", "Evaluator confirms the precedent.", fired=True)
            return r.end("Precedent", STATUS_NONE if no_credit else STATUS_LIKELY, pd_["bu_awarded"],
                         f"Past decision {pd_['decision_id']}: {pd_['reason']}", 0.9, 0 if no_credit else None)
        r.t("PD", "Past decision on this course?", "fail", "None found.")

        # Needs review -> AI suggestion
        top = cands[0]
        suggestion, reason = top["bu_course"], f"Closest BU course by content ({top['score']:.2f} similarity)."
        r.t("AI", "AI match", "applied", f"Top match {top['bu_course']} ({top['score']:.2f}); also "
            + ", ".join(c["bu_course"] for c in cands[1:]) + ".")
        if rules.is_bu_only(suggestion):
            r.t("R6", "Must the BU course be taken at BU?", "fail", f"{suggestion} is Group C.", fired=True)
            suggestion, reason = "CS elective", f"Closest match {top['bu_course']} is BU-only (Group C); elective credit."
        sub = rules.substitution_note(suggestion)
        if sub:
            reason += " " + sub
        if row["credit_system"].lower() == "quarter":
            reason += f" Quarter course: {row['source_credits']} x 2/3 = {credits} BU credits."
        similar = [p for _, p in s.past.iterrows() if p["proposed_bu"] in {c["bu_course"] for c in cands}][:4]
        review = llm.review({**course, "institution": inst, "course": code, "credits": row["source_credits"],
                             "credit_system": row["credit_system"]}, s.syllabus_for(inst, code),
                            [{**c, "description": s.course("Boston University", c["bu_course"])["description"]} for c in cands],
                            similar) if llm.available() else None
        if review:
            suggestion, reason = review["recommendation"], review["rationale"]
        self._post(r, course, suggestion)
        r.t("R10", "Department decision?", "pending", "Waiting for a department evaluator. The AI only suggests.", fired=True)
        return r.end("Needs review", STATUS_REVIEW, suggestion, reason,
                     (review or {}).get("confidence", top["confidence"]))

    def _post(self, r: Result, course: dict, bu: str = ""):
        """Rules that adjust what a transferable course is worth."""
        sub = rules.substitution_note(bu)
        if sub:
            r.t("R9", "Can it substitute for a requirement?", "applied", sub, fired=True)
        if course.get("program") == "General Education":
            r.t("R3", "Earns BU Hub units?", "fail", "Counts as credit only; transfer courses earn no Hub units.", fired=True)
        if rules.is_bio_upper(bu):
            r.t("R8", "Biology residency", "applied",
                "Counts, but at least 5 BI courses beyond BI 107/108 must still be taken at BU.", fired=True)

    def evaluate_student(self, student_id: str) -> list[Result]:
        rows = self.store.transcripts[self.store.transcripts.student_id == student_id].to_dict("records")
        results = [self.evaluate_course(r) for r in rows]
        # R7: Economics 200+ cap (max 4) - applied across the whole transcript
        upper = [r for r in results if r.status != STATUS_NONE and rules.is_econ_upper(r.suggestion)]
        for i, r in enumerate(upper):
            if i < rules.ECON_UPPER_CAP:
                r.t("R7", "Economics 200+ cap", "pass", f"Upper-level Economics course {i + 1} of {rules.ECON_UPPER_CAP} allowed.", fired=True)
            else:
                r.t("R7", "Economics 200+ cap", "fail", f"Course {i + 1}: over the cap of {rules.ECON_UPPER_CAP}.", fired=True)
                r.trace = [x for x in r.trace if x["rule"] != "R10"]
                r.rules = [x for x in r.rules if x != "R10"]
                r.end("Rule", STATUS_NONE, "No credit", f"Over the cap of {rules.ECON_UPPER_CAP} Economics courses at 200+ level.", credits=0)
        return results


def summary(results: list[Result]) -> dict:
    out = {s: 0.0 for s in (STATUS_CONFIRMED, STATUS_LIKELY, STATUS_REVIEW, STATUS_NONE)}
    for r in results:
        out[r.status] += r.bu_credits if r.status != STATUS_NONE else 0
    out["courses"] = len(results)
    return out


def to_dicts(results):
    return [asdict(r) for r in results]
