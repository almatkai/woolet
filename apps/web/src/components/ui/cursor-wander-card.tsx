import * as React from "react"
import { useState, useEffect, useRef, useCallback } from "react"
import { cn } from "@/lib/utils"

interface TiltCardProps {
  children: React.ReactNode
  className?: string
  /** Max rotation in degrees (default: 8) */
  maxTilt?: number
  /** Transition speed in ms when returning to rest (default: 400) */
  resetSpeed?: number
  style?: React.CSSProperties
}

export function TiltCard({
  children,
  className,
  maxTilt = 8,
  resetSpeed = 400,
  style,
}: TiltCardProps) {
  const cardRef = useRef<HTMLDivElement>(null)
  const glareRef = useRef<HTMLDivElement>(null)
  const [isHovered, setIsHovered] = useState(false)

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      const card = cardRef.current
      const glare = glareRef.current
      if (!card) return

      const rect = card.getBoundingClientRect()
      const x = (e.clientX - rect.left) / rect.width
      const y = (e.clientY - rect.top) / rect.height
      const centerX = x - 0.5
      const centerY = y - 0.5

      const angleX = centerY * maxTilt * -1
      const angleY = centerX * maxTilt

      card.style.transition = "transform 0.1s ease-out"
      card.style.transform = `perspective(800px) rotateX(${angleX}deg) rotateY(${angleY}deg) scale3d(1.02, 1.02, 1.02)`

      if (glare) {
        const glareX = x * 100
        const glareY = y * 100
        glare.style.background = `radial-gradient(circle at ${glareX}% ${glareY}%, rgba(255,255,255,0.25) 0%, rgba(255,255,255,0.1) 30%, transparent 60%)`
        glare.style.opacity = "1"
      }
    },
    [maxTilt],
  )

  const handleMouseEnter = useCallback(() => setIsHovered(true), [])

  const handleMouseLeave = useCallback(() => {
    setIsHovered(false)
    const card = cardRef.current
    const glare = glareRef.current
    if (!card) return
    card.style.transition = `transform ${resetSpeed}ms cubic-bezier(0.22, 1, 0.36, 1)`
    card.style.transform = "perspective(800px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)"
    if (glare) {
      glare.style.opacity = "0"
    }
  }, [resetSpeed])

  useEffect(() => {
    const card = cardRef.current
    if (!card) return
    card.addEventListener("mouseenter", handleMouseEnter)
    card.addEventListener("mousemove", handleMouseMove)
    card.addEventListener("mouseleave", handleMouseLeave)
    return () => {
      card.removeEventListener("mouseenter", handleMouseEnter)
      card.removeEventListener("mousemove", handleMouseMove)
      card.removeEventListener("mouseleave", handleMouseLeave)
    }
  }, [handleMouseMove, handleMouseLeave, handleMouseEnter])

  return (
    <div
      ref={cardRef}
      className={cn("will-change-transform relative group", className)}
      style={{ transformStyle: "preserve-3d", ...style }}
    >
      {/* 3D Side/Height (Right) */}
      <div 
        className="absolute top-0 right-0 h-full w-[4px] origin-left rounded-r-2xl brightness-[0.6] pointer-events-none"
        style={{ 
          transform: "rotateY(90deg)",
          background: "inherit", 
          backgroundColor: (style?.backgroundColor as string) || "currentColor"
        }}
      />
      {/* 3D Side/Height (Bottom) */}
      <div 
        className="absolute bottom-0 left-0 w-full h-[4px] origin-top rounded-b-2xl brightness-[0.4] pointer-events-none"
        style={{ 
          transform: "rotateX(-90deg)",
          background: "inherit",
          backgroundColor: (style?.backgroundColor as string) || "currentColor"
        }}
      />
      
      {children}
      {/* Glare / reflection overlay */}
      <div
        ref={glareRef}
        className="pointer-events-none absolute inset-0 rounded-2xl z-10"
        style={{
          opacity: 0,
          transition: "opacity 0.3s ease-out",
          mixBlendMode: "overlay",
        }}
      />
      {/* Edge highlight for 3D depth */}
      {isHovered && (
        <div
          className="pointer-events-none absolute inset-0 rounded-2xl z-10"
          style={{
            boxShadow: "inset 0 1px 0 rgba(255,255,255,0.2), inset 0 -1px 0 rgba(0,0,0,0.15)",
          }}
        />
      )}
    </div>
  )
}

export default TiltCard