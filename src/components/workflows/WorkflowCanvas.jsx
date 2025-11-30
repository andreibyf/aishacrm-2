import React, { useState, useRef, useEffect, useCallback } from 'react';
import WorkflowNode from './WorkflowNode';

export default function WorkflowCanvas({ nodes, connections, onUpdateNode, onDeleteNode, onConnect, onSelectNode, selectedNodeId }) {
  const [connectingFrom, setConnectingFrom] = useState(null);
  const [nodePositions, setNodePositions] = useState({});
  const [draggingNode, setDraggingNode] = useState(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const nodeRefs = useRef({});
  const canvasRef = useRef(null);

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

  // Drag handlers
  const handleDragStart = (nodeId, e) => {
    e.stopPropagation();
    const node = nodes.find(n => n.id === nodeId);
    if (!node) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const canvasRect = canvas.getBoundingClientRect();
    const scrollLeft = canvas.scrollLeft;
    const scrollTop = canvas.scrollTop;

    // Calculate offset from mouse to node position
    const offsetX = e.clientX - canvasRect.left + scrollLeft - (node.position?.x || 0);
    const offsetY = e.clientY - canvasRect.top + scrollTop - (node.position?.y || 0);

    setDraggingNode(nodeId);
    setDragOffset({ x: offsetX, y: offsetY });
  };

  const handleDragMove = useCallback((e) => {
    if (!draggingNode) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const canvasRect = canvas.getBoundingClientRect();
    const scrollLeft = canvas.scrollLeft;
    const scrollTop = canvas.scrollTop;

    // Calculate new position
    const newX = e.clientX - canvasRect.left + scrollLeft - dragOffset.x;
    const newY = e.clientY - canvasRect.top + scrollTop - dragOffset.y;

    // Update node position
    onUpdateNode(draggingNode, {
      position: {
        x: Math.max(0, newX),
        y: Math.max(0, newY)
      }
    });
  }, [draggingNode, dragOffset, onUpdateNode]);

  const handleDragEnd = useCallback(() => {
    setDraggingNode(null);
    setDragOffset({ x: 0, y: 0 });
  }, []);

  // Add mouse event listeners for dragging
  useEffect(() => {
    if (draggingNode) {
      window.addEventListener('mousemove', handleDragMove);
      window.addEventListener('mouseup', handleDragEnd);
      return () => {
        window.removeEventListener('mousemove', handleDragMove);
        window.removeEventListener('mouseup', handleDragEnd);
      };
    }
  }, [draggingNode, handleDragMove, handleDragEnd]);

  // Update node positions when nodes or DOM changes
  useEffect(() => {
    const updatePositions = () => {
      const positions = {};
      nodes.forEach(node => {
        const element = nodeRefs.current[node.id];
        if (element) {
          const rect = element.getBoundingClientRect();
          const container = element.closest('.workflow-canvas');
          if (container) {
            const containerRect = container.getBoundingClientRect();
            positions[node.id] = {
              x: rect.left - containerRect.left + rect.width / 2 + container.scrollLeft,
              y: rect.top - containerRect.top + rect.height + container.scrollTop,
              width: rect.width,
              height: rect.height,
              top: rect.top - containerRect.top + container.scrollTop,
            };
          }
        }
      });
      setNodePositions(positions);
    };

    // Initial update
    updatePositions();

    // Update on window resize
    window.addEventListener('resize', updatePositions);
    return () => window.removeEventListener('resize', updatePositions);
  }, [nodes, connections]);

  // Generate SVG path for connection line
  const generateConnectionPath = (fromId, toId, isCondition = false, branchType = null) => {
    const from = nodePositions[fromId];
    const to = nodePositions[toId];
    
    if (!from || !to) return null;

    const startX = from.x;
    const startY = from.y;
    const endX = to.x;
    const endY = to.top;

    // Calculate control points for curved line
    const midY = (startY + endY) / 2;
    
    // Adjust for condition branches
    let adjustedStartX = startX;
    if (isCondition && branchType === 'true') {
      adjustedStartX = startX - 40; // Left branch
    } else if (isCondition && branchType === 'false') {
      adjustedStartX = startX + 40; // Right branch
    }

    // Create smooth cubic bezier curve
    const path = `M ${adjustedStartX} ${startY} C ${adjustedStartX} ${midY}, ${endX} ${midY}, ${endX} ${endY}`;
    
    return path;
  };

  // Render SVG connections overlay
  const renderConnections = () => {
    if (Object.keys(nodePositions).length === 0) return null;

    const svgConnections = [];

    connections.forEach((conn, index) => {
      const fromNode = nodes.find(n => n.id === conn.from);
      const isCondition = fromNode?.type === 'condition';
      
      // For condition nodes, determine branch type based on connection order
      let branchType = null;
      if (isCondition) {
        const conditionConns = connections.filter(c => c.from === conn.from);
        const connIndex = conditionConns.findIndex(c => c.to === conn.to);
        branchType = connIndex === 0 ? 'true' : 'false';
      }

      const path = generateConnectionPath(conn.from, conn.to, isCondition, branchType);
      if (!path) return;

      const color = isCondition 
        ? (branchType === 'true' ? '#4ade80' : '#f87171')
        : '#a78bfa';

      svgConnections.push(
        <g key={`${conn.from}-${conn.to}-${index}`}>
          {/* Connection line */}
          <path
            d={path}
            stroke={color}
            strokeWidth="2"
            fill="none"
            strokeDasharray="5,5"
            className="animate-dash"
          />
          {/* Arrowhead */}
          <defs>
            <marker
              id={`arrowhead-${index}`}
              markerWidth="10"
              markerHeight="10"
              refX="9"
              refY="3"
              orient="auto"
              markerUnits="strokeWidth"
            >
              <path d="M0,0 L0,6 L9,3 z" fill={color} />
            </marker>
          </defs>
          <path
            d={path}
            stroke={color}
            strokeWidth="2"
            fill="none"
            markerEnd={`url(#arrowhead-${index})`}
            opacity="0.8"
          />
        </g>
      );
    });

    return (
      <svg
        className="absolute inset-0 pointer-events-none"
        style={{ width: '100%', height: '100%', zIndex: 0 }}
      >
        <style>{`
          @keyframes dash {
            to {
              stroke-dashoffset: -10;
            }
          }
          .animate-dash {
            animation: dash 0.5s linear infinite;
          }
        `}</style>
        {svgConnections}
      </svg>
    );
  };

  return (
    <div 
      ref={canvasRef}
      className="workflow-canvas relative overflow-auto bg-slate-950" 
      style={{
        scrollbarWidth: 'thin',
        scrollbarColor: '#6b7280 #1e293b',
        width: '100%',
        height: '100%',
        cursor: draggingNode ? 'grabbing' : 'default'
      }}
    >
      <style>{`
        .workflow-canvas::-webkit-scrollbar {
          width: 12px;
          height: 12px;
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
        .workflow-canvas::-webkit-scrollbar-corner {
          background: #1e293b;
        }
      `}</style>
      
      {/* Canvas workspace with grid background */}
      <div className="relative p-4" style={{ 
        minWidth: '2000px', 
        minHeight: '2000px',
        width: 'max-content',
        height: 'max-content',
        backgroundImage: `
          linear-gradient(rgba(148, 163, 184, 0.1) 1px, transparent 1px),
          linear-gradient(90deg, rgba(148, 163, 184, 0.1) 1px, transparent 1px)
        `,
        backgroundSize: '20px 20px'
      }}>
        {/* SVG connection lines overlay */}
        {renderConnections()}
        
        {connectingFrom && (
          <div className="fixed top-4 left-1/2 transform -translate-x-1/2 bg-purple-600 text-white px-4 py-2 rounded-lg shadow-lg z-50 animate-bounce">
            🔗 Click on another node to connect
          </div>
        )}

        {/* Nodes with absolute positioning */}
        {nodes.map((node) => {
          return (
            <div
              key={node.id}
              ref={(el) => {
                nodeRefs.current[node.id] = el;
              }}
              style={{
                position: 'absolute',
                left: `${node.position?.x || 50}px`,
                top: `${node.position?.y || 50}px`,
                zIndex: selectedNodeId === node.id ? 100 : 10,
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
                dragHandleProps={{
                  onMouseDown: (e) => handleDragStart(node.id, e)
                }}
              />
            </div>
          );
        })}

        {/* Empty state hint */}
        {nodes.length === 1 && (
          <div style={{ position: 'absolute', left: '50%', top: '400px', transform: 'translateX(-50%)', width: '400px' }}>
            <div className="text-center p-6 border-2 border-dashed border-slate-700 rounded-lg bg-slate-900/50">
              <p className="text-slate-400 text-sm">
                👈 Add more nodes from the library on the left
              </p>
              <p className="text-slate-500 text-xs mt-2">
                Then click the link button on nodes to connect them
              </p>
              <p className="text-slate-500 text-xs mt-1">
                💡 Drag the grip icon to reposition nodes
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}