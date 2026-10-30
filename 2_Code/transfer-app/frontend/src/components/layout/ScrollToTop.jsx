import { useEffect, useLayoutEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'

const HASH_TRIES = 10 // pages load their data first, so the anchor may appear a little later
const HASH_DELAY_MS = 100

// Every page opens at the top. The window is the scroller in both shells (the public Layout and the staff
// StaffShell grow with the page; only the sidebar's own nav list scrolls separately).
// - A new pathname scrolls the window to (0, 0)
// - A hash (#section) is an intentional anchor: the window then scrolls to that element instead
// - Query-only changes (in-page filters, search, tabs kept in the URL) do not scroll
// - The first load is left to the browser (a reload keeps its position)
export default function ScrollToTop() {
  const { pathname, hash } = useLocation()
  const previous = useRef(pathname)

  useLayoutEffect(() => {
    if (previous.current === pathname) return
    previous.current = pathname
    window.scrollTo(0, 0) // with a hash, the effect below then moves to the anchor once it is on the page
  }, [pathname])

  useEffect(() => {
    if (!hash) return undefined
    let id
    try { id = decodeURIComponent(hash.slice(1)) } catch { id = hash.slice(1) }
    let tries = 0
    let timer
    const find = () => {
      const el = id && document.getElementById(id)
      if (el) { el.scrollIntoView({ block: 'start' }); return }
      if (++tries < HASH_TRIES) timer = setTimeout(find, HASH_DELAY_MS)
    }
    find()
    return () => clearTimeout(timer)
  }, [pathname, hash])

  return null
}
