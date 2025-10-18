
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
    console.log('🚀 Upload API route called');

    // Initialize Firebase Admin SDK
    if (getApps().length === 0) {
      console.log('Initializing Firebase Admin SDK...');
      initializeApp({
        credential: cert(serviceAccountParams),
        storageBucket: 'kloqo-clinic-multi-33968-4c50b.firebasestorage.app',
      });
      console.log('✅ Firebase Admin SDK initialized successfully');
    }

    const formData = await request.formData();
    const file = formData.get('file') as File;
    const clinicId = formData.get('clinicId') as string;
    const userId = formData.get('userId') as string;

    console.log('📋 Form data received:', {
      hasFile: !!file,
      clinicId,
      userId,
      fileName: file?.name,
      fileSize: file?.size,
      fileType: file?.type
    });

    if (!file || !clinicId || !userId) {
      console.error('❌ Missing required fields');
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const fileName = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
    const filePath = `doctor_avatars/${clinicId}/${fileName}`;

    try {
      // Upload to Firebase Storage using the correct bucket format
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

      // Get the signed URL that Firebase generates
      const [signedUrl] = await fileRef.getSignedUrl({
        action: 'read',
        expires: '03-09-2491' // Far future expiration
      });

      console.log('✅ Firebase Storage upload successful');
      console.log('🔗 Generated signed URL:', signedUrl);

      // Ensure the signed URL has the required token
      if (!signedUrl.includes('token=')) {
        console.error('❌ Signed URL missing authentication token!');
        throw new Error('Failed to generate authenticated URL for Firebase Storage');
      }

      return NextResponse.json({
        url: signedUrl,
        filePath: filePath,
        bucket: bucket.name
      });

    } catch (storageError: any) {
      console.error('💥 Firebase Storage upload failed:', storageError);

      // Log detailed error information for debugging
      console.error('🔍 Error details:', {
        message: storageError.message,
        code: storageError.code,
        status: storageError.status,
        stack: storageError.stack
      });

      // Fallback to mock URL if Firebase Storage fails
      const mockUrl = `https://picsum.photos/seed/${file.name}-${Date.now()}/200/200`;
      console.log('❌ Firebase Storage failed, using mock URL:', mockUrl);

      return NextResponse.json({
        url: mockUrl,
        error: storageError.message,
        note: 'Firebase Storage upload failed, using placeholder URL',
        firebaseError: true,
        originalSize: buffer.length,
        compressedSize: buffer.length
      }, { status: 200 });
    }

  } catch (error: any) {
    console.error('💥 Upload API route error:', error);

    return NextResponse.json({
      error: 'Internal server error',
      message: error.message || 'An unknown error occurred',
      details: error.toString()
    }, { status: 500 });
  }
}
