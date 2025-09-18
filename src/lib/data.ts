import type { Doctor, Report } from './types';
import { PlaceHolderImages } from './placeholder-images';

const getImageUrl = (id: string) => PlaceHolderImages.find(img => img.id === id)?.imageUrl || '';

export const doctors: Doctor[] = [
  {
    id: 'D001',
    name: 'Dr. Emily Smith',
    specialty: 'Cardiology',
    avatar: getImageUrl('dr_smith'),
    schedule: 'Mon, Wed, Fri: 9 AM - 5 PM. Short lunch breaks.',
    preferences: 'Prefers back-to-back consultations in the morning to leave afternoons for administrative tasks. Avoids scheduling follow-ups on Fridays.',
    historicalData: 'Tends to run 15 minutes late for afternoon appointments. High patient satisfaction scores.'
  },
  {
    id: 'D002',
    name: 'Dr. Michael Jones',
    specialty: 'Neurology',
    avatar: getImageUrl('dr_jones'),
    schedule: 'Tue, Thu: 8 AM - 4 PM. Strict on-time appointments.',
    preferences: 'Likes to have 10-minute gaps between patients for note-taking. Prefers complex cases in the early afternoon.',
    historicalData: 'Appointment lengths are very consistent. Rarely cancels appointments.'
  },
  {
    id: 'D003',
    name: 'Dr. Linda Chen',
    specialty: 'Pediatrics',
    avatar: getImageUrl('dr_chen'),
    schedule: 'Mon-Fri: 10 AM - 6 PM. Flexible with walk-ins.',
    preferences: 'Does not want more than 3 new patient check-ups per day. Prefers longer slots for infants.',
    historicalData: 'Often extends appointment times for concerned parents, leading to a cascading delay throughout the day.'
  },
  {
    id: 'D004',
    name: 'Dr. Carlos Rodriguez',
    specialty: 'Orthopedics',
    avatar: getImageUrl('dr_rodriguez'),
    schedule: 'Mon, Tue, Thu: 9 AM - 5 PM. Surgery on Wednesdays.',
    preferences: 'Prefers post-op appointments on Mondays. No new patient consultations on Thursdays.',
    historicalData: 'Schedule is frequently disrupted by emergency consultations from the ER.'
  },
];

export const reports: Report[] = [
    { id: 'room-101', name: 'Room 101', statuses: ['Clean', 'Occupied', 'Needs Cleaning'], type: 'room' },
    { id: 'room-102', name: 'Room 102', statuses: ['Occupied', 'Needs Cleaning', 'Clean'], type: 'room' },
    { id: 'mri-1', name: 'MRI Scanner 1', statuses: ['Available', 'In Use', 'Maintenance'], type: 'equipment' },
    { id: 'xray-2', name: 'X-Ray Machine 2', statuses: ['In Use', 'Available', 'Maintenance'], type: 'equipment' },
    { id: 'room-205', name: 'Room 205', statuses: ['Needs Cleaning', 'Clean', 'Occupied'], type: 'room' },
    { id: 'ultrasound-1', name: 'Ultrasound 1', statuses: ['Maintenance', 'Available', 'In Use'], type: 'equipment' },
];

export const user = {
    name: 'Dr. Alice Bennett',
    email: 'alice.bennett@medidash.com',
    avatar: getImageUrl('user_avatar'),
};
