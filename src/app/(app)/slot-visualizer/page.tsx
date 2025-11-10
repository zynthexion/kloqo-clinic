"use client";

import { useEffect, useMemo, useState } from "react";
import { addMinutes, format, getDay, isAfter, isBefore, startOfDay } from "date-fns";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/firebase";
import { db } from "@/lib/firebase";
import { collection, doc, getDoc, getDocs, onSnapshot, orderBy, query, where } from "firebase/firestore";
import type { Appointment, Doctor } from "@/lib/types";
import { Loader2, Calendar as CalendarIcon } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn, parseTime } from "@/lib/utils";
import { Progress } from "@/components/ui/progress";

const daysOfWeek = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
type SessionOption = {
  index: number;
  label: string;
  from: string;
  to: string;
};

type SessionSlot = {
  slotIndex: number;
  time: Date;
  appointment?: Appointment;
};

type DaySlot = {
  slotIndex: number;
  time: Date;
  sessionIndex: number;
};

export default function SlotVisualizerPage() {
  const { currentUser } = useAuth();
  const { toast } = useToast();

  const [clinicName, setClinicName] = useState<string | null>(null);
  const [walkInSpacing, setWalkInSpacing] = useState<number | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [selectedDoctorId, setSelectedDoctorId] = useState<string>("");
  const [selectedSessionIndex, setSelectedSessionIndex] = useState<number>(0);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!currentUser) {
      setLoading(false);
      return;
    }

    let isCancelled = false;

    const loadInitialData = async () => {
      try {
        const userSnap = await getDoc(doc(db, "users", currentUser.uid));
        if (!userSnap.exists()) {
          return;
        }
        
        const clinicId = userSnap.data()?.clinicId;
        if (!clinicId) {
          return;
        }

        const clinicSnap = await getDoc(doc(db, "clinics", clinicId));
        if (clinicSnap.exists()) {
          const clinicData = clinicSnap.data();
          setClinicName(clinicData?.name ?? null);
          const spacingValue = Number(clinicData?.walkInTokenAllotment ?? 0);
          setWalkInSpacing(Number.isFinite(spacingValue) && spacingValue > 0 ? spacingValue : null);
        } else {
          setWalkInSpacing(null);
        }

        const doctorsQuery = query(
          collection(db, "doctors"),
          where("clinicId", "==", clinicId),
        );

        const doctorsSnap = await getDocs(doctorsQuery);
        if (isCancelled) return;

        const doctorsList = doctorsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Doctor));
        setDoctors(doctorsList);
        
        if (doctorsList.length > 0) {
          setSelectedDoctorId(prev => prev || doctorsList[0].id);
        }
      } catch (error) {
        console.error("Failed to load slot visualizer data:", error);
        toast({
          variant: "destructive",
          title: "Unable to load data",
          description: "We couldn't load the information needed for the slot visualizer.",
        });
      } finally {
        if (!isCancelled) {
        setLoading(false);
        }
      }
    };

    loadInitialData();

    return () => {
      isCancelled = true;
    };
  }, [currentUser, toast]);

  useEffect(() => {
    if (!selectedDoctorId) {
      setAppointments([]);
      return;
    }

    const doctor = doctors.find(d => d.id === selectedDoctorId);
    if (!doctor) {
      setAppointments([]);
      return;
    }

    const formattedDate = format(selectedDate, "d MMMM yyyy");
    const appointmentsQuery = query(
      collection(db, "appointments"),
      where("doctor", "==", doctor.name),
      where("date", "==", formattedDate),
      orderBy("slotIndex", "asc"),
    );

    const unsubscribe = onSnapshot(appointmentsQuery, snapshot => {
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Appointment));
      setAppointments(docs);
    });

    return () => unsubscribe();
  }, [selectedDoctorId, selectedDate, doctors]);

  useEffect(() => {
    if (selectedDoctorId) return;
    if (doctors.length === 0) return;
    setSelectedDoctorId(doctors[0].id);
  }, [doctors, selectedDoctorId]);

  const selectedDoctor = useMemo(
    () => doctors.find(d => d.id === selectedDoctorId) ?? null,
    [doctors, selectedDoctorId],
  );

  const availableSessions: SessionOption[] = useMemo(() => {
    if (!selectedDoctor) return [];
    const dayOfWeek = daysOfWeek[getDay(selectedDate)];
    const availabilityForDay = selectedDoctor.availabilitySlots?.find(slot => slot.day === dayOfWeek);
    if (!availabilityForDay?.timeSlots) return [];
    
    return availabilityForDay.timeSlots.map((slot, index) => ({
      index,
      label: `Session ${index + 1} (${slot.from} – ${slot.to})`,
      from: slot.from,
      to: slot.to,
    }));
  }, [selectedDoctor, selectedDate]);

  useEffect(() => {
    if (availableSessions.length === 0) {
      setSelectedSessionIndex(0);
      return;
    }

    if (selectedSessionIndex >= availableSessions.length) {
      setSelectedSessionIndex(0);
    }
  }, [availableSessions, selectedSessionIndex]);

  const appointmentsBySlot = useMemo(() => {
    const map = new Map<number, Appointment>();
    appointments.forEach(appointment => {
      if (typeof appointment.slotIndex === "number" && !map.has(appointment.slotIndex)) {
        map.set(appointment.slotIndex, appointment);
      }
    });
    return map;
  }, [appointments]);

