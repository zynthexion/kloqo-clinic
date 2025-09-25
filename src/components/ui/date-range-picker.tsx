
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
} from "@/components/ui/dropdown-menu"

interface DateRangePickerProps extends React.HTMLAttributes<HTMLDivElement> {
    initialDateRange?: DateRange;
    onDateChange: (dateRange: DateRange | undefined) => void;
}

const presets = [
    { value: "today", label: "Today" },
    { value: "last7", label: "Last 7 days" },
    { value: "this_month", label: "This month" },
    { value: "last_month", label: "Last month" },
    { value: "this_year", label: "This year" },
    { value: "last_year", label: "Last year" },
    { value: "custom", label: "Custom" },
]

export function DateRangePicker({ className, initialDateRange, onDateChange }: DateRangePickerProps) {
  const [date, setDate] = React.useState<DateRange | undefined>(initialDateRange)
  const [preset, setPreset] = React.useState<string>("last7");
  const [isCustomPickerOpen, setIsCustomPickerOpen] = React.useState(false);

  React.useEffect(() => {
    setDate(initialDateRange);
    // You might want to add logic here to determine the preset based on the initialDateRange
  }, [initialDateRange]);

  React.useEffect(() => {
    if (date) {
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
      case "custom":
        setIsCustomPickerOpen(true);
        break;
      default:
        setDate(undefined);
        break;
    }
  };

  const getPresetLabel = (value: string) => {
    return presets.find(p => p.value === value)?.label || "Select date range";
  }

  const CustomDatePopover = ({ children }: { children: React.ReactNode }) => (
    <Popover open={isCustomPickerOpen} onOpenChange={setIsCustomPickerOpen}>
        <PopoverTrigger asChild>
            {children}
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
            <Calendar
                initialFocus
                mode="range"
                defaultMonth={date?.from}
                selected={date}
                onSelect={(range) => {
                    setDate(range);
                    if (range) setIsCustomPickerOpen(false);
                }}
                numberOfMonths={2}
            />
        </PopoverContent>
    </Popover>
  );

  return (
    <div className={cn("grid gap-2", className)}>
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button
                    variant={"outline"}
                    className={cn(
                    "w-[200px] justify-between text-left font-normal bg-[#E6F0F7]",
                    !date && "text-muted-foreground"
                    )}
                >
                    <div className="flex items-center">
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        <span>
                            {preset === 'custom' && date?.from && date?.to
                                ? `${format(date.from, "LLL dd, y")} - ${format(date.to, "LLL dd, y")}`
                                : getPresetLabel(preset)
                            }
                        </span>
                    </div>
                    <ChevronDown className="h-4 w-4 opacity-50" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56">
                {presets.map(p => (
                    p.value === 'custom' ? (
                        <CustomDatePopover key={p.value}>
                            <DropdownMenuItem onSelect={(e) => { e.preventDefault(); handlePresetChange('custom'); }}>
                                <div className={cn("flex w-full items-center justify-between", preset === p.value && "font-semibold")}>
                                    {p.label}
                                    {preset === p.value && <Check className="h-4 w-4" />}
                                </div>
                            </DropdownMenuItem>
                        </CustomDatePopover>
                    ) : (
                        <DropdownMenuItem key={p.value} onSelect={() => handlePresetChange(p.value)}>
                             <div className={cn("flex w-full items-center justify-between", preset === p.value && "font-semibold")}>
                                {p.label}
                                {preset === p.value && <Check className="h-4 w-4" />}
                            </div>
                        </DropdownMenuItem>
                    )
                ))}
            </DropdownMenuContent>
        </DropdownMenu>
    </div>
  )
}
