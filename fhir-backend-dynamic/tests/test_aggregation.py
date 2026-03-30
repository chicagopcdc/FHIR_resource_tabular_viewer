"""
Tests for aggregation service
"""

import pytest
import asyncio
from unittest.mock import AsyncMock, patch, MagicMock
from datetime import datetime

from app.services.aggregation import AggregationService, AggregationProgress
from app.services.cache_manager import CacheManager, MemoryCacheBackend


class TestAggregationService:
    """Test aggregation service functionality"""
    
    @pytest.fixture
    def mock_config(self):
        """Mock configuration"""
        with patch('app.services.aggregation.config') as mock_config:
            mock_config.environment = "test"
            mock_config.aggregate_max_records = 1000
            mock_config.aggregate_page_count_hint = 10
            mock_config.aggregate_max_build_time_seconds = 60
            mock_config.cache_ttl_seconds = 300
            mock_config.http_fetch_concurrency = 2
            mock_config.http_bundle_timeout_seconds = 10
            mock_config.http_max_retries = 1
            yield mock_config
    
    @pytest.fixture
    def mock_cache_manager(self):
        """Mock cache manager"""
        mock_manager = MagicMock()
        mock_manager.generate_cache_key.return_value = "test:server:user123:Patient:hash123"
        mock_manager.get_dataset = AsyncMock(return_value=None)
        mock_manager.store_dataset = AsyncMock(return_value=True)
        mock_manager.get_dataset_id.return_value = "dataset-123"
        mock_manager.get_user_datasets = AsyncMock(return_value=[])
        mock_manager.delete_dataset = AsyncMock(return_value=True)
        return mock_manager
    
    @pytest.fixture
    def aggregation_service(self, mock_config, mock_cache_manager):
        """Create aggregation service with mocks"""
        with patch('app.services.aggregation.get_cache_manager', return_value=mock_cache_manager):
            service = AggregationService()
            return service
    
    @pytest.mark.anyio
    async def test_build_dataset_success(self, aggregation_service, mock_config):
        """Test successful dataset building"""
        # Mock FHIR responses
        mock_bundle = {
            "resourceType": "Bundle",
            "total": 25,
            "entry": [
                {"resource": {"resourceType": "Patient", "id": f"patient-{i}"}}
                for i in range(10)
            ],
            "link": []  # No next page
        }
        
        with patch('app.services.aggregation.get_json', return_value=mock_bundle):
            result = await aggregation_service.build_dataset(
                resource_type="Patient",
                search_params={"name": "Smith"},
                user_id="user123"
            )
        
        # Verify result structure
        assert result["dataset_id"] == "dataset-123"
        assert result["total"] == 10
        assert result["truncated"] is False
        assert result["cache_hit"] is False
        assert "build_time_ms" in result
    
    @pytest.mark.anyio
    async def test_build_dataset_with_pagination(self, aggregation_service, mock_config):
        """Test dataset building with multiple pages"""
        # Mock first page
        first_bundle = {
            "resourceType": "Bundle",
            "total": 25,
            "entry": [
                {"resource": {"resourceType": "Patient", "id": f"patient-{i}"}}
                for i in range(10)
            ],
            "link": [{"relation": "next", "url": "http://fhir.server/Patient?_getpages=page2"}]
        }
        
        # Mock second page
        second_bundle = {
            "resourceType": "Bundle",
            "total": 25,
            "entry": [
                {"resource": {"resourceType": "Patient", "id": f"patient-{i+10}"}}
                for i in range(5)
            ],
            "link": []  # No more pages
        }
        
        # Mock responses in sequence
        with patch('app.services.aggregation.get_json', side_effect=[first_bundle, second_bundle]):
            result = await aggregation_service.build_dataset(
                resource_type="Patient",
                search_params={},
                user_id="user123"
            )
        
        # Should have combined both pages
        assert result["total"] == 15
        assert result["truncated"] is False
    
    @pytest.mark.anyio
    async def test_build_dataset_cache_hit(self, aggregation_service, mock_cache_manager):
        """Test cache hit scenario"""
        # Mock cached dataset
        cached_dataset = {
            "dataset_id": "cached-123",
            "resources": [{"resourceType": "Patient", "id": "patient-1"}]
        }
        mock_cache_manager.get_dataset.return_value = cached_dataset
        
        result = await aggregation_service.build_dataset(
            resource_type="Patient",
            search_params={},
            user_id="user123"
        )
        
        assert result["dataset_id"] == "cached-123"
        assert result["total"] == 1
        assert result["cache_hit"] is True
        assert result["build_time_ms"] == 0
    
    @pytest.mark.anyio
    async def test_build_dataset_truncated(self, aggregation_service, mock_config):
        """Test dataset truncation at max records"""
        mock_config.aggregate_max_records = 5  # Small limit for testing
        
        # Mock large response
        mock_bundle = {
            "resourceType": "Bundle",
            "total": 100,
            "entry": [
                {"resource": {"resourceType": "Patient", "id": f"patient-{i}"}}
                for i in range(10)  # More than limit
            ],
            "link": []
        }
        
        with patch('app.services.aggregation.get_json', return_value=mock_bundle):
            result = await aggregation_service.build_dataset(
                resource_type="Patient",
                search_params={},
                user_id="user123"
            )
        
        assert result["total"] == 5  # Truncated to limit
        assert result["truncated"] is True
    
    @pytest.mark.anyio
    async def test_get_dataset_slice(self, aggregation_service, mock_cache_manager):
        """Test getting dataset slice"""
        # Mock dataset with multiple items
        dataset = {
            "dataset_id": "slice-test-123",
            "resources": [
                {"resourceType": "Patient", "id": f"patient-{i}"}
                for i in range(20)
            ]
        }
        
        mock_cache_manager.get_user_datasets.return_value = ["test:key"]
        mock_cache_manager.get_dataset.return_value = dataset
        
        # Get slice from middle
        result = await aggregation_service.get_dataset_slice(
            dataset_id="slice-test-123",
            offset=5,
            limit=10,
            user_id="user123"
        )
        
        assert result["dataset_id"] == "slice-test-123"
        assert result["total"] == 20
        assert result["offset"] == 5
        assert result["limit"] == 10
        assert len(result["items"]) == 10
        assert result["has_next"] is True
        assert result["has_prev"] is True
        
        # Verify correct slice
        assert result["items"][0]["id"] == "patient-5"
        assert result["items"][-1]["id"] == "patient-14"
    
    @pytest.mark.anyio
    async def test_get_dataset_slice_not_found(self, aggregation_service, mock_cache_manager):
        """Test slice request for non-existent dataset"""
        mock_cache_manager.get_user_datasets.return_value = []
        
        with pytest.raises(ValueError, match="Dataset not found"):
            await aggregation_service.get_dataset_slice(
                dataset_id="nonexistent",
                offset=0,
                limit=10,
                user_id="user123"
            )

    @pytest.mark.anyio
    async def test_get_dataset_profile(self, aggregation_service, mock_cache_manager):
        """Test dataset profile metadata response."""
        dataset = {
            "dataset_id": "profile-test-123",
            "source_id": "default",
            "resource_type": "Observation",
            "resources": [
                {"resourceType": "Observation", "id": "obs-1"},
                {"resourceType": "Observation", "id": "obs-2"}
            ],
            "created_at": "2026-03-31T10:00:00",
            "build_time_ms": 321,
            "status": "ready",
            "truncated": False,
            "warnings": []
        }

        mock_cache_manager.get_user_datasets.return_value = ["test:key"]
        mock_cache_manager.get_dataset.return_value = dataset

        result = await aggregation_service.get_dataset_profile(
            dataset_id="profile-test-123",
            user_id="user123"
        )

        assert result["success"] is True
        assert result["dataset_id"] == "profile-test-123"
        assert result["source_id"] == "default"
        assert result["resource_type"] == "Observation"
        assert result["status"] == "ready"
        assert result["progress_percent"] == 100
        assert result["total_records"] == 2
        assert result["build_time_ms"] == 321

    @pytest.mark.anyio
    async def test_get_dataset_schema(self, aggregation_service, mock_cache_manager):
        """Test dataset schema inference response."""
        dataset = {
            "dataset_id": "schema-test-123",
            "resource_type": "Observation",
            "resources": [
                {
                    "resourceType": "Observation",
                    "id": "obs-1",
                    "status": "final",
                    "effectiveDateTime": "2026-03-31T09:12:00Z"
                },
                {
                    "resourceType": "Observation",
                    "id": "obs-2",
                    "status": "preliminary",
                    "effectiveDateTime": "2026-03-31T10:15:00Z"
                }
            ],
            "truncated": False
        }

        mock_cache_manager.get_user_datasets.return_value = ["test:key"]
        mock_cache_manager.get_dataset.return_value = dataset

        result = await aggregation_service.get_dataset_schema(
            dataset_id="schema-test-123",
            user_id="user123"
        )

        assert result["success"] is True
        assert result["dataset_id"] == "schema-test-123"
        assert result["resource_type"] == "Observation"
        assert result["sampled_records"] == 2
        assert result["warnings"] == []

        columns = {column["path"]: column for column in result["columns"]}
        assert "id" in columns
        assert "status" in columns
        assert "effectiveDateTime" in columns
        assert columns["effectiveDateTime"]["inferred_type"] == "date"
        assert columns["status"]["example_values"] == ["final", "preliminary"]


