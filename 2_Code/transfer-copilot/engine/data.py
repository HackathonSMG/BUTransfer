"""Step 1 - Load the hackathon CSVs into simple in-memory tables."""
from pathlib import Path
import pandas as pd

DATA_DIR = Path(__file__).resolve().parent.parent / "data"


class Store:
    """Holds every table the engine needs. Swap this for SQLite/Postgres later."""

    def __init__(self, data_dir: Path = DATA_DIR):
        read = lambda name: pd.read_csv(data_dir / f"{name}.csv").fillna("")
        self.catalog = read("course_catalog")
        self.equivalency = read("equivalency_db")
        self.past = read("past_decisions")
        self.students = read("students")
        self.transcripts = read("transcripts")
        self.syllabi = read("syllabi")
        self.rules = read("rules")
        self.bu = self.catalog[self.catalog.institution == "Boston University"].reset_index(drop=True)

    # --- lookups -----------------------------------------------------------
    def course(self, institution: str, code: str) -> dict | None:
        m = self.catalog[(self.catalog.institution == institution) & (self.catalog.course == code)]
        return m.iloc[0].to_dict() if len(m) else None

    def equivalency_for(self, institution: str, code: str) -> dict | None:
        m = self.equivalency[(self.equivalency.institution == institution) & (self.equivalency.course == code)]
        return m.iloc[0].to_dict() if len(m) else None

    def precedent_for(self, institution: str, code: str) -> dict | None:
        m = self.past[(self.past.institution == institution) & (self.past.course == code)]
        return m.iloc[-1].to_dict() if len(m) else None

    def syllabus_for(self, institution: str, code: str) -> str:
        m = self.syllabi[(self.syllabi.institution == institution) & (self.syllabi.course == code)]
        return m.iloc[0].syllabus if len(m) else ""

    def add_equivalency(self, institution, code, title, bu_course, outcome, evaluator):
        """Step 7 - the feedback loop: an approved decision becomes an instant match next time."""
        new_id = f"EQ-{len(self.equivalency) + 1:03d}"
        row = dict(eq_id=new_id, institution=institution, course=code, title=title, bu_course=bu_course,
                   outcome=outcome, dept=("CAS " + bu_course.split()[1]) if bu_course.startswith("CAS") else "",
                   approved=pd.Timestamp.today().strftime("%Y-%m-%d"), evaluator=evaluator)
        self.equivalency = pd.concat([self.equivalency, pd.DataFrame([row])], ignore_index=True)
        return row
