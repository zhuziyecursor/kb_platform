from minio import Minio

from src.config import MinioConfig


class MinioClient:
    def __init__(self, config: MinioConfig):
        self._client = Minio(
            endpoint=config.endpoint,
            access_key=config.access_key,
            secret_key=config.secret_key,
            secure=config.secure,
        )
        self._bucket = config.bucket

    def get_object(self, object_path: str) -> bytes:
        """从 MinIO 下载文件内容。object_path 不含 bucket 前缀。"""
        response = self._client.get_object(self._bucket, object_path)
        try:
            return response.read()
        finally:
            response.close()
            response.release_conn()
