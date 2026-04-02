import React from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import DynamicFilterSidebar from "../DynamicFilterSidebar";

export function FilterSheet({ 
  isOpen, 
  onClose, 
  onFilterChange, 
  activeFilters, 
  patients, 
  pagination, 
  onPageChange, 
  onPageSizeChange 
}) {
  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent side="left" className="w-[400px] sm:w-[540px] overflow-y-auto p-0 border-r">
        <SheetHeader className="p-6 pb-2 border-b sticky top-0 bg-background z-10">
          <SheetTitle className="text-xl">Advanced Filters</SheetTitle>
        </SheetHeader>
        
        <div className="p-0">
          <DynamicFilterSidebar
            isOpen={true}
            onClose={() => onClose(false)}
            onFilterChange={onFilterChange}
            activeFilters={activeFilters}
            patients={patients}
            pagination={pagination}
            onPageChange={onPageChange}
            onPageSizeChange={onPageSizeChange}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
