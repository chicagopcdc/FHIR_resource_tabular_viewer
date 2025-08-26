#!/usr/bin/env python3
"""
Test script to debug HAPI FHIR server's deferred paging behavior
Run this directly to see what's happening with the HAPI server
"""

import asyncio
import httpx
import json
from urllib.parse import urlparse, parse_qs

async def test_hapi_direct():
    """Test HAPI server directly to understand its behavior"""
    
    print("=" * 80)
    print("TESTING HAPI FHIR SERVER DEFERRED PAGING")
    print("=" * 80)
    
    base_url = "https://hapi.fhir.org/baseR4/"
    
    # Step 1: Make initial request
    initial_url = f"{base_url}Patient?_count=5"
    print(f"\n1. Initial request to: {initial_url}")
    
    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.get(initial_url, headers={"Accept": "application/fhir+json"})
        
        if response.status_code != 200:
            print(f"   ERROR: Status {response.status_code}")
            print(f"   Response: {response.text}")
            return
            
        bundle = response.json()
        
        print(f"   Status: {response.status_code}")
        print(f"   Bundle type: {bundle.get('type')}")
        print(f"   Total resources: {bundle.get('total')}")
        print(f"   Entries in bundle: {len(bundle.get('entry', []))}")
        
        # Check if we got actual data
        if bundle.get('entry'):
            print(f"   ✓ Got {len(bundle['entry'])} Patient resources directly")
            for i, entry in enumerate(bundle['entry'][:2]):  # Show first 2
                patient = entry.get('resource', {})
                print(f"      Patient {i+1}: {patient.get('id')} - {patient.get('name', [{}])[0].get('family', 'Unknown')}")
        else:
            print(f"   ✗ No entries in initial bundle (deferred paging)")
        
        # Step 2: Check for pagination links
        print(f"\n2. Checking pagination links:")
        links = bundle.get('link', [])
        next_link = None
        
        for link in links:
            rel = link.get('relation')
            url = link.get('url')
            print(f"   - {rel}: {url[:100]}...")
            if rel == 'next':
                next_link = url
        
        # Step 3: If we have deferred paging, follow the next link
        if not bundle.get('entry') and next_link:
            print(f"\n3. DEFERRED PAGING DETECTED - Following next link")
            print(f"   URL: {next_link[:100]}...")
            
            # Parse the URL to see the pagination token
            parsed = urlparse(next_link)
            params = parse_qs(parsed.query)
            print(f"   Pagination token: _getpages={params.get('_getpages', ['???'])[0][:20]}...")
            
            # Follow the link
            response2 = await client.get(next_link, headers={"Accept": "application/fhir+json"})
            
            if response2.status_code != 200:
                print(f"   ERROR following link: Status {response2.status_code}")
                print(f"   Response: {response2.text}")
                return
                
            bundle2 = response2.json()
            
            print(f"   Status: {response2.status_code}")
            print(f"   Bundle type: {bundle2.get('type')}")
            print(f"   Entries in second bundle: {len(bundle2.get('entry', []))}")
            
            if bundle2.get('entry'):
                print(f"   ✓ Got {len(bundle2['entry'])} Patient resources after following link")
                for i, entry in enumerate(bundle2['entry'][:3]):  # Show first 3
                    patient = entry.get('resource', {})
                    name = patient.get('name', [{}])[0]
                    print(f"      Patient {i+1}: {patient.get('id')} - {name.get('family', 'Unknown')}, {name.get('given', [''])[0]}")
            else:
                print(f"   ✗ Still no entries after following link!")
        
        elif bundle.get('entry'):
            print(f"\n3. No deferred paging needed - got data directly")
        
        else:
            print(f"\n3. ERROR: No entries and no next link to follow!")
        
        # Step 4: Summary
        print(f"\n" + "=" * 80)
        print("SUMMARY:")
        if not bundle.get('entry') and next_link:
            print("✓ HAPI is using DEFERRED PAGING")
            print("  - First request returns empty bundle with pagination token")
            print("  - Must follow 'next' link to get actual data")
            print("  - Backend needs to handle this automatically")
        elif bundle.get('entry'):
            print("✓ HAPI returned data directly (no deferred paging)")
        else:
            print("✗ Unexpected state - no data and no way to get it")

if __name__ == "__main__":
    asyncio.run(test_hapi_direct())
