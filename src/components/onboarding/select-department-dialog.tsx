
"use client";

import { useState, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import Image from "next/image";
import { Search, CheckCircle } from "lucide-react";
import type { Department } from "@/lib/types";

type SelectDepartmentDialogProps = {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  departments: Omit<Department, "clinicId">[];
  onDepartmentsSelect: (departments: Omit<Department, "clinicId">[]) => void;
};

export function SelectDepartmentDialog({ isOpen, setIsOpen, departments, onDepartmentsSelect }: SelectDepartmentDialogProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [selected, setSelected] = useState<Omit<Department, "clinicId">[]>([]);

  const filteredDepartments = useMemo(() => {
    if (!departments) return [];
    return departments.filter((dept) =>
      dept.name.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [departments, searchTerm]);

  const toggleSelection = (department: Omit<Department, "clinicId">) => {
    setSelected(prev => {
        const isSelected = prev.find(d => d.id === department.id);
        if (isSelected) {
            return prev.filter(d => d.id !== department.id);
        } else {
            return [...prev, department];
        }
    })
  }

  const handleAdd = () => {
    if (selected.length > 0) {
      onDepartmentsSelect(selected);
      setIsOpen(false);
      setSelected([]);
      setSearchTerm("");
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Departments to Your Clinic</DialogTitle>
          <DialogDescription>
            Select one or more departments from the list to add to your clinic setup.
          </DialogDescription>
        </DialogHeader>
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search departments..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-8"
          />
        </div>
        <ScrollArea className="h-72">
          <div className="space-y-2 pr-4">
            {filteredDepartments.map((dept) => {
              const isSelected = selected.some(d => d.id === dept.id);
              return (
                <div
                    key={dept.id}
                    className={`relative flex items-center gap-4 p-2 rounded-lg cursor-pointer transition-colors ${
                    isSelected
                        ? "bg-primary/20 ring-2 ring-primary"
                        : "hover:bg-muted/50"
                    }`}
                    onClick={() => toggleSelection(dept)}
                >
                    {isSelected && (
                        <div className="absolute top-2 right-2 bg-primary text-primary-foreground rounded-full">
                            <CheckCircle className="w-5 h-5" />
                        </div>
                    )}
                    <Image
                    src={dept.image}
                    alt={dept.name}
                    width={48}
                    height={48}
                    className="rounded-md object-cover"
                    data-ai-hint={dept.imageHint}
                    />
                    <div className="flex-grow">
                    <p className="font-semibold text-sm">{dept.name}</p>
                    <p className="text-xs text-muted-foreground">{dept.description}</p>
                    </div>
                </div>
              )
            })}
          </div>
        </ScrollArea>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setIsOpen(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={handleAdd} disabled={selected.length === 0}>
            Add to Your Clinic
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
