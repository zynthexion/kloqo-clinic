
const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const doctors = [
  {
    id: 'D001',
    name: 'Dr. Petra Winsburry',
    specialty: 'Routine Check-Ups',
    avatar: "https://picsum.photos/seed/doc1/100/100",
    schedule: 'Mon, Wed, Fri: 9 AM - 5 PM. Short lunch breaks.',
    preferences: 'Prefers back-to-back consultations in the morning to leave afternoons for administrative tasks. Avoids scheduling follow-ups on Fridays.',
    historicalData: 'Tends to run 15 minutes late for afternoon appointments. High patient satisfaction scores.',
    department: 'General Medicine',
    totalPatients: 150,
    todaysAppointments: 10,
    availability: 'Available',
  },
  {
    id: 'D002',
    name: 'Dr. Olivia Martinez',
    specialty: 'Heart Specialist',
    avatar: "https://picsum.photos/seed/doc2/100/100",
    schedule: 'Tue, Thu: 8 AM - 4 PM. Strict on-time appointments.',
    preferences: 'Likes to have 10-minute gaps between patients for note-taking. Prefers complex cases in the early afternoon.',
    historicalData: 'Appointment lengths are very consistent. Rarely cancels appointments.',
    department: 'Cardiology',
    totalPatients: 200,
    todaysAppointments: 0,
    availability: 'Unavailable',
  },
  {
    id: 'D003',
    name: 'Dr. Damian Sanchez',
    specialty: 'Child Health',
    avatar: "https://picsum.photos/seed/doc3/100/100",
    schedule: 'Mon-Fri: 10 AM - 6 PM. Flexible with walk-ins.',
    preferences: 'Does not want more than 3 new patient check-ups per day. Prefers longer slots for infants.',
    historicalData: 'Often extends appointment times for concerned parents, leading to a cascading delay throughout the day.',
    department: 'Pediatrics',
    totalPatients: 180,
    todaysAppointments: 12,
    availability: 'Available',
  },
  {
    id: 'D004',
    name: 'Dr. Chloe Harrington',
    specialty: 'Skin Specialist',
    avatar: "https://picsum.photos/seed/doc4/100/100",
    schedule: 'Mon, Tue, Thu: 9 AM - 5 PM. Surgery on Wednesdays.',
    preferences: 'Prefers post-op appointments on Mondays. No new patient consultations on Thursdays.',
    historicalData: 'Schedule is frequently disrupted by emergency consultations from the ER.',
    department: 'Dermatology',
    totalPatients: 120,
    todaysAppointments: 8,
    availability: 'Available',
  },
    {
    id: 'D005',
    name: 'Dr. Emily Smith',
    specialty: 'Routine Check-Ups',
    avatar: 'https://picsum.photos/seed/101/100/100',
    schedule: 'Mon, Wed, Fri: 9 AM - 5 PM. Short lunch breaks.',
    preferences: 'Prefers back-to-back consultations in the morning to leave afternoons for administrative tasks. Avoids scheduling follow-ups on Fridays.',
    historicalData: 'Tends to run 15 minutes late for afternoon appointments. High patient satisfaction scores.',
    department: 'General Medicine',
    totalPatients: 160,
    todaysAppointments: 0,
    availability: 'Unavailable',
  },
  {
    id: 'D006',
    name: 'Dr. Samuel Thompson',
    specialty: 'Heart Specialist',
    avatar: "https://picsum.photos/seed/doc6/100/100",
    schedule: 'Tue, Thu: 8 AM - 4 PM. Strict on-time appointments.',
    preferences: 'Likes to have 10-minute gaps between patients for note-taking. Prefers complex cases in the early afternoon.',
    historicalData: 'Appointment lengths are very consistent. Rarely cancels appointments.',
    department: 'Cardiology',
    totalPatients: 210,
    todaysAppointments: 14,
    availability: 'Available',
  },
    {
    id: 'D007',
    name: 'Dr. Sarah Johnson',
    specialty: 'Child Health',
    avatar: "https://picsum.photos/seed/doc7/100/100",
    schedule: 'Mon-Fri: 10 AM - 6 PM. Flexible with walk-ins.',
    preferences: 'Does not want more than 3 new patient check-ups per day. Prefers longer slots for infants.',
    historicalData: 'Often extends appointment times for concerned parents, leading to a cascading delay throughout the day.',
    department: 'Pediatrics',
    totalPatients: 170,
    todaysAppointments: 0,
    availability: 'Unavailable',
  },
  {
    id: 'D008',
    name: 'Dr. Luke Harrison',
    specialty: 'Skin Specialist',
    avatar: "https://picsum.photos/seed/doc8/100/100",
    schedule: 'Mon, Tue, Thu: 9 AM - 5 PM. Surgery on Wednesdays.',
    preferences: 'Prefers post-op appointments on Mondays. No new patient consultations on Thursdays.',
    historicalData: 'Schedule is frequently disrupted by emergency consultations from the ER.',
    department: 'Dermatology',
    totalPatients: 130,
    todaysAppointments: 9,
    availability: 'Available',
  },
  {
    id: 'D009',
    name: 'Dr. Andrew Peterson',
    specialty: 'Internal Health',
    avatar: "https://picsum.photos/seed/doc9/100/100",
    schedule: 'Mon-Fri: 10 AM - 6 PM. Flexible with walk-ins.',
    preferences: 'Does not want more than 3 new patient check-ups per day. Prefers longer slots for infants.',
    historicalData: 'Often extends appointment times for concerned parents, leading to a cascading delay throughout the day.',
    department: 'Internal Medicine',
    totalPatients: 190,
    todaysAppointments: 0,
    availability: 'Unavailable',
  },
  {
    id: 'D010',
    name: 'Dr. William Carter',
    specialty: 'Child Health',
    avatar: "https://picsum.photos/seed/doc10/100/100",
    schedule: 'Mon-Fri: 10 AM - 6 PM. Flexible with walk-ins.',
    preferences: 'Does not want more than 3 new patient check-ups per day. Prefers longer slots for infants.',
    historicalData: 'Often extends appointment times for concerned parents, leading to a cascading delay throughout the day.',
    department: 'Pediatrics',
    totalPatients: 175,
    todaysAppointments: 12,
    availability: 'Available',
  },
  {
    id: 'D011',
    name: 'Dr. Mark Wilson',
    specialty: 'Bone Specialist',
    avatar: "https://picsum.photos/seed/doc11/100/100",
    schedule: 'Mon-Fri: 10 AM - 6 PM. Flexible with walk-ins.',
    preferences: 'Does not want more than 3 new patient check-ups per day. Prefers longer slots for infants.',
    historicalData: 'Often extends appointment times for concerned parents, leading to a cascading delay throughout the day.',
    department: 'Orthopedics',
    totalPatients: 140,
    todaysAppointments: 0,
    availability: 'Unavailable',
  },
  {
    id: 'D012',
    name: 'Dr. Thomas Brown',
    specialty: 'Brain Specialist',
    avatar: "https://picsum.photos/seed/doc12/100/100",
    schedule: 'Mon-Fri: 10 AM - 6 PM. Flexible with walk-ins.',
    preferences: 'Does not want more than 3 new patient check-ups per day. Prefers longer slots for infants.',
    historicalData: 'Often extends appointment times for concerned parents, leading to a cascading delay throughout the day.',
    department: 'Neurology',
    totalPatients: 155,
    todaysAppointments: 11,
    availability: 'Available',
  },
];

