import * as React from "react"
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card"
import { cn } from "@/lib/utils"

export type CardElevation = 'flat' | 'raised' | 'elevated'

export interface EnhancedCardProps extends React.HTMLAttributes<HTMLDivElement> {
  elevation?: CardElevation
  hoverable?: boolean
  children: React.ReactNode
}

const elevationClasses: Record<CardElevation, string> = {
  flat: "shadow-none border",
  raised: "shadow-sm border hover:shadow-md",
  elevated: "shadow-lg border-0 hover:shadow-xl",
}

export const EnhancedCard = React.forwardRef<HTMLDivElement, EnhancedCardProps>(
  ({ 
    elevation = 'raised',
    hoverable = false,
    className,
    children,
    ...props 
  }, ref) => {
    const cardClassName = cn(
      "transition-all duration-300 motion-reduce:transition-none",
      elevationClasses[elevation],
      hoverable && "cursor-pointer hover:-translate-y-1 motion-reduce:hover:translate-y-0",
      className
    )

    return (
      <Card
        ref={ref}
        className={cardClassName}
        {...props}
      >
        {children}
      </Card>
    )
  },
)
EnhancedCard.displayName = "EnhancedCard"

// Export the sub-components for convenience
export { CardHeader, CardTitle, CardDescription, CardContent, CardFooter }
