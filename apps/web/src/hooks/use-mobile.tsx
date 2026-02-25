import * as React from "react"

const DEFAULT_MOBILE_BREAKPOINT = 850

export function useIsMobile(breakpoint = DEFAULT_MOBILE_BREAKPOINT) {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(undefined)

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${breakpoint}px)`)
    const onChange = () => {
      setIsMobile(window.innerWidth <= breakpoint)
    }
    mql.addEventListener("change", onChange)
    setIsMobile(window.innerWidth <= breakpoint)
    return () => mql.removeEventListener("change", onChange)
  }, [breakpoint])

  return !!isMobile
}
