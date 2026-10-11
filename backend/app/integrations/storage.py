import json
from typing import BinaryIO, Protocol

from fastapi import Request
from minio import Minio

from app.core.config import Settings


class ProductStorage(Protocol):
    def ensure_bucket(self) -> None: ...

    def put(
        self,
        object_name: str,
        stream: BinaryIO,
        content_type: str,
    ) -> None: ...

    def delete(self, object_name: str) -> None: ...

    def public_url(self, object_name: str) -> str: ...


class MinioProductStorage:
    def __init__(self, settings: Settings) -> None:
        self._bucket = settings.minio_bucket
        self._external_url = settings.minio_external_url.rstrip("/")
        self._client = Minio(
            endpoint=settings.minio_endpoint,
            access_key=settings.minio_access_key,
            secret_key=settings.minio_secret_key,
            secure=False,
        )

    def ensure_bucket(self) -> None:
        if not self._client.bucket_exists(self._bucket):
            self._client.make_bucket(self._bucket)

        policy = {
            "Version": "2012-10-17",
            "Statement": [
                {
                    "Effect": "Allow",
                    "Principal": {"AWS": ["*"]},
                    "Action": ["s3:GetObject"],
                    "Resource": [f"arn:aws:s3:::{self._bucket}/products/*"],
                }
            ],
        }
        self._client.set_bucket_policy(self._bucket, json.dumps(policy))

    def put(
        self,
        object_name: str,
        stream: BinaryIO,
        content_type: str,
    ) -> None:
        self._client.put_object(
            bucket_name=self._bucket,
            object_name=object_name,
            data=stream,
            length=-1,
            part_size=10 * 1024 * 1024,
            content_type=content_type,
        )

    def delete(self, object_name: str) -> None:
        self._client.remove_object(
            bucket_name=self._bucket,
            object_name=object_name,
        )

    def public_url(self, object_name: str) -> str:
        return f"{self._external_url}/{self._bucket}/{object_name}"


def get_product_storage(request: Request) -> ProductStorage:
    return request.app.state.product_storage
