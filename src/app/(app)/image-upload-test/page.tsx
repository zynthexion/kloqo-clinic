
'use client';

import { useState, useTransition, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import imageCompression from 'browser-image-compression';
import { Loader2, Upload, Image as ImageIcon } from 'lucide-react';
import Image from 'next/image';
import { useAuth } from '@/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export default function ImageUploadTestPage() {
  const [file, setFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [clinicId, setClinicId] = useState<string | null>(null);
  const { toast } = useToast();
  const auth = useAuth();

  useEffect(() => {
    if (auth.currentUser) {
      const fetchClinicId = async () => {
        const userDocRef = doc(db, 'users', auth.currentUser!.uid);
        const userDocSnap = await getDoc(userDocRef);
        const userClinicId = userDocSnap.data()?.clinicId;
        if (userClinicId) {
          setClinicId(userClinicId);
          console.log("Clinic ID fetched:", userClinicId);
        } else {
          console.error('Could not find clinicId for the current user.');
          toast({
            variant: "destructive",
            title: "Configuration Error",
            description: "No clinic ID found for the current user.",
          });
        }
      };
      fetchClinicId();
    }
  }, [auth.currentUser, toast]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      const reader = new FileReader();
      reader.onloadend = () => {
        setPhotoPreview(reader.result as string);
      };
      reader.readAsDataURL(selectedFile);
    }
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!file) {
      toast({
        variant: "destructive",
        title: "No File Selected",
        description: "Please choose an image file to upload.",
      });
      return;
    }

    if (!auth.currentUser || !clinicId) {
      toast({
        variant: "destructive",
        title: "Authentication Error",
        description: "You must be logged in and have a clinic ID to upload files.",
      });
      return;
    }

    startTransition(async () => {
      console.log("Starting upload process...");
      console.log("New photo file detected:", file.name, `(${(file.size / 1024).toFixed(2)} KB)`);

      try {
        const options = {
          maxSizeMB: 0.5,
          maxWidthOrHeight: 800,
          useWebWorker: true,
        };
        
        const compressedFile = await imageCompression(file, options);
        console.log("Image compressed:", compressedFile.name, `(${(compressedFile.size / 1024).toFixed(2)} KB)`);

        const formData = new FormData();
        formData.append('file', compressedFile);
        formData.append('clinicId', clinicId);
        formData.append('userId', auth.currentUser!.uid);

        const response = await fetch('/api/upload-avatar', {
          method: 'POST',
          body: formData,
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Upload failed');
        }

        const data = await response.json();
        console.log("File uploaded successfully via API. URL:", data.url);

        toast({
          title: "Upload Successful",
          description: `Image uploaded and available at: ${data.url}`,
        });

      } catch (uploadError: any) {
        console.error("Upload error:", uploadError);
        toast({
          variant: "destructive",
          title: "Upload Failed",
          description: uploadError.message,
        });
        console.log(uploadError.message);
      }
    });
  };

  return (
    <main className="p-6">
      <Card className="max-w-xl mx-auto">
        <CardHeader>
          <CardTitle>Image Upload Test</CardTitle>
          <CardDescription>
            Use this page to test the image compression and upload functionality.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label>Doctor's Photo</Label>
              <div className="flex items-center gap-4">
                <div className="w-24 h-24 rounded-full bg-muted flex items-center justify-center overflow-hidden">
                  {photoPreview ? (
                    <Image src={photoPreview} alt="Avatar Preview" width={96} height={96} className="object-cover" />
                  ) : (
                    <ImageIcon className="w-8 h-8 text-muted-foreground" />
                  )}
                </div>
                <label htmlFor="photo-upload-test" className="cursor-pointer">
                  <Button type="button" variant="outline" asChild>
                    <span>
                      <Upload className="mr-2 h-4 w-4" />
                      Choose Image
                    </span>
                  </Button>
                </label>
                <Input type="file" accept="image/*" onChange={handleFileChange} className="hidden" id="photo-upload-test" />
              </div>
              {file && <p className="text-sm text-muted-foreground">Selected: {file.name}</p>}
            </div>

            <Button type="submit" className="w-full" disabled={isPending || !file}>
              {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
              Upload Image
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
