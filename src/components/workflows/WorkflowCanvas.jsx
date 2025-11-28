import React, { useState } from 'react';
import WorkflowNode from './WorkflowNode';
import { ArrowDown, ArrowDownRight, ArrowDownLeft } from 'lucide-react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';

export default function WorkflowCanvas({ nodes, connections, onUpdateNode, onDeleteNode, onConnect, onSelectNode, selectedNodeId, onDragEnd }) {
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

  const getNodeConnections = (nodeId) => {
    return connections.filter(c => c.from === nodeId);
  };

  const _getNodeType = (_type) => {
    // Placeholder function - not currently used
    return 'default';
  };

  const renderConnector = (node, nodeConnections) => {
    if (!nodeConnections || nodeConnections.length === 0) return null;

    const isCondition = node.type === 'condition';

    if (isCondition && nodeConnections.length >= 2) {
      // Render decision branches with labeled paths
      return (
        <div className="flex justify-center items-center gap-6 my-2">
          <div className="flex flex-col items-center">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-semibold text-green-400 bg-green-900/30 px-2 py-1 rounded">TRUE</span>
              <ArrowDownLeft className="w-4 h-4 text-green-400" />
            </div>
            <div className="w-px h-6 bg-gradient-to-b from-green-400 to-transparent" />
          </div>
          <div className="flex flex-col items-center">
            <div className="flex items-center gap-2 mb-2">
              <ArrowDownRight className="w-4 h-4 text-red-400" />
              <span className="text-xs font-semibold text-red-400 bg-red-900/30 px-2 py-1 rounded">FALSE</span>
            </div>
            <div className="w-px h-6 bg-gradient-to-b from-red-400 to-transparent" />
          </div>
        </div>
      );
    } else if (nodeConnections.length === 1) {
      // Single connection arrow
      return (
        <div className="flex justify-center my-2">
          <div className="flex flex-col items-center">
            <ArrowDown className="w-5 h-5 text-purple-400 animate-pulse" />
            <div className="w-px h-6 bg-gradient-to-b from-purple-400 to-transparent" />
          </div>
        </div>
      );
    }

    return null;
  };

  return (
    <div className="workflow-canvas relative p-4 min-h-0 overflow-auto" style={{
      scrollbarWidth: 'thin',
      scrollbarColor: '#6b7280 #1e293b'
    }}>
      <style>{`
        .workflow-canvas::-webkit-scrollbar {
          width: 12px;
        }
        .workflow-canvas::-webkit-scrollbar-track {
          background: #1e293b;
          border-radius: 6px;
        }
        .workflow-canvas::-webkit-scrollbar-thumb {
          background: #6b7280;
          border-radius: 6px;
        }
        .workflow-canvas::-webkit-scrollbar-thumb:hover {
          background: #9ca3af;
        }
      `}</style>
      {connectingFrom && (
        <div className="fixed top-4 left-1/2 transform -translate-x-1/2 bg-purple-600 text-white px-4 py-2 rounded-lg shadow-lg z-50 animate-bounce">
          🔗 Click on another node to connect
        </div>
      )}

      <DragDropContext onDragEnd={onDragEnd}>
        <Droppable droppableId="workflow-nodes">
          {(provided) => (
            <div 
              className="space-y-1"
              {...provided.droppableProps}
              ref={provided.innerRef}
            >
              {nodes.map((node, index) => {
                const nodeConnections = getNodeConnections(node.id);
                
                return (
                  <Draggable key={node.id} draggableId={node.id} index={index}>
                    {(provided, snapshot) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.draggableProps}
                        style={{
                          ...provided.draggableProps.style,
                          opacity: snapshot.isDragging ? 0.8 : 1,
                        }}
                      >
                        <WorkflowNode
                          node={node}
                          isSelected={selectedNodeId === node.id}
                          isConnecting={connectingFrom === node.id}
                          onClick={() => handleNodeClick(node.id)}
                          onUpdate={(updates) => onUpdateNode(node.id, updates)}
                          onDelete={() => onDeleteNode(node.id)}
                          onStartConnect={() => handleStartConnect(node.id)}
                          dragHandleProps={provided.dragHandleProps}
                        />
                        
                        {/* Render connector arrows - hide when dragging to avoid visual clutter */}
                        {!snapshot.isDragging && renderConnector(node, nodeConnections)}
                      </div>
                    )}
                  </Draggable>
                );
              })}
              {provided.placeholder}
            </div>
          )}
        </Droppable>
      </DragDropContext>

      {/* Empty state hint */}
      {nodes.length === 1 && (
        <div className="mt-8 text-center p-6 border-2 border-dashed border-slate-700 rounded-lg">
          <p className="text-slate-400 text-sm">
            👈 Add more nodes from the library on the left
          </p>
          <p className="text-slate-500 text-xs mt-2">
            Then click the link button on nodes to connect them
          </p>
        </div>
      )}
    </div>
  );
}