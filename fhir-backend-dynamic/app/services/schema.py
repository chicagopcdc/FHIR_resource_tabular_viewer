from typing import Any, Dict, List
from collections import defaultdict
import logging

logger = logging.getLogger(__name__)

MAX_DEPTH = 6
MAX_ARRAY_ITEMS = 3

def _flatten_paths(node: Any, prefix: str, paths: set, depth: int = 0):
    """
    Recursively flatten FHIR resource structure to dotted paths
    Returns paths like: id, name.given[0], code.coding[0].code, etc.
    """
    if depth > MAX_DEPTH:
        return
        
    if node is None:
        if prefix:
            paths.add(prefix)
        return
        
    if isinstance(node, dict):
        if not node:  # Empty dict
            if prefix:
                paths.add(prefix)
            return
            
        for key, value in node.items():
            new_prefix = f"{prefix}.{key}" if prefix else key
            _flatten_paths(value, new_prefix, paths, depth + 1)
            
    elif isinstance(node, list):
        if not node:  # Empty list
            if prefix:
                paths.add(prefix)
            return
            
        # Sample first few items to understand structure
        for idx, item in enumerate(node[:MAX_ARRAY_ITEMS]):
            array_prefix = f"{prefix}[{idx}]"
            _flatten_paths(item, array_prefix, paths, depth + 1)
            
        # Add the base array path too
        if prefix:
            paths.add(prefix)
            
    else:
        # Primitive value (string, number, boolean)
        if prefix:
            paths.add(prefix)

def infer_columns(resources: List[Dict], max_paths: int = 200) -> List[str]:
    """
    FIXED: Return simple string array as expected by frontend
    Infer column paths from sample FHIR resources dynamically
    """
    if not resources:
        return []
        
    all_paths = set()
    
    try:
        for resource in resources:
            if isinstance(resource, dict):
                _flatten_paths(resource, "", all_paths, 0)
                
        # Convert to sorted list and limit paths
        paths_list = sorted(list(all_paths))
        
        # Prioritize common/important paths
        prioritized_paths = []
        priority_patterns = [
            'id', 'resourceType', 'status', 'code', 'name', 'given', 'family',
            'display', 'text', 'value', 'system', 'effective', 'issued', 
            'date', 'period', 'subject', 'patient', 'reference'
        ]
        
        # Add high priority paths first
        for pattern in priority_patterns:
            matching_paths = [p for p in paths_list if pattern in p.lower()]
            for path in matching_paths:
                if path not in prioritized_paths:
                    prioritized_paths.append(path)
                    
        # Add remaining paths
        for path in paths_list:
            if path not in prioritized_paths:
                prioritized_paths.append(path)
                
        # Limit to max_paths to prevent UI overload
        return prioritized_paths[:max_paths]
        
    except Exception as e:
        logger.error(f"Error in schema inference: {str(e)}")
        return ['id', 'resourceType']  # Fallback to basics

def analyze_sample_values(resources: List[Dict], path: str) -> Dict[str, Any]:
    """
    Analyze sample values for a given path to provide additional metadata
    """
    values = []
    value_types = set()
    
    try:
        for resource in resources:
            value = _extract_value_by_path(resource, path)
            if value is not None:
                values.append(value)
                value_types.add(type(value).__name__)
                
        return {
            "sample_count": len(values),
            "unique_values": len(set(str(v) for v in values)),
            "value_types": list(value_types),
            "sample_values": values[:5],  # First 5 samples
            "all_null": len(values) == 0
        }
    except Exception as e:
        logger.error(f"Error analyzing values for path {path}: {str(e)}")
        return {"sample_count": 0, "all_null": True}

def _extract_value_by_path(resource: Dict, path: str) -> Any:
    """
    Extract value from resource using dotted path notation
    Handles arrays with [index] notation
    """
    try:
        current = resource
        parts = _parse_path(path)
        
        for part in parts:
            if isinstance(part, dict) and part.get("type") == "array_index":
                if isinstance(current, list) and part["index"] < len(current):
                    current = current[part["index"]]
                else:
                    return None
            elif isinstance(current, dict) and part in current:
                current = current[part]
            else:
                return None
                
        return current
    except Exception:
        return None

def _parse_path(path: str) -> List:
    """
    Parse dotted path with array indices into parts
    Example: "code.coding[0].display" -> ["code", "coding", {"type": "array_index", "index": 0}, "display"]
    """
    parts = []
    current = ""
    i = 0
    
    while i < len(path):
        char = path[i]
        
        if char == '.':
            if current:
                parts.append(current)
                current = ""
        elif char == '[':
            # Found array index
            if current:
                parts.append(current)
                current = ""
            # Find closing bracket
            j = i + 1
            while j < len(path) and path[j] != ']':
                j += 1
            if j < len(path):
                try:
                    index = int(path[i+1:j])
                    parts.append({"type": "array_index", "index": index})
                except ValueError:
                    pass  # Invalid index, skip
                i = j
            else:
                break  # No closing bracket
        else:
            current += char
        i += 1
    
    if current:
        parts.append(current)
        
    return parts