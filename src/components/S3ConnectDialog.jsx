import { useState } from "react";
import { connectBucketSource } from "../api";
import { CheckCircle2, AlertCircle, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * S3ConnectDialog — connect an S3 bucket file as the active data source.
 * Server streams bytes from S3 into in-memory FileStore — nothing on disk.
 *
 * Props: open, onClose, onSuccess
 */
export default function S3ConnectDialog({ open, onClose, onSuccess }) {
    const [form, setForm] = useState({
        bucket: "", key: "", region: "us-east-1", accessKey: "", secretKey: "",
    });
    const [status, setStatus] = useState(null); // null|"loading"|"success"|"error"
    const [result, setResult] = useState(null);

    const reset = () => { setStatus(null); setResult(null); };
    const handleClose = () => { reset(); onClose(); };
    const set = (field) => (e) => setForm(f => ({ ...f, [field]: e.target.value }));

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!form.bucket || !form.key) return;
        setStatus("loading"); setResult(null);
        try {
            const data = await connectBucketSource(form);
            setStatus("success"); setResult(data);
        } catch (e) {
            setStatus("error"); setResult({ message: e.message });
        }
    };

    if (!open) return null;

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
            onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
        >
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-md space-y-5 p-6">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <div>
                        <h2 className="text-lg font-semibold">Connect S3 Bucket</h2>
                        <p className="text-sm text-muted-foreground mt-0.5">
                            Streams file from S3 into memory — not saved to disk.
                        </p>
                    </div>
                    <button onClick={handleClose} className="p-1 hover:bg-muted rounded-md">
                        <X className="h-5 w-5" />
                    </button>
                </div>

                {/* Success */}
                {status === "success" && result && (
                    <div className="flex items-start gap-3 p-4 bg-green-50 rounded-lg border border-green-200">
                        <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5 shrink-0" />
                        <div>
                            <p className="font-medium text-green-800">Connected successfully</p>
                            <p className="text-sm text-green-700 mt-0.5">{result.message}</p>
                        </div>
                    </div>
                )}

                {/* Form */}
                {status !== "success" && (
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="space-y-1">
                            <label className="text-sm font-medium">Bucket Name *</label>
                            <input className="w-full border rounded-lg px-3 py-2 text-sm font-mono"
                                placeholder="my-fhir-data"
                                value={form.bucket} onChange={set("bucket")} required />
                        </div>
                        <div className="space-y-1">
                            <label className="text-sm font-medium">File Key / Path *</label>
                            <input className="w-full border rounded-lg px-3 py-2 text-sm font-mono"
                                placeholder="exports/patients.ndjson"
                                value={form.key} onChange={set("key")} required />
                        </div>
                        <div className="space-y-1">
                            <label className="text-sm font-medium">Region</label>
                            <input className="w-full border rounded-lg px-3 py-2 text-sm"
                                value={form.region} onChange={set("region")} />
                        </div>

                        <details className="text-sm">
                            <summary className="cursor-pointer text-muted-foreground hover:text-foreground py-1">
                                AWS Credentials (optional — leave blank to use IAM role)
                            </summary>
                            <div className="grid grid-cols-2 gap-3 mt-3">
                                <div className="space-y-1">
                                    <label className="font-medium">Access Key ID</label>
                                    <input className="w-full border rounded-lg px-3 py-2 font-mono text-sm"
                                        placeholder="AKIA..." value={form.accessKey} onChange={set("accessKey")} />
                                </div>
                                <div className="space-y-1">
                                    <label className="font-medium">Secret Access Key</label>
                                    <input type="password" className="w-full border rounded-lg px-3 py-2 text-sm"
                                        value={form.secretKey} onChange={set("secretKey")} />
                                </div>
                            </div>
                        </details>

                        {status === "error" && (
                            <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">
                                {result?.message}
                            </p>
                        )}

                        <div className="flex gap-2 justify-end pt-1">
                            <Button type="button" variant="outline" onClick={handleClose}>Cancel</Button>
                            <Button type="submit" disabled={status === "loading"}
                                className="bg-blue-600 hover:bg-blue-700 text-white">
                                {status === "loading"
                                    ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Connecting...</>
                                    : "Connect"}
                            </Button>
                        </div>
                    </form>
                )}

                {/* Footer after success */}
                {status === "success" && (
                    <div className="flex justify-end">
                        <Button className="bg-blue-600 hover:bg-blue-700 text-white"
                            onClick={() => { onSuccess?.(); handleClose(); }}>
                            View Data
                        </Button>
                    </div>
                )}
            </div>
        </div>
    );
}
