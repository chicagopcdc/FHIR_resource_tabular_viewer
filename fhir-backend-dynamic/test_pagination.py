import asyncio
import httpx
from urllib.parse import urlparse, parse_qs

async def test_pagination():
    print("TESTING HAPI PAGINATION ISSUE\n")
    
    base_url = "https://hapi.fhir.org/baseR4/"
    
    async with httpx.AsyncClient(timeout=30.0) as client:
        # Test 1: Direct request
        print("1. Direct Patient request:")
        url = f"{base_url}Patient?_count=5"
        response = await client.get(url, headers={"Accept": "application/fhir+json"})
        bundle = response.json()
        
        print(f"   URL: {url}")
        print(f"   Entries: {len(bundle.get('entry', []))}")
        
        # Get the next link
        next_link = None
        for link in bundle.get('link', []):
            if link.get('relation') == 'next':
                next_link = link.get('url')
                break
        
        if next_link:
            parsed = urlparse(next_link)
            params = parse_qs(parsed.query)
            print(f"   Next link params: _getpages={params.get('_getpages', [''])[0][:20]}...")
            print(f"   Offset in next link: {params.get('_getpagesoffset', ['???'])[0]}")
            
            # Test 2: Follow with offset=0 instead
            print("\n2. Trying with offset=0:")
            fixed_url = f"{base_url}?_getpages={params.get('_getpages', [''])[0]}&_getpagesoffset=0&_count=5&_bundletype=searchset"
            print(f"   URL: {fixed_url[:100]}...")
            response2 = await client.get(fixed_url, headers={"Accept": "application/fhir+json"})
            bundle2 = response2.json()
            print(f"   Entries: {len(bundle2.get('entry', []))}")
            
            if bundle2.get('entry'):
                for i, entry in enumerate(bundle2['entry'][:2]):
                    patient = entry.get('resource', {})
                    print(f"     Patient: {patient.get('id')}")

if __name__ == "__main__":
    asyncio.run(test_pagination())
