"use client";

import { useState } from "react";
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
import { Search } from "lucide-react";
import type { Department } from "@/lib/types";

type SelectDepartmentDialogProps = {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  departments: Department[];
  onDepartmentSelect: (department: Department) => void;
};

export function SelectDepartmentDialog({ isOpen, setIsOpen, departments, onDepartmentSelect }: SelectDepartmentDialogProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [selected, setSelected] = useState<Department | null>(null);

  const filteredDepartments = departments.filter((dept) =>
    dept.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleAdd = () => {
    if (selected) {
      onDepartmentSelect(selected);
      setIsOpen(false);
      setSelected(null);
      setSearchTerm("");
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Department to Your Clinic</DialogTitle>
          <DialogDescription>
            Select a department from the list to add it to your clinic setup.
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
            {filteredDepartments.map((dept) => (
              <div
                key={dept.id}
                className={`flex items-center gap-4 p-2 rounded-lg cursor-pointer transition-colors ${
                  selected?.id === dept.id
                    ? "bg-primary/20 ring-2 ring-primary"
                    : "hover:bg-muted/50"
                }`}
                onClick={() => setSelected(dept)}
              >
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
            ))}
          </div>
        </ScrollArea>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setIsOpen(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={handleAdd} disabled={!selected}>
            Add to Your Clinic
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
