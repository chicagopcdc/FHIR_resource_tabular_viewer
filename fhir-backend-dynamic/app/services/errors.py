from typing import Dict, Any

def map_operation_outcome(obj: Dict[str, Any]) -> Dict[str, Any]:
    if not isinstance(obj, dict):
        return {}
    if obj.get("resourceType") != "OperationOutcome":
        return {}
    issues = obj.get("issue") or []
    messages = []
    for it in issues:
        severity = it.get("severity")
        code = it.get("code")
        details = it.get("details", {}).get("text")
        diagnostics = it.get("diagnostics")
        pieces = [p for p in [severity, code, details, diagnostics] if p]
        if pieces:
            messages.append(" - ".join(pieces))
    return {"message": "; ".join(messages) if messages else "OperationOutcome returned by server"}
