
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

if (typeof window !== 'undefined') {
  throw new Error("This script should only be run in a Node.js environment.");
}

const masterDepartments = [
  {
    id: 'dept-01',
    name: 'General Medicine',
    description: 'Comprehensive primary care for adults, focusing on disease prevention and health promotion.',
    image: 'https://images.pexels.com/photos/3825529/pexels-photo-3825529.jpeg',
    imageHint: 'general checkup doctor patient',
    doctors: [],
  },
  {
    id: 'dept-02',
    name: 'Cardiology',
    description: 'Specialized care for heart and blood vessel disorders.',
    image: 'https://images.pexels.com/photos/8460159/pexels-photo-8460159.jpeg',
    imageHint: 'heart doctor stethoscope',
    doctors: [],
  },
  {
    id: 'dept-03',
    name: 'Pediatrics',
    description: 'Medical care for infants, children, and adolescents.',
    image: 'https://images.pexels.com/photos/5452201/pexels-photo-5452201.jpeg',
    imageHint: 'child doctor clinic',
    doctors: [],
  },
  {
    id: 'dept-04',
    name: 'Dermatology',
    description: 'Treatment of skin, hair, and nail conditions.',
    image: 'https://images.pexels.com/photos/6628101/pexels-photo-6628101.jpeg',
    imageHint: 'skin consultation',
    doctors: [],
  },
  {
    id: 'dept-05',
    name: 'Neurology',
    description: 'Care for disorders of the nervous system, including brain and spinal cord.',
    image: 'https://images.pexels.com/photos/8460162/pexels-photo-8460162.jpeg',
    imageHint: 'brain scan neurologist',
    doctors: [],
  },
  {
    id: 'dept-06',
    name: 'Orthopedics',
    description: 'Treatment of the musculoskeletal system, including bones and joints.',
    image: 'https://images.pexels.com/photos/5452198/pexels-photo-5452198.jpeg',
    imageHint: 'xray bone doctor',
    doctors: [],
  },
  {
    id: 'dept-07',
    name: 'Oncology',
    description: 'Diagnosis and treatment of cancer.',
    image: 'https://images.pexels.com/photos/8460144/pexels-photo-8460144.jpeg',
    imageHint: 'oncology cancer consultation',
    doctors: [],
  },
  {
    id: 'dept-08',
    name: 'OB/GYN',
    description: "Women's health services, including pregnancy and childbirth.",
    image: 'https://images.pexels.com/photos/7088520/pexels-photo-7088520.jpeg',
    imageHint: 'pregnancy gynecologist',
    doctors: [],
  },
  {
    id: 'dept-09',
    name: 'Gastroenterology',
    description: 'Care for the digestive system and its disorders.',
    image: 'https://images.pexels.com/photos/8460126/pexels-photo-8460126.jpeg',
    imageHint: 'stomach doctor consultation',
    doctors: [],
  },
  {
    id: 'dept-10',
    name: 'Pulmonology',
    description: 'Specializing in diseases of the lungs and respiratory tract.',
    image: 'https://images.pexels.com/photos/5452235/pexels-photo-5452235.jpeg',
    imageHint: 'lungs respiratory care',
    doctors: [],
  },
  {
    id: 'dept-11',
    name: 'Endocrinology',
    description: 'Treatment of hormonal imbalances and diseases.',
    image: 'https://images.pexels.com/photos/8460168/pexels-photo-8460168.jpeg',
    imageHint: 'hormone doctor consultation',
    doctors: [],
  },
  {
    id: 'dept-12',
    name: 'Nephrology',
    description: 'Specializing in kidney care and diseases.',
    image: 'https://images.pexels.com/photos/3825527/pexels-photo-3825527.jpeg',
    imageHint: 'kidney doctor clinic',
    doctors: [],
  },
  {
    id: 'dept-13',
    name: 'Urology',
    description: 'Care for the urinary tract and male reproductive system.',
    image: 'https://images.pexels.com/photos/7088529/pexels-photo-7088529.jpeg',
    imageHint: 'urologist consultation',
    doctors: [],
  },
  {
    id: 'dept-14',
    name: 'Ophthalmology',
    description: 'Comprehensive eye and vision care.',
    image: 'https://images.pexels.com/photos/3845763/pexels-photo-3845763.jpeg',
    imageHint: 'eye test optometrist',
    doctors: [],
  },
  {
    id: 'dept-15',
    name: 'ENT',
    description: 'Treatment for ear, nose, and throat conditions.',
    image: 'https://images.pexels.com/photos/5452242/pexels-photo-5452242.jpeg',
    imageHint: 'ear nose throat doctor',
    doctors: [],
  },
  {
    id: 'dept-16',
    name: 'Psychiatry',
    description: 'Mental health care and treatment of emotional disorders.',
    image: 'https://images.pexels.com/photos/5699456/pexels-photo-5699456.jpeg',
    imageHint: 'mental health therapy',
    doctors: [],
  },
  {
    id: 'dept-17',
    name: 'Rheumatology',
    description: 'Diagnosis and therapy of rheumatic diseases.',
    image: 'https://images.pexels.com/photos/5452246/pexels-photo-5452246.jpeg',
    imageHint: 'joint pain consultation',
    doctors: [],
  },
  {
    id: 'dept-18',
    name: 'Radiology',
    description: 'Medical imaging to diagnose and treat diseases.',
    image: 'https://images.pexels.com/photos/8460151/pexels-photo-8460151.jpeg',
    imageHint: 'radiologist scan machine',
    doctors: [],
  },
  {
    id: 'dept-19',
    name: 'Anesthesiology',
    description: 'Management of pain and total care of the patient before, during and after surgery.',
    image: 'https://images.pexels.com/photos/5452241/pexels-photo-5452241.jpeg',
    imageHint: 'operating room anesthesia',
    doctors: [],
  },
  {
    id: 'dept-20',
    name: 'Dentistry',
    description: 'Diagnosis, treatment, and prevention of diseases and conditions of the oral cavity.',
    image: 'https://images.pexels.com/photos/6812524/pexels-photo-6812524.jpeg',
    imageHint: 'dentist tools clinic',
    doctors: [],
  },
  {
    id: 'dept-21',
    name: 'Emergency Medicine',
    description: 'Care for patients with acute illnesses or injuries which require immediate medical attention.',
    image: 'https://images.pexels.com/photos/8460122/pexels-photo-8460122.jpeg',
    imageHint: 'emergency room hospital',
    doctors: [],
  },
  {
    id: 'dept-22',
    name: 'Geriatrics',
    description: 'Health care of elderly people.',
    image: 'https://images.pexels.com/photos/5452204/pexels-photo-5452204.jpeg',
    imageHint: 'elder care clinic',
    doctors: [],
  },
  {
    id: 'dept-23',
    name: 'Hematology',
    description: 'Treatment of blood, blood-forming organs, and blood diseases.',
    image: 'https://images.pexels.com/photos/3825523/pexels-photo-3825523.jpeg',
    imageHint: 'blood sample doctor',
    doctors: [],
  },
  {
    id: 'dept-24',
    name: 'Infectious Disease',
    description: 'Diagnosis and treatment of complex infections.',
    image: 'https://images.pexels.com/photos/3825522/pexels-photo-3825522.jpeg',
    imageHint: 'infection control hospital',
    doctors: [],
  },
  {
    id: 'dept-25',
    name: 'Plastic Surgery',
    description: 'Surgical specialty dedicated to reconstruction of facial and body defects.',
    image: 'https://images.pexels.com/photos/5452250/pexels-photo-5452250.jpeg',
    imageHint: 'surgery preparation',
    doctors: [],
  },
  {
    id: 'dept-26',
    name: 'Physiotherapy',
    description: 'Helps restore movement and function when someone is affected by injury or disability.',
    image: 'https://images.pexels.com/photos/3825521/pexels-photo-3825521.jpeg',
    imageHint: 'rehabilitation physiotherapist',
    doctors: [],
  },
];

try {
    initializeApp({
        // If you're running this locally with a service account file:
        // credential: cert(require('./path/to/your/serviceAccountKey.json'))
    });
} catch(e) {
    if (e.code !== 'app/duplicate-app') {
        console.error("Firebase Admin initialization error:", e);
        process.exit(1);
    }
}

const db = getFirestore();

async function seedMasterDepartments() {
  const collectionRef = db.collection('master-departments');
  console.log('Starting to seed master-departments...');

  for (const dept of masterDepartments) {
    try {
      const docRef = collectionRef.doc(dept.id);
      await docRef.set(dept);
      console.log(`Added master department: ${dept.name}`);
    } catch (error) {
      console.error(`Error adding master department ${dept.name}:`, error);
    }
  }

  console.log('Finished seeding master-departments.');
}

seedMasterDepartments().catch(console.error);
