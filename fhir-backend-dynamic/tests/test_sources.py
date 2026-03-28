import pytest
from httpx import AsyncClient
from app.main import app
import pathlib

# Using the existing Camila patient JSON as a test fixture
FIXTURE = pathlib.Path(__file__).parents[2] / "src" / "fhircamila.json"


@pytest.mark.asyncio
async def test_active_default_is_live():
    """Verify that by default the server uses the live FHIR server."""
    async with AsyncClient(app=app, base_url="http://test") as c:
        r = await c.get("/api/sources/active")
    assert r.status_code == 200
    assert r.json()["type"] == "live"


@pytest.mark.asyncio
async def test_upload_bundle_json():
    """Verify that uploading a valid FHIR Bundle JSON works."""
    if not FIXTURE.exists():
        pytest.skip(f"Fixture {FIXTURE} not found")
        
    content = FIXTURE.read_bytes()
    async with AsyncClient(app=app, base_url="http://test") as c:
        r = await c.post(
            "/api/sources/file",
            files={"file": ("camila.json", content, "application/json")},
        )
    assert r.status_code == 200
    data = r.json()
    assert data["success"] is True
    assert data["total_resources"] > 0
    assert "Patient" in data["resource_counts"]


@pytest.mark.asyncio
async def test_active_after_upload_is_file():
    """Verify that the active source type changes to 'file' after a successful upload."""
    if not FIXTURE.exists():
        pytest.skip(f"Fixture {FIXTURE} not found")

    content = FIXTURE.read_bytes()
    async with AsyncClient(app=app, base_url="http://test") as c:
        # First upload
        await c.post("/api/sources/file",
                     files={"file": ("camila.json", content, "application/json")})
        # Then check active source
        r = await c.get("/api/sources/active")
    
    assert r.status_code == 200
    assert r.json()["type"] == "file"
    assert "camila.json" in r.json()["name"]


@pytest.mark.asyncio
async def test_s3_connect_calls_boto3(monkeypatch):
    """Verify that the S3 connection endpoint correctly interfaces with boto3 (mocked)."""
    from unittest.mock import MagicMock, patch
    
    if not FIXTURE.exists():
        pytest.skip(f"Fixture {FIXTURE} not found")
        
    fake_content = FIXTURE.read_bytes()
    
    # Mock boto3 Session and S3 Client
    mock_s3 = MagicMock()
    mock_s3.get_object.return_value = {"Body": MagicMock(read=lambda: fake_content)}
    
    mock_session = MagicMock()
    mock_session.client.return_value = mock_s3

    with patch("boto3.Session", return_value=mock_session):
        async with AsyncClient(app=app, base_url="http://test") as c:
            r = await c.post("/api/sources/bucket/s3", json={
                "bucket": "my-bucket", 
                "key": "fhir/camila.json"
            })
            
    assert r.status_code == 200
    assert r.json()["success"] is True
    assert r.json()["name"] == "s3://my-bucket/fhir/camila.json"
    mock_s3.get_object.assert_called_once_with(Bucket="my-bucket", Key="fhir/camila.json")


@pytest.mark.asyncio
async def test_clear_reverts_to_live():
    """Verify that deleting the file source reverts the active source back to 'live'."""
    async with AsyncClient(app=app, base_url="http://test") as c:
        # Revert to live
        r = await c.delete("/api/sources/file")
        assert r.status_code == 200
        assert r.json()["active_source"] == "live"
        
        # Verify status endpoint reflects this
        r_active = await c.get("/api/sources/active")
        assert r_active.json()["type"] == "live"


@pytest.mark.asyncio
async def test_upload_invalid_file_returns_error():
    """Verify that uploading a non-FHIR JSON returns a 422 error."""
    async with AsyncClient(app=app, base_url="http://test") as c:
        r = await c.post("/api/sources/file",
                         files={"file": ("bad.json", b'{"not":"fhir"}', "application/json")})
    
    # The current implementation returns 400 or 422 depending on parsing logic
    # sources.py for /file uses parse_fhir_file which raises ValueError handled as 400
    assert r.status_code in (400, 422)
