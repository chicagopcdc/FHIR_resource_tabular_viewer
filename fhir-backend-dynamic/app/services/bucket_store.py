from __future__ import annotations
import logging
from typing import Optional
import boto3
from botocore.exceptions import BotoCoreError, ClientError
from app.services.file_store import parse_fhir_file, FileStore

logger = logging.getLogger(__name__)


def load_from_s3(
    bucket: str,
    key: str,
    region: str = "us-east-1",
    access_key: Optional[str] = None,
    secret_key: Optional[str] = None,
) -> FileStore:
   
    logger.info(f"Connecting to S3: s3://{bucket}/{key} in {region}")
    try:
        session = boto3.Session(
            aws_access_key_id=access_key or None,
            aws_secret_access_key=secret_key or None,
            region_name=region,
        )
        s3_client = session.client("s3")
        response = s3_client.get_object(Bucket=bucket, Key=key)
        content: bytes = response["Body"].read()

    except ClientError as e:
        code = e.response["Error"]["Code"]
        if code == "NoSuchBucket":
            raise RuntimeError(f"Bucket '{bucket}' not found or not accessible")
        elif code == "NoSuchKey":
            raise RuntimeError(f"File '{key}' not found in bucket '{bucket}'")
        elif code in ("AccessDenied", "403"):
            raise RuntimeError("Access denied. Check your AWS credentials.")
        else:
            raise RuntimeError(f"S3 error ({code}): {e}")
    except BotoCoreError as e:
        raise RuntimeError(f"AWS connection error: {e}")

    if not content:
        raise ValueError(f"s3://{bucket}/{key} is empty")

    resource_map = parse_fhir_file(content)
    if not resource_map:
        raise ValueError(
            f"No FHIR resources found in s3://{bucket}/{key}. "
            "File must be a FHIR Bundle JSON or NDJSON."
        )

    total = sum(len(v) for v in resource_map.values())
    logger.info(f"S3 loaded: {total} resources across {len(resource_map)} types")
    return FileStore(resource_map)
