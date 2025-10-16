
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
    image: 'https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?w=500&auto=format&fit=crop&q=60&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxzZWFyY2h8Mnx8bWVkaWNpbmV8ZW58MHx8MHx8fDA%3D',
    imageHint: 'stethoscope pills',
    doctors: [],
  },
  {
    id: 'dept-02',
    name: 'Cardiology',
    description: 'Specialized care for heart and blood vessel disorders.',
    image: 'https://images.unsplash.com/photo-1530026405182-271453396975?w=500&auto=format&fit=crop&q=60&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxzZWFyY2h8MjZ8fG1lZGljaW5lfGVufDB8fDB8fHww',
    imageHint: 'heart model',
    doctors: [],
  },
  {
    id: 'dept-03',
    name: 'Pediatrics',
    description: 'Medical care for infants, children, and adolescents.',
    image: 'https://images.unsplash.com/photo-1599586120429-48281b6f0ece?w=500&auto=format&fit=crop&q=60&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxzZWFyY2h8MTR8fGNoaWxkcmVuJTIwZG9jdG9yfGVufDB8fDB8fHww',
    imageHint: 'doctor baby',
    doctors: [],
  },
  {
    id: 'dept-04',
    name: 'Dermatology',
    description: 'Treatment of skin, hair, and nail conditions.',
    image: 'https://images.unsplash.com/photo-1631894959934-396b3a8d11b3?w=500&auto=format&fit=crop&q=60&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxzZWFyY2h8MTB8fGRlcm1hdG9sb2d5fGVufDB8fDB8fHww',
    imageHint: 'skin care',
    doctors: [],
  },
  {
    id: 'dept-05',
    name: 'Neurology',
    description: 'Care for disorders of the nervous system, including brain and spinal cord.',
    image: 'https://images.unsplash.com/photo-1695423589949-c9a56f626245?w=500&auto=format&fit=crop&q=60&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxzZWFyY2h8Nnx8bmV1cm9sb2d5fGVufDB8fDB8fHww',
    imageHint: 'brain model',
    doctors: [],
  },
  {
    id: 'dept-06',
    name: 'Orthopedics',
    description: 'Treatment of the musculoskeletal system, including bones and joints.',
    image: 'https://images.unsplash.com/photo-1681878096238-31e1388b0a99?w=500&auto=format&fit=crop&q=60&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxzZWFyY2h8NHx8b3J0aG9wZWRpY3N8ZW58MHx8MHx8fDA%3D',
    imageHint: 'joint brace',
    doctors: [],
  },
  {
    id: 'dept-07',
    name: 'Oncology',
    description: 'Diagnosis and treatment of cancer.',
    image: 'https://plus.unsplash.com/premium_photo-1676999081594-81498a442a22?w=500&auto=format&fit=crop&q=60&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxzZWFyY2h8MXx8b25jb2xvZ3l8ZW58MHx8MHx8fDA%3D',
    imageHint: 'awareness ribbon',
    doctors: [],
  },
  {
    id: 'dept-08',
    name: 'Obstetrics and Gynecology (OB/GYN)',
    description: "Women's health services, including pregnancy and childbirth.",
    image: 'https://images.unsplash.com/photo-1576089182512-a8ce7c001a88?w=500&auto=format&fit=crop&q=60&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxzZWFyY2h8MTF8fHByZWduYW5jeXxlbnwwfHwwfHx8MA%3D%3D',
    imageHint: 'pregnant woman',
    doctors: [],
  },
  {
    id: 'dept-09',
    name: 'Gastroenterology',
    description: 'Care for the digestive system and its disorders.',
    image: 'https://images.unsplash.com/photo-1607619056574-7d8d3ee536b2?w=500&auto=format&fit=crop&q=60&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxzZWFyY2h8NHx8Z2FzdHJvZW50ZXJvbG9neXxlbnwwfHwwfHx8MA%3D%3D',
    imageHint: 'digestive model',
    doctors: [],
  },
  {
    id: 'dept-10',
    name: 'Pulmonology',
    description: 'Specializing in diseases of the lungs and respiratory tract.',
    image: 'https://images.unsplash.com/photo-1581579261779-14f776a3a4e4?w=500&auto=format&fit=crop&q=60&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxzZWFyY2h8M3x8bHVuZ3N8ZW58MHx8MHx8fDA%3D',
    imageHint: 'lungs model',
    doctors: [],
  },
  {
    id: 'dept-11',
    name: 'Endocrinology',
    description: 'Treatment of hormonal imbalances and diseases.',
    image: 'https://images.unsplash.com/photo-1620922896395-b3a385413156?w=500&auto=format&fit=crop&q=60&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxzZWFyY2h8Mnx8ZW5kb2NyaW5vbG9neXxlbnwwfHwwfHx8MA%3D%3D',
    imageHint: 'hormone chart',
    doctors: [],
  },
  {
    id: 'dept-12',
    name: 'Nephrology',
    description: 'Specializing in kidney care and diseases.',
    image: 'https://images.unsplash.com/photo-1620922896395-b3a385413156?w=500&auto=format&fit=crop&q=60&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxzZWFyY2h8NXx8a2lkbmV5fGVufDB8fDB8fHww',
    imageHint: 'kidney model',
    doctors: [],
  },
  {
    id: 'dept-13',
    name: 'Urology',
    description: 'Care for the urinary tract and male reproductive system.',
    image: 'https://images.unsplash.com/photo-1619623696587-2a493906231e?w=500&auto=format&fit=crop&q=60&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxzZWFyY2h8MXx8dXJvbG9neXxlbnwwfHwwfHx8MA%3D%3D',
    imageHint: 'medical chart',
    doctors: [],
  },
  {
    id: 'dept-14',
    name: 'Ophthalmology',
    description: 'Comprehensive eye and vision care.',
    image: 'https://images.unsplash.com/photo-1579828898622-446b1e065oa1?w=500&auto=format&fit=crop&q=60&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxzZWFyY2h8Mnx8b3B0aGFsbW9sb2d5fGVufDB8fDB8fHww',
    imageHint: 'eye chart',
    doctors: [],
  },
  {
    id: 'dept-15',
    name: 'Otolaryngology (ENT)',
    description: 'Treatment for ear, nose, and throat conditions.',
    image: 'https://images.unsplash.com/photo-1591122102133-899478a1c628?w=500&auto=format&fit=crop&q=60&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxzZWFyY2h8MXx8ZW50JTIwZG9jdG9yfGVufDB8fDB8fHww',
    imageHint: 'ear model',
    doctors: [],
  },
  {
    id: 'dept-16',
    name: 'Psychiatry',
    description: 'Mental health care and treatment of emotional disorders.',
    image: 'https://images.unsplash.com/photo-1598449339797-0358503d47a4?w=500&auto=format&fit=crop&q=60&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxzZWFyY2h8Mnx8cHN5Y2hpYXRyeXxlbnwwfHwwfHx8MA%3D%3D',
    imageHint: 'brain illustration',
    doctors: [],
  },
  {
    id: 'dept-17',
    name: 'Rheumatology',
    description: 'Diagnosis and therapy of rheumatic diseases.',
    image: 'https://images.unsplash.com/photo-1620922896395-b3a385413156?w=500&auto=format&fit=crop&q=60&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxzZWFyY2h8M3x8am9pbnRzfGVufDB8fDB8fHww',
    imageHint: 'joint pain',
    doctors: [],
  },
  {
    id: 'dept-18',
    name: 'Radiology',
    description: 'Medical imaging to diagnose and treat diseases.',
    image: 'https://images.unsplash.com/photo-1581092576329-8ab1143a7933?w=500&auto=format&fit=crop&q=60&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxzZWFyY2h8Mnx8eHJheXxlbnwwfHwwfHx8MA%3D%3D',
    imageHint: 'xray scan',
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
