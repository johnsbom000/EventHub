import { CheckCircle2, AlertCircle, Info, AlertTriangle } from "lucide-react"
import { toast as baseToast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"

export type ToastVariant = 'default' | 'success' | 'error' | 'warning' | 'info' | 'destructive'

interface EnhancedToastProps {
  title?: string
  description?: string
  variant?: ToastVariant
  duration?: number
}

const variantConfig: Record<ToastVariant, { icon?: React.ElementType; className?: string }> = {
  default: {},
  destructive: {},
  success: {
    icon: CheckCircle2,
    className: "border-green-500 bg-green-50 dark:bg-green-950 text-green-900 dark:text-green-100",
  },
  error: {
    icon: AlertCircle,
  },
  warning: {
    icon: AlertTriangle,
    className: "border-yellow-500 bg-yellow-50 dark:bg-yellow-950 text-yellow-900 dark:text-yellow-100",
  },
  info: {
    icon: Info,
    className: "border-blue-500 bg-blue-50 dark:bg-blue-950 text-blue-900 dark:text-blue-100",
  },
}

export function toast({ title, description, variant = 'default', duration }: EnhancedToastProps) {
  const config = variantConfig[variant]
  const Icon = config.icon
  
  // Map custom variants to shadcn variants
  const shadcnVariant = variant === 'error' ? 'destructive' : (variant === 'success' || variant === 'warning' || variant === 'info' ? 'default' : variant)

  return baseToast({
    title: Icon ? (
      <div className="flex items-center gap-2">
        <Icon className="h-5 w-5" />
        <span>{title}</span>
      </div>
    ) : title,
    description,
    variant: shadcnVariant as 'default' | 'destructive',
    className: cn(config.className),
    duration: duration !== undefined ? duration : 5000,
  })
}

// Re-export the useToast hook from shadcn
export { useToast } from "@/hooks/use-toast"
