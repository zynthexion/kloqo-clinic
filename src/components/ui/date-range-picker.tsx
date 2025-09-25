
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  const handlePresetChange = (value: string) => {
    setPreset(value);
    setIsCustomPickerOpen(false);
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

  return (
    <div className={cn("grid gap-2", className)}>
        <Popover>
            <PopoverTrigger asChild>
                <Button
                    id="date"
                    variant={"outline"}
                    className={cn(
                        "w-[300px] justify-start text-left font-normal bg-[#E6F0F7]"
                    )}
                    >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    <span>
                        {date?.from ? (
                            date.to ? (
                                <>
                                {format(date.from, "LLL dd, y")} -{" "}
                                {format(date.to, "LLL dd, y")}
                                </>
                            ) : (
                                format(date.from, "LLL dd, y")
                            )
                        ) : (
                            "Pick a date"
                        )}
                    </span>
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
                <div className="flex">
                    <div className="w-48 border-r">
                        <div className="p-2">
                            {presets.map((p) => (
                                <Button 
                                    key={p.value} 
                                    variant="ghost"
                                    className="w-full justify-start"
                                    onClick={() => handlePresetChange(p.value)}
                                >
                                    {p.label}
                                </Button>
                            ))}
                        </div>
                    </div>
                    <Calendar
                        initialFocus
                        mode="range"
                        defaultMonth={date?.from}
                        selected={date}
                        onSelect={setDate}
                        numberOfMonths={2}
                    />
                </div>
            </PopoverContent>
        </Popover>
    </div>
  )
}
