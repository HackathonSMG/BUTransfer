// How each staff role is named to the user
export const ROLE_LABELS = {
  evaluator: 'Evaluator',
  admin: 'Administrator',
  credit_office: 'Credit Evaluation Office'
}

// Where each role lands after signing in; the role comes from the account, never from a selector
export function homeFor(role) {
  switch (role) {
    case 'admin': return '/admin'
    case 'credit_office': return '/office'
    case 'evaluator': return '/evaluator'
    case 'student': return '/student'
    default: return '/'
  }
}
