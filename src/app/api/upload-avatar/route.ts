
import { NextRequest, NextResponse } from 'next/server';
import { getStorage } from 'firebase-admin/storage';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { config } from 'dotenv';

// Load environment variables from .env file
config();

// Initialize Firebase Admin
// Make sure to set the environment variables in your .env.local file
if (!getApps().length) {
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
  if (!process.env.FIREBASE_PROJECT_ID || !process.env.FIREBASE_CLIENT_EMAIL || !privateKey || !process.env.FIREBASE_STORAGE_BUCKET) {
    // This part is changed. Instead of throwing an error which crashes the server,
    // we return a proper JSON response. This is a common source of 500 errors in Next.js API routes.
    console.error('Firebase Admin SDK initialization failed: Missing environment variables.');
  } else {
      try {
        initializeApp({
            credential: cert({
            projectId: process.env.FIREBASE_PROJECT_ID,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey: privateKey,
            }),
            storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
        });
      } catch (error) {
          console.error('Firebase Admin SDK initialization error:', error);
      }
  }
}

export async function POST(request: NextRequest) {
  // Check if Firebase Admin is initialized before proceeding
  if (!getApps().length) {
    return NextResponse.json(
        { error: 'Firebase Admin SDK not initialized. Check server logs for details. Make sure environment variables are set.' },
        { status: 500 }
    );
  }

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const clinicId = formData.get('clinicId') as string;
    const userId = formData.get('userId') as string;

    if (!file || !clinicId) {
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

    // The public URL can be constructed this way, assuming default public access settings or signed URLs
    // For simplicity, we'll make the file public. For production, signed URLs are safer.
    await fileRef.makePublic();
    const publicUrl = `https://storage.googleapis.com/${bucket.name}/${filePath}`;

    return NextResponse.json({ url: publicUrl });
  } catch (error: any) {
    console.error('Upload error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
