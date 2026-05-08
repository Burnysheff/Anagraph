import json
import re
from pathlib import Path

from services.llm_client import LLMClient
from services.graph_service import GraphService
from models.qa import QAResponse

PROMPTS_DIR = Path(__file__).parent.parent / "prompts"

FALLBACK_TEMPLATES = {
    "all_of_type": (
        "MATCH (n:Entity) WHERE n.type = $type "
        "RETURN n.name AS name LIMIT 25"
    ),
    "connections_of": (
        "MATCH (n:Entity)-[r:RELATES]-(m:Entity) "
        "WHERE toLower(n.name) CONTAINS toLower($name) "
        "RETURN n.name AS source, r.type AS relation, m.name AS target LIMIT 25"
    ),
    "path_between": (
        "MATCH path = shortestPath((a:Entity)-[*..5]-(b:Entity)) "
        "WHERE toLower(a.name) CONTAINS toLower($name1) "
        "AND toLower(b.name) CONTAINS toLower($name2) "
        "RETURN [n IN nodes(path) | n.name] AS path_nodes, "
        "[r IN relationships(path) | r.type] AS path_relations "
        "LIMIT 5"
    ),
}


class QAService:

    def __init__(self, llm: LLMClient, graph: GraphService):
        self.llm = llm
        self.graph = graph
        self.cypher_prompt = (PROMPTS_DIR / "text_to_cypher.txt").read_text()
        self.answer_prompt = (PROMPTS_DIR / "answer_generation.txt").read_text()

    async def ask(self, question: str, language: str = "auto") -> QAResponse:
        if language == "auto":
            language = _detect_language(question)

        # Step 1: Generate Cypher
        try:
            cypher = await self._generate_cypher(question)
            results = await self.graph.execute_cypher_readonly(cypher)
            method = "text_to_cypher"
        except Exception:
            # Fallback
            cypher, results = await self._fallback_query(question)
            method = "fallback"

        if not results:
            cypher_fb, results_fb = await self._fallback_query(question)
            if results_fb:
                results = results_fb
                cypher = cypher_fb
                method = "fallback"

        # Step 2: Generate answer
        answer = await self._generate_answer(question, results)

        return QAResponse(
            answer=answer,
            cypher_query=cypher,
            raw_results=results,
            method=method,
        )

    async def _generate_cypher(self, question: str) -> str:
        prompt = self.cypher_prompt.replace("{question}", question)

        raw = await self.llm.generate(
            prompt=prompt,
            temperature=0.0,
            response_format="text",
        )

        cypher = raw.strip()
        # Remove markdown code fences if present
        cypher = re.sub(r'^```(?:cypher)?\s*', '', cypher)
        cypher = re.sub(r'\s*```$', '', cypher)
        return cypher.strip()

    async def _generate_answer(self, question: str, results: list[dict]) -> str:
        if not results:
            return "No relevant data found in the knowledge graph for this question."

        results_str = json.dumps(results[:20], ensure_ascii=False, indent=2)
        prompt = (
            self.answer_prompt
            .replace("{question}", question)
            .replace("{results}", results_str)
        )

        return await self.llm.generate(
            prompt=prompt,
            temperature=0.1,
            response_format="text",
        )

    async def _fallback_query(self, question: str) -> tuple[str, list[dict]]:
        q_lower = question.lower()

        # Try to detect entity type queries
        type_keywords = {
            "person": "Person", "people": "Person", "человек": "Person", "люди": "Person",
            "organization": "Organization", "company": "Organization",
            "организаци": "Organization", "компани": "Organization",
            "technology": "Technology", "технолог": "Technology",
        }
        for keyword, entity_type in type_keywords.items():
            if keyword in q_lower:
                cypher = FALLBACK_TEMPLATES["all_of_type"].replace("$type", f"'{entity_type}'")
                try:
                    results = await self.graph.execute_cypher_readonly(cypher)
                    return cypher, results
                except Exception:
                    pass

        # Generic fallback: search for nouns in the question
        words = [w for w in question.split() if len(w) > 3]
        for word in words:
            cypher = FALLBACK_TEMPLATES["connections_of"].replace("$name", f"'{word}'")
            cypher = cypher.replace("toLower($name)", f"toLower('{word}')")
            try:
                results = await self.graph.execute_cypher_readonly(cypher)
                if results:
                    return cypher, results
            except Exception:
                continue

        return "", []


def _detect_language(text: str) -> str:
    cyrillic_count = sum(1 for c in text[:500] if '\u0400' <= c <= '\u04FF')
    return "ru" if cyrillic_count > len(text[:500]) * 0.2 else "en"