class TestAggregationProgress:
    """Test aggregation progress tracking"""
    
    def test_progress_initialization(self):
        """Test progress object initialization"""
        progress = AggregationProgress("dataset-123", "Patient", 100)
        
        assert progress.dataset_id == "dataset-123"
        assert progress.resource_type == "Patient"
        assert progress.status == "building"
        assert progress.fetched == 0
        assert progress.estimated_total == 100
        assert progress.started_at is not None
        assert progress.completed_at is None
    
    def test_progress_update(self):
        """Test progress updates"""
        progress = AggregationProgress("dataset-123", "Patient")
        progress.update_progress(50, 200)
        
        assert progress.fetched == 50
        assert progress.estimated_total == 200
    
    def test_progress_complete(self):
        """Test progress completion"""
        progress = AggregationProgress("dataset-123", "Patient")
        progress.complete(150, truncated=True)
        
        assert progress.status == "truncated"
        assert progress.fetched == 150
        assert progress.estimated_total == 150
        assert progress.completed_at is not None
        assert progress.truncated is True
        assert progress.build_time_ms >= 0
    
    def test_progress_error(self):
        """Test progress error state"""
        progress = AggregationProgress("dataset-123", "Patient")
        progress.mark_error("Connection timeout")
        
        assert progress.status == "error"
        assert progress.error_message == "Connection timeout"
        assert progress.completed_at is not None
    
    def test_progress_to_dict(self):
        """Test progress serialization"""
        progress = AggregationProgress("dataset-123", "Patient", 100)
        progress.update_progress(25)
        
        data = progress.to_dict()
        
        assert data["dataset_id"] == "dataset-123"
        assert data["resource_type"] == "Patient"
        assert data["status"] == "building"
        assert data["fetched"] == 25
        assert data["estimated_total"] == 100
        assert data["progress_percent"] == 25
        assert "started_at" in data
        assert data["completed_at"] is None


