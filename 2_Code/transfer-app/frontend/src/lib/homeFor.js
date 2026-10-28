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
