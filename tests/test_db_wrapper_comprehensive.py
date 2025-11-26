import unittest
from unittest.mock import AsyncMock, patch, MagicMock
from pymongo.errors import (
    ConnectionFailure,
    OperationFailure,
    ServerSelectionTimeoutError,
    NotPrimaryError,
    CursorNotFound,
)
from pymongo.asynchronous.cursor import AsyncCursor
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "server"))
from db_wrapper import AsyncDBWrapper, is_retryable_operation_failure


class TestDBWrapperComprehensive(unittest.IsolatedAsyncioTestCase):
    async def test_is_retryable_operation_failure_with_retryable_codes(self):
        """Test that OperationFailure with retryable codes returns True."""
        # Test retryable error codes relevant to single-node setup
        retryable_codes = [6, 7, 89, 91, 9001, 262, 64, 189]

        for code in retryable_codes:
            with self.subTest(code=code):
                exc = OperationFailure("Test error", code=code)
                self.assertTrue(is_retryable_operation_failure(exc))

    async def test_is_retryable_operation_failure_with_non_retryable_codes(self):
        """Test that OperationFailure with non-retryable codes returns False."""
        # Test non-retryable error codes
        non_retryable_codes = [11000, 121, 123]  # Duplicate key, validation error, etc.

        for code in non_retryable_codes:
            with self.subTest(code=code):
                exc = OperationFailure("Test error", code=code)
                self.assertFalse(is_retryable_operation_failure(exc))

    async def test_is_retryable_operation_failure_with_labels(self):
        """Test that OperationFailure with retryable labels returns True."""

        # Create a mock that behaves like OperationFailure but has details
        class MockOperationFailure:
            def __init__(self, message, code):
                self.message = message
                self.code = code
                self.details = {"errorLabels": ["RetryableWriteError"]}

        mock_exc = MockOperationFailure("Test error", 123)
        self.assertTrue(is_retryable_operation_failure(mock_exc))

    async def test_is_retryable_operation_failure_non_operation_failure(self):
        """Test that non-OperationFailure exceptions return False."""
        exc = ConnectionFailure("Test connection failure")
        self.assertFalse(is_retryable_operation_failure(exc))

    @patch("asyncio.sleep", new_callable=AsyncMock)
    async def test_retry_logic_with_operation_failure(self, mock_sleep):
        """Test that OperationFailure with retryable codes is retried."""
        # Mock the database and collection
        mock_db = MagicMock()
        mock_collection = AsyncMock()
        mock_db.__getitem__.return_value = mock_collection

        # The wrapped database
        wrapped_db = AsyncDBWrapper(mock_db)
        wrapped_collection = wrapped_db["test_collection"]

        # Simulate an OperationFailure with retryable code on the first call, then succeed
        retryable_exc = OperationFailure("Network timeout", code=89)  # NetworkInterfaceExceededTimeLimit
        mock_collection.find_one.side_effect = [
            retryable_exc,
            {"_id": "123", "name": "test"},
        ]

        # Call the method that should be retried
        result = await wrapped_collection.find_one({"_id": "123"})

        # Assert that the method was called twice (original + 1 retry)
        self.assertEqual(mock_collection.find_one.call_count, 2)

        # Assert that the final result is correct
        self.assertEqual(result, {"_id": "123", "name": "test"})

        # Assert that sleep was called once between retries
        mock_sleep.assert_called_once()

    @patch("asyncio.sleep", new_callable=AsyncMock)
    async def test_retry_logic_with_not_primary_error(self, mock_sleep):
        """Test that NotPrimaryError is retried."""
        # Mock the database and collection
        mock_db = MagicMock()
        mock_collection = AsyncMock()
        mock_db.__getitem__.return_value = mock_collection

        # The wrapped database
        wrapped_db = AsyncDBWrapper(mock_db)
        wrapped_collection = wrapped_db["test_collection"]

        # Simulate a NotPrimaryError on the first call, then succeed
        mock_collection.find_one.side_effect = [
            NotPrimaryError("Not primary"),
            {"_id": "123", "name": "test"},
        ]

        # Call the method that should be retried
        result = await wrapped_collection.find_one({"_id": "123"})

        # Assert that the method was called twice (original + 1 retry)
        self.assertEqual(mock_collection.find_one.call_count, 2)

        # Assert that the final result is correct
        self.assertEqual(result, {"_id": "123", "name": "test"})

        # Assert that sleep was called once between retries
        mock_sleep.assert_called_once()

    @patch("asyncio.sleep", new_callable=AsyncMock)
    async def test_retry_logic_with_cursor_not_found(self, mock_sleep):
        """Test that CursorNotFound during iteration is retried."""
        # Mock the cursor, using spec to make it pass isinstance checks
        mock_cursor = AsyncMock(spec=AsyncCursor)
        mock_cursor.__anext__.side_effect = [
            {"_id": "1", "name": "item1"},
            CursorNotFound("Cursor not found", 43, {"ns": "test.collection", "cursorId": 123}),
            {"_id": "2", "name": "item2"},
            StopAsyncIteration,
        ]

        # Mock the database and collection
        mock_collection = AsyncMock()
        # Ensure 'find' is a sync method returning our async cursor mock
        mock_collection.find = MagicMock(return_value=mock_cursor)

        mock_db = MagicMock()
        mock_db.__getitem__.return_value = mock_collection

        # The wrapped database
        wrapped_db = AsyncDBWrapper(mock_db)
        wrapped_collection = wrapped_db["test_collection"]

        # Call the method that returns a cursor
        cursor = wrapped_collection.find({})

        # Iterate over the cursor
        results = []
        async for item in cursor:
            results.append(item)

        # Assert that __anext__ was called 4 times (item1, failure, item2, StopAsyncIteration)
        self.assertEqual(mock_cursor.__anext__.call_count, 4)

        # Assert that the final results are correct
        self.assertEqual(results, [{"_id": "1", "name": "item1"}, {"_id": "2", "name": "item2"}])

        # Assert that sleep was called once between retries
        mock_sleep.assert_called_once()


if __name__ == "__main__":
    unittest.main()
