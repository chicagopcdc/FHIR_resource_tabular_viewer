import asyncio
import httpx

async def test_direct():
    print("TESTING DIFFERENT APPROACHES\n")
    
    base_url = "https://hapi.fhir.org/baseR4/"
    
    async with httpx.AsyncClient(timeout=30.0) as client:
        # Test 1: Without _count parameter
        print("1. Without _count:")
        url = f"{base_url}Patient"
        response = await client.get(url, headers={"Accept": "application/fhir+json"})
        bundle = response.json()
        print(f"   Entries: {len(bundle.get('entry', []))}")
        
        # Test 2: With larger count
        print("\n2. With _count=20:")
        url = f"{base_url}Patient?_count=20"
        response = await client.get(url, headers={"Accept": "application/fhir+json"})
        bundle = response.json()
        print(f"   Entries: {len(bundle.get('entry', []))}")
        
        # Test 3: With _summary=count
        print("\n3. Check total with _summary=count:")
        url = f"{base_url}Patient?_summary=count"
        response = await client.get(url, headers={"Accept": "application/fhir+json"})
        bundle = response.json()
        print(f"   Total patients: {bundle.get('total', 'Unknown')}")
        
        # Test 4: Try specific test patients
        print("\n4. Try fetching a specific test patient:")
        url = f"{base_url}Patient?name=test&_count=10"
        response = await client.get(url, headers={"Accept": "application/fhir+json"})
        bundle = response.json()
        print(f"   Entries: {len(bundle.get('entry', []))}")

if __name__ == "__main__":
    asyncio.run(test_direct())
