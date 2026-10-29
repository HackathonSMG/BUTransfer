// Status messages shown inline on the page instead of corner pop-ups. Same call shape the pages used before:
// notify.success(text), notify.error(text), notify(text).
//
// Where a message appears: an error goes to the innermost open region (the dialog the user is working in, else the
// page); a success or notice always goes to the page, because the dialog that triggered it usually closes. A message
// stays until it is dismissed, replaced or the user moves to another page. { keepOnNavigate: true } keeps it for the
// next page (e.g. a confirmation shown after leaving a page the user no longer has access to).

const listeners = new Set()
let messages = []
let seq = 0
// Regions currently on screen, innermost last ('page' is always the outermost)
const regions = ['page']

const emit = () => listeners.forEach((fn) => fn(messages))

function push(kind, text, { keepOnNavigate = false } = {}) {
  if (!text) return null
  const region = kind === 'error' ? regions[regions.length - 1] : 'page'
  const message = { id: ++seq, kind, text: String(text), region, keepOnNavigate, at: Date.now() }
  // One message per region: the newest replaces the last, so the page never fills with stale notes
  messages = [...messages.filter((m) => m.region !== region), message]
  emit()
  return message.id
}

const notify = (text, options) => push('info', text, options)
notify.success = (text, options) => push('success', text, options)
notify.error = (text, options) => push('error', text, options)
notify.dismiss = (id) => { messages = messages.filter((m) => m.id !== id); emit() }
notify.subscribe = (fn) => { listeners.add(fn); fn(messages); return () => listeners.delete(fn) }

/** A dialog's region: errors raised while it is open appear inside it. Returns the cleanup to call on close. */
notify.openRegion = (name) => {
  regions.push(name)
  return () => {
    const i = regions.lastIndexOf(name)
    if (i > 0) regions.splice(i, 1)
    messages = messages.filter((m) => m.region !== name)
    emit()
  }
}

/** Called when the page changes: messages belong to the page they were raised on, unless kept for the next one. */
notify.pageChanged = () => {
  messages = messages.filter((m) => m.keepOnNavigate).map((m) => ({ ...m, keepOnNavigate: false }))
  emit()
}

export default notify
