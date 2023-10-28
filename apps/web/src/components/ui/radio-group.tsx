import * as React from "react"

import { cn } from "@/utils/cn"

export type RadioGroupProps = React.InputHTMLAttributes<HTMLDivElement>
export type RadioGroupItemProps = React.InputHTMLAttributes<HTMLButtonElement> & {
  active?: boolean
}

const RadioGroup = React.forwardRef<HTMLDivElement, RadioGroupProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <div
        className={cn(
          "flex h-10 divide-x rounded-md border border-input bg-background text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)

const RadioGroupItem = React.forwardRef<HTMLButtonElement, RadioGroupItemProps>(({className, active, ...props}, ref) => {
  return (
    <button {...props} className={cn('flex-1 px-3 whitespace-nowrap leading-none hover:bg-slate-100 transition-colors font-medium', className, active && 'bg-slate-100')} type="button" ref={ref} />
  )
})

RadioGroup.displayName = "RadioGroup"
RadioGroupItem.displayName = "RadioGroupItem"

export { RadioGroup, RadioGroupItem }
