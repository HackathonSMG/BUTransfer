"""Step 4 - (Optional) LLM reviewer: drafts the evaluator's recommendation for a "maybe" course.

Runs only if ANTHROPIC_API_KEY is set; otherwise the pipeline uses the matcher's output alone.
The LLM never decides - it writes a draft the department evaluator approves or changes.
"""
import json
import os

PROMPT = """You help a university transfer-credit evaluator. Compare the TRANSFER course with the
candidate BU courses and recommend one outcome. Department evaluators make the final decision.

TRANSFER COURSE ({institution} {course}, {credits} {system} credits):
Title: {title}
Description: {description}
Learning outcomes: {learning_outcomes}
Syllabus: {syllabus}

CANDIDATE BU COURSES:
{candidates}

SIMILAR PAST DECISIONS (follow these patterns):
{precedents}

Return ONLY JSON:
{{"recommendation": "<BU course code, or 'Elective credit', or 'No credit'>",
  "confidence": <0-1>, "covered_topics": [..], "missing_topics": [..],
  "rationale": "<2 sentences>", "needs_syllabus": <true|false>}}"""


def available() -> bool:
    return bool(os.getenv("ANTHROPIC_API_KEY"))


def review(course: dict, syllabus: str, candidates: list, precedents: list) -> dict | None:
    if not available():
        return None
    import anthropic
    client = anthropic.Anthropic()
    cand = "\n".join(f"- {c['bu_course']} {c['title']}: {c.get('description', '')}" for c in candidates)
    prec = "\n".join(f"- {p['institution']} {p['course']} -> {p['decision']} ({p['bu_awarded']}): {p['reason']}"
                     for p in precedents) or "none"
    msg = client.messages.create(
        model=os.getenv("CLAUDE_MODEL", "claude-sonnet-4-5"), max_tokens=600,
        messages=[{"role": "user", "content": PROMPT.format(
            syllabus=syllabus or "not provided", candidates=cand, precedents=prec,
            system=course.get("credit_system", ""), credits=course.get("credits", ""), **course)}])
    text = msg.content[0].text
    return json.loads(text[text.find("{"): text.rfind("}") + 1])
