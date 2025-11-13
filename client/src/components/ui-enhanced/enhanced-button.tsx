import * as React from "react"
import { motion, AnimatePresence, useReducedMotion } from "framer-motion"
import { Loader2 } from "lucide-react"
import { Button, ButtonProps } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export interface EnhancedButtonProps extends ButtonProps {
  loading?: boolean
  enableRipple?: boolean
}

interface RippleType {
  x: number
  y: number
  id: number
}

export const EnhancedButton = React.forwardRef<HTMLButtonElement, EnhancedButtonProps>(
  ({ 
    loading = false,
    enableRipple = true,
    disabled,
    children,
    onClick,
    className,
    ...props 
  }, ref) => {
    const [ripples, setRipples] = React.useState<RippleType[]>([])
    const shouldReduceMotion = useReducedMotion()

    const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
      if (enableRipple && !shouldReduceMotion && e.currentTarget) {
        const rect = e.currentTarget.getBoundingClientRect()
        const x = e.clientX - rect.left
        const y = e.clientY - rect.top
        
        const newRipple = {
          x,
          y,
          id: Date.now(),
        }
        
        setRipples(prev => [...prev, newRipple])
        
        setTimeout(() => {
          setRipples(prev => prev.filter(r => r.id !== newRipple.id))
        }, 600)
      }
      
      onClick?.(e)
    }

    return (
      <Button
        ref={ref}
        onClick={handleClick}
        disabled={disabled || loading}
        className={cn("relative overflow-hidden", className)}
        aria-busy={loading}
        {...props}
      >
        {/* Ripple effect */}
        {!shouldReduceMotion && (
          <AnimatePresence>
            {ripples.map((ripple) => (
              <motion.span
                key={ripple.id}
                className="absolute rounded-full bg-white/30 pointer-events-none"
                style={{
                  left: ripple.x,
                  top: ripple.y,
                }}
                initial={{ width: 0, height: 0, x: 0, y: 0 }}
                animate={{ 
                  width: 200, 
                  height: 200, 
                  x: -100, 
                  y: -100,
                  opacity: [1, 0.5, 0]
                }}
                exit={{ opacity: 0 }}
                transition={{ 
                  duration: 0.6,
                  ease: "easeOut"
                }}
              />
            ))}
          </AnimatePresence>
        )}

        {/* Loading spinner */}
        {loading && (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            <span className="sr-only">Loading...</span>
          </>
        )}

        {children}
      </Button>
    )
  },
)
EnhancedButton.displayName = "EnhancedButton"
