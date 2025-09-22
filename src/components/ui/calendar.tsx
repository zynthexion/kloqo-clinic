"use client"

import * as React from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { DayPicker } from "react-day-picker"

import { cn } from "@/lib/utils"
import { buttonVariants } from "@/components/ui/button"

export type CalendarProps = React.ComponentProps<typeof DayPicker> & {
  compact?: boolean;
};

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  compact = false,
  ...props
}: CalendarProps) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn("p-4 bg-white dark:bg-slate-900 rounded-lg border shadow-sm", className)}
      classNames={{
        months: "flex flex-col sm:flex-row space-y-4 sm:space-x-4 sm:space-y-0",
        month: "space-y-4 w-full",
        caption: "flex justify-center pt-1 relative items-center mb-6",
        caption_label: cn(
            "flex items-center gap-3 text-slate-900 dark:text-slate-100",
            compact ? "text-base font-semibold" : "text-xl font-bold"
        ),
        caption_icon: cn(
          'h-8 w-8 rounded-full flex items-center justify-center',
          'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
        ),
        nav: "space-x-1 flex items-center",
        nav_button: cn(
          buttonVariants({ variant: "outline" }),
          "h-9 w-9 bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700",
          "hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:border-blue-300 dark:hover:border-blue-600",
          "text-slate-600 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400",
          "p-0 transition-colors duration-200"
        ),
        nav_button_previous: "absolute left-1",
        nav_button_next: "absolute right-1",
        table: "w-full border-collapse space-y-1",
        head_row: "flex justify-between mb-2",
        head_cell: cn(
          "text-slate-500 dark:text-slate-400 rounded-md font-medium uppercase tracking-wide",
          compact ? "w-9 text-[10px]" : "w-12 text-xs"
        ),
        row: cn("flex w-full justify-between", compact ? "mt-1" : "mt-2"),
        cell: cn(
          "text-center p-0 relative rounded-lg",
          "[&:has([aria-selected].day-range-end)]:rounded-r-lg [&:has([aria-selected].day-outside)]:bg-blue-50/50 dark:[&:has([aria-selected].day-outside)]:bg-blue-900/20",
          "[&:has([aria-selected])]:bg-blue-100 dark:[&:has([aria-selected])]:bg-blue-900/40",
          "first:[&:has([aria-selected])]:rounded-l-lg last:[&:has([aria-selected])]:rounded-r-lg",
          "focus-within:relative focus-within:z-20",
           compact ? "h-9 w-9 text-xs" : "h-12 w-12 text-sm"
        ),
        day: cn(
          buttonVariants({ variant: "ghost" }),
          "h-full w-full p-0 font-medium rounded-lg transition-all duration-200 text-slate-900 dark:text-slate-50",
          "hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:text-blue-600 dark:hover:text-blue-400",
          "focus:bg-blue-100 dark:focus:bg-blue-900/40 focus:text-blue-700 dark:focus:text-blue-300",
          "aria-selected:opacity-100",
          compact ? "text-xs" : "text-sm"
        ),
        day_range_end: "day-range-end",
        day_selected: cn(
          "bg-blue-600 dark:bg-blue-500 text-white font-semibold shadow-md",
          "hover:bg-blue-700 dark:hover:bg-blue-600 hover:text-white",
          "focus:bg-blue-700 dark:focus:bg-blue-600 focus:text-white",
          "border-2 border-blue-600 dark:border-blue-500"
        ),
        day_today: cn(
          "bg-amber-100 dark:bg-amber-900/40 text-amber-900 dark:text-amber-300",
          "border-2 border-amber-400 dark:border-amber-600 font-semibold",
          "hover:bg-amber-200 dark:hover:bg-amber-900/60"
        ),
        day_outside: cn(
          "day-outside text-slate-300 dark:text-slate-600 opacity-50",
          "aria-selected:bg-blue-100/50 dark:aria-selected:bg-blue-900/20",
          "aria-selected:text-slate-400 dark:aria-selected:text-slate-500",
          "aria-selected:opacity-30"
        ),
        day_disabled: cn(
          "text-slate-300 dark:text-slate-600 opacity-40",
          "bg-slate-50 dark:bg-slate-800/50 cursor-not-allowed",
          "line-through"
        ),
        day_range_middle: cn(
          "aria-selected:bg-blue-100 dark:aria-selected:bg-blue-900/40",
          "aria-selected:text-blue-700 dark:aria-selected:text-blue-300"
        ),
        day_hidden: "invisible",
        ...classNames,
      }}
      components={{
        IconLeft: ({ className, ...props }) => (
          <ChevronLeft className={cn("h-4 w-4", className)} {...props} />
        ),
        IconRight: ({ className, ...props }) => (
          <ChevronRight className={cn("h-4 w-4", className)} {...props} />
        ),
         CaptionLabel: ({ displayMonth }) => {
            const month = displayMonth.toLocaleString('default', { month: 'long' });
            const year = displayMonth.getFullYear();
            return (
              <span className="flex items-center gap-3">
                 {!compact && (
                   <svg 
                     xmlns="http://www.w3.org/2000/svg" 
                     width="24" 
                     height="24" 
                     viewBox="0 0 24 24" 
                     fill="none" 
                     stroke="currentColor" 
                     strokeWidth="2" 
                     strokeLinecap="round" 
                     strokeLinejoin="round" 
                     className="h-6 w-6 text-blue-600 dark:text-blue-400"
                   >
                     <rect width="18" height="18" x="3" y="4" rx="2" ry="2"></rect>
                     <line x1="16" x2="16" y1="2" y2="6"></line>
                     <line x1="8" x2="8" y1="2" y2="6"></line>
                     <line x1="3" x2="21" y1="10" y2="10"></line>
                   </svg>
                 )}
                <span className="text-slate-900 dark:text-slate-100">
                  {month} {year}
                </span>
              </span>
            );
        },
      }}
      {...props}
    />
  )
}
Calendar.displayName = "Calendar"

export { Calendar }
