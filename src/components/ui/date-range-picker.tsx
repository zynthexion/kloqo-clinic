
"use client"

import * as React from "react"
import { format, subDays, startOfMonth, endOfMonth, subMonths, startOfWeek, endOfWeek, startOfYear, endOfYear, subYears } from "date-fns"
import { Calendar as CalendarIcon, Check, ChevronDown } from "lucide-react"
import { DateRange } from "react-day-picker"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"

interface DateRangePickerProps extends React.HTMLAttributes<HTMLDivElement> {
    onDateChange: (dateRange: DateRange | undefined) => void;
    initialDateRange?: DateRange;
}

const presets = [
    { value: "today", label: "Today" },
    { value: "last7", label: "Last 7 days" },
    { value: "this_month", label: "This month" },
    { value: "last_month", label: "Last month" },
    { value: "this_year", label: "This year" },
    { value: "last_year", label: "Last year" },
]

export function DateRangePicker({ className, initialDateRange, onDateChange }: DateRangePickerProps) {
  const [date, setDate] = React.useState<DateRange | undefined>(initialDateRange)
  const [preset, setPreset] = React.useState<string>("last7");
  const [isCustomPickerOpen, setIsCustomPickerOpen] = React.useState(false);

  React.useEffect(() => {
    if (onDateChange) {
      onDateChange(date);
    }
  }, [date, onDateChange]);

  const handlePresetChange = (value: string) => {
    setPreset(value);
    const now = new Date();
    switch (value) {
      case "today":
        setDate({ from: now, to: now });
        break;
      case "last7":
        setDate({ from: subDays(now, 6), to: now });
        break;
      case "this_month":
        setDate({ from: startOfMonth(now), to: endOfMonth(now) });
        break;
      case "last_month":
        const lastMonth = subMonths(now, 1);
        setDate({ from: startOfMonth(lastMonth), to: endOfMonth(lastMonth) });
        break;
      case "this_year":
        setDate({ from: startOfYear(now), to: endOfYear(now) });
        break;
      case "last_year":
        const lastYear = subYears(now, 1);
        setDate({ from: startOfYear(lastYear), to: endOfYear(lastYear) });
        break;
      default:
        setDate(undefined);
        break;
    }
  };

  const getPresetLabel = (value: string) => {
    if (value === 'custom') {
         if (date?.from && date.to) {
            return `${format(date.from, "LLL dd, y")} - ${format(date.to, "LLL dd, y")}`;
         }
         return 'Custom';
    }
    return presets.find(p => p.value === value)?.label || "Select date range";
  }

  return (
    <div className={cn("grid gap-2", className)}>
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button
                    variant={"outline"}
                    size="icon"
                >
                    <CalendarIcon className="h-4 w-4" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56">
                {presets.map(p => (
                    <DropdownMenuItem key={p.value} onClick={() => handlePresetChange(p.value)}>
                        <Check className={cn("mr-2 h-4 w-4", preset === p.value ? "opacity-100" : "opacity-0")} />
                        {p.label}
                    </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <Popover open={isCustomPickerOpen} onOpenChange={setIsCustomPickerOpen}>
                    <PopoverTrigger asChild>
                        <DropdownMenuItem 
                            onSelect={e => e.preventDefault()} 
                            onClick={() => {
                                setPreset("custom")
                                setDate(undefined)
                                setIsCustomPickerOpen(true)
                            }}
                        >
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            <span>Custom Range</span>
                        </DropdownMenuItem>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                            initialFocus
                            mode="range"
                            defaultMonth={date?.from}
                            selected={date}
                            onSelect={(range) => {
                                setDate(range);
                                if (range?.from && range?.to) {
                                    setIsCustomPickerOpen(false);
                                }
                            }}
                            numberOfMonths={2}
                        />
                    </PopoverContent>
                </Popover>
            </DropdownMenuContent>
        </DropdownMenu>
    </div>
  )
}
