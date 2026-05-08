from pydantic import BaseModel


class Node(BaseModel):
    id: str
    name: str
    type: str
    connections: int


class Edge(BaseModel):
    id: str
    source: str
    target: str
    type: str
    context: str | None = None


class GraphData(BaseModel):
    nodes: list[Node]
    edges: list[Edge]


class GraphStats(BaseModel):
    total_nodes: int
    total_edges: int
    types_distribution: list[dict]
    top_connected: list[dict]
    documents_processed: int
