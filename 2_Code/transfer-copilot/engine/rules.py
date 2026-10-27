"""Step 2 - Deterministic business rules. No AI here: these must be explainable and always right."""
import math
import re

PASSING_GRADES = {"A", "A-", "B+", "B", "B-", "C+", "C"}          # R1: C or higher
BU_ONLY = {"CAS CS 320", "CAS CS 332", "CAS CS 350"}               # R6: Group C, must be taken at BU
ECON_UPPER_CAP = 4                                                 # R7: max 4 econ courses at 200+ level
SUBSTITUTIONS = {"CAS MA 242": "CAS CS 132", "CAS MA 294": "CAS CS 235", "CAS MA 581": "CAS CS 237"}  # R9


def grade_ok(grade: str) -> bool:
    return str(grade).strip().upper() in PASSING_GRADES


def bu_credits(source_credits: float, credit_system: str) -> float:
    """R2: quarter credits x 2/3, truncated to 2 decimals (BU's example: 4 -> 2.66)."""
    c = float(source_credits)
    if credit_system.lower() == "quarter":
        return math.floor(c * 2 / 3 * 100) / 100
    return c


def is_bu_only(bu_course: str) -> bool:
    return bu_course in BU_ONLY


def is_econ_upper(bu_course: str) -> bool:
    m = re.match(r"(CAS EC|Econ elective \(CAS EC) (\d)", bu_course)
    return bool(m) and int(m.group(2)) >= 2


def substitution_note(bu_course: str) -> str:
    target = SUBSTITUTIONS.get(bu_course)
    return f"{bu_course} can substitute for {target} in the CS major." if target else ""


def is_withdrawn(grade: str) -> bool:
    return str(grade).strip().upper() == "W"


def is_bio_upper(bu_course: str) -> bool:
    """R8: BI courses beyond BI 107/108 count toward the 'at least 5 at BU' residency rule."""
    m = re.match(r"CAS BI (\d{3})", bu_course or "")
    return bool(m) and m.group(1) not in ("107", "108")
