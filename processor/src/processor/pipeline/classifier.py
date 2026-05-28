from processor.llm.client import LLMClient
from processor.models import RawArticle

CATEGORIES = [
    "AI/ML", "Infrastructure", "Programming Languages",
    "Security", "Frontend", "Mobile", "Database",
    "DevOps", "Open Source", "Academic",
    "Startup", "Science", "Hardware", "Product"
]

SYSTEM_PROMPT = f"""You are a tech news classifier. Given an article title and content, classify it into one or more categories from this list: {', '.join(CATEGORIES)}.

Category guidelines:
- AI/ML: artificial intelligence, machine learning, LLM, deep learning
- Infrastructure: cloud, servers, networking, distributed systems
- Programming Languages: language design, compilers, new languages
- Security: vulnerabilities, hacking, encryption, privacy
- Frontend: web UI, React, Vue, CSS, browsers
- Mobile: iOS, Android, mobile apps
- Database: SQL, NoSQL, data storage
- DevOps: CI/CD, containers, Kubernetes, deployment
- Open Source: open source projects, licenses, communities
- Academic: research papers, conferences, academic work
- Startup: startup news, funding rounds, entrepreneurship, VC
- Science: physics, chemistry, biology, math, astronomy, space
- Hardware: chips, processors, embedded systems, IoT, robotics
- Product: product launches, reviews, tools, apps

Respond with JSON only:
{{
    "categories": ["category1", "category2"],
    "confidence": 0.85
}}"""


class Classifier:
    def __init__(self, llm: LLMClient):
        self.llm = llm

    def classify(self, article: RawArticle) -> list[str]:
        prompt = f"Title: {article.title}\nContent: {article.content[:2000]}\n\nClassify this article."
        try:
            result = self.llm.chat_json(SYSTEM_PROMPT, prompt)
            categories = result.get("categories", [])
            # Validate against known categories
            valid = [c for c in categories if c in CATEGORIES]
            return valid if valid else ["Other"]
        except Exception as e:
            # Fallback: categorize as Other on LLM failure
            return ["Other"]