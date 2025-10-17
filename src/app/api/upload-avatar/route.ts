
import { NextRequest, NextResponse } from 'next/server';
import { getStorage } from 'firebase-admin/storage';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { config } from 'dotenv';

config();

export async function POST(request: NextRequest) {
  // Initialize Firebase Admin SDK within the request handler
  if (!getApps().length) {
    try {
      const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
      if (!process.env.FIREBASE_PROJECT_ID || !process.env.FIREBASE_CLIENT_EMAIL || !privateKey || !process.env.FIREBASE_STORAGE_BUCKET) {
        throw new Error('Firebase Admin SDK initialization failed: One or more required environment variables are missing.');
      }
      initializeApp({
        credential: cert({
          projectId: process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: privateKey,
        }),
        storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
      });
    } catch (error: any) {
        console.error('Firebase Admin SDK initializeApp error:', error.message);
        return NextResponse.json(
            { error: 'Firebase Admin SDK not initialized. Check server logs for details. Make sure environment variables are set.' },
            { status: 500 }
        );
    }
  }

  // Check again to ensure initialization was successful
  if (!getApps().length) {
    return NextResponse.json(
        { error: 'Firebase Admin SDK could not be initialized.' },
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
    console.error('Upload error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
