
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
};

export type Appointment = {
  id: string;
  patientName: string;
  doctor: string;
  date: string;
  time: string;
  department: string;
  status: 'Confirmed' | 'Pending' | 'Cancelled';
  treatment: string;
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