const departments = [
  {
    id: 'dept-01',
    name: 'General Medicine',
    description: 'Provides comprehensive healthcare services including routine check-ups, preventive care, and treatment for a wide range of illnesses.',
    image: 'https://picsum.photos/seed/gm/600/400',
    imageHint: 'stethoscope pills',
    doctors: ['Dr. Petra Winsburry', 'Dr. Emily Smith', 'Dr. Samuel Thompson', 'Dr. Sarah Johnson', 'Dr. Luke Harrison', 'Dr. Andrew Peterson', 'Dr. William Carter', 'Dr. Mark Wilson', 'Dr. Thomas Brown', 'Dr. Olivia Martinez', 'Dr. Damian Sanchez', 'Dr. Chloe Harrington'],
  },
  {
    id: 'dept-02',
    name: 'Cardiology',
    description: 'Specializes in the diagnosis and treatment of heart-related conditions, offering advanced cardiac care and preventive services.',
    image: 'https://picsum.photos/seed/cardio/600/400',
    imageHint: 'heart model',
    doctors: ['Dr. Olivia Martinez', 'Dr. Samuel Thompson', 'Dr. Emily Smith', 'Dr. Sarah Johnson', 'Dr. Luke Harrison', 'Dr. Andrew Peterson', 'Dr. William Carter', 'Dr. Mark Wilson'],
  },
  {
    id: 'dept-03',
    name: 'Pediatrics',
    description: 'Dedicated to the health and well-being of children, providing specialized care for infants, children, and adolescents.',
    image: 'https://picsum.photos/seed/peds/600/400',
    imageHint: 'doctor baby',
    doctors: ['Dr. Damian Sanchez', 'Dr. Sarah Johnson', 'Dr. William Carter', 'Dr. Petra Winsburry', 'Dr. Emily Smith', 'Dr. Samuel Thompson', 'Dr. Luke Harrison'],
  },
  {
    id: 'dept-04',
    name: 'Dermatology',
    description: 'Focuses on the treatment of skin conditions, offering medical and cosmetic dermatology services to improve skin health and appearance.',
    image: 'https://picsum.photos/seed/derma/600/400',
    imageHint: 'skin care',
    doctors: ['Dr. Chloe Harrington', 'Dr. Luke Harrison', 'Dr. Petra Winsburry', 'Dr. Emily Smith', 'Dr. Samuel Thompson'],
  },
  {
    id: 'dept-05',
    name: 'Internal Medicine',
    description: 'Provides primary care for adults, focusing on the prevention, diagnosis, and treatment of adult diseases.',
    image: 'https://picsum.photos/seed/im/600/400',
    imageHint: 'anatomical model',
    doctors: ['Dr. Andrew Peterson', 'Dr. Petra Winsburry', 'Dr. Olivia Martinez', 'Dr. Samuel Thompson', 'Dr. Mark Wilson', 'Dr. Thomas Brown', 'Dr. Chloe Harrington', 'Dr. Damian Sanchez', 'Dr. Sarah Johnson', 'Dr. William Carter', 'Dr. Emily Smith', 'Dr. Luke Harrison'],
  },
  {
    id: 'dept-06',
    name: 'Orthopedics',
    description: 'Specializes in the treatment of musculoskeletal system disorders, including bones, joints, ligaments, tendons, and muscles.',
    image: 'https://picsum.photos/seed/ortho/600/400',
    imageHint: 'joint brace',
    doctors: ['Dr. Mark Wilson', 'Dr. Petra Winsburry', 'Dr. Olivia Martinez', 'Dr. Samuel Thompson', 'Dr. Andrew Peterson', 'Dr. Thomas Brown', 'Dr. Chloe Harrington', 'Dr. Damian Sanchez'],
  },
    {
    id: 'dept-07',
    name: 'Neurology',
    description: 'Deals with disorders of the nervous system, offering expert care for conditions affecting the brain, spinal cord, and nerves.',
    image: 'https://picsum.photos/seed/neuro/600/400',
    imageHint: 'brain model',
    doctors: ['Dr. Thomas Brown', 'Dr. Olivia Martinez', 'Dr. Samuel Thompson', 'Dr. Andrew Peterson', 'Dr. Mark Wilson', 'Dr. Chloe Harrington'],
  },
  {
    id: 'dept-08',
    name: 'Oncology',
    description: 'Focuses on the diagnosis and treatment of cancer, providing comprehensive cancer care and support services.',
    image: 'https://picsum.photos/seed/onco/600/400',
    imageHint: 'awareness ribbon',
    doctors: ['Dr. Emily Smith', 'Dr. Petra Winsburry', 'Dr. Olivia Martinez', 'Dr. Samuel Thompson', 'Dr. Andrew Peterson', 'Dr. Mark Wilson', 'Dr. Thomas Brown'],
  },
  {
    id: 'dept-09',
    name: 'Obstetrics and Gynecology (OB/GYN)',
    description: "Provides care for women's health, including pregnancy, childbirth, and reproductive health.",
    image: 'https://picsum.photos/seed/obgyn/600/400',
    imageHint: 'pregnant woman',
    doctors: ['Dr. Sarah Johnson', 'Dr. Petra Winsburry', 'Dr. Olivia Martinez', 'Dr. Samuel Thompson', 'Dr. Andrew Peterson', 'Dr. Mark Wilson', 'Dr. Thomas Brown', 'Dr. Chloe Harrington', 'Dr. Damian Sanchez', 'Dr. William Carter', 'Dr. Emily Smith'],
  }
];

// Initialize Firebase Admin SDK
// Make sure to have your service account key file in the root directory
// and update the GOOGLE_APPLICATION_CREDENTIALS environment variable
initializeApp();

const db = getFirestore();

async function seedCollection(collectionName, data, idField) {
  const collectionRef = db.collection(collectionName);
  console.log(`Starting to seed ${collectionName}...`);

  const promises = data.map(async (item) => {
    const docRef = collectionRef.doc(item[idField]);
    await docRef.set(item);
    console.log(`Added ${collectionName} ${item.name || item[idField]} with ID: ${item[idField]}`);
  });

  await Promise.all(promises);
  console.log(`Finished seeding ${collectionName}.`);
}

async function main() {
    await seedCollection('doctors', doctors, 'id');
    await seedCollection('departments', departments, 'id');
}


main().catch(console.error);

    