import React, { useState, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search, Plus, X } from 'lucide-react';

const AddResourceDialog = ({ open, onOpenChange, availableResources, onAddTab }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');

  const categorizeResources = (resources) => {
    const categories = {};

    resources.forEach(resource => {
      const type = resource.label.toLowerCase();
      let category = 'Other Healthcare Data';
      
      if (type.includes('condition') || type.includes('diagnosis')) {
        category = 'Conditions & Diagnoses';
      } else if (type.includes('observation') || type.includes('vital') || type.includes('measurement')) {
        category = 'Observations & Vitals';
      } else if (type.includes('procedure') || type.includes('surgery') || type.includes('intervention')) {
        category = 'Procedures & Treatments';
      } else if (type.includes('medication') || type.includes('drug') || type.includes('prescription')) {
        category = 'Medications & Prescriptions';
      } else if (type.includes('immunization') || type.includes('vaccine')) {
        category = 'Immunizations & Vaccines';
      } else if (type.includes('allergy') || type.includes('intolerance') || type.includes('adverse')) {
        category = 'Allergies & Reactions';
      } else if ((type.includes('care') && type.includes('plan')) || type.includes('treatment')) {
        category = 'Care Plans & Goals';
      } else if ((type.includes('care') && type.includes('team')) || type.includes('team')) {
        category = 'Care Teams & Providers';
      } else if (type.includes('goal') || type.includes('target')) {
        category = 'Goals & Targets';
      } else if (type.includes('encounter') || type.includes('visit') || type.includes('admission')) {
        category = 'Visits & Encounters';
      } else if (type.includes('appointment') || type.includes('schedule')) {
        category = 'Appointments & Scheduling';
      } else if (type.includes('patient') || type.includes('person') || type.includes('individual')) {
        category = 'Patients & Demographics';
      } else if (type.includes('practitioner') || type.includes('provider') || type.includes('clinician')) {
        category = 'Healthcare Providers';
      } else if (type.includes('organization') || type.includes('facility') || type.includes('institution')) {
        category = 'Organizations & Facilities';
      } else if (type.includes('location') || type.includes('place') || type.includes('site')) {
        category = 'Locations & Places';
      } else if (type.includes('document') || type.includes('reference') || type.includes('attachment') || type.includes('file') || type.includes('pdf') || type.includes('binary')) {
        category = 'Documents & References';
      } else if (type.includes('diagnostic') && type.includes('report')) {
        category = 'Diagnostic Reports';
      } else if (type.includes('imaging') || type.includes('study') || type.includes('scan')) {
        category = 'Imaging & Studies';
      } else if (type.includes('media') || type.includes('photo') || type.includes('image')) {
        category = 'Media & Attachments';
      } else if (type.includes('coverage') || type.includes('insurance') || type.includes('eligibility')) {
        category = 'Insurance & Coverage';
      } else if (type.includes('account') || type.includes('billing') || type.includes('financial')) {
        category = 'Billing & Financial';
      } else if (type.includes('device') || type.includes('equipment') || type.includes('implant')) {
        category = 'Devices & Equipment';
      } else if (type.includes('family') || type.includes('history') || type.includes('genetic')) {
        category = 'Family & Medical History';
      } else if (type.includes('request') || type.includes('order') || type.includes('requisition')) {
        category = 'Orders & Requests';
      } else if (type.includes('task') || type.includes('workflow') || type.includes('process')) {
        category = 'Tasks & Workflow';
      } else if (type.includes('communication') || type.includes('message') || type.includes('alert')) {
        category = 'Communications & Messages';
      } else if (type.includes('research') || type.includes('study') || type.includes('trial')) {
        category = 'Research & Studies';
      } else if (type.includes('quality') || type.includes('measure') || type.includes('metric')) {
        category = 'Quality & Measures';
      } else if (type.includes('provenance') || type.includes('audit') || type.includes('log')) {
        category = 'Audit & Provenance';
      } else if (type.includes('subscription') || type.includes('notification')) {
        category = 'Subscriptions & Notifications';
      }
      
      if (!categories[category]) {
        categories[category] = [];
      }
      categories[category].push(resource);
    });

    const sortedCategories = {};
    Object.keys(categories)
      .filter(category => categories[category].length > 0)
      .sort()
      .forEach(category => {
        sortedCategories[category] = categories[category];
      });

    return sortedCategories;
  };

  const filteredResources = useMemo(() => {
    let filtered = [...availableResources];

    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      filtered = filtered.filter(resource =>
        resource.label.toLowerCase().includes(searchLower) ||
        (resource.description || '').toLowerCase().includes(searchLower)
      );
    }

    const categorized = categorizeResources(filtered);

    if (selectedCategory !== 'All') {
      return { [selectedCategory]: categorized[selectedCategory] || [] };
    }

    return categorized;
  }, [availableResources, searchTerm, selectedCategory]);

  const availableCategories = useMemo(() => {
    const categorized = categorizeResources(availableResources);
    return ['All', ...Object.keys(categorized).sort()];
  }, [availableResources]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[96vw] max-w-[96vw] sm:max-w-5xl! lg:max-w-7xl! max-h-[90vh] flex flex-col overflow-hidden p-0">
        <DialogHeader className="p-6 pb-0">
          <DialogTitle className="text-2xl font-bold">Add Resource Tab</DialogTitle>
          <DialogDescription>
            Select a FHIR resource type to add as a new tab. All resource types are discovered dynamically.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-1 min-h-0 flex-col gap-4 p-6 pt-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground transition-colors group-focus-within:text-primary" />
              <Input
                placeholder="Search resources..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 h-11 border-muted-foreground/20 focus-visible:ring-primary/20 hover:border-muted-foreground/40 transition-all"
              />
            </div>
            <Select value={selectedCategory} onValueChange={setSelectedCategory}>
              <SelectTrigger className="w-full sm:w-60 h-11 border-muted-foreground/20 hover:border-muted-foreground/40 transition-all">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                {availableCategories.map(category => (
                  <SelectItem key={category} value={category}>
                    {category}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex-1 min-h-0 -mx-6 overflow-y-auto px-6">
            <div className="space-y-8 pb-4 pr-1">
              {Object.entries(filteredResources).map(([categoryName, resources]) => (
                <div key={categoryName} className="space-y-4">
                  <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                    {categoryName}
                    <span className="bg-muted px-1.5 py-0.5 rounded text-[10px] font-bold">{resources.length}</span>
                  </h4>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                    {resources.map(resource => (
                      <button
                        key={resource.id}
                        onClick={() => {
                          onAddTab(resource.id);
                          onOpenChange(false);
                        }}
                        className="group relative flex w-full min-w-0 flex-col text-left p-4 rounded-xl border border-muted-foreground/10 hover:border-primary/40 hover:bg-primary/2 hover:shadow-md transition-all duration-200 overflow-hidden ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      >
                        <div className="flex items-start justify-between mb-2">
                          <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center text-xl group-hover:bg-primary/10 group-hover:text-primary transition-colors">
                            {resource.icon || '📄'}
                          </div>
                          <div className="bg-primary/10 text-primary p-1 rounded-full opacity-0 group-hover:opacity-100 transition-all scale-75 group-hover:scale-100">
                            <Plus className="w-4 h-4" />
                          </div>
                        </div>
                        <div className="min-w-0">
                          <h5 className="font-semibold text-sm mb-1 group-hover:text-primary transition-colors line-clamp-2 wrap-break-word">{resource.label}</h5>
                          <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed wrap-break-word">
                            {resource.description || `View ${resource.label} resources for this patient.`}
                          </p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ))}

              {availableResources.length > 0 && Object.keys(filteredResources).length === 0 && (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4">
                    <Search className="w-6 h-6 text-muted-foreground" />
                  </div>
                  <h3 className="font-semibold text-lg mb-1">No resources found</h3>
                  <p className="text-muted-foreground text-sm max-w-xs">
                    No resources matched your search "{searchTerm}". Try different keywords.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="p-6 border-t bg-muted/30 flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            Showing <span className="font-medium text-foreground">{Object.values(filteredResources).flat().length}</span> of <span className="font-medium text-foreground">{availableResources.length}</span> resources
          </p>
          <button 
            onClick={() => onOpenChange(false)}
            className="text-sm font-medium px-4 py-2 rounded-lg hover:bg-muted transition-colors"
          >
            Close
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default AddResourceDialog;
