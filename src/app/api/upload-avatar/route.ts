
import { NextRequest, NextResponse } from 'next/server';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getStorage } from 'firebase-admin/storage';

// Import the service account key from the JSON file
import serviceAccount from '../../../../service-account-key.json';

// Ensure the service account has the correct properties
const serviceAccountParams = {
  projectId: serviceAccount.project_id,
  clientEmail: serviceAccount.client_email,
  privateKey: serviceAccount.private_key,
};

export async function GET() {
  try {
    // Initialize Firebase Admin SDK
    if (getApps().length === 0) {
      initializeApp({
        credential: cert(serviceAccountParams),
        storageBucket: 'kloqo-clinic-multi-33968-4c50b.firebasestorage.app',
      });
    }

    // Test bucket access
    const bucket = getStorage().bucket('kloqo-clinic-multi-33968-4c50b.firebasestorage.app');

    // Try to list files (this will fail if bucket doesn't exist)
    try {
      const [files] = await bucket.getFiles({ maxResults: 1 });

      return NextResponse.json({
        success: true,
        bucket: bucket.name,
        accessible: true,
        fileCount: files.length,
        message: 'Firebase Storage bucket is working correctly'
      });

    } catch (bucketError: any) {
      if (bucketError.message?.includes('does not exist')) {
        return NextResponse.json({
          success: false,
          error: 'Bucket does not exist',
          message: 'Firebase Storage bucket needs to be created in Firebase Console',
          details: bucketError.message
        }, { status: 404 });
      }

      throw bucketError;
    }

  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: 'Test failed',
      message: error.message || 'An unknown error occurred during bucket test',
      details: error.toString()
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    // Initialize Firebase Admin SDK
    if (getApps().length === 0) {
      initializeApp({
        credential: cert(serviceAccountParams),
        storageBucket: 'kloqo-clinic-multi-33968-4c50b.firebasestorage.app',
      });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File;
    const clinicId = formData.get('clinicId') as string;
    const userId = formData.get('userId') as string;

    if (!file || !clinicId || !userId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const fileName = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
    const filePath = `doctor_avatars/${clinicId}/${fileName}`;
    
    try {
      const bucket = getStorage().bucket('kloqo-clinic-multi-33968-4c50b.firebasestorage.app');
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

      return NextResponse.json({
        url: publicUrl,
        filePath: filePath,
        bucket: bucket.name
      });

    } catch (storageError: any) {
      return NextResponse.json({ error: `Firebase Storage Error: ${storageError.message}` }, { status: 500 });
    }

  } catch (error: any) {
    return NextResponse.json({
      error: 'Internal server error',
      message: error.message || 'An unknown error occurred',
      details: error.toString()
    }, { status: 500 });
  }
}
