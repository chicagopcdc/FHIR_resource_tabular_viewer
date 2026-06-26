"""A :class:`SourceLoader` backed by a FHIR object stored in Amazon S3.

Scope: *direct object loading* - given an ``s3://bucket/key`` URI (or explicit
bucket + key), fetch the object's bytes and parse them with the same machinery
the local-file source uses. Bucket browsing can be layered on later.

The actual byte fetch is injectable (``fetcher``) so the parsing/store path is
testable without boto3, AWS credentials, or network access; the default fetcher
imports boto3 lazily.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Callable, Optional
from urllib.parse import urlparse

from app.services.sources.memory_source import InMemoryStoreSource
from app.services.sources.store import InMemoryFhirStore


class S3Error(RuntimeError):
    """Raised when an S3 object cannot be fetched (auth, missing key, etc.)."""


def parse_s3_uri(uri: str) -> tuple[str, str]:
    """Parse ``s3://bucket/key/path`` into ``(bucket, key)``.

    Raises :class:`ValueError` if the URI is not a valid, fully-qualified S3
    object reference.
    """
    if not isinstance(uri, str) or not uri.strip():
        raise ValueError("S3 URI is required.")
    parsed = urlparse(uri.strip())
    if parsed.scheme != "s3":
        raise ValueError(f"Not an s3:// URI: {uri!r}")
    bucket = parsed.netloc
    key = parsed.path.lstrip("/")
    if not bucket:
        raise ValueError(f"S3 URI is missing a bucket: {uri!r}")
    if not key:
        raise ValueError(f"S3 URI is missing an object key: {uri!r}")
    return bucket, key


@dataclass
class S3Settings:
    """Optional connection overrides; otherwise the default AWS chain is used."""

    region: Optional[str] = None
    endpoint_url: Optional[str] = None  # e.g. MinIO / LocalStack for testing
    access_key_id: Optional[str] = None
    secret_access_key: Optional[str] = None
    session_token: Optional[str] = None


# A fetcher takes (bucket, key, settings) and returns the object's raw bytes.
Fetcher = Callable[[str, str, S3Settings], bytes]


def _boto3_fetch(bucket: str, key: str, settings: S3Settings) -> bytes:
    """Default fetcher: download an object via boto3 (imported lazily)."""
    try:
        import boto3  # noqa: WPS433 (intentional lazy import)
        from botocore.exceptions import BotoCoreError, ClientError
    except ImportError as exc:  # pragma: no cover - depends on environment
        raise S3Error(
            "boto3 is required for S3 sources. Install it with `pip install boto3`."
        ) from exc

    client_kwargs = {}
    if settings.region:
        client_kwargs["region_name"] = settings.region
    if settings.endpoint_url:
        client_kwargs["endpoint_url"] = settings.endpoint_url
    if settings.access_key_id and settings.secret_access_key:
        client_kwargs["aws_access_key_id"] = settings.access_key_id
        client_kwargs["aws_secret_access_key"] = settings.secret_access_key
        if settings.session_token:
            client_kwargs["aws_session_token"] = settings.session_token

    try:
        client = boto3.client("s3", **client_kwargs)
        response = client.get_object(Bucket=bucket, Key=key)
        return response["Body"].read()
    except (BotoCoreError, ClientError) as exc:
        raise S3Error(f"Failed to fetch s3://{bucket}/{key}: {exc}") from exc


class S3FileSource(InMemoryStoreSource):
    """Serve FHIR resources parsed from an S3 object out of memory."""

    source_type = "s3"

    def __init__(self, store: InMemoryFhirStore, *, uri: str = ""):
        super().__init__(store)
        self.uri = uri

    @classmethod
    def from_s3(
        cls,
        uri: str,
        *,
        settings: Optional[S3Settings] = None,
        fetcher: Optional[Fetcher] = None,
    ) -> "S3FileSource":
        """Load a source from an ``s3://bucket/key`` URI.

        ``fetcher`` is overridable for testing; when omitted the boto3-based
        default is resolved at call time (so it can be monkeypatched).
        """
        bucket, key = parse_s3_uri(uri)
        fetch = fetcher or _boto3_fetch
        data = fetch(bucket, key, settings or S3Settings())
        store = InMemoryFhirStore.from_bytes(data, filename=uri)
        return cls(store, uri=uri)
