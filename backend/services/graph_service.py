import re

from neo4j import AsyncGraphDatabase

from models.triplet import Triplet
from models.graph import Node, Edge, GraphData, GraphStats


class GraphService:

    def __init__(self, uri: str, user: str, password: str):
        self.driver = AsyncGraphDatabase.driver(uri, auth=(user, password))

    async def create_indexes(self):
        async with self.driver.session() as session:
            await session.run(
                "CREATE FULLTEXT INDEX entityNameIndex IF NOT EXISTS "
                "FOR (n:Entity) ON EACH [n.name]"
            )
            await session.run(
                "CREATE INDEX entityNameIdx IF NOT EXISTS "
                "FOR (n:Entity) ON (n.name)"
            )
            await session.run(
                "CREATE INDEX entityTypeIdx IF NOT EXISTS "
                "FOR (n:Entity) ON (n.type)"
            )

    async def save_triplets(self, triplets: list[Triplet], source_id: str):
        if not triplets:
            return

        triplet_dicts = [
            {
                "subject_name": t.subject,
                "subject_type": t.subject_type,
                "predicate": t.predicate,
                "object_name": t.object,
                "object_type": t.object_type,
                "context": t.context,
                "confidence": t.confidence,
            }
            for t in triplets
        ]

        query = """
        UNWIND $triplets AS t

        MERGE (s:Entity {name: t.subject_name})
        ON CREATE SET s.type = t.subject_type, s.created_at = datetime()
        ON MATCH SET s.type = COALESCE(s.type, t.subject_type)

        MERGE (o:Entity {name: t.object_name})
        ON CREATE SET o.type = t.object_type, o.created_at = datetime()
        ON MATCH SET o.type = COALESCE(o.type, t.object_type)

        MERGE (s)-[r:RELATES {type: t.predicate}]->(o)
        ON CREATE SET r.source = $source, r.context = t.context,
                      r.confidence = t.confidence, r.created_at = datetime()
        """

        async with self.driver.session() as session:
            await session.run(query, {"triplets": triplet_dicts, "source": source_id})

        # Dynamic labels (Neo4j doesn't support dynamic labels in UNWIND)
        for t in triplets:
            label_s = _sanitize_label(t.subject_type)
            label_o = _sanitize_label(t.object_type)
            if label_s:
                async with self.driver.session() as session:
                    await session.run(
                        f"MATCH (n:Entity {{name: $name}}) SET n:`{label_s}`",
                        {"name": t.subject},
                    )
            if label_o:
                async with self.driver.session() as session:
                    await session.run(
                        f"MATCH (n:Entity {{name: $name}}) SET n:`{label_o}`",
                        {"name": t.object},
                    )

    async def get_all_nodes(
        self, limit: int = 500, types_filter: list[str] | None = None
    ) -> list[Node]:
        type_clause = ""
        params: dict = {"limit": limit}
        if types_filter:
            type_clause = "WHERE n.type IN $types"
            params["types"] = types_filter

        query = f"""
        MATCH (n:Entity)
        {type_clause}
        RETURN elementId(n) AS id, n.name AS name, n.type AS type,
               size([(n)--() | 1]) AS connections
        ORDER BY connections DESC
        LIMIT $limit
        """
        async with self.driver.session() as session:
            result = await session.run(query, params)
            records = [record.data() async for record in result]
            return [Node(**r) for r in records]

    async def get_all_edges(self, limit: int = 1000) -> list[Edge]:
        query = """
        MATCH (s:Entity)-[r:RELATES]->(o:Entity)
        RETURN elementId(r) AS id, elementId(s) AS source, elementId(o) AS target,
               r.type AS type, r.context AS context
        LIMIT $limit
        """
        async with self.driver.session() as session:
            result = await session.run(query, {"limit": limit})
            records = [record.data() async for record in result]
            return [Edge(**r) for r in records]

    async def get_graph(
        self, limit: int = 500, types_filter: list[str] | None = None
    ) -> GraphData:
        nodes = await self.get_all_nodes(limit=limit, types_filter=types_filter)
        edges = await self.get_all_edges(limit=limit * 2)
        return GraphData(nodes=nodes, edges=edges)

    async def get_stats(self, documents_processed: int = 0) -> GraphStats:
        async with self.driver.session() as session:
            nodes_result = await session.run("MATCH (n:Entity) RETURN count(n) AS count")
            nodes_record = await nodes_result.single()
            total_nodes = nodes_record["count"] if nodes_record else 0

            edges_result = await session.run("MATCH ()-[r:RELATES]->() RETURN count(r) AS count")
            edges_record = await edges_result.single()
            total_edges = edges_record["count"] if edges_record else 0

            types_result = await session.run(
                "MATCH (n:Entity) "
                "RETURN n.type AS type, count(n) AS count "
                "ORDER BY count DESC"
            )
            types_distribution = [record.data() async for record in types_result]

            top_result = await session.run(
                "MATCH (n:Entity) "
                "RETURN n.name AS name, n.type AS type, "
                "       size([(n)--() | 1]) AS connections "
                "ORDER BY connections DESC LIMIT 10"
            )
            top_connected = [record.data() async for record in top_result]

        return GraphStats(
            total_nodes=total_nodes,
            total_edges=total_edges,
            types_distribution=types_distribution,
            top_connected=top_connected,
            documents_processed=documents_processed,
        )

    async def search_nodes(self, query: str, limit: int = 20) -> list[Node]:
        cypher = """
        CALL db.index.fulltext.queryNodes('entityNameIndex', $query + '~')
        YIELD node, score
        RETURN elementId(node) AS id, node.name AS name,
               node.type AS type,
               size([(node)--() | 1]) AS connections
        ORDER BY score DESC
        LIMIT $limit
        """
        async with self.driver.session() as session:
            result = await session.run(cypher, {"query": query, "limit": limit})
            records = [record.data() async for record in result]
            return [Node(**r) for r in records]

    async def get_node_neighborhood(self, node_name: str, depth: int = 1) -> GraphData:
        query = """
        MATCH (center:Entity {name: $name})
        CALL {
            WITH center
            MATCH (center)-[r:RELATES*1..""" + str(min(depth, 3)) + """]->(neighbor:Entity)
            RETURN neighbor, r AS rels
            UNION
            WITH center
            MATCH (center)<-[r:RELATES*1..""" + str(min(depth, 3)) + """]-(neighbor:Entity)
            RETURN neighbor, r AS rels
        }
        WITH DISTINCT neighbor
        MATCH (neighbor)
        RETURN elementId(neighbor) AS id, neighbor.name AS name,
               neighbor.type AS type,
               size([(neighbor)--() | 1]) AS connections
        LIMIT 50
        """

        edges_query = """
        MATCH (center:Entity {name: $name})
        MATCH (center)-[r:RELATES]-(neighbor:Entity)
        RETURN elementId(r) AS id, elementId(startNode(r)) AS source,
               elementId(endNode(r)) AS target,
               r.type AS type, r.context AS context
        LIMIT 100
        """

        async with self.driver.session() as session:
            nodes_result = await session.run(query, {"name": node_name})
            nodes_records = [record.data() async for record in nodes_result]

            edges_result = await session.run(edges_query, {"name": node_name})
            edges_records = [record.data() async for record in edges_result]

        nodes = [Node(**r) for r in nodes_records]
        edges = [Edge(**r) for r in edges_records]

        return GraphData(nodes=nodes, edges=edges)

    async def execute_cypher_readonly(self, cypher: str) -> list[dict]:
        _validate_readonly(cypher)
        async with self.driver.session() as session:
            result = await session.run(cypher)
            return [record.data() async for record in result]

    async def delete_by_source(self, source_id: str):
        query = """
        MATCH ()-[r:RELATES]->()
        WHERE r.source = $source
        DELETE r
        """
        orphan_query = """
        MATCH (n:Entity)
        WHERE NOT (n)--()
        DELETE n
        """
        async with self.driver.session() as session:
            await session.run(query, {"source": source_id})
            await session.run(orphan_query)

    async def clear_all(self):
        async with self.driver.session() as session:
            await session.run("MATCH (n) DETACH DELETE n")

    async def close(self):
        await self.driver.close()


def _sanitize_label(label: str) -> str:
    cleaned = re.sub(r'[^a-zA-Z0-9_]', '', label)
    return cleaned if cleaned else ""


_FORBIDDEN_KEYWORDS = re.compile(
    r'\b(CREATE|DELETE|DETACH|SET|REMOVE|MERGE|DROP|CALL\s+dbms)\b',
    re.IGNORECASE,
)


def _validate_readonly(cypher: str):
    if _FORBIDDEN_KEYWORDS.search(cypher):
        raise ValueError("Only read-only Cypher queries are allowed")