const fullDaySlots: DaySlot[] = useMemo(() => {
  if (!selectedDoctor) return [];
  const dayOfWeek = daysOfWeek[getDay(selectedDate)];
  const availabilityForDay = selectedDoctor.availabilitySlots?.find(slot => slot.day === dayOfWeek);
  if (!availabilityForDay?.timeSlots) return [];

  const slotDuration = selectedDoctor.averageConsultingTime || 15;
  const slots: DaySlot[] = [];
  let slotIndex = 0;

  availabilityForDay.timeSlots.forEach((session, sessionIndex) => {
    let currentTime = parseTime(session.from, selectedDate);
                  const sessionEnd = parseTime(session.to, selectedDate);
                  
    while (isBefore(currentTime, sessionEnd)) {
      slots.push({
        slotIndex,
        time: new Date(currentTime),
        sessionIndex,
      });
      currentTime = addMinutes(currentTime, slotDuration);
      slotIndex += 1;
    }
  });

  return slots;
}, [selectedDoctor, selectedDate]);

const sessionSlots: SessionSlot[] = useMemo(() => {
  if (!selectedDoctor) return [];
  const session = availableSessions[selectedSessionIndex];
  if (!session) return [];

  return fullDaySlots
    .filter(slot => slot.sessionIndex === session.index)
    .map(slot => ({
      slotIndex: slot.slotIndex,
      time: slot.time,
      appointment: appointmentsBySlot.get(slot.slotIndex),
    }));
}, [availableSessions, appointmentsBySlot, fullDaySlots, selectedDoctor, selectedSessionIndex]);

const futureSessionSlots = useMemo(() => {
  const current = new Date();
  return sessionSlots.filter(slot => !isBefore(slot.time, current));
}, [sessionSlots]);

const sessionSummary = useMemo(() => {
  let walkIn = 0;
  let advanced = 0;
  futureSessionSlots.forEach(slot => {
    if (!slot.appointment) return;
    if (slot.appointment.bookedVia === "Walk-in") {
      walkIn += 1;
    } else {
      advanced += 1;
    }
  });

  const total = futureSessionSlots.length;
  const booked = walkIn + advanced;
  const available = Math.max(total - booked, 0);

  return { total, booked, available, walkIn, advanced };
}, [futureSessionSlots]);

