import { useState, useRef, useCallback } from "react";
import { uploadFileSource } from "../api";
import { Upload, CheckCircle2, AlertCircle, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";

const MAX_MB = 50;

/**
 * FileUploadDialog — drag-drop local FHIR file upload.
 * File is parsed in-memory on the server; nothing written to disk.
 *
 * Props: open, onClose, onSuccess
 */
export default function FileUploadDialog({ open, onClose, onSuccess }) {
  const [dragOver, setDragOver] = useState(false);
  const [status, setStatus] = useState(null); // null|"uploading"|"success"|"error"
  const [result, setResult] = useState(null);
  const inputRef = useRef();

  const reset = () => { setStatus(null); setResult(null); };
  const handleClose = () => { reset(); onClose(); };

  const validate = (file) => {
    const ext = "." + file.name.split(".").pop().toLowerCase();
    if (![".json", ".ndjson"].includes(ext))
      return `Unsupported type "${ext}". Use .json or .ndjson`;
    if (file.size > MAX_MB * 1024 * 1024)
      return `File too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Max ${MAX_MB} MB`;
    return null;
  };

  const handleFile = useCallback(async (file) => {
    if (!file) return;
    const err = validate(file);
    if (err) { setStatus("error"); setResult({ message: err }); return; }
    setStatus("uploading"); setResult(null);
    try {
      const data = await uploadFileSource(file);
      setStatus("success"); setResult(data);
    } catch (e) {
      setStatus("error");
      setResult({ message: e.message || "Upload failed. Check the file is valid FHIR JSON or NDJSON." });
    }
  }, []);

  const handleDrop = (e) => {
    e.preventDefault(); setDragOver(false);
    handleFile(e.dataTransfer.files[0]);
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg space-y-5 p-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Load Local FHIR File</h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              Parsed in memory — not saved to disk.
            </p>
          </div>
          <button onClick={handleClose} className="p-1 hover:bg-muted rounded-md">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Drop Zone */}
        {!status && (
          <div
            className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors
              ${dragOver ? "border-blue-400 bg-blue-50" : "border-muted-foreground/30 hover:border-muted-foreground/60"}`}
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
          >
            <Upload className="mx-auto h-10 w-10 text-muted-foreground mb-3" />
            <p className="font-medium">Drag & drop a file here</p>
            <p className="text-sm text-muted-foreground mt-1">or click to browse</p>
            <p className="text-xs text-muted-foreground mt-2">FHIR Bundle JSON or NDJSON · Max {MAX_MB} MB</p>
            <input ref={inputRef} type="file" accept=".json,.ndjson" className="hidden"
              onChange={(e) => handleFile(e.target.files[0])} />
          </div>
        )}

        {/* Uploading */}
        {status === "uploading" && (
          <div className="flex flex-col items-center gap-3 py-8">
            <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
            <p className="text-sm font-medium">Parsing FHIR file...</p>
            <p className="text-xs text-muted-foreground">Large files may take a moment</p>
          </div>
        )}

        {/* Success */}
        {status === "success" && result && (
          <div className="space-y-4">
            <div className="flex items-start gap-3 p-4 bg-green-50 rounded-lg border border-green-200">
              <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5 shrink-0" />
              <div>
                <p className="font-medium text-green-800">File loaded successfully</p>
                <p className="text-sm text-green-700 mt-0.5">{result.message}</p>
              </div>
            </div>
            {result.resource_counts && (
              <div className="rounded-lg border overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium">Resource Type</th>
                      <th className="text-right px-3 py-2 font-medium">Count</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(result.resource_counts).map(([type, count]) => (
                      <tr key={type} className="border-t">
                        <td className="px-3 py-1.5 font-mono text-xs">{type}</td>
                        <td className="px-3 py-1.5 text-right">{count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Error */}
        {status === "error" && (
          <div className="flex items-start gap-3 p-4 bg-red-50 rounded-lg border border-red-200">
            <AlertCircle className="h-5 w-5 text-red-500 mt-0.5 shrink-0" />
            <div>
              <p className="font-medium text-red-800">Upload failed</p>
              <p className="text-sm text-red-700 mt-0.5">{result?.message}</p>
              <button onClick={reset} className="text-sm text-red-600 underline mt-2">Try again</button>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex justify-end gap-2 pt-1">
          {status === "success"
            ? <Button className="bg-blue-600 hover:bg-blue-700 text-white"
              onClick={() => { onSuccess?.(); handleClose(); }}>View Data</Button>
            : <Button variant="outline" onClick={handleClose}>Cancel</Button>
          }
        </div>
      </div>
    </div>
  );
}
