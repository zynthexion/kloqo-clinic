"use client";

import { useState, useEffect, useMemo } from "react";
import { format, getDay, parse, addMinutes, isBefore, isAfter, startOfDay, isToday, differenceInMinutes } from "date-fns";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/firebase";
import { db } from "@/lib/firebase";
import { collection, query, where, orderBy, onSnapshot, doc, getDoc as getFirestoreDoc } from "firebase/firestore";
import type { Doctor, Appointment, Clinic } from "@/lib/types";
import { Loader2, Calendar as CalendarIcon } from "lucide-react";
import { cn, parseTime } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

// Generate slots with session index
function generateTimeSlotsWithSession(
  timeSlots: { from: string; to: string }[],
  referenceDate: Date,
  slotDuration: number
): { time: Date; sessionIndex: number }[] {
  const slots: { time: Date; sessionIndex: number }[] = [];
  timeSlots.forEach((slot, sessionIndex) => {
    const startTime = parseTime(slot.from, referenceDate);
    const endTime = parseTime(slot.to, referenceDate);
    let current = new Date(startTime);
    while (isBefore(current, endTime)) {
      slots.push({ time: new Date(current), sessionIndex });
      current = addMinutes(current, slotDuration);
    }
  });
  return slots;
}

// Group slots into 2-hour subsessions
function groupIntoSubsessions(
  slots: { time: Date; sessionIndex: number }[],
  sessionIndex: number,
  slotDuration: number // in minutes
): { time: Date; sessionIndex: number }[][] {
  const sessionSlots = slots.filter(s => s.sessionIndex === sessionIndex);
  const subsessions: { time: Date; sessionIndex: number }[][] = [];
  
  // Calculate how many slots make up 2 hours
  // 2 hours = 120 minutes, so slots per subsession = 120 / slotDuration
  const slotsPerSubsession = Math.floor(120 / slotDuration);
  
  for (let i = 0; i < sessionSlots.length; i += slotsPerSubsession) {
    subsessions.push(sessionSlots.slice(i, i + slotsPerSubsession));
  }
  
  return subsessions;
}

