import json
from unittest.mock import MagicMock, patch

import pytest

from processor.llm.client import LLMClient


@pytest.fixture
def mock_anthropic_response():
    mock = MagicMock()
    mock.content = [MagicMock(text='{"result": "test"}')]
    return mock


def test_chat_json_extracts_json(mock_anthropic_response):
    with patch("processor.llm.client.Anthropic") as MockAnthropic:
        mock_instance = MagicMock()
        mock_instance.messages.create.return_value = mock_anthropic_response
        MockAnthropic.return_value = mock_instance

        client = LLMClient(api_key="test-key")
        result = client.chat_json("sys", "user")

        assert result == {"result": "test"}


def test_chat_json_extracts_from_markdown_block(mock_anthropic_response):
    mock_anthropic_response.content[0].text = '```json\n{"result": "test"}\n```'

    with patch("processor.llm.client.Anthropic") as MockAnthropic:
        mock_instance = MagicMock()
        mock_instance.messages.create.return_value = mock_anthropic_response
        MockAnthropic.return_value = mock_instance

        client = LLMClient(api_key="test-key")
        result = client.chat_json("sys", "user")

        assert result == {"result": "test"}
