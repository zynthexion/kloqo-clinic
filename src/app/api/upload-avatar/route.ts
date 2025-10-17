
import { NextRequest, NextResponse } from 'next/server';
import { getStorage } from 'firebase-admin/storage';
import { initializeApp, getApps, cert, App } from 'firebase-admin/app';

// Import the service account key from the JSON file
import serviceAccount from '../../../../service-account.json';

// Ensure the service account has the correct properties
const serviceAccountParams = {
  projectId: serviceAccount.project_id,
  clientEmail: serviceAccount.client_email,
  privateKey: serviceAccount.private_key,
};

export async function POST(request: NextRequest) {
  // Initialize Firebase Admin SDK within the request handler
  if (getApps().length === 0) {
    try {
      console.log("Initializing Firebase Admin SDK for this request...");
      initializeApp({
        credential: cert(serviceAccountParams),
        storageBucket: 'kloqo-clinic-multi-33968-4c50b.appspot.com',
      });
      console.log("Firebase Admin SDK initialized successfully.");
    } catch (error: any) {
      console.error('CRITICAL: Firebase Admin SDK initialization failed:', error.message);
      return NextResponse.json(
          { error: 'Server configuration error: Failed to initialize Firebase Admin.' },
          { status: 500 }
      );
    }
  }
  
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const clinicId = formData.get('clinicId') as string;
    const userId = formData.get('userId') as string;

    if (!file || !clinicId || !userId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const fileName = `${Date.now()}_${file.name}`;
    const filePath = `doctor_avatars/${clinicId}/${fileName}`;

    const bucket = getStorage().bucket();
    const fileRef = bucket.file(filePath);

    await fileRef.save(buffer, {
      contentType: file.type,
      metadata: {
        metadata: {
          uploadedBy: userId,
          clinicId: clinicId,
        },
      },
    });

    // Make the file public to get a publicly accessible URL
    await fileRef.makePublic();
    const publicUrl = `https://storage.googleapis.com/${bucket.name}/${filePath}`;

    return NextResponse.json({ url: publicUrl });
  } catch (error: any) {
    console.error('Upload API route error:', error);
    return NextResponse.json({ error: error.message || 'An unknown error occurred during upload.' }, { status: 500 });
  }
}
