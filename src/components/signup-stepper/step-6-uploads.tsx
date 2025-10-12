
'use client';

import { useFormContext } from 'react-hook-form';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Upload } from 'lucide-react';
import type { SignUpFormData } from '@/app/signup/page';
import Image from 'next/image';
import { useState } from 'react';
import { FormControl, FormField, FormItem, FormMessage } from '../ui/form';
import { Input } from '@/components/ui/input';

type StepProps = {
  data: SignUpFormData;
  updateData: (update: Partial<SignUpFormData>) => void;
};

const FileUpload = ({ field, label }: { field: any, label: string }) => {
  const [preview, setPreview] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    field.onChange(file);
    if (file) {
      setPreview(URL.createObjectURL(file));
    } else {
      setPreview(null);
    }
  }

  return (
    <FormItem>
      <Label>{label}</Label>
      <div className="flex items-center gap-4">
        <div className="w-20 h-20 rounded-md bg-muted flex items-center justify-center overflow-hidden">
          {preview ? <Image src={preview} alt="preview" width={80} height={80} className="object-cover" /> : <Upload className="h-6 w-6 text-muted-foreground"/>}
        </div>
        <FormControl>
          <Input type="file" accept="image/*" onChange={handleFileChange} style={{ display: 'none' }} id={`file-input-${field.name}`} />
        </FormControl>
        <label htmlFor={`file-input-${field.name}`} className="cursor-pointer">
          <Button type="button" variant="outline" tabIndex={-1}>
            <Upload className="mr-2 h-4 w-4" />
            Choose File
          </Button>
        </label>
        {field.value && <span className="text-sm text-muted-foreground truncate">{field.value.name}</span>}
      </div>
       <FormMessage />
    </FormItem>
  );
};


export function Step6Uploads() {
  const { control } = useFormContext<SignUpFormData>();

  return (
    <div>
      <p className="text-sm text-muted-foreground">Step 6/7</p>
      <h2 className="text-2xl font-bold mb-1">Uploads (Optional)</h2>
      <p className="text-muted-foreground mb-6">Adding these will build trust and complete your profile.</p>

      <div className="space-y-6">
        <FormField
          control={control}
          name="logo"
          render={({ field }) => <FileUpload field={field} label="Clinic Logo" />}
        />
        <FormField
          control={control}
          name="license"
          render={({ field }) => <FileUpload field={field} label="Doctor/Clinic License Copy" />}
        />
        <FormField
          control={control}
          name="receptionPhoto"
          render={({ field }) => <FileUpload field={field} label="Reception / Waiting Area Photo" />}
        />
      </div>
    </div>
  );
}
