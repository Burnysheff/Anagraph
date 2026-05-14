import { useState } from "react";
import DocumentUpload from "./components/DocumentUpload";
import GraphViewer from "./components/GraphViewer";
import FilterPanel from "./components/FilterPanel";
import EntityTypesPanel from "./components/EntityTypesPanel";
import SearchBar from "./components/SearchBar";
import StatsPanel from "./components/StatsPanel";
import QAPanel from "./components/QAPanel";
import NodeDetails from "./components/NodeDetails";
import DocumentList from "./components/DocumentList";
import type { GraphNode } from "./types";
import "./App.css";

export default function App() {
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const handleRefresh = () => setRefreshKey((k) => k + 1);

  return (
    <div className="app">
      <header className="app-header">
        <h1>Anagraph</h1>
        <DocumentUpload onComplete={handleRefresh} />
      </header>

      <div className="app-body">
        <aside className="sidebar">
          <EntityTypesPanel />
          <FilterPanel />
          <SearchBar onSelect={(node) => setSelectedNode(node)} />
          <DocumentList refreshKey={refreshKey} onChange={handleRefresh} />
          <StatsPanel
            refreshKey={refreshKey}
            onClear={handleRefresh}
            onSelectNode={setSelectedNode}
          />
        </aside>

        <main className="main-area">
          <GraphViewer
            refreshKey={refreshKey}
            onNodeSelect={setSelectedNode}
          />
          <QAPanel />
        </main>
      </div>

      {selectedNode && (
        <footer className="node-details-bar">
          <NodeDetails
            node={selectedNode}
            onClose={() => setSelectedNode(null)}
            onDeleted={() => {
              setSelectedNode(null);
              handleRefresh();
            }}
          />
        </footer>
      )}
    </div>
  );
}