const capacityInfo = useMemo(() => {
  const total = sessionSummary.total;
  const reservedMinimum = total > 0 ? Math.ceil(total * 0.15) : 0;
  const maxAdvance = Math.max(total - reservedMinimum, 0);
  const advance = sessionSummary.advanced;
  const walkIn = sessionSummary.walkIn;
  const advancePercent = total > 0 ? (advance / total) * 100 : 0;
  const walkInPercent = total > 0 ? (walkIn / total) * 100 : 0;
  const remainingAdvance = Math.max(maxAdvance - advance, 0);
  const limitReached = maxAdvance > 0 && advance >= maxAdvance;

  return {
    total,
    reservedMinimum,
    maxAdvance,
    advancePercent,
    walkInPercent,
    remainingAdvance,
    limitReached,
  };
}, [sessionSummary]);

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
          <CardTitle className="flex flex-col gap-1">
            <span>Slot Visualizer</span>
            {clinicName && <span className="text-sm font-normal text-muted-foreground">{clinicName}</span>}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <label className="text-sm font-medium">Select Doctor</label>
              <Select value={selectedDoctorId} onValueChange={setSelectedDoctorId} disabled={doctors.length === 0}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a doctor" />
                </SelectTrigger>
                <SelectContent>
                  {doctors.map(doctor => (
                    <SelectItem key={doctor.id} value={doctor.id}>
                      {doctor.name}
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
                      !selectedDate && "text-muted-foreground",
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {selectedDate ? format(selectedDate, "PPP") : "Pick a date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={selectedDate}
                    onSelect={date => date && setSelectedDate(date)}
                    disabled={date => isBefore(date, startOfDay(new Date()))}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Select Session</label>
                <Select 
                  value={selectedSessionIndex.toString()} 
                onValueChange={value => setSelectedSessionIndex(Number.parseInt(value, 10))}
                disabled={availableSessions.length === 0}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a session" />
                  </SelectTrigger>
                  <SelectContent>
                  {availableSessions.length === 0 ? (
                    <SelectItem value="0" disabled>
                      No sessions
                    </SelectItem>
                  ) : (
                    availableSessions.map(session => (
                      <SelectItem key={session.index} value={session.index.toString()}>
                        {session.label}
                      </SelectItem>
                    ))
                  )}
                  </SelectContent>
                </Select>
              </div>
          </div>

          <div className="space-y-4">
            {!selectedDoctor && (
              <p className="text-sm text-muted-foreground">Add a doctor to view slots for this clinic.</p>
            )}

            {selectedDoctor && availableSessions.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No availability configured for {format(selectedDate, "PPP")}. Update the doctor’s schedule to see slots.
              </p>
            )}

            {selectedDoctor && availableSessions.length > 0 && (
              <div className="overflow-hidden rounded-md border">
                <div className="grid gap-3 border-b bg-muted/30 p-4 text-sm md:grid-cols-4">
                  <div>
                    <p className="text-xs uppercase text-muted-foreground">Upcoming slots</p>
                    <p className="text-xl font-semibold">{sessionSummary.total}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase text-muted-foreground">Advance bookings</p>
                    <p className="text-xl font-semibold">{sessionSummary.advanced}</p>
                    <span className="text-xs text-muted-foreground">
                      {capacityInfo.maxAdvance > 0
                        ? `${sessionSummary.advanced} / ${capacityInfo.maxAdvance} capacity`
                        : "Advance quota unavailable"}
                    </span>
                  </div>
                  <div>
                    <p className="text-xs uppercase text-muted-foreground">Walk-in bookings</p>
                    <p className="text-xl font-semibold">{sessionSummary.walkIn}</p>
                    <span className="text-xs text-muted-foreground">
                      Minimum reserve: {capacityInfo.reservedMinimum} slot{capacityInfo.reservedMinimum === 1 ? "" : "s"}
                    </span>
                  </div>
                  <div>
                    <p className="text-xs uppercase text-muted-foreground">Available</p>
                    <p className="text-xl font-semibold">{sessionSummary.available}</p>
                    <span className="text-xs text-muted-foreground">{sessionSummary.booked} booked so far</span>
                    </div>
                  </div>
                <div className="grid gap-4 border-b bg-muted/20 px-4 py-3 text-xs text-muted-foreground md:grid-cols-2">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs font-medium text-foreground">
                      <span className="flex items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-full bg-sky-500" />
                        Advanced (max 85%)
                      </span>
                      <span>
                        {sessionSummary.advanced}
                        {capacityInfo.maxAdvance > 0 ? ` / ${capacityInfo.maxAdvance}` : ""}
                        {capacityInfo.total > 0 ? ` · ${Math.round(capacityInfo.advancePercent)}%` : ""}
                      </span>
                </div>
                    <Progress value={Math.min(capacityInfo.advancePercent, 100)} className="h-2" />
                    {capacityInfo.maxAdvance === 0 ? (
                      <p className="text-[11px] text-muted-foreground">
                        No advance capacity configured for this session.
                      </p>
                    ) : capacityInfo.limitReached ? (
                      <p className="text-[11px] text-destructive">
                        Advance booking limit reached. Convert new tokens to walk-ins.
                      </p>
                    ) : (
                      <p className="text-[11px] text-muted-foreground">
                        {capacityInfo.remainingAdvance} advance slot(s) remaining before reaching the limit.
                      </p>
                    )}
                                      </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs font-medium text-foreground">
                      <span className="flex items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                        Walk-ins
                      </span>
                      <span>
                        {sessionSummary.walkIn}
                        {capacityInfo.total > 0 ? ` · ${Math.round(capacityInfo.walkInPercent)}%` : ""}
                      </span>
                                    </div>
                    <Progress value={Math.min(capacityInfo.walkInPercent, 100)} className="h-2" />
                    <p className="text-[11px] text-muted-foreground">
                      Walk-ins have a minimum reserve of {capacityInfo.reservedMinimum} slot
                      {capacityInfo.reservedMinimum === 1 ? "" : "s"} but can use any additional capacity.
                    </p>
                                    </div>
                                      </div>
                {futureSessionSlots.length === 0 ? (
                  <div className="px-4 py-6 text-center text-sm text-muted-foreground">
                    No slots found for this session.
                                  </div>
                                ) : (
                  <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
                    {futureSessionSlots.map(slot => {
                      const appointment = slot.appointment;
                      const isBooked = Boolean(appointment);
                      const isWalkIn = appointment?.bookedVia === "Walk-in";
                      const cardStyles = cn(
                        "relative flex flex-col gap-2 rounded-lg border p-3 text-xs shadow-sm transition md:text-sm",
                        isBooked
                          ? isWalkIn
                            ? "border-emerald-300 bg-emerald-50 hover:border-emerald-400 hover:bg-emerald-50/80"
                            : "border-sky-300 bg-sky-50 hover:border-sky-400 hover:bg-sky-50/80"
                          : "border-muted bg-background hover:border-muted-foreground/40",
                      );
                        
                        return (
                        <div key={slot.slotIndex} className={cardStyles}>
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex flex-col">
                              <span className="text-xs uppercase text-muted-foreground">Slot</span>
                              <span className="text-lg font-semibold">#{slot.slotIndex + 1}</span>
                              </div>
                            <Badge variant="outline">{format(slot.time, "hh:mm a")}</Badge>
                              </div>
                      
                          <div className="flex items-center justify-between text-xs">
                            <span
                              className={cn(
                                "font-medium",
                                isBooked ? "text-foreground" : "text-muted-foreground",
                              )}
                            >
                              {isBooked ? "Booked" : "Available"}
                                </span>
                            {appointment?.tokenNumber && (
                              <span className="rounded-full bg-foreground/10 px-2 py-0.5 font-medium text-foreground">
                                {appointment.tokenNumber}
                                </span>
                              )}
                                </div>

                          <div className="min-h-[2.5rem] text-sm">
                            {isBooked ? (
                              <div className="flex flex-col gap-1">
                                <p className="font-medium leading-tight">
                                  {appointment?.patientName ?? "Unknown patient"}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {appointment?.communicationPhone ?? "—"}
                                </p>
            </div>
          ) : (
                              <p className="text-xs text-muted-foreground">No patient assigned</p>
                            )}
                          </div>

                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              {appointment ? (
                                <Badge variant={isWalkIn ? "success" : "secondary"}>
                                  {isWalkIn ? "Walk-in booking" : "Advanced booking"}
                      </Badge>
                              ) : (
                                <Badge variant="outline">Available</Badge>
                              )}
              </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                )}
                <div className="flex flex-wrap items-center gap-4 border-t bg-muted/20 px-4 py-3 text-xs text-muted-foreground">
                              <div className="flex items-center gap-2">
                    <span className="h-3 w-3 rounded border border-sky-400 bg-sky-100" />
                    <span>Advanced booking</span>
                              </div>
                  <div className="flex items-center gap-2">
                    <span className="h-3 w-3 rounded border border-emerald-400 bg-emerald-100" />
                    <span>Walk-in booking</span>
                            </div>
                  <div className="flex items-center gap-2">
                    <span className="h-3 w-3 rounded border border-muted bg-background" />
                    <span>Available slot</span>
                                </div>
                            </div>
                      </div>
                    )}
                </div>
        </CardContent>
      </Card>
    </div>
  );
}

