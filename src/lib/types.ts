export type Doctor = {
  id: string;
  name: string;
  specialty: string;
  avatar: string;
  schedule: string;
  preferences: string;
  historicalData: string;
};

export type Appointment = {
  id: string;
  patientName: string;
  doctor: string;
  date: Date;
  time: string;
  department: string;
};

export type Activity = {
  id: string;
  timestamp: Date;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
};

export type Report = {
  id: string;
  name: string;
  statuses: string[];
  type: 'room' | 'equipment';
};
