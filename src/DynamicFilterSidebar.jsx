// src/DynamicFilterSidebar.jsx
// Redesigned: Shadcn UI + Tailwind, parallel data fetching, skeleton loading states.
// Eliminates sequential fetch chains and all inline styles / App.css dependency.

import React, { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import * as api from './api';
import { CONFIG } from './config';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ChevronDown, ChevronRight, RotateCcw, SlidersHorizontal, X, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

// ─── helpers to fetch filter metadata in parallel ─────────────────────────────

function useFilterTargets() {
  return useQuery({
    queryKey: ['filters', 'targets'],
    queryFn: () => api.get('/filters/targets'),
    staleTime: 10 * 60 * 1000,
    retry: 1,
  });
}

function useResourceFilters(resourceType, enabled = false) {
  return useQuery({
    queryKey: ['filters', 'resource', resourceType],
    queryFn: () => api.get(`/filters/${resourceType}/metadata?sample_size=${CONFIG.ui.defaultPageSize}`),
    enabled: !!resourceType && enabled,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
}

// ─── sub-components ───────────────────────────────────────────────────────────

/** Collapsible section wrapper */
function FilterSection({ title, count = 0, defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-border last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium hover:bg-accent/50 transition-colors"
      >
        <span className="flex items-center gap-2">
          {title}
          {count > 0 && (
            <Badge variant="destructive" className="h-5 min-w-5 text-xs px-1.5">
              {count}
            </Badge>
          )}
        </span>
        {open ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        )}
      </button>

      {open && (
        <div className="px-4 pb-3 space-y-1.5 animate-in slide-in-from-top-1 duration-150">
          {children}
        </div>
      )}
    </div>
  );
}

/** Single checkbox option */
function FilterOption({ label, count, checked, onChange }) {
  return (
    <label className="flex items-center gap-2.5 py-1 cursor-pointer group">
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="h-4 w-4 rounded border-input accent-primary cursor-pointer"
      />
      <span className="flex-1 text-sm text-foreground group-hover:text-primary transition-colors truncate">
        {label}
      </span>
      {count !== undefined && (
        <span className="text-xs text-muted-foreground shrink-0">({count})</span>
      )}
    </label>
  );
}

/** Skeleton placeholder for a loading filter section */
function FilterSectionSkeleton({ title }) {
  return (
    <div className="border-b border-border">
      <div className="px-4 py-3 flex items-center justify-between">
        <Skeleton className="h-4 w-36" />
        <Skeleton className="h-4 w-4" />
      </div>
      <div className="px-4 pb-3 space-y-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-2.5">
            <Skeleton className="h-4 w-4 rounded" />
            <Skeleton className="h-3 flex-1" />
            <Skeleton className="h-3 w-8" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** A single resource-type filter group (fetches its own filters when expanded) */
function ResourceFilterGroup({ patientId, resourceType, stagedFilters, onFilterChange }) {
  const [expanded, setExpanded] = useState(false);

  const { data, isLoading, isError } = useResourceFilters(resourceType, expanded);

  const filters = data?.filters || [];
  const activeCount = filters.filter(
    (f) => stagedFilters[f.key] && stagedFilters[f.key].length > 0
  ).length;

  return (
    <div className="border border-border rounded-md mb-2 overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="w-full flex items-center justify-between px-3 py-2.5 bg-muted/40 hover:bg-muted/60 transition-colors text-sm font-medium"
      >
        <span className="flex items-center gap-2">
          {resourceType}
          {activeCount > 0 && (
            <Badge className="h-5 min-w-5 text-xs px-1.5 bg-emerald-600">{activeCount}</Badge>
          )}
        </span>
        {expanded ? (
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
        )}
      </button>

      {expanded && (
        <div className="px-3 py-2 space-y-1 animate-in slide-in-from-top-1 duration-150">
          {isLoading && (
            <div className="space-y-2 py-1">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center gap-2">
                  <Skeleton className="h-4 w-4 rounded" />
                  <Skeleton className="h-3 flex-1" />
                </div>
              ))}
            </div>
          )}

          {isError && (
            <div className="flex items-center gap-2 text-xs text-destructive py-1">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              <span>Failed to load filters</span>
            </div>
          )}

          {!isLoading && !isError && filters.length === 0 && (
            <p className="text-xs text-muted-foreground py-1 italic">
              No filters available for {resourceType}
            </p>
          )}

          {filters.map((filter) => {
            if (!filter.key || !Array.isArray(filter.options)) return null;
            return (
              <div key={filter.key} className="mb-2">
                <p className="text-xs font-medium text-muted-foreground mb-1">
                  {filter.label || filter.key}
                </p>
                <div
                  className={cn(
                    'space-y-0.5',
                    filter.options.length > 8 && 'max-h-40 overflow-y-auto pr-1'
                  )}
                >
                  {filter.options.map((opt) => (
                    <FilterOption
                      key={opt.value}
                      label={opt.label || opt.value}
                      count={opt.count}
                      checked={(stagedFilters[filter.key] || []).includes(opt.value)}
                      onChange={(e) => onFilterChange(filter.key, opt.value, e.target.checked)}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── main component ───────────────────────────────────────────────────────────

const DynamicFilterSidebar = ({
  onFilterChange,
  activeFilters: parentActiveFilters = {},
  patients = [],
}) => {
  // Staged (pending) vs committed filters
  const [stagedFilters, setStagedFilters] = useState({});
  const [activeFilters, setActiveFilters] = useState({});

  // Sync from parent whenever parent changes (e.g. after clear from header)
  useEffect(() => {
    const unwrapped = parentActiveFilters?.filters
      ? { ...parentActiveFilters.filters }
      : { ...parentActiveFilters };
    setActiveFilters(unwrapped);
    setStagedFilters(unwrapped);
  }, [parentActiveFilters]);

  // ── fetch resource types available for filtering ────────────────────────
  const { data: targetsData, isLoading: isTargetsLoading } = useFilterTargets();
  const resourceTypes = targetsData?.resource_types || [];

  // ── derive simple patient-data filters ─────────────────────────────────
  const patientBasedFilters = useMemo(() => {
    const opts = {};
    if (!patients.length) return opts;

    // Gender
    const genders = [...new Set(patients.map((p) => p.gender).filter(Boolean))];
    if (genders.length > 1) {
      opts.gender = genders.sort().map((g) => ({
        value: g,
        label: g.charAt(0).toUpperCase() + g.slice(1),
        count: patients.filter((p) => p.gender === g).length,
      }));
    }

    // State
    const states = [
      ...new Set(
        patients.map((p) => p.state || p.address?.[0]?.state).filter(Boolean)
      ),
    ];
    if (states.length > 1 && states.length <= 50) {
      opts.state = states.sort().map((s) => ({
        value: s,
        label: s,
        count: patients.filter(
          (p) => (p.state || p.address?.[0]?.state) === s
        ).length,
      }));
    }

    // City
    const cities = [...new Set(patients.map((p) => p.city).filter(Boolean))];
    if (cities.length > 1 && cities.length <= 80) {
      opts.city = cities.sort().map((c) => ({
        value: c,
        label: c,
        count: patients.filter((p) => p.city === c).length,
      }));
    }

    // Active status
    const statuses = [
      ...new Set(
        patients.map((p) => p.active).filter((v) => v !== undefined && v !== null)
      ),
    ];
    if (statuses.length > 1) {
      opts.active = statuses.map((s) => ({
        value: s.toString(),
        label: s ? 'Active' : 'Inactive',
        count: patients.filter((p) => p.active === s).length,
      }));
    }

    return opts;
  }, [patients]);

  // ── filter helpers ──────────────────────────────────────────────────────
  const handleFilterChange = (key, value, checked) => {
    setStagedFilters((prev) => {
      const current = prev[key] || [];
      const updated = checked
        ? [...current, value]
        : current.filter((v) => v !== value);
      const next = { ...prev, [key]: updated.length > 0 ? updated : undefined };
      Object.keys(next).forEach((k) => {
        if (!next[k] || (Array.isArray(next[k]) && next[k].length === 0)) delete next[k];
      });
      return next;
    });
  };

  const hasPendingChanges = JSON.stringify(stagedFilters) !== JSON.stringify(activeFilters);
  const totalActive = Object.values(activeFilters).reduce(
    (n, v) => n + (Array.isArray(v) ? v.length : 1),
    0
  );

  const applyFilters = () => {
    setActiveFilters({ ...stagedFilters });
    const payload =
      Object.keys(stagedFilters).length > 0 ? { filters: { ...stagedFilters } } : {};
    onFilterChange?.(payload);
  };

  const clearAll = () => {
    setActiveFilters({});
    setStagedFilters({});
    onFilterChange?.({});
  };

  const resetStaged = () => setStagedFilters({ ...activeFilters });

  // ── render ──────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Sticky filter toolbar */}
      <div className="px-4 py-3 border-b border-border bg-background sticky top-0 z-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="h-4 w-4 text-muted-foreground" />
            <span className="font-semibold text-sm">Filters</span>
            {totalActive > 0 && (
              <Badge variant="destructive" className="h-5 px-1.5 text-xs">
                {totalActive} active
              </Badge>
            )}
          </div>
          {totalActive > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={clearAll}
              className="h-7 px-2 text-xs text-muted-foreground hover:text-destructive gap-1"
            >
              <X className="h-3 w-3" /> Clear all
            </Button>
          )}
        </div>
      </div>

      {/* Scrollable filter list */}
      <div className="flex-1 overflow-y-auto">

        {/* ── Patient-derived quick filters ── */}
        {patients.length > 0 && Object.entries(patientBasedFilters).map(([key, options]) => {
          const activeCount = (stagedFilters[key] || []).length;
          const labelMap = {
            gender: 'Gender',
            state: 'State / Province',
            city: 'City',
            active: 'Patient Status',
          };
          return (
            <FilterSection
              key={key}
              title={labelMap[key] || key}
              count={activeCount}
              defaultOpen={activeCount > 0}
            >
              <div className={cn('space-y-0.5', options.length > 8 && 'max-h-44 overflow-y-auto pr-1')}>
                {options.map((opt) => (
                  <FilterOption
                    key={opt.value}
                    label={opt.label}
                    count={opt.count}
                    checked={(stagedFilters[key] || []).includes(opt.value)}
                    onChange={(e) => handleFilterChange(key, opt.value, e.target.checked)}
                  />
                ))}
              </div>
            </FilterSection>
          );
        })}

        {/* ── Medical Resource Filters heading ── */}
        <div className="px-4 pt-4 pb-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Medical Resource Filters
          </p>
        </div>

        {/* Skeleton while loading resource types */}
        {isTargetsLoading && (
          <div className="px-4 space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="border border-border rounded-md p-2.5 flex items-center gap-2">
                <Skeleton className="h-4 flex-1" />
                <Skeleton className="h-4 w-4" />
              </div>
            ))}
          </div>
        )}

        {/* Error state */}
        {!isTargetsLoading && targetsData && !targetsData.success && (
          <div className="mx-4 mb-3 p-3 rounded-md bg-destructive/10 border border-destructive/20 text-xs text-destructive flex gap-2 items-start">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            <span>Could not load medical filter categories. Check your backend connection.</span>
          </div>
        )}

        {/* No patients loaded */}
        {patients.length === 0 && !isTargetsLoading && (
          <div className="px-4 py-6 text-center text-muted-foreground">
            <SlidersHorizontal className="h-10 w-10 mx-auto mb-3 opacity-20" />
            <p className="text-sm font-medium">No filter data yet</p>
            <p className="text-xs mt-1">Patient data appears once the table loads.</p>
          </div>
        )}

        {/* Lazy-loading resource type filter groups */}
        {resourceTypes.length > 0 && (
          <div className="px-4 pb-4 space-y-0">
            {resourceTypes.map((rt) => (
              <ResourceFilterGroup
                key={rt}
                resourceType={rt}
                stagedFilters={stagedFilters}
                onFilterChange={handleFilterChange}
              />
            ))}
          </div>
        )}
      </div>

      {/* Sticky action bar */}
      {patients.length > 0 && (
        <div className="border-t border-border px-4 py-3 space-y-2 bg-background">
          <Button
            className="w-full"
            onClick={applyFilters}
            disabled={!hasPendingChanges}
          >
            {hasPendingChanges
              ? `Apply Filters (${Object.keys(stagedFilters).length})`
              : 'Filters Applied'}
          </Button>
          {hasPendingChanges && (
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-muted-foreground gap-1.5"
              onClick={resetStaged}
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Discard Changes
            </Button>
          )}
        </div>
      )}
    </div>
  );
};

export default DynamicFilterSidebar;