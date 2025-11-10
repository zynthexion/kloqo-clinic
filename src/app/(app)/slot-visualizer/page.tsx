"use client";

import { useState, useEffect, useMemo } from "react";
import { format, getDay, parse, addMinutes, subMinutes, isBefore, isAfter, startOfDay, isToday, differenceInMinutes, isSameMinute } from "date-fns";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/firebase";
import { db } from "@/lib/firebase";
import { collection, query, where, orderBy, onSnapshot, doc, getDoc as getFirestoreDoc, getDocs } from "firebase/firestore";
import type { Doctor, Appointment, Clinic } from "@/lib/types";
import { Loader2, Calendar as CalendarIcon, Users, Clock, UserCheck, UserX, Stethoscope } from "lucide-react";
import { cn, parseTime } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { computeQueues, type QueueState } from "@/lib/queue-management-service";

const daysOfWeek = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export default function SlotVisualizerPage() {
  const { currentUser } = useAuth();
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [selectedDoctorId, setSelectedDoctorId] = useState<string>("");
  const [selectedSessionIndex, setSelectedSessionIndex] = useState<number>(0);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [clinicDetails, setClinicDetails] = useState<Clinic | null>(null);
  const [loading, setLoading] = useState(true);
  const [queueState, setQueueState] = useState<QueueState | null>(null);
  const [currentTime, setCurrentTime] = useState<Date>(new Date());
  const { toast } = useToast();
  
  // Update current time every minute to recalculate which slots are past
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000); // Update every minute
    
    return () => clearInterval(interval);
  }, []);

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

  // Compute queues for the selected doctor/date/session
  useEffect(() => {
    if (!selectedDoctorId || !selectedDate || appointments.length === 0) {
      setQueueState(null);
      return;
    }

    const selectedDoctor = doctors.find(d => d.id === selectedDoctorId);
    if (!selectedDoctor || !clinicDetails) return;

    const formattedDate = format(selectedDate, "d MMMM yyyy");

    const computeQueue = async () => {
      try {
        const state = await computeQueues(
          appointments,
          selectedDoctor.name,
          selectedDoctor.id,
          clinicDetails.id,
          formattedDate,
          selectedSessionIndex
        );
        setQueueState(state);
      } catch (error) {
        console.error("Error computing queues:", error);
        setQueueState(null);
      }
    };

    computeQueue();
  }, [selectedDoctorId, selectedDate, selectedSessionIndex, appointments, doctors, clinicDetails]);

  const selectedDoctor = doctors.find(d => d.id === selectedDoctorId);

  // Get available sessions for the selected doctor and date
  const availableSessions = useMemo(() => {
    if (!selectedDoctor || !selectedDate) return [];
    
    const dayOfWeek = daysOfWeek[getDay(selectedDate)];
    const availabilityForDay = selectedDoctor.availabilitySlots?.find(s => s.day === dayOfWeek);
    if (!availabilityForDay?.timeSlots) return [];
    
    return availabilityForDay.timeSlots.map((slot, index) => ({
      index,
      label: `Session ${index + 1} (${slot.from} - ${slot.to})`,
      from: slot.from,
      to: slot.to,
    }));
  }, [selectedDoctor, selectedDate]);

  // Reset session index when doctor or date changes
  useEffect(() => {
    if (availableSessions.length > 0 && selectedSessionIndex >= availableSessions.length) {
      setSelectedSessionIndex(0);
    }
  }, [availableSessions, selectedSessionIndex]);

  // Filter appointments by selected session index
  const filteredAppointments = useMemo(() => {
    if (!selectedSessionIndex && selectedSessionIndex !== 0) return appointments;
    return appointments.filter(apt => apt.sessionIndex === selectedSessionIndex || apt.sessionIndex === undefined);
  }, [appointments, selectedSessionIndex]);

  // Get all appointments for today (all sessions)
  const todaysAppointments = useMemo(() => {
    if (!isToday(selectedDate)) return [];
    return appointments.filter(apt => {
      try {
        const aptDate = parse(apt.date, 'd MMMM yyyy', new Date());
        return isToday(aptDate);
      } catch {
        return false;
      }
    }).sort((a, b) => {
      try {
        const timeA = parseTime(a.time, parse(a.date, 'd MMMM yyyy', new Date()));
        const timeB = parseTime(b.time, parse(b.date, 'd MMMM yyyy', new Date()));
        return timeA.getTime() - timeB.getTime();
      } catch {
        return 0;
      }
    });
  }, [appointments, selectedDate]);

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
          <CardTitle>Slot Visualizer - Queue System</CardTitle>
          <CardDescription>
            Complete visualization of the queue management system showing Arrived Queue, Buffer Queue, Skipped Queue, and Doctor Consultation Room
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Controls */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
            {availableSessions.length > 0 && (
              <div className="space-y-2">
                <label className="text-sm font-medium">Select Session</label>
                <Select 
                  value={selectedSessionIndex.toString()} 
                  onValueChange={(value) => setSelectedSessionIndex(parseInt(value, 10))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a session" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableSessions.map((session) => (
                      <SelectItem key={session.index} value={session.index.toString()}>
                        {session.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {/* Today's Appointments Summary */}
          {isToday(selectedDate) && todaysAppointments.length > 0 && (
            <Card className="border-2 border-blue-300">
              <CardHeader className="bg-blue-50 dark:bg-blue-950/20">
                <CardTitle className="flex items-center gap-2">
                  <CalendarIcon className="h-5 w-5 text-blue-600" />
                  Today's Appointments
                  <Badge variant="outline" className="ml-auto bg-blue-100 text-blue-800 border-blue-400">
                    {todaysAppointments.length} total
                  </Badge>
                </CardTitle>
                <CardDescription>
                  All booked appointments for today across all sessions
                </CardDescription>
              </CardHeader>
              <CardContent className="p-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <div className="text-muted-foreground">Total Appointments</div>
                    <div className="text-2xl font-bold">{todaysAppointments.length}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">A Tokens</div>
                    <div className="text-2xl font-bold text-blue-600">
                      {todaysAppointments.filter(a => a.bookedVia !== "Walk-in").length}
                    </div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">W Tokens</div>
                    <div className="text-2xl font-bold text-green-600">
                      {todaysAppointments.filter(a => a.bookedVia === "Walk-in").length}
                    </div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Confirmed</div>
                    <div className="text-2xl font-bold text-green-600">
                      {todaysAppointments.filter(a => a.status === "Confirmed").length}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Slot Visualization for Selected Session */}
          {selectedDoctor && availableSessions[selectedSessionIndex] && (
            <Card className="border-2 border-purple-300">
              <CardHeader className="bg-purple-50 dark:bg-purple-950/20">
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5 text-purple-600" />
                  Slot Visualization - Session {selectedSessionIndex + 1}
                  <Badge variant="outline" className="ml-auto bg-purple-100 text-purple-800 border-purple-400">
                    {availableSessions[selectedSessionIndex]?.label || `Session ${selectedSessionIndex + 1}`}
                  </Badge>
                </CardTitle>
                <CardDescription>
                  Visual representation of all slots showing which are booked (A/W tokens) and which are empty
                </CardDescription>
              </CardHeader>
              <CardContent className="p-4">
                {(() => {
                  const session = availableSessions[selectedSessionIndex];
                  if (!session || !selectedDoctor) return null;
                  
                  // Generate all slots for this session
                  const consultationTime = selectedDoctor.averageConsultingTime || 15;
                  const sessionStart = parseTime(session.from, selectedDate);
                  const sessionEnd = parseTime(session.to, selectedDate);
                  
                  const allSlots: { time: Date; slotIndex: number }[] = [];
                  let slotTime = sessionStart;
                  let globalSlotIndex = 0;
                  
                  // Calculate starting global slot index for this session
                  const dayOfWeek = daysOfWeek[getDay(selectedDate)];
                  const availabilityForDay = selectedDoctor.availabilitySlots?.find(s => s.day === dayOfWeek);
                  let sessionStartSlotIndex = 0;
                  if (availabilityForDay) {
                    for (let i = 0; i < selectedSessionIndex; i++) {
                      const timeSlot = availabilityForDay.timeSlots[i];
                      let ts = parseTime(timeSlot.from, selectedDate);
                      const endTime = parseTime(timeSlot.to, selectedDate);
                      while (isBefore(ts, endTime)) {
                        sessionStartSlotIndex++;
                        ts = addMinutes(ts, consultationTime);
                      }
                    }
                  }
                  
                  // Generate slots for this session
                  while (isBefore(slotTime, sessionEnd)) {
                    allSlots.push({
                      time: new Date(slotTime),
                      slotIndex: sessionStartSlotIndex + allSlots.length
                    });
                    slotTime = addMinutes(slotTime, consultationTime);
                  }
                  
                  // Filter out past slots or mark them as passed
                  // Find the first slot that hasn't started yet (current time or future)
                  const now = currentTime; // Use component's currentTime state
                  const futureSlots = allSlots.filter(slot => isAfter(slot.time, now) || isSameMinute(slot.time, now));
                  const pastSlots = allSlots.filter(slot => isBefore(slot.time, now) && !isSameMinute(slot.time, now));
                  
                  // Find the reference point - the first future slot (or first slot if all are future)
                  let referenceSlotIndex = 0;
                  if (futureSlots.length > 0) {
                    referenceSlotIndex = futureSlots[0].slotIndex;
                  } else if (allSlots.length > 0) {
                    // All slots are in the past, use the last slot
                    referenceSlotIndex = allSlots[allSlots.length - 1].slotIndex;
                  }
                  
                  // Create a map of slotIndex to appointment
                  const slotToAppointment = new Map<number, Appointment>();
                  filteredAppointments.forEach(apt => {
                    if (apt.slotIndex !== undefined) {
                      slotToAppointment.set(apt.slotIndex, apt);
                    }
                  });
                  
                  // Calculate W token positioning pattern (interval-based)
                  const walkInTokenAllotment = clinicDetails?.walkInTokenAllotment || 7;
                  const confirmedAppointments = filteredAppointments
                    .filter(a => a.status === 'Pending' || a.status === 'Confirmed')
                    .filter(a => a.bookedVia === 'Advanced Booking' || a.bookedVia === 'Online' || a.bookedVia === 'Advanced')
                    .sort((a, b) => (a.slotIndex ?? Infinity) - (b.slotIndex ?? Infinity));
                  
                  const existingWTokens = filteredAppointments
                    .filter(a => a.bookedVia === 'Walk-in' && (a.status === 'Pending' || a.status === 'Confirmed'))
                    .sort((a, b) => (a.slotIndex ?? Infinity) - (b.slotIndex ?? Infinity));
                  
                  // NEW APPROACH: Imaginary W slots are the LAST 15% of total slots
                  // They are displayed at floating positions (intervals of walkInTokenAllotment) for visualization
                  // Their visual slot numbers are their 0-indexed positions matching the base slot list
                  const totalSlots = allSlots.length;
                  const imaginaryWSlotsCount = Math.ceil(totalSlots * 0.15); // 15% rounded up
                  const sessionSlotIndices = allSlots.map(slot => slot.slotIndex).sort((a, b) => a - b);
                  
                  // Actual imaginary W slot indices (last N slots)
                  const actualImaginaryWSlotIndices = new Set<number>();
                  if (imaginaryWSlotsCount > 0) {
                    const lastSlots = allSlots.slice(-imaginaryWSlotsCount);
                    lastSlots.forEach(slot => {
                      if (slot?.slotIndex !== undefined) {
                        actualImaginaryWSlotIndices.add(slot.slotIndex);
                      }
                    });
                  }
                  
                  // Floating positions for visualization (intervals of walkInTokenAllotment from clinic collection)
                  // These are where the imaginary W slots appear visually, but they keep their last slot numbers
                  // Pattern: Each imaginary slot is placed after walkInTokenAllotment A slots within this session
                  // - First imaginary slot appears before the slot that comes immediately after the first walkInTokenAllotment A slots
                  // - Subsequent imaginary slots follow the same spacing based on A slots only
                  const wSlotPositions = new Set<number>(); // Visual positions (actual slot indices)
                  const maxSlotIndex = sessionSlotIndices.length > 0 ? sessionSlotIndices[sessionSlotIndices.length - 1] : -1;
                  
                  console.log('🔍 [DEBUG] Starting imaginary slot position calculation:', {
                    walkInTokenAllotment,
                    imaginaryWSlotsCount,
                    totalSlots,
                    maxSlotIndex,
                    sessionStartSlotIndex,
                    sessionSlotIndices
                  });
                  
                  const calculationDetails: Array<{
                    index: number;
                    basePosition: number;
                    adjustedPosition: number;
                    fallbackApplied: boolean;
                  }> = [];
                  
                  if (sessionSlotIndices.length > 0 && walkInTokenAllotment > 0) {
                    let nextImaginarySlotPosition = sessionStartSlotIndex + walkInTokenAllotment;
                    
                    for (let i = 0; i < imaginaryWSlotsCount; i++) {
                      const basePosition = nextImaginarySlotPosition;
                      const fallbackPosition = maxSlotIndex - (imaginaryWSlotsCount - 1 - i);
                      const adjustedPosition = Math.min(basePosition, fallbackPosition);
                      
                      wSlotPositions.add(adjustedPosition);
                      calculationDetails.push({
                        index: i,
                        basePosition,
                        adjustedPosition,
                        fallbackApplied: adjustedPosition !== basePosition
                      });
                      
                      nextImaginarySlotPosition = adjustedPosition + walkInTokenAllotment;
                    }
                  }
                  
                  console.log('🔍 [DEBUG] Imaginary slot placement details:', calculationDetails);
                  
                  const finalPositions = Array.from(wSlotPositions).sort((a, b) => a - b);
                  const sortedDetails = [...calculationDetails]
                    .sort((a, b) => a.adjustedPosition - b.adjustedPosition)
                    .slice(0, finalPositions.length);
                  const expectedPositions = sortedDetails.map(detail => detail.adjustedPosition);
                  console.log('🔍 [DEBUG] Final wSlotPositions:', {
                    walkInTokenAllotment,
                    imaginaryWSlotsCount,
                    positions: finalPositions,
                    expected: expectedPositions,
                    match: JSON.stringify(finalPositions) === JSON.stringify(expectedPositions),
                    details: finalPositions.map((pos, idx) => {
                      const detail = sortedDetails[idx];
                      const calculation = detail
                        ? `${detail.basePosition} (base)${detail.fallbackApplied ? ` → adjusted to ${detail.adjustedPosition}` : ''}`
                        : `sessionStart + walkInTokenAllotment * (${idx + 1})`;
                      const fallbackCalculation = `${maxSlotIndex} - (${imaginaryWSlotsCount} - 1 - ${idx})`;
                      return {
                        index: idx,
                        position: pos,
                        expected: expectedPositions[idx],
                        afterSlot: pos - 1,
                        calculation: pos === expectedPositions[idx] ? calculation : `min(${calculation}, ${fallbackCalculation})`,
                        match: pos === expectedPositions[idx]
                      };
                    }),
                    allPositionsInSet: Array.from(wSlotPositions)
                  });
                  
                  // Create mapping: visual position -> actual slot index (last slots)
                  const visualToActualSlotMap = new Map<number, number>();
                  const sortedVisualPositions = Array.from(wSlotPositions).sort((a, b) => a - b);
                  const sortedActualIndices = Array.from(actualImaginaryWSlotIndices).sort((a, b) => a - b);
                  sortedVisualPositions.forEach((visualPos, index) => {
                    if (index < sortedActualIndices.length) {
                      visualToActualSlotMap.set(visualPos, sortedActualIndices[index]);
                    }
                  });
                  
                  console.log('🔍 [DEBUG] Imaginary W Slot Mapping:', {
                    walkInTokenAllotment,
                    totalSlots,
                    imaginaryWSlotsCount,
                    actualImaginaryWSlotIndices: Array.from(actualImaginaryWSlotIndices).sort((a, b) => a - b),
                    visualPositions: sortedVisualPositions,
                    wSlotPositionsArray: Array.from(wSlotPositions).sort((a, b) => a - b),
                    mapping: Array.from(visualToActualSlotMap.entries()).map(([v, a]) => `Visual ${v} → Actual ${a}`),
                    calculatedPositions: expectedPositions
                  });
                  
                  // Identify empty slots within 1-hour window (where A tokens can't book)
                  // W tokens should fill these empty slots first, before taking imaginary slots
                  // A tokens can't book slots that are within 1 hour from the current time
                  const oneHourFromNow = addMinutes(now, 60);
                  const emptySlotsWithinOneHour = new Set<number>();
                  
                  console.log('🔍 [DEBUG] 1-Hour Window Check:', {
                    now: format(now, 'hh:mm a'),
                    oneHourFromNow: format(oneHourFromNow, 'hh:mm a'),
                    totalSlots: allSlots.length
                  });
                  
                  allSlots.forEach(slot => {
                    // Check if slot is within 1-hour window (A tokens can't book here)
                    // Slot must be: now <= slot.time <= oneHourFromNow
                    const isWithinOneHour = !isBefore(slot.time, now) && !isAfter(slot.time, oneHourFromNow);
                    
                    if (isWithinOneHour) {
                      // Check if this slot is empty (no appointment or vacant)
                      const appointment = slotToAppointment.get(slot.slotIndex);
                      const isEmpty = !appointment;
                      const isNoShow = appointment?.status === 'No-show';
                      const isVacant = isEmpty || isNoShow || 
                        (appointment && ['Skipped', 'Cancelled', 'Completed'].includes(appointment.status));
                      
                      // Only A tokens can't use these slots, W tokens can
                      const isAToken = appointment && (appointment.bookedVia === 'Advanced Booking' || appointment.bookedVia === 'Online' || appointment.bookedVia === 'Advanced');
                      if (isVacant || !isAToken) {
                        emptySlotsWithinOneHour.add(slot.slotIndex);
                        console.log('🔍 [DEBUG] Slot within 1-hour window:', {
                          slotIndex: slot.slotIndex,
                          slotTime: format(slot.time, 'hh:mm a'),
                          isEmpty,
                          isVacant,
                          isAToken
                        });
                      }
                    }
                  });
                  
                  console.log('🔍 [DEBUG] Empty slots within 1-hour window:', Array.from(emptySlotsWithinOneHour));
                  
                  // Also check if there are existing W tokens and calculate next position
                  const potentialWPositions = new Set<number>();
                  // Priority 1: Empty slots within 1-hour window
                  emptySlotsWithinOneHour.forEach(slotIndex => {
                    potentialWPositions.add(slotIndex);
                  });
                  
                  // Priority 2: Empty slots that are before imaginary W slots
                  // Check all empty slots and see if they come before any imaginary W slot
                  const emptySlotsBeforeImaginaryW = new Set<number>();
                  const sortedImaginaryWSlots = Array.from(wSlotPositions).sort((a, b) => a - b);
                  
                  allSlots.forEach(slot => {
                    const appointment = slotToAppointment.get(slot.slotIndex);
                    const isEmpty = !appointment;
                    const isNoShow = appointment?.status === 'No-show';
                    const isVacant = isEmpty || isNoShow || 
                      (appointment && ['Skipped', 'Cancelled', 'Completed'].includes(appointment.status));
                    
                    // If this slot is empty/vacant and comes before any imaginary W slot
                    if (isVacant && sortedImaginaryWSlots.length > 0) {
                      const firstImaginaryWSlot = sortedImaginaryWSlots[0];
                      if (slot.slotIndex < firstImaginaryWSlot) {
                        // This empty slot comes before the first imaginary W slot
                        // Only add if it's not already in emptySlotsWithinOneHour
                        if (!emptySlotsWithinOneHour.has(slot.slotIndex)) {
                          emptySlotsBeforeImaginaryW.add(slot.slotIndex);
                        }
                      }
                    }
                  });
                  
                  // Add empty slots before imaginary W slots to potentialWPositions
                  emptySlotsBeforeImaginaryW.forEach(slotIndex => {
                    potentialWPositions.add(slotIndex);
                  });
                  
                  console.log('🔍 [DEBUG] Slot Visualizer - W Position Calculation:', {
                    walkInTokenAllotment,
                    confirmedAppointmentsCount: confirmedAppointments.length,
                    existingWTokensCount: existingWTokens.length,
                    emptySlotsWithinOneHour: Array.from(emptySlotsWithinOneHour),
                    emptySlotsBeforeImaginaryW: Array.from(emptySlotsBeforeImaginaryW),
                    imaginaryWSlots: sortedImaginaryWSlots,
                    confirmedAppointments: confirmedAppointments.map(a => ({
                      tokenNumber: a.tokenNumber,
                      slotIndex: a.slotIndex
                    })),
                    existingWTokens: existingWTokens.map(a => ({
                      tokenNumber: a.tokenNumber,
                      slotIndex: a.slotIndex
                    }))
                  });
                  
                  // Priority 3: Imaginary W slots (only if no empty slots available before them)
                  // Calculate where the next imaginary W slot would be placed
                  // Only show imaginary W slots if there are no empty slots before them
                  let calculatedImaginaryWSlot: number | null = null;
                  
                  if (confirmedAppointments.length === 0) {
                    // No confirmed appointments - first W would be at slot 0 + walkInTokenAllotment
                    calculatedImaginaryWSlot = walkInTokenAllotment;
                    console.log('🔍 [DEBUG] No confirmed appointments - calculated imaginary W slot:', calculatedImaginaryWSlot);
                  } else if (existingWTokens.length === 0) {
                    // First W token: after walkInTokenAllotment confirmed appointments
                    if (confirmedAppointments.length >= walkInTokenAllotment) {
                      const targetAppointment = confirmedAppointments[walkInTokenAllotment - 1];
                      calculatedImaginaryWSlot = (targetAppointment.slotIndex ?? 0) + 1;
                      console.log('🔍 [DEBUG] First W token - enough confirmed appointments:', {
                        targetAppointmentSlotIndex: targetAppointment.slotIndex,
                        calculatedImaginaryWSlot
                      });
                    } else {
                      const lastAppointment = confirmedAppointments[confirmedAppointments.length - 1];
                      calculatedImaginaryWSlot = (lastAppointment.slotIndex ?? 0) + 1;
                      console.log('🔍 [DEBUG] First W token - fewer confirmed appointments:', {
                        lastAppointmentSlotIndex: lastAppointment.slotIndex,
                        calculatedImaginaryWSlot
                      });
                    }
                  } else {
                    // Subsequent W tokens: after walkInTokenAllotment appointments from last W
                    const lastWToken = existingWTokens[existingWTokens.length - 1];
                    const lastWTokenSlotIndex = lastWToken?.slotIndex ?? -1;
                    
                    const appointmentsAfterLastW = confirmedAppointments.filter(a => {
                      const aptSlotIndex = a.slotIndex ?? 0;
                      return aptSlotIndex > lastWTokenSlotIndex;
                    });
                    
                    if (appointmentsAfterLastW.length >= walkInTokenAllotment) {
                      const targetAppointment = appointmentsAfterLastW[walkInTokenAllotment - 1];
                      calculatedImaginaryWSlot = (targetAppointment.slotIndex ?? 0) + 1;
                      console.log('🔍 [DEBUG] Subsequent W - enough appointments after last W:', {
                        targetAppointmentSlotIndex: targetAppointment.slotIndex,
                        calculatedImaginaryWSlot
                      });
                    } else if (appointmentsAfterLastW.length > 0) {
                      const lastAppointment = appointmentsAfterLastW[appointmentsAfterLastW.length - 1];
                      calculatedImaginaryWSlot = (lastAppointment.slotIndex ?? 0) + 1;
                      console.log('🔍 [DEBUG] Subsequent W - fewer appointments after last W:', {
                        lastAppointmentSlotIndex: lastAppointment.slotIndex,
                        calculatedImaginaryWSlot
                      });
                    } else {
                      calculatedImaginaryWSlot = lastWTokenSlotIndex + 1;
                      console.log('🔍 [DEBUG] Subsequent W - no appointments after last W:', {
                        calculatedImaginaryWSlot
                      });
                    }
                  }
                  
                  // Only add imaginary W slot if it's valid and there are no empty slots before it
                  // Check if there are any empty slots before this imaginary W slot
                  if (calculatedImaginaryWSlot !== null && calculatedImaginaryWSlot < allSlots.length) {
                    const imaginarySlot = allSlots.find(s => s.slotIndex === calculatedImaginaryWSlot);
                    if (imaginarySlot) {
                      // Check if there are any empty slots before this imaginary W slot
                      const hasEmptySlotsBefore = emptySlotsBeforeImaginaryW.size > 0 && 
                        Array.from(emptySlotsBeforeImaginaryW).some(slotIndex => slotIndex < calculatedImaginaryWSlot);
                      
                      // Only add imaginary W slot if:
                      // 1. There are no empty slots before it, OR
                      // 2. It's within the 1-hour window (where A tokens can't book)
                      const isWithinOneHour = !isBefore(imaginarySlot.time, now) && !isAfter(imaginarySlot.time, oneHourFromNow);
                      
                      if (!hasEmptySlotsBefore || isWithinOneHour) {
                        // Only add if it's not already in emptySlotsWithinOneHour or emptySlotsBeforeImaginaryW
                        if (!emptySlotsWithinOneHour.has(calculatedImaginaryWSlot) && 
                            !emptySlotsBeforeImaginaryW.has(calculatedImaginaryWSlot)) {
                          potentialWPositions.add(calculatedImaginaryWSlot);
                          console.log('🔍 [DEBUG] Added imaginary W slot:', {
                            slotIndex: calculatedImaginaryWSlot,
                            slotTime: format(imaginarySlot.time, 'hh:mm a'),
                            isWithinOneHour,
                            hasEmptySlotsBefore
                          });
                        } else {
                          console.log('🔍 [DEBUG] Skipped imaginary W slot (already in empty slots):', calculatedImaginaryWSlot);
                        }
                      } else {
                        console.log('🔍 [DEBUG] Skipped imaginary W slot (empty slots available before it):', {
                          slotIndex: calculatedImaginaryWSlot,
                          slotTime: format(imaginarySlot.time, 'hh:mm a'),
                          hasEmptySlotsBefore,
                          emptySlotsBefore: Array.from(emptySlotsBeforeImaginaryW).filter(s => s < calculatedImaginaryWSlot)
                        });
                      }
                    }
                  }
                  
                  // Also add all imaginary W slots from wSlotPositions if they don't have empty slots before them
                  wSlotPositions.forEach(imaginaryWSlotIndex => {
                    // Check if there are any empty slots before this imaginary W slot
                    const hasEmptySlotsBefore = emptySlotsBeforeImaginaryW.size > 0 && 
                      Array.from(emptySlotsBeforeImaginaryW).some(slotIndex => slotIndex < imaginaryWSlotIndex);
                    
                    // Only add if there are no empty slots before it
                    if (!hasEmptySlotsBefore && 
                        !emptySlotsWithinOneHour.has(imaginaryWSlotIndex) && 
                        !emptySlotsBeforeImaginaryW.has(imaginaryWSlotIndex)) {
                      potentialWPositions.add(imaginaryWSlotIndex);
                    }
                  });
                  
                  console.log('🔍 [DEBUG] Final potentialWPositions:', Array.from(potentialWPositions));
                  
                  return (
                    <div className="space-y-4">
                      {/* W Token Positioning Info */}
                      <div className="p-3 bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 rounded-lg">
                        <h4 className="text-sm font-semibold mb-2 text-green-800 dark:text-green-200">
                          W Token Positioning Logic
                        </h4>
                        <div className="text-xs text-green-700 dark:text-green-300 space-y-1">
                          <div>• <strong>Priority 1:</strong> W tokens fill empty slots within 1-hour window (where A tokens can't book)</div>
                          <div>• <strong>Priority 2:</strong> W tokens use imaginary slots at intervals of <strong>{walkInTokenAllotment}</strong> confirmed appointments (use imaginary W slots first!)</div>
                          <div>• <strong>Priority 3:</strong> If no imaginary W slots available, W tokens fill empty slots that come before imaginary W slots</div>
                          <div>• First W: After {walkInTokenAllotment} confirmed appointments (at 8th position if {walkInTokenAllotment} = 7)</div>
                          <div>• Subsequent W: After {walkInTokenAllotment} appointments from the last W token</div>
                          <div>• When a W token is inserted (in empty slot or imaginary slot), all subsequent A tokens are shifted forward by average consulting time</div>
                          <div>• W tokens don't have time labels - they're inserted between A tokens</div>
                        </div>
                      </div>
                      
                      {/* Slot Grid Visualization */}
                      <div>
                        <h4 className="text-sm font-semibold mb-3">All Slots Timeline</h4>
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2 max-h-96 overflow-y-auto p-2 border rounded-lg bg-muted/20">
                          {(() => {
                            // Create a combined list of all slots including imaginary W slots
                            // When a W token is booked, it takes the position of the first imaginary W slot
                            // This updates the time of all upcoming slots after that by adding average consulting time
                            // W slots are inserted between A slots at intervals
                            // After each W slot (actual or imaginary), A slots continue from the previous A slot's time + consultation time
                            // Filter out past slots or mark them as passed
                            const allSlotsWithW: Array<{ time: Date | null; slotIndex: number; displaySlotIndex: number; isWSlot: boolean; originalSlotIndex?: number; isPast?: boolean; wTokenAppointment?: Appointment }> = [];
                            
                            // Track which regular slots have been used and current time for A slots
                            let regularSlotIndex = 0;
                            let currentASlotTime = sessionStart;
                            
                            // Build the combined list: A slots with time, then W slots without time, alternating
                            // Calculate how many total slots we need (regular slots + W slots)
                            const totalSlotsNeeded = allSlots.length + wSlotPositions.size;
                            const now = currentTime; // Use component's currentTime state
                            
                            // Calculate total slots across ALL sessions for the day to avoid conflicts
                            const dayOfWeek = daysOfWeek[getDay(selectedDate)];
                            const availabilityForDay = selectedDoctor.availabilitySlots?.find(s => s.day === dayOfWeek);
                            let totalSlotsForDay = 0;
                            if (availabilityForDay?.timeSlots) {
                              const consultationTime = selectedDoctor.averageConsultingTime || 15;
                              availabilityForDay.timeSlots.forEach(timeSlot => {
                                const sessionStart = parseTime(timeSlot.from, selectedDate);
                                const sessionEnd = parseTime(timeSlot.to, selectedDate);
                                let currentTime = sessionStart;
                                let sessionSlotCount = 0;
                                while (isBefore(currentTime, sessionEnd)) {
                                  sessionSlotCount++;
                                  currentTime = addMinutes(currentTime, consultationTime);
                                }
                                totalSlotsForDay += sessionSlotCount;
                              });
                            }
                            
                            // Calculate how many A slots exist in previous sessions (before current session)
                            // This ensures continuous numbering across all sessions
                            let aSlotsInPreviousSessions = 0;
                            if (availabilityForDay && selectedSessionIndex > 0) {
                              const consultationTime = selectedDoctor.averageConsultingTime || 15;
                              for (let i = 0; i < selectedSessionIndex; i++) {
                                const timeSlot = availabilityForDay.timeSlots[i];
                                const sessionStart = parseTime(timeSlot.from, selectedDate);
                                const sessionEnd = parseTime(timeSlot.to, selectedDate);
                                let currentTime = sessionStart;
                                while (isBefore(currentTime, sessionEnd)) {
                                  aSlotsInPreviousSessions++;
                                  currentTime = addMinutes(currentTime, consultationTime);
                                }
                              }
                            }
                            
                            // Start imaginary W slot counter from total slots for the day (to avoid conflicts across sessions)
                            let imaginaryWSlotCounter = totalSlotsForDay; // Start from total slots (0-indexed, so this is correct)
                            
                            // Counter for continuous A slot numbering - start from previous sessions count
                            let continuousASlotCounter = aSlotsInPreviousSessions;
                            
                            // Create a map of slot index to W token appointments
                            // W tokens can be in empty slots (within 1-hour window) or imaginary W slots
                            const wTokenAtSlotIndex = new Map<number, Appointment>();
                            existingWTokens.forEach(wToken => {
                              const wTokenSlotIndex = wToken.slotIndex ?? -1;
                              if (wTokenSlotIndex >= 0) {
                                wTokenAtSlotIndex.set(wTokenSlotIndex, wToken);
                              }
                            });
                            
                            // Track which slots have W tokens (either in empty slots or imaginary slots)
                            const slotsWithWTokens = new Set<number>();
                            existingWTokens.forEach(wToken => {
                              const wTokenSlotIndex = wToken.slotIndex ?? -1;
                              if (wTokenSlotIndex >= 0) {
                                slotsWithWTokens.add(wTokenSlotIndex);
                              }
                            });
                            
                            // Build combined list by iterating through all slots (both regular and imaginary W slots)
                            // We need to process slots in order of their actual slot indices
                            const allSlotIndices = new Set<number>();
                            
                            // Add all regular slot indices
                            allSlots.forEach(slot => {
                              allSlotIndices.add(slot.slotIndex);
                            });
                            
                            // Add all imaginary W slot positions
                            wSlotPositions.forEach(slotIndex => {
                              allSlotIndices.add(slotIndex);
                            });
                            
                            // Sort all slot indices
                            const sortedSlotIndices = Array.from(allSlotIndices).sort((a, b) => a - b);
                            
                            const sortedWSlotPositions = Array.from(wSlotPositions).sort((a, b) => a - b);
                            console.log('🔍 [DEBUG] Slot Processing:', {
                              wSlotPositions: sortedWSlotPositions,
                              wSlotPositionsDetails: sortedWSlotPositions.map(pos => ({
                                position: pos,
                                afterSlot: pos - 1,
                                isInSet: wSlotPositions.has(pos)
                              })),
                              sortedSlotIndices,
                              allSlotsLength: allSlots.length,
                              totalSlots,
                              allSlotsSlotIndices: allSlots.map(s => s.slotIndex),
                              hasSlot13: allSlots.some(s => s.slotIndex === 13),
                              hasSlot14: allSlots.some(s => s.slotIndex === 14)
                            });
                            
                            // Process each slot index in order
                            for (const actualSlotIndex of sortedSlotIndices) {
                              console.log(`🔍 [DEBUG] Processing slot index ${actualSlotIndex}, isImaginaryW: ${wSlotPositions.has(actualSlotIndex)}`);
                              // Check if there's an A token appointment at this position (regardless of whether it's an imaginary W position)
                              const aTokenAtThisPosition = slotToAppointment.get(actualSlotIndex);
                              const isAToken = aTokenAtThisPosition && 
                                (aTokenAtThisPosition.bookedVia === 'Advanced Booking' || 
                                 aTokenAtThisPosition.bookedVia === 'Online' || 
                                 aTokenAtThisPosition.bookedVia === 'Advanced') &&
                                (aTokenAtThisPosition.status === 'Pending' || aTokenAtThisPosition.status === 'Confirmed');
                              
                              // Check if this is an imaginary W slot position
                              if (wSlotPositions.has(actualSlotIndex)) {
                                // This is an imaginary W slot position
                                // Check if there's an actual W token at this imaginary slot position
                                const wTokenAtThisPosition = wTokenAtSlotIndex.get(actualSlotIndex);
                                
                                // IMPORTANT: If there's an A token at this position, we still need to show:
                                // 1. The empty imaginary W slot with final slot number (appears first, right after slot index 6)
                                // 2. The A token with continuous slot number (appears after the imaginary W slot)
                                if (isAToken) {
                                  // IMPORTANT: Add the empty imaginary W slot FIRST - it should appear right after slot index 6
                                  // The imaginary W slot appears at its calculated position (after walkInTokenAllotment positions)
                                  // Use a small offset (actualSlotIndex - 0.001) to ensure it appears BEFORE the A token when sorted
                                  // Get the actual slot index from the mapping (last 15% of slots)
                                  const actualSlotIndexForW = visualToActualSlotMap.get(actualSlotIndex) ?? actualSlotIndex;
                                  const finalSlotNumber = actualSlotIndexForW; // Keep zero-based numbering to match A slots
                                  allSlotsWithW.push({
                                    time: null,
                                    slotIndex: actualSlotIndex - 0.001, // Small offset to appear BEFORE A token when sorted
                                    displaySlotIndex: finalSlotNumber, // Use actual slot number from last 15%
                                    isWSlot: true,
                                    isPast: false
                                  });
                                  
                                  // A token is at an imaginary W slot position - treat it as a regular A slot
                                  const regularSlot = allSlots.find(s => s.slotIndex === actualSlotIndex);
                                  if (regularSlot) {
                                    const slotTime = new Date(currentASlotTime);
                                    const isPast = isBefore(slotTime, now) && !isSameMinute(slotTime, now);
                                    
                                    // Assign continuous slot number to A slots (0, 1, 2, 3, 4, 5, 6, 7, 8, 9...)
                                    const continuousASlotNumber = continuousASlotCounter++;
                                    
                                    allSlotsWithW.push({
                                      time: slotTime,
                                      slotIndex: actualSlotIndex, // Keep visual position for sorting
                                      displaySlotIndex: continuousASlotNumber, // Continuous numbering for A slots
                                      isWSlot: false,
                                      originalSlotIndex: regularSlot.slotIndex,
                                      isPast: isPast
                                    });
                                    // Move to next A slot time (add consultation time)
                                    currentASlotTime = addMinutes(currentASlotTime, consultationTime);
                                  }
                                } else if (wTokenAtThisPosition) {
                                  // There's an actual W token at this imaginary slot position
                                  // Use the actual slotIndex from the W token appointment
                                  const wTokenSlotIndex = wTokenAtThisPosition.slotIndex ?? actualSlotIndex;
                                  allSlotsWithW.push({
                                    time: null,
                                    slotIndex: actualSlotIndex, // Keep visual position for sorting
                                    displaySlotIndex: wTokenSlotIndex, // Use actual slotIndex from W token appointment for display
                                    isWSlot: true,
                                    isPast: false,
                                    wTokenAppointment: wTokenAtThisPosition
                                  });
                                  // When an actual W token is inserted, subsequent A tokens shift forward by consultation time
                                  currentASlotTime = addMinutes(currentASlotTime, consultationTime);
                                } else {
                                  // This is an imaginary W slot - no actual token yet
                                  // Imaginary W slots don't take time, so they don't increment time for subsequent slots
                                  // Get the actual slot index from the mapping (last 15% of slots)
                                  const actualSlotIndexForW = visualToActualSlotMap.get(actualSlotIndex) ?? actualSlotIndex;
                                  const finalSlotNumber = actualSlotIndexForW; // Keep zero-based numbering to match A slots
                                  
                                  console.log(`🔍 [DEBUG] Adding imaginary W slot:`, {
                                    visualPosition: actualSlotIndex,
                                    actualSlotIndexForW,
                                    finalSlotNumber,
                                    mapping: visualToActualSlotMap.has(actualSlotIndex) ? `Visual ${actualSlotIndex} → Actual ${actualSlotIndexForW}` : 'No mapping found'
                                  });
                                  
                                  allSlotsWithW.push({
                                    time: null,
                                    slotIndex: actualSlotIndex, // Keep visual position for sorting
                                    displaySlotIndex: finalSlotNumber, // Use actual slot number from last 15%
                                    isWSlot: true,
                                    isPast: false
                                  });
                                  // Don't increment time for imaginary W slots - they're just placeholders
                                  // Time will only increment when an actual W token is placed
                                }
                              } else {
                                // This is a regular A slot
                                const regularSlot = allSlots.find(s => s.slotIndex === actualSlotIndex);
                                
                                if (actualSlotIndex === 13) {
                                  const slotTimeFor13 = new Date(currentASlotTime);
                                  const isPastFor13 = isBefore(slotTimeFor13, now) && !isSameMinute(slotTimeFor13, now);
                                  console.log(`🔍 [DEBUG] Position 13 check:`, {
                                    actualSlotIndex,
                                    regularSlotFound: !!regularSlot,
                                    regularSlot,
                                    allSlotsHas13: allSlots.some(s => s.slotIndex === 13),
                                    allSlotsIndices: allSlots.map(s => s.slotIndex),
                                    currentASlotTime: currentASlotTime.toLocaleTimeString(),
                                    slotTimeFor13: slotTimeFor13.toLocaleTimeString(),
                                    now: now.toLocaleTimeString(),
                                    isPastFor13,
                                    willBeFiltered: isPastFor13
                                  });
                                }
                                
                                if (regularSlot) {
                                  // Check if there's a W token in this regular slot (empty slot within 1-hour window)
                                  const wTokenAtThisRegularSlot = wTokenAtSlotIndex.get(regularSlot.slotIndex);
                                  
                                  if (wTokenAtThisRegularSlot) {
                                    // W token is in this empty slot (within 1-hour window)
                                    // Use the actual slotIndex from the W token appointment
                                    const wTokenSlotIndex = wTokenAtThisRegularSlot.slotIndex ?? regularSlot.slotIndex;
                                    allSlotsWithW.push({
                                      time: null,
                                      slotIndex: actualSlotIndex, // Keep visual position for sorting
                                      displaySlotIndex: wTokenSlotIndex, // Use actual slotIndex from W token appointment for display
                                      isWSlot: true,
                                      originalSlotIndex: regularSlot.slotIndex,
                                      isPast: false,
                                      wTokenAppointment: wTokenAtThisRegularSlot
                                    });
                                    // When a W token is inserted, subsequent A tokens shift forward by consultation time
                                    currentASlotTime = addMinutes(currentASlotTime, consultationTime);
                                  } else {
                                    // This is a regular A slot - has time
                                    const slotTime = new Date(currentASlotTime);
                                    const isPast = isBefore(slotTime, now) && !isSameMinute(slotTime, now);
                                    
                                    // Assign continuous slot number to A slots (0, 1, 2, 3, 4, 5, 6, 7, 8, 9...)
                                    const continuousASlotNumber = continuousASlotCounter++;
                                    
                                    // Use the actual slotIndex from the original slot
                                    allSlotsWithW.push({
                                      time: slotTime,
                                      slotIndex: actualSlotIndex, // Keep visual position for sorting
                                      displaySlotIndex: continuousASlotNumber, // Continuous numbering for A slots
                                      isWSlot: false,
                                      originalSlotIndex: regularSlot.slotIndex,
                                      isPast: isPast
                                    });
                                    // Move to next A slot time (add consultation time)
                                    currentASlotTime = addMinutes(currentASlotTime, consultationTime);
                                  }
                                } else {
                                  // Position exists in sortedSlotIndices but not in allSlots
                                  // This shouldn't happen, but if it does, add an empty slot to maintain visual order
                                  // Calculate time based on currentASlotTime
                                  const slotTime = new Date(currentASlotTime);
                                  const isPast = isBefore(slotTime, now) && !isSameMinute(slotTime, now);
                                  
                                  // Assign continuous slot number to A slots
                                  const continuousASlotNumber = continuousASlotCounter++;
                                  
                                  allSlotsWithW.push({
                                    time: slotTime,
                                    slotIndex: actualSlotIndex, // Keep visual position for sorting
                                    displaySlotIndex: continuousASlotNumber, // Continuous numbering for A slots
                                    isWSlot: false,
                                    isPast: isPast
                                  });
                                  // Move to next A slot time (add consultation time)
                                  currentASlotTime = addMinutes(currentASlotTime, consultationTime);
                                }
                              }
                            }
                            
                            // Sort by slotIndex (visual position) to maintain correct order
                            allSlotsWithW.sort((a, b) => a.slotIndex - b.slotIndex);
                            
                            console.log('🔍 [DEBUG] After sorting allSlotsWithW:', {
                              totalSlots: allSlotsWithW.length,
                              imaginaryWSlots: allSlotsWithW.filter(s => s.isWSlot && !s.wTokenAppointment).map(s => ({
                                slotIndex: s.slotIndex,
                                displaySlotIndex: s.displaySlotIndex,
                                afterSlot: s.slotIndex - 1
                              })),
                              allSlots: allSlotsWithW.map(s => ({
                                slotIndex: s.slotIndex,
                                displaySlotIndex: s.displaySlotIndex,
                                isWSlot: s.isWSlot,
                                hasTime: s.time !== null,
                                isPast: s.isPast
                              })),
                              slotsAround14: allSlotsWithW.filter(s => s.slotIndex >= 12 && s.slotIndex <= 15).map(s => ({
                                slotIndex: s.slotIndex,
                                displaySlotIndex: s.displaySlotIndex,
                                isWSlot: s.isWSlot,
                                hasTime: s.time !== null,
                                isPast: s.isPast,
                                time: s.time ? s.time.toLocaleTimeString() : null
                              })),
                              hasSlot13: allSlotsWithW.some(s => s.slotIndex === 13),
                              slot13Details: allSlotsWithW.find(s => s.slotIndex === 13)
                            });
                            
                            // Filter out past slots (only show future and current slots)
                            // BUT: If an imaginary W slot is at a position, ensure the slot before it is visible
                            // (even if it's in the past) to maintain visual continuity
                            const visibleSlots = allSlotsWithW.filter(slot => {
                              if (!slot.isPast) return true;
                              
                              // If this is a past slot, check if there's an imaginary W slot immediately after it
                              const nextSlot = allSlotsWithW.find(s => s.slotIndex === slot.slotIndex + 1);
                              if (nextSlot && nextSlot.isWSlot && !nextSlot.wTokenAppointment) {
                                // There's an imaginary W slot after this past slot, so show this slot too
                                return true;
                              }
                              
                              return false;
                            });
                            
                            console.log('🔍 [DEBUG] After filtering past slots:', {
                              totalVisible: visibleSlots.length,
                              hasSlot13: visibleSlots.some(s => s.slotIndex === 13),
                              slotsAround14: visibleSlots.filter(s => s.slotIndex >= 12 && s.slotIndex <= 15).map(s => ({
                                slotIndex: s.slotIndex,
                                displaySlotIndex: s.displaySlotIndex,
                                isWSlot: s.isWSlot,
                                isPast: s.isPast
                              }))
                            });
                            
                            return visibleSlots.map((slot, index) => {
                              // For appointments, check the original slot index if this slot was shifted
                              // If this is a W slot with an actual token, use that token
                              const appointmentSlotIndex = slot.originalSlotIndex !== undefined ? slot.originalSlotIndex : slot.slotIndex;
                              const appointment = slot.wTokenAppointment || slotToAppointment.get(appointmentSlotIndex);
                              const isEmpty = !appointment;
                              const isNoShow = appointment?.status === 'No-show';
                              const isVacant = isEmpty || isNoShow || 
                                (appointment && ['Skipped', 'Cancelled', 'Completed'].includes(appointment.status));
                              // Check if this is a potential W position
                              // Only show "W Position" for imaginary W slots that are actually available
                              // Don't show "W Position" if there are empty slots before imaginary W slots (A tokens should fill those first)
                              const isImaginaryWSlot = slot.isWSlot && !appointment;
                              const isEmptySlotWithinOneHour = emptySlotsWithinOneHour.has(slot.originalSlotIndex ?? slot.slotIndex) && isEmpty && !slot.isWSlot;
                              const isEmptySlotBeforeImaginaryW = emptySlotsBeforeImaginaryW.has(slot.originalSlotIndex ?? slot.slotIndex) && isEmpty && !slot.isWSlot;
                              
                              // Only show "W Position" for imaginary W slots that are:
                              // 1. Actually imaginary W slots (not regular empty slots)
                              // 2. Not occupied
                              // 3. There are no empty slots before them (A tokens should fill those first)
                              const isPotentialWPosition = isImaginaryWSlot && isEmpty && !isNoShow && emptySlotsBeforeImaginaryW.size === 0;
                              
                              // For imaginary W slots, never show time - they don't take time
                              const shouldShowTime = !isImaginaryWSlot && slot.time !== null;
                              
                              // Use displaySlotIndex for display:
                              // - For A tokens: actual slotIndex from the original slot (continuous numbering)
                              // - For W tokens: actual slotIndex from the appointment
                              // - For imaginary W slots: final slot number starting from maxRegularSlotIndex + 1
                              const displaySlotIndex = slot.displaySlotIndex;
                              
                              return (
                                <div
                                  key={`${slot.slotIndex}-${index}`}
                                  className={cn(
                                    "p-2 rounded-lg border-2 text-center transition-all relative",
                                    appointment && !isVacant
                                      ? appointment.bookedVia === "Walk-in"
                                        ? "bg-green-100 border-green-400 dark:bg-green-950/30 dark:border-green-700"
                                        : "bg-blue-100 border-blue-400 dark:bg-blue-950/30 dark:border-blue-700"
                                      : isNoShow
                                      ? "bg-amber-50 border-amber-300 border-dashed dark:bg-amber-950/10 dark:border-amber-600"
                                      : isImaginaryWSlot
                                      ? "bg-green-50 border-green-300 border-dashed dark:bg-green-950/10 dark:border-green-600"
                                      : isEmptySlotWithinOneHour
                                      ? "bg-green-50 border-green-300 border-dashed dark:bg-green-950/10 dark:border-green-600"
                                      : isEmptySlotBeforeImaginaryW
                                      ? "bg-blue-50 border-blue-300 border-dashed dark:bg-blue-950/10 dark:border-blue-600"
                                      : isPotentialWPosition
                                      ? "bg-green-50 border-green-300 border-dashed dark:bg-green-950/10 dark:border-green-600"
                                      : "bg-gray-50 border-gray-200 dark:bg-gray-950/10 dark:border-gray-700"
                                  )}
                                >
                                  {appointment && !isVacant && appointment.bookedVia !== 'Walk-in' ? (
                                    <>
                                      {shouldShowTime && (
                                        <div className="text-xs font-semibold mb-1">
                                          {format(slot.time!, 'hh:mm a')}
                                        </div>
                                      )}
                                      <div className="text-xs text-muted-foreground mb-1">
                                        Slot #{displaySlotIndex}
                                      </div>
                                    </>
                                  ) : appointment && !isVacant && appointment.bookedVia === 'Walk-in' ? (
                                    <>
                                      <div className="text-xs text-muted-foreground mb-1">
                                        Slot #{displaySlotIndex}
                                      </div>
                                      <div className="text-xs text-muted-foreground italic mb-1">
                                        (No time - inserted between A tokens)
                                      </div>
                                    </>
                                  ) : isImaginaryWSlot ? (
                                    <>
                                      <div className="text-xs text-muted-foreground mb-1 font-medium">
                                        Slot #{displaySlotIndex}
                                      </div>
                                      <div className="text-xs text-muted-foreground italic mb-1">
                                        (W Slot - No time)
                                      </div>
                                    </>
                                  ) : (
                                    <>
                                      {shouldShowTime && (
                                        <div className="text-xs font-semibold mb-1">
                                          {format(slot.time!, 'hh:mm a')}
                                        </div>
                                      )}
                                      <div className="text-xs text-muted-foreground mb-1">
                                        Slot #{displaySlotIndex}
                                      </div>
                                    </>
                                  )}
                                {appointment && !isVacant ? (
                                  <div className="space-y-1">
                                    <div className={cn(
                                      "text-sm font-bold",
                                      appointment.bookedVia === "Walk-in" ? "text-green-700 dark:text-green-300" : "text-blue-700 dark:text-blue-300"
                                    )}>
                                      {appointment.tokenNumber || `#${appointment.slotIndex}`}
                                    </div>
                                    <Badge 
                                      variant="outline"
                                      className={cn(
                                        "text-xs",
                                        appointment.status === "Confirmed" && "bg-green-200 text-green-900 border-green-400",
                                        appointment.status === "Pending" && "bg-yellow-200 text-yellow-900 border-yellow-400",
                                        appointment.status === "Skipped" && "bg-orange-200 text-orange-900 border-orange-400",
                                        appointment.status === "Completed" && "bg-gray-200 text-gray-900 border-gray-400"
                                      )}
                                    >
                                      {appointment.status}
                                    </Badge>
                                    <div className="text-xs font-medium truncate" title={appointment.patientName}>
                                      {appointment.patientName}
                                    </div>
                                    {appointment.delay && appointment.delay > 0 && (
                                      <div className="text-xs text-orange-600 dark:text-orange-400 font-medium">
                                        ⏱️ +{appointment.delay} min
                                      </div>
                                    )}
                                  </div>
                                ) : isNoShow ? (
                                  <div className="space-y-1">
                                    <div className="text-xs text-amber-600 dark:text-amber-400 font-medium">
                                      No-show (Available)
                                    </div>
                                    <div className="text-xs text-muted-foreground truncate" title={appointment?.patientName}>
                                      {appointment?.patientName || 'N/A'}
                                    </div>
                                  </div>
                                ) : isImaginaryWSlot ? (
                                  <div className="space-y-1">
                                    <div className="text-xs text-green-600 dark:text-green-400 font-medium">
                                      W Slot
                                    </div>
                                    <div className="text-xs text-muted-foreground">
                                      (Imaginary - No time)
                                    </div>
                                  </div>
                                ) : isEmptySlotWithinOneHour ? (
                                  <div className="space-y-1">
                                    <div className="text-xs text-green-600 dark:text-green-400 font-medium">
                                      W Priority
                                    </div>
                                    <div className="text-xs text-muted-foreground">
                                      (Empty slot - W can fill)
                                    </div>
                                  </div>
                                ) : isEmptySlotBeforeImaginaryW ? (
                                  <div className="space-y-1">
                                    <div className="text-xs text-blue-600 dark:text-blue-400 font-medium">
                                      Available for A
                                    </div>
                                    <div className="text-xs text-muted-foreground">
                                      (Empty slot - A can fill first)
                                    </div>
                                  </div>
                                ) : isPotentialWPosition ? (
                                  <div className="space-y-1">
                                    <div className="text-xs text-green-600 dark:text-green-400 font-medium">
                                      W Position
                                    </div>
                                    <div className="text-xs text-muted-foreground">
                                      (Next W here)
                                    </div>
                                  </div>
                                ) : (
                                  <div className="text-xs text-muted-foreground">
                                    Empty
                                  </div>
                                )}
                                </div>
                              );
                            });
                          })()}
                        </div>
                      </div>
                      
                      {/* Legend */}
                      <div className="flex flex-wrap gap-4 text-xs p-3 bg-muted/30 rounded-lg">
                        <div className="flex items-center gap-2">
                          <div className="w-4 h-4 rounded border-2 bg-blue-100 border-blue-400"></div>
                          <span>A Token (Advanced Booking)</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-4 h-4 rounded border-2 bg-green-100 border-green-400"></div>
                          <span>W Token (Walk-in) - Placed at intervals</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-4 h-4 rounded border-2 border-dashed bg-green-50 border-green-300"></div>
                          <span>W Slot (Imaginary - No time, spread at intervals: {walkInTokenAllotment}, {walkInTokenAllotment * 2}, {walkInTokenAllotment * 3}...)</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-4 h-4 rounded border-2 border-dashed bg-green-100 border-green-400"></div>
                          <span>W Priority (Empty slot within 1-hour - W can fill)</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-4 h-4 rounded border-2 border-dashed bg-green-50 border-green-300"></div>
                          <span>W Position (Imaginary slot - Next W here if no empty slots)</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-4 h-4 rounded border-2 border-dashed bg-amber-50 border-amber-300"></div>
                          <span>No-show Slot (Available for Reuse)</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-4 h-4 rounded border-2 bg-gray-50 border-gray-200"></div>
                          <span>Empty Slot</span>
                        </div>
                      </div>
                      
                      {/* Next W Token Information */}
                      {(() => {
                        // Calculate total slots across all sessions for the day
                        const dayOfWeek = daysOfWeek[getDay(selectedDate)];
                        const availabilityForDay = selectedDoctor.availabilitySlots?.find(s => s.day === dayOfWeek);
                        let totalSlots = 0;
                        if (availabilityForDay?.timeSlots) {
                          const consultationTime = selectedDoctor.averageConsultingTime || 15;
                          availabilityForDay.timeSlots.forEach(timeSlot => {
                            const sessionStart = parseTime(timeSlot.from, selectedDate);
                            const sessionEnd = parseTime(timeSlot.to, selectedDate);
                            let currentTime = sessionStart;
                            let sessionSlotCount = 0;
                            while (isBefore(currentTime, sessionEnd)) {
                              sessionSlotCount++;
                              currentTime = addMinutes(currentTime, consultationTime);
                            }
                            totalSlots += sessionSlotCount;
                          });
                        }
                        
                        // Calculate next W token number (total slots + 1 + current W counter)
                        const dateStr = format(selectedDate, "d MMMM yyyy");
                        const existingWTokens = filteredAppointments
                          .filter(a => a.bookedVia === 'Walk-in')
                          .sort((a, b) => {
                            const aNum = a.tokenNumber ? parseInt(a.tokenNumber.substring(1), 10) : 0;
                            const bNum = b.tokenNumber ? parseInt(b.tokenNumber.substring(1), 10) : 0;
                            return bNum - aNum;
                          });
                        
                        const wTokenStartNumber = totalSlots + 1;
                        let nextWTokenNumber = wTokenStartNumber;
                        if (existingWTokens.length > 0) {
                          const lastWToken = existingWTokens[0];
                          const lastWTokenNum = lastWToken.tokenNumber ? parseInt(lastWToken.tokenNumber.substring(1), 10) : 0;
                          if (lastWTokenNum >= wTokenStartNumber) {
                            nextWTokenNumber = lastWTokenNum + 1;
                          }
                        }
                        
                        // Calculate where the next W token will be placed
                        const walkInTokenAllotment = clinicDetails?.walkInTokenAllotment || 7;
                        const confirmedAppointments = filteredAppointments
                          .filter(a => a.status === 'Pending' || a.status === 'Confirmed')
                          .filter(a => a.bookedVia === 'Advanced Booking' || a.bookedVia === 'Online' || a.bookedVia === 'Advanced')
                          .sort((a, b) => (a.slotIndex ?? Infinity) - (b.slotIndex ?? Infinity));
                        
                        const existingWTokensForPlacement = filteredAppointments
                          .filter(a => a.bookedVia === 'Walk-in' && (a.status === 'Pending' || a.status === 'Confirmed'))
                          .sort((a, b) => (a.slotIndex ?? Infinity) - (b.slotIndex ?? Infinity));
                        
                        // Priority 1: Empty slots within 1-hour window
                        const oneHourFromNow = addMinutes(now, 60);
                        const emptySlotsWithinOneHour = allSlots
                          .filter(slot => {
                            const isWithinOneHour = !isBefore(slot.time, now) && !isAfter(slot.time, oneHourFromNow);
                            if (!isWithinOneHour) return false;
                            const appointment = slotToAppointment.get(slot.slotIndex);
                            const isEmpty = !appointment;
                            const isNoShow = appointment?.status === 'No-show';
                            const isVacant = isEmpty || isNoShow || 
                              (appointment && ['Skipped', 'Cancelled', 'Completed'].includes(appointment.status));
                            return isVacant;
                          })
                          .map(slot => slot.slotIndex)
                          .sort((a, b) => a - b);
                        
                        // Use the same imaginary slot positions calculated for the visualization
                        const wSlotPositionsForInfo = new Set<number>(finalPositions);
                        const totalSlotsForInfo = sessionSlotIndices.length;
                        const maxSlotIndexForInfo = maxSlotIndex;
                        const imaginaryWSlotsCountForInfo = wSlotPositionsForInfo.size;
                        
                        // Calculate imaginary W slot positions for comparison
                        const sortedImaginaryWSlots = Array.from(wSlotPositionsForInfo).sort((a, b) => a - b);
                        
                        // Helper function to check if a slot is occupied (Pending or Confirmed)
                        const isSlotOccupied = (slotIndex: number): boolean => {
                          const appointment = slotToAppointment.get(slotIndex);
                          if (!appointment) return false;
                          return appointment.status === 'Pending' || appointment.status === 'Confirmed';
                        };
                        
                        // Filter out occupied slots from imaginary W slots
                        const availableImaginaryWSlots = sortedImaginaryWSlots.filter(slotIndex => !isSlotOccupied(slotIndex));
                        
                        // Priority 2: Empty slots that come before imaginary W slots
                        const emptySlotsBeforeImaginaryW = allSlots
                          .filter(slot => {
                            const appointment = slotToAppointment.get(slot.slotIndex);
                            const isEmpty = !appointment;
                            const isNoShow = appointment?.status === 'No-show';
                            const isVacant = isEmpty || isNoShow || 
                              (appointment && ['Skipped', 'Cancelled', 'Completed'].includes(appointment.status));
                            
                            // If this slot is empty/vacant and comes before any imaginary W slot
                            if (isVacant && availableImaginaryWSlots.length > 0) {
                              const firstImaginaryWSlot = availableImaginaryWSlots[0];
                              if (slot.slotIndex < firstImaginaryWSlot) {
                                // Only add if it's not already in emptySlotsWithinOneHour and not occupied
                                return !emptySlotsWithinOneHour.includes(slot.slotIndex) && !isSlotOccupied(slot.slotIndex);
                              }
                            }
                            return false;
                          })
                          .map(slot => slot.slotIndex)
                          .sort((a, b) => a - b);
                        
                        // Priority 2: Imaginary W slot position, Priority 3: Empty slots before imaginary W
                        let nextWSlotPosition: number | null = null;
                        if (emptySlotsWithinOneHour.length > 0) {
                          // Priority 1: Empty slots within 1-hour window
                          nextWSlotPosition = emptySlotsWithinOneHour[0];
                        } else if (availableImaginaryWSlots.length > 0) {
                          // Priority 2: Use the first available imaginary W slot position (use imaginary W slots first!)
                          nextWSlotPosition = availableImaginaryWSlots[0];
                        } else if (emptySlotsBeforeImaginaryW.length > 0) {
                          // Priority 3: Use earliest empty slot before imaginary W slots (only if no imaginary W slots available)
                          nextWSlotPosition = emptySlotsBeforeImaginaryW[0];
                        } else {
                          // Fallback: Calculate imaginary W slot position
                          let calculatedSlot: number | null = null;
                          if (confirmedAppointments.length === 0) {
                            calculatedSlot = walkInTokenAllotment;
                          } else if (existingWTokensForPlacement.length === 0) {
                            if (confirmedAppointments.length >= walkInTokenAllotment) {
                              const targetAppointment = confirmedAppointments[walkInTokenAllotment - 1];
                              calculatedSlot = (targetAppointment.slotIndex ?? 0) + 1;
                            } else {
                              const lastAppointment = confirmedAppointments[confirmedAppointments.length - 1];
                              calculatedSlot = (lastAppointment.slotIndex ?? 0) + 1;
                            }
                          } else {
                            const lastWToken = existingWTokensForPlacement[existingWTokensForPlacement.length - 1];
                            const lastWTokenSlotIndex = lastWToken?.slotIndex ?? -1;
                            const appointmentsAfterLastW = confirmedAppointments.filter(a => {
                              const aptSlotIndex = a.slotIndex ?? 0;
                              return aptSlotIndex > lastWTokenSlotIndex;
                            });
                            
                            if (appointmentsAfterLastW.length >= walkInTokenAllotment) {
                              const targetAppointment = appointmentsAfterLastW[walkInTokenAllotment - 1];
                              calculatedSlot = (targetAppointment.slotIndex ?? 0) + 1;
                            } else if (appointmentsAfterLastW.length > 0) {
                              const lastAppointment = appointmentsAfterLastW[appointmentsAfterLastW.length - 1];
                              calculatedSlot = (lastAppointment.slotIndex ?? 0) + 1;
                            } else {
                              calculatedSlot = lastWTokenSlotIndex + 1;
                            }
                          }
                          
                          // Check if calculated slot is occupied, if so find next available slot
                          if (calculatedSlot !== null && isSlotOccupied(calculatedSlot)) {
                            // Find next available slot after the calculated one
                            const allSlotIndices = allSlots.map(s => s.slotIndex).sort((a, b) => a - b);
                            const calculatedIndex = allSlotIndices.indexOf(calculatedSlot);
                            if (calculatedIndex >= 0) {
                              // Find next available slot
                              for (let i = calculatedIndex + 1; i < allSlotIndices.length; i++) {
                                const slotIndex = allSlotIndices[i];
                                if (!isSlotOccupied(slotIndex)) {
                                  nextWSlotPosition = slotIndex;
                                  break;
                                }
                              }
                            }
                          } else {
                            nextWSlotPosition = calculatedSlot;
                          }
                        }
                        
                        // Final check: If nextWSlotPosition is still occupied, find next available slot
                        if (nextWSlotPosition !== null && isSlotOccupied(nextWSlotPosition)) {
                          const allSlotIndices = allSlots.map(s => s.slotIndex).sort((a, b) => a - b);
                          const currentIndex = allSlotIndices.indexOf(nextWSlotPosition);
                          if (currentIndex >= 0) {
                            // Find next available slot
                            for (let i = currentIndex + 1; i < allSlotIndices.length; i++) {
                              const slotIndex = allSlotIndices[i];
                              if (!isSlotOccupied(slotIndex)) {
                                nextWSlotPosition = slotIndex;
                                break;
                              }
                            }
                            // If no available slot found after, set to null
                            if (isSlotOccupied(nextWSlotPosition!)) {
                              nextWSlotPosition = null;
                            }
                          }
                        }
                        
                        // Create mapping from visual position to display slot number
                        // This matches the logic used in the slot visualization above
                        // Calculate total slots across ALL sessions for the day
                        const dayOfWeekForInfo = daysOfWeek[getDay(selectedDate)];
                        const availabilityForDayForInfo = selectedDoctor.availabilitySlots?.find(s => s.day === dayOfWeekForInfo);
                        let totalSlotsForDayForInfo = 0;
                        if (availabilityForDayForInfo?.timeSlots) {
                          const consultationTimeForInfo = selectedDoctor.averageConsultingTime || 15;
                          availabilityForDayForInfo.timeSlots.forEach(timeSlot => {
                            const sessionStart = parseTime(timeSlot.from, selectedDate);
                            const sessionEnd = parseTime(timeSlot.to, selectedDate);
                            let currentTime = sessionStart;
                            let sessionSlotCount = 0;
                            while (isBefore(currentTime, sessionEnd)) {
                              sessionSlotCount++;
                              currentTime = addMinutes(currentTime, consultationTimeForInfo);
                            }
                            totalSlotsForDayForInfo += sessionSlotCount;
                          });
                        }
                        
                        // Calculate how many A slots exist in previous sessions (before current session)
                        let aSlotsInPreviousSessionsForInfo = 0;
                        if (availabilityForDayForInfo && selectedSessionIndex > 0) {
                          const consultationTimeForInfo = selectedDoctor.averageConsultingTime || 15;
                          for (let i = 0; i < selectedSessionIndex; i++) {
                            const timeSlot = availabilityForDayForInfo.timeSlots[i];
                            const sessionStart = parseTime(timeSlot.from, selectedDate);
                            const sessionEnd = parseTime(timeSlot.to, selectedDate);
                            let currentTime = sessionStart;
                            while (isBefore(currentTime, sessionEnd)) {
                              aSlotsInPreviousSessionsForInfo++;
                              currentTime = addMinutes(currentTime, consultationTimeForInfo);
                            }
                          }
                        }
                        
                        const maxRegularSlotIndex = allSlots.length > 0 ? Math.max(...allSlots.map(s => s.slotIndex)) : -1;
                        let imaginaryWSlotCounter = totalSlotsForDayForInfo; // Start from total slots for the day
                        let continuousASlotCounter = aSlotsInPreviousSessionsForInfo; // Start from previous sessions count
                        const visualToDisplaySlotMap = new Map<number, number>();
                        
                        // Create a map of slot index to W token appointments (for this section)
                        const wTokenAtSlotIndexForInfo = new Map<number, Appointment>();
                        existingWTokensForPlacement.forEach(wToken => {
                          const wTokenSlotIndex = wToken.slotIndex ?? -1;
                          if (wTokenSlotIndex >= 0) {
                            wTokenAtSlotIndexForInfo.set(wTokenSlotIndex, wToken);
                          }
                        });
                        
                        // Build the same combined list to create the mapping
                        const allSlotIndicesForMap = new Set<number>();
                        allSlots.forEach(slot => allSlotIndicesForMap.add(slot.slotIndex));
                        wSlotPositionsForInfo.forEach(slotIndex => allSlotIndicesForMap.add(slotIndex));
                        const sortedSlotIndicesForMap = Array.from(allSlotIndicesForMap).sort((a, b) => a - b);
                        
                        for (const actualSlotIndex of sortedSlotIndicesForMap) {
                          // Check if there's an A token appointment at this position
                          const aTokenAtThisPosition = slotToAppointment.get(actualSlotIndex);
                          const isAToken = aTokenAtThisPosition && 
                            (aTokenAtThisPosition.bookedVia === 'Advanced Booking' || 
                             aTokenAtThisPosition.bookedVia === 'Online' || 
                             aTokenAtThisPosition.bookedVia === 'Advanced') &&
                            (aTokenAtThisPosition.status === 'Pending' || aTokenAtThisPosition.status === 'Confirmed');
                          
                          if (wSlotPositionsForInfo.has(actualSlotIndex)) {
                            // This is an imaginary W slot position
                            const wTokenAtThisPosition = wTokenAtSlotIndexForInfo.get(actualSlotIndex);
                            
                            // IMPORTANT: If there's an A token at this position, treat it as a regular A slot
                            // A tokens should NEVER use imaginary W slot numbers - they always get continuous A slot numbers
                            if (isAToken) {
                              // A token is at an imaginary W slot position - treat it as a regular A slot
                              const regularSlot = allSlots.find(s => s.slotIndex === actualSlotIndex);
                              if (regularSlot) {
                                // Regular A slot - assign continuous number
                                const continuousASlotNumber = continuousASlotCounter++;
                                visualToDisplaySlotMap.set(actualSlotIndex, continuousASlotNumber);
                              }
                            } else if (wTokenAtThisPosition) {
                              // Actual W token - use its slotIndex
                              const wTokenSlotIndex = wTokenAtThisPosition.slotIndex ?? actualSlotIndex;
                              visualToDisplaySlotMap.set(actualSlotIndex, wTokenSlotIndex);
                            } else {
                              // Imaginary W slot - assign final slot number
                              const finalSlotNumber = imaginaryWSlotCounter++;
                              visualToDisplaySlotMap.set(actualSlotIndex, finalSlotNumber);
                            }
                          } else {
                            // This is a regular A slot
                            const regularSlot = allSlots.find(s => s.slotIndex === actualSlotIndex);
                            if (regularSlot) {
                              const wTokenAtThisRegularSlot = wTokenAtSlotIndexForInfo.get(regularSlot.slotIndex);
                              if (wTokenAtThisRegularSlot) {
                                // W token in regular slot - use its slotIndex
                                const wTokenSlotIndex = wTokenAtThisRegularSlot.slotIndex ?? regularSlot.slotIndex;
                                visualToDisplaySlotMap.set(actualSlotIndex, wTokenSlotIndex);
                              } else {
                                // Regular A slot - assign continuous number
                                const continuousASlotNumber = continuousASlotCounter++;
                                visualToDisplaySlotMap.set(actualSlotIndex, continuousASlotNumber);
                              }
                            }
                          }
                        }
                        
                        // Convert visual position to display slot number
                        const nextWSlotDisplayNumber = nextWSlotPosition !== null 
                          ? (visualToDisplaySlotMap.get(nextWSlotPosition) ?? nextWSlotPosition)
                          : null;
                        
                        return (
                          <div className="mt-4 p-4 bg-green-50 dark:bg-green-950/20 border-2 border-green-300 rounded-lg">
                            <h4 className="text-sm font-semibold mb-2 text-green-800 dark:text-green-200">
                              Next Walk-in Token Information
                            </h4>
                            <div className="space-y-2 text-sm">
                              <div className="flex items-center justify-between">
                                <span className="text-muted-foreground">Next W Token Number:</span>
                                <span className="font-bold text-green-700 dark:text-green-300">
                                  W{String(nextWTokenNumber).padStart(3, '0')}
                                </span>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-muted-foreground">Will be placed at:</span>
                                <span className="font-bold text-green-700 dark:text-green-300">
                                  {nextWSlotDisplayNumber !== null ? (
                                    <>
                                      Slot #{nextWSlotDisplayNumber}
                                      {emptySlotsWithinOneHour.includes(nextWSlotPosition!) && (
                                        <Badge variant="outline" className="ml-2 bg-green-200 text-green-900 border-green-400">
                                          Priority 1: Empty slot (1-hour window)
                                        </Badge>
                                      )}
                                      {availableImaginaryWSlots.includes(nextWSlotPosition!) && (
                                        <Badge variant="outline" className="ml-2 bg-green-200 text-green-900 border-green-400">
                                          Priority 2: Imaginary W slot
                                        </Badge>
                                      )}
                                      {emptySlotsBeforeImaginaryW.includes(nextWSlotPosition!) && !sortedImaginaryWSlots.includes(nextWSlotPosition!) && (
                                        <Badge variant="outline" className="ml-2 bg-green-200 text-green-900 border-green-400">
                                          Priority 3: Empty slot (before imaginary W)
                                        </Badge>
                                      )}
                                    </>
                                  ) : (
                                    'Calculating...'
                                  )}
                                </span>
                              </div>
                              <div className="text-xs text-muted-foreground mt-2 pt-2 border-t border-green-200">
                                <div>• W tokens start from W{String(wTokenStartNumber).padStart(3, '0')} (Total slots: {totalSlots} + 1)</div>
                                <div>• Priority 1: Empty slots within 1-hour window (where A tokens can't book)</div>
                                <div>• Priority 2: Imaginary W slot position (after {walkInTokenAllotment} confirmed appointments) - use imaginary W slots first!</div>
                                <div>• Priority 3: Empty slots that come before imaginary W slots (only if no imaginary W slots available)</div>
                              </div>
                            </div>
                          </div>
                        );
                      })()}
                      
                      {/* Booked Tokens List */}
                      <div>
                        <h4 className="text-sm font-semibold mb-3">Booked Tokens - Session {selectedSessionIndex + 1}</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 max-h-96 overflow-y-auto">
                          {filteredAppointments.map((apt) => (
                            <div
                              key={apt.id}
                              className={cn(
                                "p-3 rounded-lg border-2",
                                apt.status === "Confirmed" && "bg-blue-100 border-blue-400 dark:bg-blue-950/30 dark:border-blue-700",
                                apt.status === "Pending" && "bg-yellow-100 border-yellow-400 dark:bg-yellow-950/30 dark:border-yellow-700",
                                apt.status === "Skipped" && "bg-orange-100 border-orange-400 dark:bg-orange-950/30 dark:border-orange-700",
                                apt.status === "Completed" && "bg-gray-100 border-gray-400 dark:bg-gray-950/30 dark:border-gray-700",
                                apt.bookedVia === "Walk-in" && "border-green-400"
                              )}
                            >
                              <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-2">
                                  <span className="text-lg font-bold">{apt.tokenNumber || `#${apt.slotIndex}`}</span>
                                  <Badge 
                                    variant="outline"
                                    className={cn(
                                      apt.status === "Confirmed" && "bg-green-200 text-green-900 border-green-400",
                                      apt.status === "Pending" && "bg-yellow-200 text-yellow-900 border-yellow-400",
                                      apt.status === "Skipped" && "bg-orange-200 text-orange-900 border-orange-400",
                                      apt.status === "Completed" && "bg-gray-200 text-gray-900 border-gray-400"
                                    )}
                                  >
                                    {apt.status}
                                  </Badge>
                                </div>
                                <Badge variant="outline">
                                  {apt.bookedVia || "Advanced Booking"}
                                </Badge>
                              </div>
                              <div className="text-sm space-y-1">
                                <div className="font-medium">{apt.patientName}</div>
                                <div className="text-muted-foreground">Time: {apt.time}</div>
                                {apt.slotIndex !== undefined && (
                                  <div className="text-xs text-muted-foreground">Slot: #{apt.slotIndex}</div>
                                )}
                                {apt.delay && apt.delay > 0 && (
                                  <div className="text-xs text-orange-600 dark:text-orange-400 font-medium">
                                    ⏱️ Delayed by {apt.delay} min
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                          {filteredAppointments.length === 0 && (
                            <div className="col-span-full text-center py-8 text-muted-foreground">
                              <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
                              <p className="text-sm">No appointments booked for this session</p>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </CardContent>
            </Card>
          )}

          {!selectedDoctor || !queueState ? (
            <div className="text-center py-8 text-muted-foreground">
              {!selectedDoctor
                ? "Please select a doctor"
                : !selectedDate
                ? "Please select a date"
                : "No appointments found for this date"}
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Left Column: Doctor Consultation Room */}
              <div className="space-y-6">
                <Card className="border-2 border-primary">
                  <CardHeader className="bg-primary text-primary-foreground">
                    <CardTitle className="flex items-center gap-2">
                      <Stethoscope className="h-5 w-5" />
                      Doctor Consultation Room
                    </CardTitle>
                    <CardDescription className="text-primary-foreground/80">
                      Currently consulting patient
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="p-6">
                    {queueState.currentConsultation ? (
                      <div className="space-y-4">
                        <div className="text-center">
                          <div className="text-4xl font-bold text-primary mb-2">
                            {queueState.currentConsultation.tokenNumber || "N/A"}
                          </div>
                          <div className="text-sm text-muted-foreground">Token Number</div>
                        </div>
                        <Separator />
                        <div className="space-y-2">
                          <div className="flex justify-between">
                            <span className="text-sm text-muted-foreground">Patient Name:</span>
                            <span className="text-sm font-semibold">{queueState.currentConsultation.patientName}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-sm text-muted-foreground">Appointment Time:</span>
                            <span className="text-sm font-semibold">{queueState.currentConsultation.time}</span>
                          </div>
                          {queueState.currentConsultation.delay && queueState.currentConsultation.delay > 0 && (
                            <div className="flex justify-between">
                              <span className="text-sm text-muted-foreground">Delay:</span>
                              <span className="text-sm font-semibold text-orange-600 dark:text-orange-400">
                                ⏱️ +{queueState.currentConsultation.delay} min
                              </span>
                            </div>
                          )}
                          <div className="flex justify-between">
                            <span className="text-sm text-muted-foreground">Status:</span>
                            <Badge variant="default" className="bg-green-600">
                              {queueState.currentConsultation.status}
                            </Badge>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-sm text-muted-foreground">Booked Via:</span>
                            <Badge variant="outline">
                              {queueState.currentConsultation.bookedVia || "Advanced Booking"}
                            </Badge>
                          </div>
                          {queueState.consultationCount > 0 && (
                            <div className="flex justify-between">
                              <span className="text-sm text-muted-foreground">Consultations Completed:</span>
                              <span className="text-sm font-semibold">{queueState.consultationCount}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="text-center py-8 text-muted-foreground">
                        <Stethoscope className="h-12 w-12 mx-auto mb-4 opacity-50" />
                        <p>No patient currently consulting</p>
                        <p className="text-xs mt-2">Waiting for next patient from buffer queue</p>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Buffer Queue */}
                <Card className="border-2 border-yellow-400">
                  <CardHeader className="bg-yellow-50 dark:bg-yellow-950/20">
                    <CardTitle className="flex items-center gap-2">
                      <Clock className="h-5 w-5 text-yellow-600" />
                      Buffer Queue
                      <Badge variant="outline" className="ml-auto bg-yellow-100 text-yellow-800 border-yellow-400">
                        Max 2
                      </Badge>
                    </CardTitle>
                    <CardDescription>
                      Top 2 patients from Arrived Queue (ready for consultation)
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="p-4">
                    {queueState.bufferQueue.length > 0 ? (
                      <div className="space-y-3">
                        {queueState.bufferQueue.map((apt, index) => (
                          <div
                            key={apt.id}
                            className={cn(
                              "p-4 rounded-lg border-2",
                              index === 0
                                ? "bg-yellow-100 border-yellow-400 dark:bg-yellow-950/30 dark:border-yellow-800"
                                : "bg-yellow-50 border-yellow-300 dark:bg-yellow-950/20 dark:border-yellow-700"
                            )}
                          >
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-2">
                                <Badge variant="outline" className="bg-yellow-200 text-yellow-900 border-yellow-400">
                                  Position {index + 1}
                                </Badge>
                                <span className="text-lg font-bold">{apt.tokenNumber || `#${apt.slotIndex}`}</span>
                              </div>
                              <Badge variant="outline">
                                {apt.bookedVia || "Advanced Booking"}
                              </Badge>
                            </div>
                            <div className="text-sm space-y-1">
                              <div className="font-medium">{apt.patientName}</div>
                              <div className="text-muted-foreground">Time: {apt.time}</div>
                              {apt.delay && apt.delay > 0 && (
                                <div className="text-xs text-orange-600 dark:text-orange-400 font-medium">
                                  ⏱️ +{apt.delay} min
                                </div>
                              )}
                            </div>
                            {index === 0 && (
                              <div className="mt-2 text-xs font-semibold text-yellow-800 dark:text-yellow-200">
                                ⬆️ Next to consult
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-4 text-muted-foreground">
                        <Clock className="h-8 w-8 mx-auto mb-2 opacity-50" />
                        <p className="text-sm">Buffer queue is empty</p>
                        <p className="text-xs mt-1">No patients ready in buffer</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Right Column: Arrived Queue and Skipped Queue */}
              <div className="space-y-6">
                {/* Arrived Queue */}
                <Card className="border-2 border-blue-400">
                  <CardHeader className="bg-blue-50 dark:bg-blue-950/20">
                    <CardTitle className="flex items-center gap-2">
                      <Users className="h-5 w-5 text-blue-600" />
                      Arrived Queue
                      <Badge variant="outline" className="ml-auto bg-blue-100 text-blue-800 border-blue-400">
                        {queueState.arrivedQueue.length} patients
                      </Badge>
                    </CardTitle>
                    <CardDescription>
                      All Confirmed appointments sorted by appointment time (first on top)
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="p-4 max-h-96 overflow-y-auto">
                    {queueState.arrivedQueue.length > 0 ? (
                      <div className="space-y-2">
                        {queueState.arrivedQueue.map((apt, index) => {
                          const isInBuffer = queueState.bufferQueue.some(b => b.id === apt.id);
                          return (
                            <div
                              key={apt.id}
                              className={cn(
                                "p-3 rounded-lg border-2 transition-all",
                                isInBuffer
                                  ? "bg-yellow-100 border-yellow-400 dark:bg-yellow-950/30 dark:border-yellow-800"
                                  : index < 2
                                  ? "bg-blue-100 border-blue-300 dark:bg-blue-950/20 dark:border-blue-700"
                                  : "bg-blue-50 border-blue-200 dark:bg-blue-950/10 dark:border-blue-600"
                              )}
                            >
                              <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-2">
                                  <Badge variant="outline" className="bg-blue-200 text-blue-900 border-blue-400">
                                    #{index + 1}
                                  </Badge>
                                  <span className="font-bold">{apt.tokenNumber || `#${apt.slotIndex}`}</span>
                                  {isInBuffer && (
                                    <Badge variant="outline" className="bg-yellow-200 text-yellow-900 border-yellow-400">
                                      Buffer
                                    </Badge>
                                  )}
                                </div>
                                <Badge variant="outline">
                                  {apt.bookedVia || "Advanced Booking"}
                                </Badge>
                              </div>
                              <div className="text-sm space-y-1">
                                <div className="font-medium">{apt.patientName}</div>
                                <div className="text-muted-foreground">Time: {apt.time}</div>
                                {apt.delay && apt.delay > 0 && (
                                  <div className="text-xs text-orange-600 dark:text-orange-400 font-medium">
                                    ⏱️ +{apt.delay} min
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="text-center py-4 text-muted-foreground">
                        <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
                        <p className="text-sm">No patients in arrived queue</p>
                        <p className="text-xs mt-1">Waiting for patients to confirm arrival</p>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Skipped Queue */}
                <Card className="border-2 border-orange-400">
                  <CardHeader className="bg-orange-50 dark:bg-orange-950/20">
                    <CardTitle className="flex items-center gap-2">
                      <UserX className="h-5 w-5 text-orange-600" />
                      Skipped Queue
                      <Badge variant="outline" className="ml-auto bg-orange-100 text-orange-800 border-orange-400">
                        {queueState.skippedQueue.length} patients
                      </Badge>
                    </CardTitle>
                    <CardDescription>
                      Patients who didn't confirm arrival by cut-off time (15 minutes before appointment)
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="p-4 max-h-96 overflow-y-auto">
                    {queueState.skippedQueue.length > 0 ? (
                      <div className="space-y-2">
                        {queueState.skippedQueue.map((apt, index) => (
                          <div
                            key={apt.id}
                            className="p-3 rounded-lg border-2 bg-orange-50 border-orange-300 dark:bg-orange-950/20 dark:border-orange-700"
                          >
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-2">
                                <Badge variant="outline" className="bg-orange-200 text-orange-900 border-orange-400">
                                  #{index + 1}
                                </Badge>
                                <span className="font-bold">{apt.tokenNumber || `#${apt.slotIndex}`}</span>
                              </div>
                              <Badge variant="outline">
                                {apt.bookedVia || "Advanced Booking"}
                              </Badge>
                            </div>
                            <div className="text-sm space-y-1">
                              <div className="font-medium">{apt.patientName}</div>
                              <div className="text-muted-foreground">Appointment Time: {apt.time}</div>
                              {apt.skippedAt && (
                                <div className="text-xs text-orange-600 dark:text-orange-400">
                                  Skipped at: {format(apt.skippedAt.toDate?.() || new Date(apt.skippedAt), "hh:mm a")}
                                </div>
                              )}
                            </div>
                            <div className="mt-2 text-xs text-orange-700 dark:text-orange-300">
                              ⚠️ Can be requeued after {clinicDetails?.skippedTokenRecurrence || 3} confirmed patients
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-4 text-muted-foreground">
                        <UserX className="h-8 w-8 mx-auto mb-2 opacity-50" />
                        <p className="text-sm">No skipped patients</p>
                        <p className="text-xs mt-1">All patients arrived on time</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          )}

          {/* System Logic Explanation */}
          {queueState && (
            <Card className="bg-muted/50">
              <CardHeader>
                <CardTitle className="text-lg">System Logic Explanation</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div>
                  <strong className="text-blue-600">1. Arrived Queue:</strong> Contains all appointments with status "Confirmed" sorted by appointment time (earliest first). This is the master queue of patients who have confirmed their arrival.
                </div>
                <div>
                  <strong className="text-yellow-600">2. Buffer Queue:</strong> Contains the top 2 patients from the Arrived Queue. These are the next patients ready for consultation. If the buffer is empty, the doctor consults the top patient from the Arrived Queue directly.
                </div>
                <div>
                  <strong className="text-primary">3. Doctor Consultation Room:</strong> Shows the patient currently being consulted. This is always the first patient from the Buffer Queue (or Arrived Queue if buffer is empty).
                </div>
                <div>
                  <strong className="text-orange-600">4. Skipped Queue:</strong> Contains patients with status "Skipped" who didn't confirm arrival by the cut-off time (15 minutes before their appointment). These can be requeued after {clinicDetails?.skippedTokenRecurrence || 3} confirmed patients.
                </div>
                <Separator />
                <div className="space-y-2">
                  <div><strong>Flow:</strong></div>
                  <div className="ml-4 space-y-1">
                    <div>• Patient confirms arrival → Status changes to "Confirmed" → Added to Arrived Queue</div>
                    <div>• Top 2 from Arrived Queue → Moved to Buffer Queue</div>
                    <div>• Top patient from Buffer Queue → Goes to Doctor Consultation Room</div>
                    <div>• After consultation → Status changes to "Completed" → Consultation counter increments</div>
                    <div>• If patient doesn't confirm by cut-off time → Status changes to "Skipped" → Added to Skipped Queue</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
