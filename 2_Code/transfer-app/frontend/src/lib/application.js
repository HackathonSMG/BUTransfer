// Options and payload mapping shared by the student application form and the staff "New Application" page

export const PROGRAMS = [
  { value: 'computer_science', label: 'Computer Science' },
  { value: 'business', label: 'Business Administration' },
  { value: 'engineering', label: 'Engineering' },
  { value: 'liberal_arts', label: 'Liberal Arts' },
  { value: 'sciences', label: 'Sciences' },
  { value: 'education', label: 'Education' },
  { value: 'communication', label: 'Communication' }
]

export const PROGRAM_DEPARTMENTS = {
  computer_science: 'College of Arts & Sciences / CS',
  business: 'Questrom School of Business',
  engineering: 'College of Engineering',
  liberal_arts: 'College of Arts & Sciences',
  sciences: 'College of Arts & Sciences',
  education: 'Wheelock College of Education',
  communication: 'College of Communication'
}

export const TERMS = [
  { value: 'spring_2027', label: 'Spring 2027' },
  { value: 'fall_2027', label: 'Fall 2027' },
  { value: 'spring_2028', label: 'Spring 2028' },
  { value: 'fall_2028', label: 'Fall 2028' }
]

export const STANDING = [
  { value: 'good_standing', label: 'Good Standing' },
  { value: 'probation', label: 'Academic Probation' },
  { value: 'suspension', label: 'Academic Suspension' }
]

// Maps form fields to the backend's application schema
export function toApplicationPayload(data) {
  return {
    student_name: `${data.first_name} ${data.last_name}`.trim(),
    student_email: data.email,
    student_phone: data.phone || null,
    date_of_birth: data.date_of_birth || null,
    transfer_from_institution: data.transfer_from_institution,
    transfer_from_program: data.current_program || null,
    transfer_to_program: PROGRAMS.find(p => p.value === data.program)?.label || data.program,
    transfer_to_department: PROGRAM_DEPARTMENTS[data.program] || null,
    expected_start_term: TERMS.find(t => t.value === data.expected_start_term)?.label || data.expected_start_term || null,
    academic_history: {
      gpa: parseFloat(data.gpa),
      credits_completed: parseInt(data.total_credits, 10),
      academic_standing: data.academic_standing || null,
      transfer_date: data.graduation_date || null
    },
    personal_statement: data.personal_statement || null,
    additional_info: { address: data.address || null, why_transferring: data.why_transferring || null }
  }
}