class TestCacheManager:
    """Test cache manager functionality"""
    
    def test_cache_key_generation(self):
        """Test deterministic cache key generation"""
        manager = CacheManager(backend_type="memory")
        
        # Same inputs should generate same key
        key1 = manager.generate_cache_key(
            env="test", 
            server_id="server1", 
            user_id="user123", 
            resource_type="Patient",
            filters={"name": "Smith", "gender": "male"}
        )
        
        key2 = manager.generate_cache_key(
            env="test", 
            server_id="server1", 
            user_id="user123", 
            resource_type="Patient",
            filters={"gender": "male", "name": "Smith"}  # Different order
        )
        
        assert key1 == key2
        assert "test:server1:user123:Patient:" in key1
    
    def test_filter_normalization(self):
        """Test filter parameter normalization"""
        manager = CacheManager(backend_type="memory")
        
        filters1 = {"name": "  Smith  ", "active": True}
        filters2 = {"name": "smith", "active": "true"}
        
        norm1 = manager._normalize_filters(filters1)
        norm2 = manager._normalize_filters(filters2)
        
        # Should normalize to same values
        assert norm1["name"] == norm2["name"]
        assert norm1["active"] == norm2["active"]
    
    @pytest.mark.anyio
    async def test_memory_cache_basic_operations(self):
        """Test basic memory cache operations"""
        backend = MemoryCacheBackend(max_datasets_per_user=5)
        
        # Test set and get
        test_data = {"test": "data", "items": [1, 2, 3]}
        await backend.set("test:key", test_data, 300)
        
        retrieved = await backend.get("test:key")
        assert retrieved == test_data
        
        # Test non-existent key
        missing = await backend.get("nonexistent:key")
        assert missing is None
        
        # Test deletion
        deleted = await backend.delete("test:key")
        assert deleted is True
        
        retrieved_after_delete = await backend.get("test:key")
        assert retrieved_after_delete is None
    
    @pytest.mark.anyio
    async def test_memory_cache_expiry(self):
        """Test cache TTL expiry"""
        backend = MemoryCacheBackend()
        
        # Set with very short TTL
        await backend.set("short:key", {"data": "test"}, 0)  # Immediate expiry
        
        # Should be expired immediately
        retrieved = await backend.get("short:key")
        assert retrieved is None
    
    @pytest.mark.anyio
    async def test_memory_cache_user_limits(self):
        """Test per-user dataset limits"""
        backend = MemoryCacheBackend(max_datasets_per_user=2)
        
        # Add datasets for same user
        await asyncio.wait_for(backend.set("test:server:user1:Patient:hash1", {"id": 1}, 300), timeout=1)
        await asyncio.wait_for(backend.set("test:server:user1:Observation:hash2", {"id": 2}, 300), timeout=1)
        await asyncio.wait_for(backend.set("test:server:user1:Condition:hash3", {"id": 3}, 300), timeout=1)  # Should evict oldest
        
        # First dataset should be evicted
        first = await backend.get("test:server:user1:Patient:hash1")
        assert first is None
        
        # Later datasets should still exist
        second = await backend.get("test:server:user1:Observation:hash2")
        third = await backend.get("test:server:user1:Condition:hash3")
        assert second is not None
        assert third is not None


if __name__ == "__main__":
    pytest.main([__file__])
