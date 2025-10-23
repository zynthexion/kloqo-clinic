
'use client';

import { useState, Suspense, useRef, forwardRef } from "react";
import { format } from "date-fns";
import { useReactToPrint } from "react-to-print";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import OverviewStats from "@/components/dashboard/overview-stats";
import DoctorAvailability from "@/components/dashboard/doctor-availability";
import TodaysAppointments from "@/components/dashboard/todays-appointments";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Calendar } from "@/components/ui/calendar";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import type { DateRange } from "react-day-picker";
import { subDays } from 'date-fns';
import { Button } from "@/components/ui/button";
import { Printer, FileDown, Loader2 } from "lucide-react";
import AppointmentStatusChart from "@/components/dashboard/appointment-status-chart";
import PatientsVsAppointmentsChart from "@/components/dashboard/patients-vs-appointments-chart";
import PeakHoursChart from "@/components/dashboard/peak-hours-chart";
import { useSearchParams } from "next/navigation";


// A new component that correctly forwards the ref for printing.
const PrintableContent = forwardRef<HTMLDivElement, { children: React.ReactNode }>(({ children }, ref) => {
  return (
    <div ref={ref} className="flex-1 p-6 bg-background">
      {children}
    </div>
  );
});
PrintableContent.displayName = 'PrintableContent';


function DashboardPageContent() {
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: subDays(new Date(), 6),
    to: new Date(),
  });
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [isPrinting, setIsPrinting] = useState(false);
  
  const contentToPrintRef = useRef<HTMLDivElement>(null);

  const handlePrint = useReactToPrint({
    content: () => contentToPrintRef.current,
  });

  const handleDownloadPdf = async () => {
    const content = contentToPrintRef.current;
    if (!content) return;

    setIsPrinting(true);
    try {
      const canvas = await html2canvas(content, { scale: 2 });
      const imgData = canvas.toDataURL('image/png');
      
      const pdf = new jsPDF({
        orientation: 'landscape',
        unit: 'px',
        format: [canvas.width, canvas.height]
      });
      
      pdf.addImage(imgData, 'PNG', 0, 0, canvas.width, canvas.height);
      pdf.save(`dashboard-report-${format(new Date(), 'yyyy-MM-dd')}.pdf`);

    } catch (error) {
      console.error("Error generating PDF:", error);
    } finally {
      setIsPrinting(false);
    }
  };
  
  const handleDateSelect = (date: Date | undefined) => {
    if (date) {
      setSelectedDate(date);
    }
  };

  return (
    <>
      <header className="flex items-center justify-between gap-4 px-6 border-b py-6">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
        </div>
        <div className="flex items-center gap-4">
           <DateRangePicker 
              onDateChange={setDateRange}
              initialDateRange={dateRange}
           />
           <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" disabled={isPrinting} onClick={handlePrint}>
                  <Printer className="h-4 w-4" />
                  <span className="sr-only">Print</span>
              </Button>
              <Button variant="outline" size="icon" disabled={isPrinting} onClick={handleDownloadPdf}>
                  {isPrinting ? <Loader2 className="h-4 w-4 animate-spin"/> : <FileDown className="h-4 w-4" />}
                  <span className="sr-only">Download PDF</span>
              </Button>
           </div>
        </div>
      </header>

      <PrintableContent ref={contentToPrintRef}>
        <div className="space-y-6">
          <OverviewStats dateRange={dateRange} />
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-3">
                <AppointmentStatusChart dateRange={dateRange} />
            </div>
            <div className="lg:col-span-6">
                <PatientsVsAppointmentsChart dateRange={dateRange} />
            </div>
            <div className="lg:col-span-3">
               <Card className="h-full flex flex-col bg-[#dcf2eb] overflow-hidden">
                  <CardContent className="flex-grow flex items-center justify-center">
                      <Calendar
                          mode="single"
                          selected={selectedDate}
                          onSelect={handleDateSelect}
                          className="w-full border-0 shadow-none bg-transparent [&_button]:text-base [&_caption]:text-lg"
                      />
                  </CardContent>
                </Card>
            </div>
          </div>
           <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
             <div className="lg:col-span-1">
                <PeakHoursChart dateRange={dateRange} />
            </div>
            <div className="lg:col-span-1">
                <TodaysAppointments selectedDate={selectedDate} />
            </div>
            <div className="lg:col-span-1">
                <DoctorAvailability selectedDate={selectedDate} />
            </div>
          </div>
        </div>
      </PrintableContent>
    </>
  );
}


export default function DashboardPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <DashboardPageContent />
    </Suspense>
  )
}
