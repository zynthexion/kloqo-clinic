

export type TimeSlot = {
  from: string;
  to: string;
};

export type AvailabilitySlot = {
  day: string;
  timeSlots: TimeSlot[];
};



export type BookedSlot = {
    date: string;
    time: string;
    tokenNumber: string;
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
  bookedSlots?: BookedSlot[];
  freeFollowUpDays?: number;
  advanceBookingDays?: number;
  registrationNumber?: string;
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
  department: string;
  status: 'Confirmed' | 'Pending' | 'Cancelled' | 'Completed' | 'No-show' | 'Skipped';
  treatment: string;
  tokenNumber: string;
  numericToken: number;
  bookedVia: 'Advanced Booking' | 'Walk-in';
  place?: string;
  isSkipped?: boolean;
  slotIndex?: number;
  sessionIndex?: number;
  createdAt?: any;
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




