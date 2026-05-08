import { useState } from "react";
import DocumentUpload from "./components/DocumentUpload";
import GraphViewer from "./components/GraphViewer";
import FilterPanel from "./components/FilterPanel";
import SearchBar from "./components/SearchBar";
import StatsPanel from "./components/StatsPanel";
import QAPanel from "./components/QAPanel";
import NodeDetails from "./components/NodeDetails";
import type { GraphNode } from "./types";
import "./App.css";

export default function App() {
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [activeTypes, setActiveTypes] = useState<string[]>([]);
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
          <FilterPanel activeTypes={activeTypes} onChange={setActiveTypes} />
          <SearchBar onSelect={(node) => setSelectedNode(node)} />
          <StatsPanel refreshKey={refreshKey} onClear={handleRefresh} />
        </aside>

        <main className="main-area">
          <GraphViewer
            refreshKey={refreshKey}
            activeTypes={activeTypes}
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
          />
        </footer>
      )}
    </div>
  );
}
