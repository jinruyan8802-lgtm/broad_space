import logging

from processor.llm.client import LLMClient

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """Translate the following tech article metadata from English to Chinese.
Keep the translation natural and accurate. For technical terms, use commonly accepted Chinese translations.

Respond with JSON only:
{
    "title_zh": "...",
    "summary_zh": "...",
    "key_points_zh": ["...", "..."]
}"""


def _is_chinese(text: str) -> bool:
    """Check if text contains Chinese characters (CJK Unified Ideographs)."""
    return any("一" <= c <= "鿿" for c in text)


class Translator:
    def __init__(self, llm: LLMClient):
        self.llm = llm

    def translate(self, title: str, summary: str, key_points: list[str]) -> dict:
        """Translate title/summary/key_points to Chinese.

        Returns dict with language, title_zh, summary_zh, key_points_zh.
        For Chinese articles, returns original text in _zh fields.
        """
        if _is_chinese(title):
            logger.debug("Article already in Chinese, skipping translation: %.50s", title)
            return {
                "language": "zh",
                "title_zh": title,
                "summary_zh": summary,
                "key_points_zh": key_points,
            }

        prompt = f"Title: {title}\nSummary: {summary}\nKey points: {key_points}"
        try:
            result = self.llm.chat_json(SYSTEM_PROMPT, prompt, max_tokens=2048)
            return {
                "language": "en",
                "title_zh": result.get("title_zh") or title,
                "summary_zh": result.get("summary_zh") or summary,
                "key_points_zh": result.get("key_points_zh") or key_points,
            }
        except Exception as e:
            logger.warning("Translation failed, using original text: %s", e)
            return {
                "language": "en",
                "title_zh": title,
                "summary_zh": summary,
                "key_points_zh": key_points,
            }
