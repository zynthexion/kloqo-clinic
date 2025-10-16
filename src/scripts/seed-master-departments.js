
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
    image: 'https://images.unsplash.com/photo-1576091160550-2173dba999ef?w=500&auto=format&fit=crop&q=60',
    imageHint: 'doctor laptop',
    doctors: [],
  },
  {
    id: 'dept-02',
    name: 'Cardiology',
    description: 'Specialized care for heart and blood vessel disorders.',
    image: 'https://images.unsplash.com/photo-1579684385127-6ac149463a50?w=500&auto=format&fit=crop&q=60',
    imageHint: 'heart ecg',
    doctors: [],
  },
  {
    id: 'dept-03',
    name: 'Pediatrics',
    description: 'Medical care for infants, children, and adolescents.',
    image: 'https://images.unsplash.com/photo-1605338301994-6b783321295e?w=500&auto=format&fit=crop&q=60',
    imageHint: 'doctor child',
    doctors: [],
  },
  {
    id: 'dept-04',
    name: 'Dermatology',
    description: 'Treatment of skin, hair, and nail conditions.',
    image: 'https://images.unsplash.com/photo-1629117281093-e4a46044710c?w=500&auto=format&fit=crop&q=60',
    imageHint: 'skin analysis',
    doctors: [],
  },
  {
    id: 'dept-05',
    name: 'Neurology',
    description: 'Care for disorders of the nervous system, including brain and spinal cord.',
    image: 'https://images.unsplash.com/photo-1552049298-958428a16892?w=500&auto=format&fit=crop&q=60',
    imageHint: 'brain scan',
    doctors: [],
  },
  {
    id: 'dept-06',
    name: 'Orthopedics',
    description: 'Treatment of the musculoskeletal system, including bones and joints.',
    image: 'https://images.unsplash.com/photo-1559775532-a434195a9482?w=500&auto=format&fit=crop&q=60',
    imageHint: 'x-ray bone',
    doctors: [],
  },
  {
    id: 'dept-07',
    name: 'Oncology',
    description: 'Diagnosis and treatment of cancer.',
    image: 'https://images.unsplash.com/photo-1581092576137-6d9539355744?w=500&auto=format&fit=crop&q=60',
    imageHint: 'lab research',
    doctors: [],
  },
  {
    id: 'dept-08',
    name: 'Obstetrics and Gynecology (OB/GYN)',
    description: "Women's health services.",
    image: 'https://images.unsplash.com/photo-1631215243349-5cd3b9148464?w=500&auto=format&fit=crop&q=60',
    imageHint: 'pregnancy ultrasound',
    doctors: [],
  },
  {
    id: 'dept-09',
    name: 'Gastroenterology',
    description: 'Care for the digestive system and its disorders.',
    image: 'https://images.unsplash.com/photo-1619623696587-2a493906231e?w=500&auto=format&fit=crop&q=60',
    imageHint: 'digestive system',
    doctors: [],
  },
  {
    id: 'dept-10',
    name: 'Pulmonology',
    description: 'Specializing in diseases of the lungs and respiratory tract.',
    image: 'https://images.unsplash.com/photo-1607619056574-7d8d3ee536b2?w=500&auto=format&fit=crop&q=60',
    imageHint: 'lungs model',
    doctors: [],
  },
  {
    id: 'dept-11',
    name: 'Endocrinology',
    description: 'Treatment of hormonal imbalances and diseases.',
    image: 'https://plus.unsplash.com/premium_photo-1681995326991-236531742439?w=500&auto=format&fit=crop&q=60',
    imageHint: 'medical chart',
    doctors: [],
  },
  {
    id: 'dept-12',
    name: 'Nephrology',
    description: 'Specializing in kidney care and diseases.',
    image: 'https://images.unsplash.com/photo-1581594549592-3823d3e39396?w=500&auto=format&fit=crop&q=60',
    imageHint: 'kidney model',
    doctors: [],
  },
  {
    id: 'dept-13',
    name: 'Urology',
    description: 'Care for the urinary tract and male reproductive system.',
    image: 'https://images.unsplash.com/photo-1629905684821-2a8e85906161?w=500&auto=format&fit=crop&q=60',
    imageHint: 'medical exam',
    doctors: [],
  },
  {
    id: 'dept-14',
    name: 'Ophthalmology',
    description: 'Comprehensive eye and vision care.',
    image: 'https://images.unsplash.com/photo-1579828898622-446b1e065oa1?w=500&auto=format&fit=crop&q=60',
    imageHint: 'eye exam',
    doctors: [],
  },
  {
    id: 'dept-15',
    name: 'Otolaryngology (ENT)',
    description: 'Treatment for ear, nose, and throat conditions.',
    image: 'https://images.unsplash.com/photo-1629905684821-2a8e85906161?w=500&auto=format&fit=crop&q=60',
    imageHint: 'ear model',
    doctors: [],
  },
  {
    id: 'dept-16',
    name: 'Psychiatry',
    description: 'Mental health care and treatment of emotional disorders.',
    image: 'https://images.unsplash.com/photo-1598449339797-0358503d47a4?w=500&auto=format&fit=crop&q=60',
    imageHint: 'therapy session',
    doctors: [],
  },
  {
    id: 'dept-17',
    name: 'Rheumatology',
    description: 'Diagnosis and therapy of rheumatic diseases.',
    image: 'https://plus.unsplash.com/premium_photo-1676999081594-81498a442a22?w=500&auto=format&fit=crop&q=60',
    imageHint: 'joint x-ray',
    doctors: [],
  },
  {
    id: 'dept-18',
    name: 'Radiology',
    description: 'Medical imaging to diagnose and treat diseases.',
    image: 'https://images.unsplash.com/photo-1581092576329-8ab1143a7933?w=500&auto=format&fit=crop&q=60',
    imageHint: 'mri scan',
    doctors: [],
  },
  {
    id: 'dept-19',
    name: 'Anesthesiology',
    description: 'Management of pain and total care of the patient before, during and after surgery.',
    image: 'https://images.unsplash.com/photo-1581594549592-3823d3e39396?w=500&auto=format&fit=crop&q=60',
    imageHint: 'operating room',
    doctors: [],
  },
  {
    id: 'dept-20',
    name: 'Dentistry',
    description: 'Diagnosis, treatment, and prevention of diseases and conditions of the oral cavity.',
    image: 'https://images.unsplash.com/photo-1629905684821-2a8e85906161?w=500&auto=format&fit=crop&q=60',
    imageHint: 'dental tools',
    doctors: [],
  },
  {
    id: 'dept-21',
    name: 'Emergency Medicine',
    description: 'Care for patients with acute illnesses or injuries which require immediate medical attention.',
    image: 'https://images.unsplash.com/photo-1532938911079-1b06ac7ceec7?w=500&auto=format&fit=crop&q=60',
    imageHint: 'emergency room',
    doctors: [],
  },
  {
    id: 'dept-22',
    name: 'Geriatrics',
    description: 'Health care of elderly people.',
    image: 'https://images.unsplash.com/photo-1594949563212-320e69882208?w=500&auto=format&fit=crop&q=60',
    imageHint: 'doctor elderly',
    doctors: [],
  },
  {
    id: 'dept-23',
    name: 'Hematology',
    description: 'Treatment of blood, blood-forming organs, and blood diseases.',
    image: 'https://images.unsplash.com/photo-1579154341148-3c3b05f88414?w=500&auto=format&fit=crop&q=60',
    imageHint: 'blood sample',
    doctors: [],
  },
  {
    id: 'dept-24',
    name: 'Infectious Disease',
    description: 'Diagnosis and treatment of complex infections.',
    image: 'https://images.unsplash.com/photo-1579532582937-16c1179a3348?w=500&auto=format&fit=crop&q=60',
    imageHint: 'microscope virus',
    doctors: [],
  },
  {
    id: 'dept-25',
    name: 'Plastic Surgery',
    description: 'Surgical specialty dedicated to reconstruction of facial and body defects.',
    image: 'https://images.unsplash.com/photo-1631215243349-5cd3b9148464?w=500&auto=format&fit=crop&q=60',
    imageHint: 'surgical tools',
    doctors: [],
  },
  {
    id: 'dept-26',
    name: 'Physiotherapy',
    description: 'Helps restore movement and function when someone is affected by injury or disability.',
    image: 'https://images.unsplash.com/photo-1591953931693-7a27453b3b4f?w=500&auto=format&fit=crop&q=60',
    imageHint: 'physical therapy',
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
