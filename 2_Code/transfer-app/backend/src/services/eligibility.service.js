import { query } from '../config/db.js';

export async function getCriteria() {
  const result = await query(
    `SELECT id, criterion_name, description, rule_type, rule_config, is_required, display_order
     FROM eligibility_criteria WHERE is_active = true ORDER BY display_order ASC, criterion_name ASC`
  );
  return result.rows;
}

/**
 * @param {object} input
 * @param {boolean} [input.missingAsUnknown] the staff evaluation of an application: a GPA or credit total that was
 *   not asked for (the applicant form does not collect them; the transcript carries them) is "to be verified",
 *   not a failed criterion. The public eligibility check keeps treating a missing value as not met.
 */
export async function checkEligibility({ gpa, credits, institution, program, hasTranscripts, missingAsUnknown = false }) {
  const criteria = await getCriteria();
  const criteriaResults = [];
  const reasons = [];
  let passedWeight = 0;
  let totalWeight = 0;

  for (const criterion of criteria) {
    const ruleConfig = criterion.rule_config || {};
    let result = null;
    let reason = '';

    switch (criterion.rule_type) {
      case 'gpa': {
        const minGpa = parseFloat(ruleConfig.min_gpa ?? 2.5);
        const studentGpa = parseFloat(gpa);
        if (isNaN(studentGpa)) { result = missingAsUnknown ? null : false; reason = missingAsUnknown ? 'GPA will be verified from the transcript' : 'GPA not provided'; }
        else if (studentGpa >= minGpa) { result = true; reason = `GPA ${studentGpa.toFixed(2)} meets minimum of ${minGpa.toFixed(2)}`; }
        else { result = false; reason = `GPA ${studentGpa.toFixed(2)} is below minimum of ${minGpa.toFixed(2)}`; }
        break;
      }
      case 'credits': {
        const minCredits = parseInt(ruleConfig.min_credits ?? 30, 10);
        const studentCredits = parseInt(credits, 10);
        if (isNaN(studentCredits)) { result = missingAsUnknown ? null : false; reason = missingAsUnknown ? 'Credit hours will be verified from the transcript' : 'Credit hours not provided'; }
        else if (studentCredits >= minCredits) { result = true; reason = `${studentCredits} credit hours meets minimum of ${minCredits}`; }
        else { result = false; reason = `${studentCredits} credit hours is below minimum of ${minCredits}`; }
        break;
      }
      case 'document': {
        if (ruleConfig.document_type === 'transcript') {
          result = hasTranscripts === true;
          reason = result ? 'Official transcripts are available' : 'Official transcripts are required but not available';
        } else { result = true; reason = 'Document availability will be verified during review'; }
        break;
      }
      case 'accreditation': {
        if (!institution || institution.trim().length < 3) { result = false; reason = 'Institution name not provided'; }
        else { result = true; reason = `Accreditation of ${institution} will be verified by evaluators`; }
        break;
      }
      case 'standing': {
        const studentGpa = parseFloat(gpa);
        if (!isNaN(studentGpa) && studentGpa >= 2.0) { result = true; reason = 'Good academic standing assumed based on reported GPA'; }
        else if (!isNaN(studentGpa)) { result = false; reason = 'GPA indicates potential academic standing issues'; }
        else { result = null; reason = 'Academic standing will be verified from transcripts'; }
        break;
      }
      case 'disciplinary':
      case 'prerequisites': {
        result = null; reason = `${criterion.criterion_name} will be verified during full review`; break;
      }
      case 'deadline': {
        result = true; reason = 'Deadline compliance will be confirmed upon submission'; break;
      }
      default: { result = null; reason = 'Will be evaluated during review'; }
    }

    const weight = criterion.is_required ? 2 : 1;
    totalWeight += weight;
    if (result === true) passedWeight += weight;
    else if (result === null) passedWeight += weight * 0.5;

    criteriaResults.push({ id: criterion.id, criterion_name: criterion.criterion_name, rule_type: criterion.rule_type, is_required: criterion.is_required, result, reason });
    if (result === false && criterion.is_required) reasons.push(reason);
  }

  const score = totalWeight > 0 ? Math.round((passedWeight / totalWeight) * 100) : 0;
  const hasHardFail = criteriaResults.some((c) => c.is_required && c.result === false);
  const eligible = !hasHardFail && score >= 50;

  return { eligible, score, criteria_results: criteriaResults, reasons };
}

export default { checkEligibility, getCriteria };
