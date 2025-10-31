import { useState } from 'react';
import WorkflowNode from './WorkflowNode';
import { ArrowDown } from 'lucide-react';

export default function WorkflowCanvas({ nodes, connections, onUpdateNode, onDeleteNode, onConnect, onSelectNode, selectedNodeId }) {
  const [connectingFrom, setConnectingFrom] = useState(null);

  const handleNodeClick = (nodeId) => {
    if (connectingFrom) {
      if (connectingFrom !== nodeId) {
        onConnect(connectingFrom, nodeId);
      }
      setConnectingFrom(null);
    } else {
      onSelectNode(nodeId);
    }
  };

  const handleStartConnect = (nodeId) => {
    setConnectingFrom(nodeId);
  };

  return (
    <div className="relative p-8 min-h-full">
      {connectingFrom && (
        <div className="fixed top-4 left-1/2 transform -translate-x-1/2 bg-purple-600 text-white px-4 py-2 rounded-lg shadow-lg z-50">
          Click on another node to connect
        </div>
      )}

      {/* Render nodes */}
      <div className="space-y-6">
        {nodes.map((node, _index) => (
          <React.Fragment key={node.id}>
            <WorkflowNode
              node={node}
              isSelected={selectedNodeId === node.id}
              isConnecting={connectingFrom === node.id}
              onClick={() => handleNodeClick(node.id)}
              onUpdate={(updates) => onUpdateNode(node.id, updates)}
              onDelete={() => onDeleteNode(node.id)}
              onStartConnect={() => handleStartConnect(node.id)}
            />
            
            {/* Show arrow if there's a connection from this node */}
            {connections.find(c => c.from === node.id) && (
              <div className="flex justify-center">
                <ArrowDown className="w-6 h-6 text-purple-400" />
              </div>
            )}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}