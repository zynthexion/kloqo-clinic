
import { NextRequest, NextResponse } from 'next/server';
import { getStorage } from 'firebase-admin/storage';
import { initializeApp, getApps, cert } from 'firebase-admin/app';

// Initialize Firebase Admin
// Make sure to set the environment variables in your .env.local file
if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  });
}

export async function POST(request: NextRequest) {
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