const daysOfWeek = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export default function SlotVisualizerPage() {
  const { currentUser } = useAuth();
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [selectedDoctorId, setSelectedDoctorId] = useState<string>("");
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [clinicDetails, setClinicDetails] = useState<Clinic | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  // Fetch clinic details and doctors
  useEffect(() => {
    if (!currentUser) {
      setLoading(false);
      return;
    }

    const fetchData = async () => {
      try {
        // Fetch user to get clinicId
        const userDoc = await getFirestoreDoc(doc(db, "users", currentUser.uid));
        if (!userDoc.exists()) {
          setLoading(false);
          return;
        }
        const userData = userDoc.data();
        
        if (!userData?.clinicId) {
          setLoading(false);
          return;
        }

        // Fetch clinic details
        const clinicDoc = await getFirestoreDoc(doc(db, "clinics", userData.clinicId));
        if (clinicDoc.exists()) {
          setClinicDetails({ id: clinicDoc.id, ...clinicDoc.data() } as Clinic);
        }

        // Fetch doctors
        const doctorsRef = collection(db, "doctors");
        const doctorsQuery = query(doctorsRef, where("clinicId", "==", userData.clinicId));
        const doctorsSnapshot = await import("firebase/firestore").then(m =>
          m.getDocs(doctorsQuery)
        );
        const doctorsList = doctorsSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
        })) as Doctor[];
        setDoctors(doctorsList);
        
        if (doctorsList.length > 0) {
          setSelectedDoctorId(doctorsList[0].id);
        }
      } catch (error) {
        console.error("Error fetching data:", error);
        toast({
          variant: "destructive",
          title: "Error",
          description: "Failed to load clinic and doctor data.",
        });
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [currentUser, toast]);

  // Fetch appointments for selected date and doctor
  useEffect(() => {
    if (!selectedDate || !selectedDoctorId) return;

    const formattedDate = format(selectedDate, "d MMMM yyyy");
    const selectedDoctor = doctors.find(d => d.id === selectedDoctorId);
    if (!selectedDoctor) return;

    const appointmentsRef = collection(db, "appointments");
    const appointmentsQuery = query(
      appointmentsRef,
      where("doctor", "==", selectedDoctor.name),
      where("date", "==", formattedDate),
      orderBy("slotIndex", "asc")
    );

    const unsubscribe = onSnapshot(appointmentsQuery, (snapshot) => {
      const apts = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      })) as Appointment[];
      setAppointments(apts);
    });

    return () => unsubscribe();
  }, [selectedDate, selectedDoctorId, doctors]);

  const selectedDoctor = doctors.find(d => d.id === selectedDoctorId);

  // Generate all slots for the selected date
  const allSlots = useMemo(() => {
    if (!selectedDoctor || !selectedDate) return [];

    const dayOfWeek = daysOfWeek[getDay(selectedDate)];
    const availabilityForDay = selectedDoctor.availabilitySlots?.find(s => s.day === dayOfWeek);
    if (!availabilityForDay?.timeSlots) return [];

    const slotDuration = selectedDoctor.averageConsultingTime || 15;
    return generateTimeSlotsWithSession(availabilityForDay.timeSlots, selectedDate, slotDuration);
  }, [selectedDoctor, selectedDate]);

  // Get appointment status for a slot
  const getSlotStatus = (slotIndex: number) => {
    const appointment = appointments.find(apt => apt.slotIndex === slotIndex);
    if (!appointment) {
      return { type: "available", appointment: null };
    }

    const status = appointment.status;
    const bookedVia = appointment.bookedVia || "Advanced Booking";

    if (status === "Skipped") {
      return { type: "skipped", appointment };
    }
    if (status === "Completed") {
      return { type: "completed", appointment };
    }
    if (status === "No-show") {
      return { type: "vacant", appointment };
    }
    if (status === "Cancelled") {
      return { type: "cancelled", appointment };
    }
    if (bookedVia === "Walk-in") {
      return { type: "walkin", appointment };
    }
    return { type: "advanced", appointment };
  };

  // Calculate last A token slotIndex
  const lastAdvancedSlotIndex = useMemo(() => {
    const advancedAppointments = appointments.filter(
      apt => apt.bookedVia !== "Walk-in" && 
      (apt.status === "Pending" || apt.status === "Confirmed")
    );
    if (advancedAppointments.length === 0) return -1;
    return Math.max(...advancedAppointments.map(a => a.slotIndex ?? -1));
  }, [appointments]);

  // Calculate reference point for walk-ins
  const walkInReferenceSlot = useMemo(() => {
    const walkInAppointments = appointments.filter(
      apt => apt.bookedVia === "Walk-in" && apt.status !== "Skipped"
    );
    if (walkInAppointments.length === 0) return null;
    const futureWalkIns = walkInAppointments.filter(w => {
      const slotIndex = w.slotIndex ?? -1;
      if (slotIndex < 0 || slotIndex >= allSlots.length) return false;
      const slot = allSlots[slotIndex];
      return slot && (isAfter(slot.time, new Date()) || slot.time.getTime() === new Date().getTime());
    });
    if (futureWalkIns.length === 0) return null;
    return futureWalkIns.sort((a, b) => (b.slotIndex ?? 0) - (a.slotIndex ?? 0))[0];
  }, [appointments, allSlots]);

  // Calculate current delay
  const currentDelay = useMemo(() => {
    if (!selectedDoctor || !isToday(selectedDate)) return null;

    const now = new Date();
    const activeAppointments = appointments.filter(
      apt => (apt.status === "Pending" || apt.status === "Confirmed") &&
      apt.slotIndex !== undefined && apt.slotIndex >= 0 &&
      apt.slotIndex < allSlots.length
    );

    if (activeAppointments.length === 0) return null;

    // Find the current/next appointment
    let currentOrNextAppointment = activeAppointments.find(apt => {
      const slotIndex = apt.slotIndex!;
      const slot = allSlots[slotIndex];
      if (!slot) return false;
      // Appointment that hasn't started yet or is currently happening
      return isAfter(slot.time, now) || (isBefore(slot.time, now) && !apt.status.includes("Completed"));
    });

    if (!currentOrNextAppointment || currentOrNextAppointment.slotIndex === undefined) {
      // Find the earliest future appointment
      const futureAppointments = activeAppointments
        .filter(apt => {
          const slotIndex = apt.slotIndex!;
          const slot = allSlots[slotIndex];
          return slot && isAfter(slot.time, now);
        })
        .sort((a, b) => (a.slotIndex ?? 0) - (b.slotIndex ?? 0));

      if (futureAppointments.length === 0) return null;
      currentOrNextAppointment = futureAppointments[0];
    }

    const slotIndex = currentOrNextAppointment.slotIndex!;
    const slot = allSlots[slotIndex];
    if (!slot) return null;

    const expectedTime = slot.time;
    const delay = differenceInMinutes(now, expectedTime);

    return {
      appointment: currentOrNextAppointment,
      expectedTime,
      delayMinutes: delay,
      slotIndex,
    };
  }, [appointments, allSlots, selectedDoctor, selectedDate]);

  // Get subsessions for each session
  const sessionSlots = useMemo(() => {
    if (!selectedDoctor || !selectedDate || allSlots.length === 0) return [];

    const dayOfWeek = daysOfWeek[getDay(selectedDate)];
    const availabilityForDay = selectedDoctor.availabilitySlots?.find(s => s.day === dayOfWeek);
    if (!availabilityForDay?.timeSlots) return [];

    const slotDuration = selectedDoctor.averageConsultingTime || 15;
    const sessions: Array<{
      sessionIndex: number;
      title: string;
      subsessions: Array<{
        subsessionIndex: number;
        slots: Array<{ slotIndex: number; time: Date; sessionIndex: number }>;
      }>;
    }> = [];

    availabilityForDay.timeSlots.forEach((timeSlot, sessionIndex) => {
      const subsessions = groupIntoSubsessions(allSlots, sessionIndex, slotDuration);
      const sessionTitle = `Session ${sessionIndex + 1} (${timeSlot.from} - ${timeSlot.to})`;

      const subsessionData = subsessions.map((subsession, subsessionIndex) => ({
        subsessionIndex,
        slots: subsession.map((slot, idx) => {
          const slotIndex = allSlots.findIndex(s => 
            s.time.getTime() === slot.time.getTime() && s.sessionIndex === slot.sessionIndex
          );
          return {
            slotIndex,
            time: slot.time,
            sessionIndex: slot.sessionIndex,
          };
        }).filter(s => s.slotIndex >= 0),
      }));

      sessions.push({
        sessionIndex,
        title: sessionTitle,
        subsessions: subsessionData,
      });
    });

    return sessions;
  }, [selectedDoctor, selectedDate, allSlots]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto p-6">
      <Card>
        <CardHeader>
          <CardTitle>Slot Visualizer</CardTitle>
          <CardDescription>
            Visualize slot assignments and token distribution for testing purposes
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Current Delay Indicator */}
          {currentDelay && (
            <Card className={cn(
              "p-4",
              currentDelay.delayMinutes > 0 
                ? "bg-red-50 border-red-200 dark:bg-red-950/20 dark:border-red-800"
                : "bg-green-50 border-green-200 dark:bg-green-950/20 dark:border-green-800"
            )}>
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-semibold text-sm text-muted-foreground mb-1">Current Status</h4>
                  <div className="flex items-center gap-4">
                    <div>
                      <span className="text-xs text-muted-foreground">Expected Time:</span>
                      <span className="ml-2 font-semibold">{format(currentDelay.expectedTime, "hh:mm a")}</span>
                    </div>
                    <div>
                      <span className="text-xs text-muted-foreground">Current Time:</span>
                      <span className="ml-2 font-semibold">{format(new Date(), "hh:mm a")}</span>
                    </div>
                    <div>
                      <span className="text-xs text-muted-foreground">Delay:</span>
                      <span className={cn(
                        "ml-2 font-bold text-lg",
                        currentDelay.delayMinutes > 0 ? "text-red-600" : "text-green-600"
                      )}>
                        {currentDelay.delayMinutes > 0 ? `+${currentDelay.delayMinutes}` : currentDelay.delayMinutes} min
                      </span>
                    </div>
                    {currentDelay.appointment && (
                      <div>
                        <span className="text-xs text-muted-foreground">Token:</span>
                        <span className="ml-2 font-semibold">{currentDelay.appointment.tokenNumber || `#${currentDelay.slotIndex + 1}`}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </Card>
          )}

          {/* Controls */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Select Doctor</label>
              <Select value={selectedDoctorId} onValueChange={setSelectedDoctorId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a doctor" />
                </SelectTrigger>
                <SelectContent>
                  {doctors.map(doctor => (
                    <SelectItem key={doctor.id} value={doctor.id}>
                      {doctor.name} - {doctor.specialty}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Select Date</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !selectedDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {selectedDate ? format(selectedDate, "PPP") : <span>Pick a date</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={selectedDate}
                    onSelect={(date) => date && setSelectedDate(date)}
                    disabled={(date) => isBefore(date, startOfDay(new Date()))}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>

          {/* Legend */}
          <div className="flex flex-wrap gap-4 p-4 bg-muted/50 rounded-lg">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 border-2 border-gray-300 bg-white rounded" />
              <span className="text-sm">Available</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-blue-500 rounded" />
              <span className="text-sm">A Token</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-green-500 rounded" />
              <span className="text-sm">W Token</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-yellow-500 rounded" />
              <span className="text-sm">Skipped</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-gray-400 rounded" />
              <span className="text-sm">Completed</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-green-200 border-2 border-green-400 rounded" />
              <span className="text-sm">Vacant</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-red-300 border-2 border-red-500 rounded" />
              <span className="text-sm">Cancelled</span>
            </div>
            {lastAdvancedSlotIndex >= 0 && (
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 border-4 border-blue-700 bg-transparent rounded" />
                <span className="text-sm">Last A Token</span>
              </div>
            )}
            {walkInReferenceSlot && (
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 border-4 border-green-700 bg-transparent rounded" />
                <span className="text-sm">W Reference</span>
              </div>
            )}
          </div>

          {/* Slots Display */}
          {selectedDoctor && sessionSlots.length > 0 ? (
            <div className="space-y-4">
              {sessionSlots.map((session) => (
                <div key={session.sessionIndex} className="space-y-4">
                  {session.subsessions.map((subsession) => {
                    const firstSlot = subsession.slots[0];
                    const lastSlot = subsession.slots[subsession.slots.length - 1];
                    const subsessionTitle = firstSlot && lastSlot
                      ? `${format(firstSlot.time, "hh:mm a")} - ${format(lastSlot.time, "hh:mm a")}`
                      : `Subsession ${subsession.subsessionIndex + 1}`;

                    // Calculate dynamic grid columns based on number of slots
                    const slotCount = subsession.slots.length;
                    // Use responsive grid that wraps naturally
                    // For 2-hour subsessions: typically 8 slots (15 min), 6 slots (20 min), 4 slots (30 min), etc.

                    return (
                      <Card key={`${session.sessionIndex}-${subsession.subsessionIndex}`} className="p-4">
                        <div className="mb-3">
                          <h4 className="text-base font-semibold">
                            {subsessionTitle} <span className="text-sm text-muted-foreground font-normal">({slotCount} slots, 2 hours)</span>
                          </h4>
                        </div>
                        <div 
                          className="grid gap-2"
                          style={{ gridTemplateColumns: `repeat(${slotCount <= 12 ? slotCount : 12}, minmax(0, 1fr))` }}
                        >
                          {subsession.slots.map((slot) => {
                            const status = getSlotStatus(slot.slotIndex);
                            const isLastA = slot.slotIndex === lastAdvancedSlotIndex;
                            const isWRef = walkInReferenceSlot && slot.slotIndex === walkInReferenceSlot.slotIndex;

                            return (
                              <div
                                key={slot.slotIndex}
                                className={cn(
                                  "relative p-3 border-2 rounded-lg text-center min-h-[80px] flex flex-col items-center justify-center",
                                  status.type === "available" && "border-gray-300 bg-white",
                                  status.type === "advanced" && "bg-blue-500 text-white border-blue-600",
                                  status.type === "walkin" && "bg-green-500 text-white border-green-600",
                                  status.type === "skipped" && "bg-yellow-500 text-white border-yellow-600",
                                  status.type === "completed" && "bg-gray-400 text-white border-gray-500",
                                  status.type === "vacant" && "bg-green-200 border-green-400",
                                  status.type === "cancelled" && "bg-red-300 border-red-500 text-red-900",
                                  isLastA && "border-blue-700 border-4",
                                  isWRef && "border-green-700 border-4"
                                )}
                              >
                                <div className="text-xs font-bold mb-1">
                                  #{slot.slotIndex}
                                </div>
                                <div className="text-xs mb-1">
                                  {format(slot.time, "hh:mm a")}
                                </div>
                                {status.appointment && (
                                  <>
                                    <div className="text-xs font-semibold">
                                      {status.appointment.tokenNumber || `T${slot.slotIndex + 1}`}
                                    </div>
                                    <div className="text-xs truncate w-full">
                                      {status.appointment.patientName?.split(" ")[0] || "N/A"}
                                    </div>
                                  </>
                                )}
                                {(isLastA || isWRef) && (
                                  <div className="absolute -top-2 -right-2">
                                    <Badge
                                      variant="outline"
                                      className={cn(
                                        "text-xs",
                                        isLastA && "bg-blue-700 text-white border-blue-800",
                                        isWRef && "bg-green-700 text-white border-green-800"
                                      )}
                                    >
                                      {isLastA ? "A" : "W"}
                                    </Badge>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </Card>
                    );
                  })}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              {!selectedDoctor
                ? "Please select a doctor"
                : !selectedDate
                ? "Please select a date"
                : "No slots available for this date"}
            </div>
          )}

          {/* Statistics */}
          {appointments.length > 0 && (
            <Card className="p-4">
              <h4 className="font-semibold mb-3">Statistics</h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <div className="text-muted-foreground">Total Appointments</div>
                  <div className="text-2xl font-bold">{appointments.length}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">A Tokens</div>
                  <div className="text-2xl font-bold text-blue-600">
                    {appointments.filter(a => a.bookedVia !== "Walk-in").length}
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground">W Tokens</div>
                  <div className="text-2xl font-bold text-green-600">
                    {appointments.filter(a => a.bookedVia === "Walk-in").length}
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground">Available Slots</div>
                  <div className="text-2xl font-bold text-gray-600">
                    {allSlots.length - appointments.filter(a => 
                      a.status === "Pending" || a.status === "Confirmed"
                    ).length}
                  </div>
                </div>
              </div>
            </Card>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

