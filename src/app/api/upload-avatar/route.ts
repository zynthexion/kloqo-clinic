
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
    console.log('🧪 Testing Firebase Storage bucket...');

    // Initialize Firebase Admin SDK
    if (getApps().length === 0) {
      console.log('Initializing Firebase Admin SDK for bucket test...');
      initializeApp({
        credential: cert(serviceAccountParams),
        storageBucket: 'kloqo-clinic-multi-33968-4c50b.firebasestorage.app',
      });
      console.log('✅ Firebase Admin SDK initialized successfully');
    }

    // Test bucket access
    const bucket = getStorage().bucket('kloqo-clinic-multi-33968-4c50b.firebasestorage.app');

    // Try to list files (this will fail if bucket doesn't exist)
    try {
      const [files] = await bucket.getFiles({ maxResults: 1 });
      console.log('✅ Firebase Storage bucket exists and is accessible');
      console.log('📁 Bucket name:', bucket.name);
      console.log('📊 Files in bucket:', files.length);

      return NextResponse.json({
        success: true,
        bucket: bucket.name,
        accessible: true,
        fileCount: files.length,
        message: 'Firebase Storage bucket is working correctly'
      });

    } catch (bucketError: any) {
      console.error('❌ Bucket test failed:', bucketError.message);

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
    console.error('💥 Bucket test error:', error);

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
    console.log('🚀 API Route: /api/upload-avatar POST request received.');

    // Initialize Firebase Admin SDK
    if (getApps().length === 0) {
      console.log('🚀 API Route: Initializing Firebase Admin SDK...');
      initializeApp({
        credential: cert(serviceAccountParams),
        storageBucket: 'kloqo-clinic-multi-33968-4c50b.firebasestorage.app',
      });
      console.log('✅ API Route: Firebase Admin SDK initialized successfully');
    }

    const formData = await request.formData();
    const file = formData.get('file') as File;
    const clinicId = formData.get('clinicId') as string;
    const userId = formData.get('userId') as string;

    console.log('📋 API Route: Form data received:', {
      hasFile: !!file,
      clinicId,
      userId,
      fileName: file?.name,
      fileSize: file?.size,
      fileType: file?.type
    });

    if (!file || !clinicId || !userId) {
      console.error('❌ API Route: Missing required fields');
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const fileName = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
    const filePath = `doctor_avatars/${clinicId}/${fileName}`;
    
    console.log(`🚀 API Route: Preparing to upload to Firebase Storage at path: ${filePath}`);

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
      console.log('✅ API Route: File saved to bucket.');

      await fileRef.makePublic();
      console.log('✅ API Route: File made public.');
      
      const publicUrl = `https://storage.googleapis.com/${bucket.name}/${filePath}`;

      console.log('✅ API Route: Firebase Storage upload successful');
      console.log('🔗 Generated public URL:', publicUrl);


      return NextResponse.json({
        url: publicUrl,
        filePath: filePath,
        bucket: bucket.name
      });

    } catch (storageError: any) {
      console.error('💥 API Route: Firebase Storage upload failed:', storageError);

      // Log detailed error information for debugging
      console.error('🔍 API Route: Storage error details:', {
        message: storageError.message,
        code: storageError.code,
        status: storageError.status,
        stack: storageError.stack
      });

      return NextResponse.json({ error: `Firebase Storage Error: ${storageError.message}` }, { status: 500 });
    }

  } catch (error: any) {
    console.error('💥 API Route: Internal server error:', error);

    return NextResponse.json({
      error: 'Internal server error',
      message: error.message || 'An unknown error occurred',
      details: error.toString()
    }, { status: 500 });
  }
}
