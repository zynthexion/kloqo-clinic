

export type TimeSlot = {
  from: string;
  to: string;
};

export type AvailabilitySlot = {
  day: string;
  timeSlots: TimeSlot[];
};



export type Doctor = {
  id: string;
  clinicId: string;
  name: string;
  specialty: string;
  avatar: string;
  schedule: string;
  preferences: string;
  historicalData: string;
  department: string;
  totalPatients?: number;
  todaysAppointments?: number;
  availability: 'Available' | 'Unavailable';
  consultationStatus?: 'In' | 'Out';
  bio?: string;
  averageConsultingTime?: number;
  availabilitySlots?: AvailabilitySlot[];
  leaveSlots?: any[];
  degrees?: string[];
  experience?: number;
  rating?: number;
  reviews?: number;
  consultationFee?: number;
  freeFollowUpDays?: number;
  advanceBookingDays?: number;
  registrationNumber?: string;
  reviewList?: Review[];
  actualAverageConsultationTime?: number;
  actualAverageConsultationTimeUpdatedAt?: any;
};

export type Review = {
  id: string;
  appointmentId: string;
  doctorId: string;
  doctorName: string;
  patientId: string;
  patientName: string;
  rating: number;
  feedback: string;
  createdAt: any;
  clinicId: string;
};

export type Appointment = {
  id:string;
  clinicId: string;
  patientId: string;
  doctorId?: string; // Made optional
  patientName: string;
  sex: 'Male' | 'Female' | 'Other';
  communicationPhone: string;
  age: number;
  doctor: string;
  date: string;
  time: string;
  arriveByTime?: string;
  department: string;
  status: 'Confirmed' | 'Pending' | 'Cancelled' | 'Completed' | 'No-show' | 'Skipped';
  treatment: string;
  tokenNumber: string;
  numericToken: number;
  bookedVia: 'Advanced Booking' | 'Walk-in' | 'Online';
  place?: string;
  isSkipped?: boolean;
  slotIndex?: number;
  sessionIndex?: number;
  createdAt?: any;
  reviewed?: boolean;
  reviewId?: string;
  completedAt?: any;
  skippedAt?: any; // Timestamp when appointment was marked as Skipped
  lateMinutes?: number; // Late minutes for skipped appointments
  cutOffTime?: any; // Cut-off time (appointment time - 15 minutes) - when Pending becomes Skipped (ORIGINAL, never delayed)
  noShowTime?: any; // No-show time (appointment time + 15 minutes) - when Skipped becomes No-show (ORIGINAL, never delayed)
  delay?: number; // Delay in minutes added when W tokens are inserted before this appointment
  doctorDelayMinutes?: number; // Delay in minutes due to doctor not starting on time (for display only, doesn't affect status transitions)
};

export type Patient = {
  id: string;
  primaryUserId?: string;
  clinicIds?: string[];
  name: string;
  age: number;
  sex: 'Male' | 'Female' | 'Other' | '';
  phone: string;
  communicationPhone?: string;
  email?: string;
  place?: string;
  totalAppointments: number;
  visitHistory?: string[];
  createdAt: any; // Can be Date or Firestore Timestamp
  updatedAt: any; // Can be Date or Firestore Timestamp
  relatedPatientIds?: string[];
  isPrimary?: boolean;
  isKloqoMember?: boolean;
};

export type NewRelative = Omit<Patient, 'id' | 'clinicIds' | 'visitHistory' | 'totalAppointments' | 'createdAt' | 'updatedAt' | 'relatedPatientIds'> & { phone?: string };


export type Activity = {
  id: string;
  timestamp: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
};

export type Report = {
  id: string;
  name: string;
  statuses: string[];
  type: 'room' | 'equipment';
};

export type Department = {
    id: string;
    name: string;
    description: string;
    icon: string;
    doctors: string[];
}

export type LiveStatus = {
    id: string;
    doctorName: string;
    specialty: string;
    room: string;
    status: 'available' | 'break';
    currentToken?: string;
    queue?: number;
    returnTime?: string;
};
    
export type MobileApp = {
    id: string;
    clinicId: string;
    username: string;
    password?: string;
}

export type User = {
    uid: string;
    phone: string;
    role?: 'clinicAdmin' | 'patient';
    patientId?: string;
    clinicId?: string;
    email?: string;
    name?: string;
    designation?: 'Doctor' | 'Owner';
    onboarded?: boolean;
}




