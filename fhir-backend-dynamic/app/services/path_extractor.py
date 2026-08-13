"""
Generic FHIR JSON Path Extractor
Safely walks nested FHIR JSON using dot+bracket notation from config
No resource-specific logic - works universally across all FHIR resources
"""

from typing import List, Dict, Any, Optional, Union
import logging
import re

logger = logging.getLogger(__name__)


def extract_values_by_path(resources: List[Dict[str, Any]], path: str) -> List[str]:
    """
    Extract values from a LIST of FHIR resources using JSON path notation.
    Loops through every resource and collects all found values into one list.
    
    Example: give it 10 Patient resources and path "gender", 
             get back ["male", "female", "male", ...]
    """
    if not resources or not path:
        return []
    
    values = []
    
    for resource in resources:
        if not isinstance(resource, dict):
            continue
            
        try:
            value = extract_single_value_by_path(resource, path)
            if value is None:
                continue
            # Value could be a list (from wildcard) or a single item
            if isinstance(value, list):
                for v in value:
                    str_value = str(v).strip()
                    if str_value:
                        values.append(str_value)
            else:
                str_value = str(value).strip()
                if str_value:
                    values.append(str_value)
        except Exception as e:
            logger.debug(f"Error extracting path '{path}' from resource: {str(e)}")
            continue
    
    return values


def extract_single_value_by_path(resource: Dict[str, Any], path: str) -> Optional[Any]:
    """
    Extract a value from ONE FHIR resource using path notation.
    
    Supports:
        - Simple fields:   "status"           → "active"
        - Nested objects:  "code.text"        → "Blood Pressure"
        - Numeric index:   "coding[0].code"   → "12345"
        - Wildcard index:  "coding[*].code"   → ["12345", "67890"]
    
    Returns None if path doesn't exist.
    Returns a list if wildcard [*] is used.
    """
    if not resource or not path:
        return None
    
    try:
        segments = parse_path_segments(path)
        return _walk_segments(resource, segments)
    except Exception as e:
        logger.debug(f"Error parsing path '{path}': {str(e)}")
        return None


def _walk_segments(current: Any, segments: list) -> Optional[Any]:
    """
    Recursively walk through path segments to extract a value.
    This is the engine that powers extract_single_value_by_path.
    
    Think of it like following directions:
    "Go to code → then go to coding → take the first item → get its display"
    """
    if not segments or current is None:
        return current
    
    segment = segments[0]
    remaining = segments[1:]
    
    if segment['type'] == 'field':
        # Simple field: just look up the key in the dictionary
        if not isinstance(current, dict):
            return None
        return _walk_segments(current.get(segment['name']), remaining)
    
    elif segment['type'] == 'array':
        # Array with numeric index like coding[0]
        if not isinstance(current, dict):
            return None
        field_value = current.get(segment['name'])
        if not isinstance(field_value, list):
            return None
        index = segment['index']
        if index >= len(field_value):
            return None
        return _walk_segments(field_value[index], remaining)
    
    elif segment['type'] == 'wildcard':
        # Wildcard [*]: collect results from ALL items in the array
        # Example: coding[*].display → ["Blood Pressure", "BP", ...]
        if not isinstance(current, dict):
            return None
        field_value = current.get(segment['name'])
        if not isinstance(field_value, list) or not field_value:
            return None
        
        results = []
        for item in field_value:
            result = _walk_segments(item, remaining)
            if result is None:
                continue
            # Result itself might be a list (nested wildcards)
            if isinstance(result, list):
                results.extend(result)
            else:
                results.append(result)
        
        return results if results else None
    
    return None


def parse_path_segments(path: str) -> List[Dict[str, Union[str, int]]]:
    """
    Break a path string into structured pieces we can follow one by one.
    
    Examples:
        "status"              → [{"type": "field", "name": "status"}]
        "coding[0].code"      → [{"type": "array",    "name": "coding", "index": 0},
                                  {"type": "field",    "name": "code"}]
        "coding[*].code"      → [{"type": "wildcard", "name": "coding"},
                                  {"type": "field",    "name": "code"}]
    """
    if not path:
        return []
    
    segments = []
    parts = path.split('.')
    
    for part in parts:
        if not part:
            continue
        
        # Check for wildcard: coding[*]
        wildcard_match = re.match(r'^([a-zA-Z_]\w*)\[\*\]$', part)
        # Check for numeric index: coding[0]
        array_match = re.match(r'^([a-zA-Z_]\w*)\[(\d+)\]$', part)
        
        if wildcard_match:
            segments.append({
                'type': 'wildcard',
                'name': wildcard_match.group(1)
            })
        elif array_match:
            segments.append({
                'type': 'array',
                'name': array_match.group(1),
                'index': int(array_match.group(2))
            })
        else:
            clean_name = re.sub(r'[^a-zA-Z0-9_]', '', part)
            if clean_name:
                segments.append({
                    'type': 'field',
                    'name': clean_name
                })
    
    return segments


def extract_multiple_paths(resources: List[Dict[str, Any]], paths: Dict[str, str]) -> Dict[str, List[str]]:
    """
    Convenience function: extract several paths at once from the same resources.
    
    Instead of calling extract_values_by_path 5 times, call this once with
    a dictionary of {label: path} pairs.
    
    Example:
        paths = {"code": "code.coding[0].code", "display": "code.coding[0].display"}
        result = extract_multiple_paths(resources, paths)
        # → {"code": ["123", "456"], "display": ["Test A", "Test B"]}
    """
    if not resources or not paths:
        return {}
    
    results = {}
    for key, path in paths.items():
        try:
            results[key] = extract_values_by_path(resources, path)
        except Exception as e:
            logger.warning(f"Error extracting path '{path}' for key '{key}': {str(e)}")
            results[key] = []
    
    return results


def validate_path_syntax(path: str) -> bool:
    """
    Check if a path string is written correctly before trying to use it.
    Returns True if valid, False if something looks wrong.
    """
    if not path or not isinstance(path, str):
        return False
    if path.startswith('.') or path.endswith('.') or '..' in path:
        return False
    try:
        segments = parse_path_segments(path)
        if not segments:
            return False
        for segment in segments:
            if not segment.get('name') or not re.match(r'^[a-zA-Z_]\w*$', segment['name']):
                return False
            if segment['type'] == 'array':
                if 'index' not in segment or not isinstance(segment['index'], int) or segment['index'] < 0:
                    return False
        return True
    except Exception:
        return False