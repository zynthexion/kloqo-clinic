
const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { doctors } = require('../dist/lib/data.js');

// Initialize Firebase Admin SDK
// Make sure to have your service account key file in the root directory
// and update the GOOGLE_APPLICATION_CREDENTIALS environment variable
initializeApp();

const db = getFirestore();

async function seedDoctors() {
  const doctorsCollection = db.collection('doctors');
  
  console.log('Starting to seed doctors...');

  const promises = doctors.map(async (doctor) => {
    // Create a new document with an auto-generated ID
    const docRef = doctorsCollection.doc(doctor.id);
    await docRef.set(doctor);
    console.log(`Added doctor ${doctor.name} with ID: ${doctor.id}`);
  });

  await Promise.all(promises);
  
  console.log('Finished seeding doctors.');
}

seedDoctors().catch(console.error);
