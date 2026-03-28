import { useEffect, useState, useCallback } from "react";
import { getActiveSource, clearFileSource } from "../api";
import { Button } from "@/components/ui/button";
import { FileJson, X, AlertCircle, Database } from "lucide-react";

/**
 * DataSourceBanner — Shows a banner when a local file or bucket source is active.
 * Renders nothing when using the live FHIR server (normal mode).
 *
 * Props:
 *   refreshKey  — increment from parent to force a re-check (e.g. after upload)
 *   onCleared   — called after source is cleared so parent can refresh data
 */
export default function DataSourceBanner({ refreshKey, onCleared }) {
  const [source, setSource] = useState(null);
  const [clearing, setClearing] = useState(false);

  const fetchSource = useCallback(async () => {
    try {
      const data = await getActiveSource();
      setSource(data);
    } catch {
      // silently ignore — banner just won't show
    }
  }, []);

  useEffect(() => {
    fetchSource();
  }, [fetchSource, refreshKey]);

  const handleClear = async () => {
    setClearing(true);
    try {
      await clearFileSource();
      await fetchSource();
      onCleared?.();
    } finally {
      setClearing(false);
    }
  };

  if (!source || source.type === "live") return null;

  const total = source.total_resources ?? 0;
  const typeCount = Object.keys(source.resource_counts || {}).length;
  const isS3 = source.name?.startsWith("s3://");

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center gap-3 px-5 py-2.5 bg-amber-50 border-b border-amber-200 text-sm text-amber-900"
    >
      {isS3 ? (
        <Database className="h-4 w-4 shrink-0 text-amber-600" aria-hidden />
      ) : (
        <FileJson className="h-4 w-4 shrink-0 text-amber-600" aria-hidden />
      )}

      <div className="flex-1 min-w-0">
        <span className="font-semibold">Data source: </span>
        <span className="font-mono text-xs truncate">{source.name}</span>
        <span className="ml-2 text-amber-600">
          ({total.toLocaleString()} resources · {typeCount} types)
        </span>
      </div>

      <Button
        onClick={handleClear}
        disabled={clearing}
        variant="outline"
        size="sm"
        className="shrink-0 border-amber-300 text-amber-800 hover:bg-amber-100"
      >
        <X className="h-3.5 w-3.5 mr-1.5" />
        {clearing ? "Switching…" : "Use Live Server"}
      </Button>
    </div>
  );
}
