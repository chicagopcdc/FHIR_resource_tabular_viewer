import React, { useState, useEffect } from "react";
import S3ConnectDialog from "./components/S3ConnectDialog";
import FileUploadDialog from "./components/FileUploadDialog";
import DataSourceBanner from "./components/DataSourceBanner";
import { Search, RefreshCw, Filter, SlidersHorizontal, X, CalendarClock, FileJson, Database } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const formatCurrentDateTime = (timeZone) =>
  new Date().toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    ...(timeZone ? { timeZone } : {}),
    timeZoneName: "short",
  });

const Header = ({
  onSearchChange,
  onRefresh,
  searchTerm = "",
  onToggleFilters,
  hasActiveFilters,
  onClearFilters
}) => {
  const userTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const [localSearchTerm, setLocalSearchTerm] = useState(searchTerm);
  const [currentDateTime, setCurrentDateTime] = useState(() => formatCurrentDateTime(userTimeZone));

  const [uploadOpen, setUploadOpen] = useState(false);
  const [s3Open, setS3Open] = useState(false);
  const [bannerRefreshKey, setBannerRefreshKey] = useState(0);

  const onSourceLoaded = () => {
    setBannerRefreshKey(k => k + 1);
    window.location.reload();
  };



  useEffect(() => {
    setLocalSearchTerm(searchTerm);
  }, [searchTerm]);

  useEffect(() => {
    let intervalId;

    const updateTime = () => setCurrentDateTime(formatCurrentDateTime(userTimeZone));

    updateTime();

    const msUntilNextMinute = 60000 - (Date.now() % 60000);
    const timeoutId = setTimeout(() => {
      updateTime();
      intervalId = setInterval(updateTime, 60000);
    }, msUntilNextMinute);

    return () => {
      clearTimeout(timeoutId);
      if (intervalId) clearInterval(intervalId);
    };
  }, [userTimeZone]);

  const handleSearchSubmit = (e) => {
    e?.preventDefault();
    if (onSearchChange) onSearchChange(localSearchTerm);
  };

  return (
    <>
      <DataSourceBanner
        refreshKey={bannerRefreshKey}
        onCleared={onSourceLoaded}
      />
      <header className="bg-background border-b sticky top-0 z-50 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-center px-6 py-5 border-b bg-linear-to-r from-background via-background to-muted/20 backdrop-blur-sm">

          <div className="rounded-xl border bg-card/70 px-4 py-3 shadow-sm">
            <h1 className="text-2xl sm:text-[1.65rem] font-bold tracking-tight text-foreground leading-none">
              FHIR Patient Viewer
            </h1>

            <p className="mt-1 text-sm text-muted-foreground font-medium tracking-wide">
              Healthcare Data Management System
            </p>
          </div>

          <div className="inline-flex items-center gap-2.5 text-sm text-foreground mt-1 sm:mt-0 bg-card/90 px-3.5 py-2 rounded-xl border shadow-sm backdrop-blur-sm transition-all duration-200 hover:shadow-md hover:border-blue-200/70">
            <div className="relative flex h-8 w-8 items-center justify-center rounded-xl bg-linear-to-br from-blue-500 to-indigo-600 text-white shadow-sm ring-1 ring-blue-300/40">
              <div className="absolute -inset-1 -z-10 rounded-xl bg-blue-400/25 blur-sm" />
              <CalendarClock className="h-4 w-4 drop-shadow-[0_1px_1px_rgba(0,0,0,0.3)]" />
            </div>
            <span className="font-semibold tracking-tight">{currentDateTime}</span>
          </div>

        </div>

        {/* Action Bar */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center px-6 py-3 border-b bg-card/50">
          <div className="flex items-center gap-4 mb-4 sm:mb-0">
            <Button
              onClick={onToggleFilters}
              variant="destructive"
              className="flex items-center shadow-sm font-semibold"
            >
              <Filter className="w-4 h-4 mr-2" />
              Quick Filters
              {hasActiveFilters && (
                <span
                  className="ml-2 flex h-5 w-5 items-center justify-center rounded-full bg-white/20 hover:bg-white/40 transition-colors cursor-pointer"
                  onClick={(e) => {
                    console.log("Quick Filters Clear clicked!");
                    e.preventDefault();
                    e.stopPropagation();
                    if (onClearFilters) onClearFilters();
                  }}
                  title="Clear active filters"
                >
                  <X className="w-3.5 h-3.5 text-white" />
                </span>
              )}
            </Button>
            <h2 className="text-lg font-semibold text-foreground tracking-tight hidden md:block">
              FHIR Resource Viewer - Patient Search
            </h2>
          </div>
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <Button variant="outline"
              className="flex items-center gap-2 text-emerald-700 border-emerald-200 hover:bg-emerald-50"
              onClick={() => setUploadOpen(true)}>
              <FileJson className="w-4 h-4" />
              <span className="hidden sm:inline">Load File</span>
            </Button>
            <Button variant="outline"
              className="flex items-center gap-2 text-orange-700 border-orange-200 hover:bg-orange-50"
              onClick={() => setS3Open(true)}>
              <Database className="w-4 h-4" />
              <span className="hidden sm:inline">S3 Bucket</span>
            </Button>
            <Button
              onClick={() => onRefresh ? onRefresh() : window.location.reload()}
              variant="outline"
              className="flex items-center gap-2 w-full sm:w-auto text-blue-600 border-blue-200 hover:bg-blue-50"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Refresh</span>
            </Button>
          </div>
        </div>

        {/* Search Bar */}
        <div className="px-6 py-4 bg-muted/30">
          <form
            onSubmit={handleSearchSubmit}
            className="flex items-center w-full max-w-2xl gap-2"
          >
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                type="text"
                value={localSearchTerm}
                onChange={(e) => setLocalSearchTerm(e.target.value)}
                placeholder="Search patients by name or ID..."
                className="pl-9 h-10 w-full bg-background shadow-sm border-muted-foreground/20 focus-visible:ring-blue-500"
              />
              {localSearchTerm && (
                <button
                  type="button"
                  onClick={() => { setLocalSearchTerm(""); if (onSearchChange) onSearchChange(""); }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground rounded-full p-1 transition-colors"
                  title="Clear search"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            <Button
              type="submit"
              className="h-10 px-6 bg-blue-600 hover:bg-blue-700 text-white shadow-sm font-medium"
            >
              <Search className="w-4 h-4 mr-2" />
              Search
            </Button>

            <Button
              type="button"
              variant="outline"
              className={`h-10 ml-2 hidden sm:flex items-center shadow-sm border-muted-foreground/20 transition-all ${hasActiveFilters ? "bg-blue-50 border-blue-200 text-blue-700" : "bg-background"}`}
              onClick={onToggleFilters}
            >
              <SlidersHorizontal className={`w-4 h-4 mr-2 ${hasActiveFilters ? "text-blue-600" : ""}`} />
              Advanced
              {hasActiveFilters && (
                <span
                  className="ml-2 flex h-5 w-5 items-center justify-center rounded-full bg-blue-200 hover:bg-blue-300 transition-colors cursor-pointer"
                  onClick={(e) => {
                    console.log("Advanced Filters Clear clicked!");
                    e.preventDefault();
                    e.stopPropagation();
                    if (onClearFilters) onClearFilters();
                  }}
                  title="Clear active filters"
                >
                  <X className="w-3.5 h-3.5 text-blue-800" />
                </span>
              )}
            </Button>
          </form>
        </div>
      </header>

      <FileUploadDialog
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        onSuccess={() => { setUploadOpen(false); onSourceLoaded(); }}
      />
      <S3ConnectDialog
        open={s3Open}
        onClose={() => setS3Open(false)}
        onSuccess={() => { setS3Open(false); onSourceLoaded(); }}
      />
    </>
  );
};

export default Header;
