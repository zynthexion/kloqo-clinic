
import { NextRequest, NextResponse } from 'next/server';
import { getStorage } from 'firebase-admin/storage';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import serviceAccount from '../../../../service-account.json';

// Initialize Firebase Admin SDK
if (!getApps().length) {
  try {
    initializeApp({
      credential: cert(serviceAccount as any),
      storageBucket: 'kloqo-clinic-multi-33968-4c50b.appspot.com',
    });
    console.log("Firebase Admin SDK initialized successfully.");
  } catch (error: any) {
    console.error('Firebase Admin SDK initialization error:', error.message);
  }
}

export async function POST(request: NextRequest) {
  // Check if SDK is initialized
  if (!getApps().length) {
    console.error("Critical Error: Firebase Admin SDK is not initialized.");
    return NextResponse.json(
        { error: 'Server configuration error. Firebase Admin SDK could not be initialized.' },
        { status: 500 }
    );
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

    await fileRef.makePublic();
    const publicUrl = `https://storage.googleapis.com/${bucket.name}/${filePath}`;

    return NextResponse.json({ url: publicUrl });
  } catch (error: any) {
    console.error('Upload API route error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
