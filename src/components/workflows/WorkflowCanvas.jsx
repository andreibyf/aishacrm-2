import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Grid3X3 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import WorkflowNode from './WorkflowNode';

const DEFAULT_NODE_WIDTH = 360; // w-80 = 20rem; fallback measured at 18px root font
const DEFAULT_NODE_HEIGHT = 120;
const CONDITION_NODE_HEIGHT = 160;
const GRID_SIZE = 20;
const CANVAS_PADDING = 200; // Extra space beyond furthest node

export default function WorkflowCanvas({
  nodes,
  connections,
  onUpdateNode,
  onDeleteNode,
  onConnect,
  onSelectNode,
  selectedNodeId,
}) {
  const [connectingFrom, setConnectingFrom] = useState(null);
  const [draggingNode, setDraggingNode] = useState(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [snapToGrid, setSnapToGrid] = useState(true);
  const [canvasSize, setCanvasSize] = useState({ width: 2000, height: 2000 });
  const nodeRefs = useRef({});
  const canvasRef = useRef(null);

  const handleNodeClick = (nodeId) => {
    if (!connectingFrom) {
      onSelectNode(nodeId);
    }
  };

  const handleConnectionPointClick = (nodeId, connectionPoint) => {
    if (connectingFrom) {
      if (connectingFrom.nodeId !== nodeId) {
        onConnect(connectingFrom.nodeId, nodeId);
      }
      setConnectingFrom(null);
    } else {
      setConnectingFrom({ nodeId, point: connectionPoint });
    }
  };

  const handleStartConnect = (nodeId, connectionPoint) => {
    handleConnectionPointClick(nodeId, connectionPoint);
  };

  // Drag handlers
  const handleDragStart = (nodeId, e) => {
    e.stopPropagation();
    const node = nodes.find((n) => n.id === nodeId);
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

  const handleDragMove = useCallback(
    (e) => {
      if (!draggingNode) return;

      const canvas = canvasRef.current;
      if (!canvas) return;

      const canvasRect = canvas.getBoundingClientRect();
      const scrollLeft = canvas.scrollLeft;
      const scrollTop = canvas.scrollTop;

      // Calculate new position
      let newX = e.clientX - canvasRect.left + scrollLeft - dragOffset.x;
      let newY = e.clientY - canvasRect.top + scrollTop - dragOffset.y;

      // Snap to grid if enabled
      if (snapToGrid) {
        newX = Math.round(newX / GRID_SIZE) * GRID_SIZE;
        newY = Math.round(newY / GRID_SIZE) * GRID_SIZE;
      }

      newX = Math.max(0, newX);
      newY = Math.max(0, newY);

      // Auto-expand canvas if node is near the edge
      const expandedWidth = Math.max(canvasSize.width, newX + DEFAULT_NODE_WIDTH + CANVAS_PADDING);
      const expandedHeight = Math.max(
        canvasSize.height,
        newY + CONDITION_NODE_HEIGHT + CANVAS_PADDING,
      );
      if (expandedWidth > canvasSize.width || expandedHeight > canvasSize.height) {
        setCanvasSize({ width: expandedWidth, height: expandedHeight });
      }

      // Update node position
      onUpdateNode(draggingNode, {
        position: { x: newX, y: newY },
      });
    },
    [draggingNode, dragOffset, onUpdateNode, snapToGrid, canvasSize],
  );

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

  // Compute node positions from node.position data + measured dimensions.
  // Uses node.position directly (not getBoundingClientRect viewport coords) since both
  // nodes and SVG share the same absolute coordinate space within the inner container div.
  const [nodePositions, setNodePositions] = useState({});

  const computePositions = useCallback(() => {
    const positions = {};
    nodes.forEach((node) => {
      const x = node.position?.x || 50;
      const y = node.position?.y || 50;

      // Measure actual rendered dimensions from DOM ref, fall back to estimates
      const element = nodeRefs.current[node.id];
      const width = element ? element.offsetWidth : DEFAULT_NODE_WIDTH;
      const height = element
        ? element.offsetHeight
        : node.type === 'condition'
          ? CONDITION_NODE_HEIGHT
          : DEFAULT_NODE_HEIGHT;

      const centerX = x + width / 2;
      const centerY = y + height / 2;

      positions[node.id] = {
        x: centerX,
        y: centerY,
        width,
        height,
        top: y,
        bottom: y + height,
        left: x,
        right: x + width,
        points: {
          top: { x: centerX, y },
          bottom: { x: centerX, y: y + height },
          left: { x, y: centerY },
          right: { x: x + width, y: centerY },
        },
      };
    });
    setNodePositions(positions);
  }, [nodes]);

  // Recompute positions after DOM paints so refs are populated with correct heights
  useEffect(() => {
    // Immediate computation (uses estimates if refs aren't ready)
    computePositions();

    // After paint: re-measure with actual DOM heights
    const rafId = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        computePositions();
      });
    });

    // Fallback for slow renders
    const timeoutId = setTimeout(computePositions, 150);

    return () => {
      cancelAnimationFrame(rafId);
      clearTimeout(timeoutId);
    };
  }, [computePositions, connections]);

  // Generate SVG path for connection line
  const generateConnectionPath = useCallback(
    (fromId, toId) => {
      const from = nodePositions[fromId];
      const to = nodePositions[toId];

      if (!from || !to) return null;

      // Determine best connection points based on relative positions
      const dx = to.x - from.x;
      const dy = to.y - from.y;

      let startPoint, endPoint;

      // Choose start point based on direction to target
      if (Math.abs(dx) > Math.abs(dy)) {
        // Horizontal connection preferred
        startPoint = dx > 0 ? from.points.right : from.points.left;
        endPoint = dx > 0 ? to.points.left : to.points.right;
      } else {
        // Vertical connection preferred
        startPoint = dy > 0 ? from.points.bottom : from.points.top;
        endPoint = dy > 0 ? to.points.top : to.points.bottom;
      }

      const startX = startPoint.x;
      const startY = startPoint.y;
      const endX = endPoint.x;
      const endY = endPoint.y;

      // Calculate control points for smooth curves
      let path;
      if (Math.abs(dx) > Math.abs(dy)) {
        // Horizontal connection - use horizontal control points
        const midX = (startX + endX) / 2;
        path = `M ${startX} ${startY} C ${midX} ${startY}, ${midX} ${endY}, ${endX} ${endY}`;
      } else {
        // Vertical connection - use vertical control points
        const midY = (startY + endY) / 2;
        path = `M ${startX} ${startY} C ${startX} ${midY}, ${endX} ${midY}, ${endX} ${endY}`;
      }

      return path;
    },
    [nodePositions],
  );

  // Render SVG connections overlay
  const renderConnections = () => {
    if (Object.keys(nodePositions).length === 0) return null;

    const svgConnections = [];

    connections.forEach((conn, index) => {
      const path = generateConnectionPath(conn.from, conn.to);
      if (!path) return;

      // Check if this is from a condition node to style branches
      const fromNode = nodes.find((n) => n.id === conn.from);
      const isCondition = fromNode?.type === 'condition';

      // For condition nodes, color based on connection order (first=true/green, second=false/red)
      let color = '#a78bfa';
      if (isCondition) {
        const conditionConns = connections.filter((c) => c.from === conn.from);
        const connIndex = conditionConns.findIndex((c) => c.to === conn.to);
        color = connIndex === 0 ? '#4ade80' : '#f87171'; // Green for TRUE, Red for FALSE
      }

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
        </g>,
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
        cursor: draggingNode ? 'grabbing' : 'default',
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

      {/* Snap-to-grid toggle */}
      <div className="sticky top-2 left-2 z-50 inline-flex">
        <Button
          variant={snapToGrid ? 'default' : 'outline'}
          size="sm"
          onClick={() => setSnapToGrid(!snapToGrid)}
          className={
            snapToGrid
              ? 'bg-purple-600 hover:bg-purple-700 text-white shadow-lg'
              : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700'
          }
          title={snapToGrid ? 'Snap to grid: ON' : 'Snap to grid: OFF'}
        >
          <Grid3X3 className="w-4 h-4 mr-1" />
          Snap
        </Button>
      </div>

      {/* Canvas workspace with grid background */}
      <div
        className="relative p-4"
        style={{
          minWidth: `${canvasSize.width}px`,
          minHeight: `${canvasSize.height}px`,
          width: 'max-content',
          height: 'max-content',
          backgroundImage: `
          linear-gradient(rgba(148, 163, 184, 0.1) 1px, transparent 1px),
          linear-gradient(90deg, rgba(148, 163, 184, 0.1) 1px, transparent 1px)
        `,
          backgroundSize: `${GRID_SIZE}px ${GRID_SIZE}px`,
        }}
      >
        {/* SVG connection lines overlay */}
        {renderConnections()}

        {connectingFrom && (
          <div className="fixed top-4 left-1/2 transform -translate-x-1/2 bg-purple-600 text-white px-4 py-2 rounded-lg shadow-lg z-50 animate-bounce">
            Click on a connection point on another node
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
                zIndex: selectedNodeId === node.id ? 100 : draggingNode === node.id ? 200 : 10,
              }}
            >
              <WorkflowNode
                node={node}
                isSelected={selectedNodeId === node.id}
                isConnecting={connectingFrom?.nodeId === node.id}
                isDragging={draggingNode === node.id}
                connectMode={!!connectingFrom}
                onClick={() => handleNodeClick(node.id)}
                onUpdate={(updates) => onUpdateNode(node.id, updates)}
                onDelete={() => onDeleteNode(node.id)}
                onStartConnect={(point) => handleStartConnect(node.id, point)}
                dragHandleProps={{
                  onMouseDown: (e) => handleDragStart(node.id, e),
                }}
              />
            </div>
          );
        })}

        {/* Empty state hint */}
        {nodes.length === 1 && (
          <div
            style={{
              position: 'absolute',
              left: '50%',
              top: '400px',
              transform: 'translateX(-50%)',
              width: '400px',
            }}
          >
            <div className="text-center p-6 border-2 border-dashed border-slate-700 rounded-lg bg-slate-900/50">
              <p className="text-slate-400 text-sm">Add more nodes from the library on the left</p>
              <p className="text-slate-500 text-xs mt-2">
                Then click connection points (blue dots) to connect nodes
              </p>
              <p className="text-slate-500 text-xs mt-1">Drag the grip icon to reposition nodes</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
