import * as React from "react"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import { CheckCircle2, AlertCircle } from "lucide-react"

type BaseInputProps = {
  label?: string
  error?: string
  success?: boolean
  hint?: string
}

export type EnhancedInputProps = BaseInputProps & (
  | (Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> & {
      type?: 'text' | 'email' | 'password' | 'number' | 'tel' | 'url' | 'search' | 'date'
    })
  | (React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
      type: 'textarea'
      rows?: number
    })
)

export const EnhancedInput = React.forwardRef<HTMLInputElement | HTMLTextAreaElement, EnhancedInputProps>(
  (props, ref) => {
    const { 
      type = 'text',
      label,
      error,
      success,
      hint,
      className,
      id,
      ...restProps 
    } = props as any
    const inputId = id || React.useId()
    const isTextarea = type === 'textarea'

    const inputClassName = cn(
      "transition-all duration-200 motion-reduce:transition-none",
      error && "border-destructive focus-visible:ring-destructive",
      success && "border-green-500 focus-visible:ring-green-500",
      className
    )

    return (
      <div className="w-full space-y-2">
        {label && (
          <label 
            htmlFor={inputId}
            className="text-sm font-medium text-foreground"
          >
            {label}
          </label>
        )}
        
        <div className="relative">
          {isTextarea ? (
            <Textarea
              ref={ref as React.Ref<HTMLTextAreaElement>}
              id={inputId}
              className={inputClassName}
              rows={restProps.rows || 4}
              aria-invalid={!!error}
              aria-describedby={error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined}
              {...restProps}
            />
          ) : (
            <Input
              ref={ref as React.Ref<HTMLInputElement>}
              type={type as any}
              id={inputId}
              className={inputClassName}
              aria-invalid={!!error}
              aria-describedby={error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined}
              {...restProps}
            />
          )}
          
          {/* Success indicator */}
          {success && !error && (
            <CheckCircle2 
              className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 text-green-500"
              aria-hidden="true"
            />
          )}
          
          {/* Error indicator */}
          {error && (
            <AlertCircle 
              className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 text-destructive"
              aria-hidden="true"
            />
          )}
        </div>

        {/* Error message */}
        {error && (
          <p 
            id={`${inputId}-error`}
            className="text-sm text-destructive flex items-center gap-1"
            role="alert"
          >
            {error}
          </p>
        )}

        {/* Hint text */}
        {hint && !error && (
          <p 
            id={`${inputId}-hint`}
            className="text-sm text-muted-foreground"
          >
            {hint}
          </p>
        )}
      </div>
    )
  },
)
EnhancedInput.displayName = "EnhancedInput"
