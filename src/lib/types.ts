

export type TimeSlot = {
  from: string;
  to: string;
};

export type AvailabilitySlot = {
  day: string;
  timeSlots: TimeSlot[];
};

export type LeaveSlot = {
    date: string; // "yyyy-MM-dd"
    slots: TimeSlot[];
}

export type Doctor = {
  id: string;
  name: string;
  specialty: string;
  avatar: string;
  schedule: string;
  preferences: string;
  historicalData: string;
  department?: string;
  totalPatients?: number;
  todaysAppointments?: number;
  availability: 'Available' | 'Unavailable';
  bio?: string;
  averageConsultingTime?: number;
  availabilitySlots?: AvailabilitySlot[];
  leaveSlots?: LeaveSlot[];
  degrees?: string[];
  experience?: number;
  rating?: number;
  reviews?: number;
  consultationFee?: number;
};

export type Appointment = {
  id:string;
  patientName: string;
  gender: 'Male' | 'Female' | 'Other';
  phone: string;
  age: number;
  doctor: string;
  date: string;
  time: string;
  department: string;
  status: 'Confirmed' | 'Pending' | 'Cancelled';
  treatment: string;
  tokenNumber: string;
  bookedVia: 'Online' | 'Phone' | 'Walk-in';
  place?: string;
  skipped?: boolean;
};

export type Patient = {
  id: string;
  name: string;
  age: number;
  gender: 'Male' | 'Female' | 'Other';
  phone: string;
  place?: string;
  lastVisit: string;
  doctor: string;
  totalAppointments: number;
};

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
    image: string;
    imageHint?: string;
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
    username: string;
    password?: string;
}
