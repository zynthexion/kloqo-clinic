
const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

if (typeof window !== 'undefined') {
  throw new Error("This script should only be run in a Node.js environment.");
}

const masterDepartments = [
  {
    id: 'dept-01',
    name: 'General Medicine',
    description: 'Comprehensive primary care.',
    image: 'https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?w=500&auto=format&fit=crop&q=60&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxzZWFyY2h8Mnx8bWVkaWNpbmV8ZW58MHx8MHx8fDA%3D',
    imageHint: 'stethoscope pills',
    doctors: [],
  },
  {
    id: 'dept-02',
    name: 'Cardiology',
    description: 'Specialized heart care.',
    image: 'https://images.unsplash.com/photo-1530026405182-271453396975?w=500&auto=format&fit=crop&q=60&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxzZWFyY2h8MjZ8fG1lZGljaW5lfGVufDB8fDB8fHww',
    imageHint: 'heart model',
    doctors: [],
  },
  {
    id: 'dept-03',
    name: 'Pediatrics',
    description: 'Healthcare for children.',
    image: 'https://images.unsplash.com/photo-1599586120429-48281b6f0ece?w=500&auto=format&fit=crop&q=60&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxzZWFyY2h8MTR8fGNoaWxkcmVuJTIwZG9jdG9yfGVufDB8fDB8fHww',
    imageHint: 'doctor baby',
    doctors: [],
  },
  {
    id: 'dept-04',
    name: 'Dermatology',
    description: 'Skin health services.',
    image: 'https://images.unsplash.com/photo-1631894959934-396b3a8d11b3?w=500&auto=format&fit=crop&q=60&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxzZWFyY2h8MTB8fGRlcm1hdG9sb2d5fGVufDB8fDB8fHww',
    imageHint: 'skin care',
    doctors: [],
  },
  {
    id: 'dept-05',
    name: 'Neurology',
    description: 'Nervous system disorders.',
    image: 'https://images.unsplash.com/photo-1695423589949-c9a56f626245?w=500&auto=format&fit=crop&q=60&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxzZWFyY2h8Nnx8bmV1cm9sb2d5fGVufDB8fDB8fHww',
    imageHint: 'brain model',
    doctors: [],
  },
  {
    id: 'dept-06',
    name: 'Orthopedics',
    description: 'Musculoskeletal system disorders.',
    image: 'https://images.unsplash.com/photo-1681878096238-31e1388b0a99?w=500&auto=format&fit=crop&q=60&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxzZWFyY2h8NHx8b3J0aG9wZWRpY3N8ZW58MHx8MHx8fDA%3D',
    imageHint: 'joint brace',
    doctors: [],
  },
  {
    id: 'dept-07',
    name: 'Oncology',
    description: 'Cancer diagnosis and treatment.',
    image: 'https://plus.unsplash.com/premium_photo-1676999081594-81498a442a22?w=500&auto=format&fit=crop&q=60&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxzZWFyY2h8MXx8b25jb2xvZ3l8ZW58MHx8MHx8fDA%3D',
    imageHint: 'awareness ribbon',
    doctors: [],
  },
  {
    id: 'dept-08',
    name: 'Obstetrics and Gynecology (OB/GYN)',
    description: "Women's health services.",
    image: 'https://images.unsplash.com/photo-1576089182512-a8ce7c001a88?w=500&auto=format&fit=crop&q=60&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxzZWFyY2h8MTF8fHByZWduYW5jeXxlbnwwfHwwfHx8MA%3D%3D',
    imageHint: 'pregnant woman',
    doctors: [],
  },
];

try {
    initializeApp();
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
