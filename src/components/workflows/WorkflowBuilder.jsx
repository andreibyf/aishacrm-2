
import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Workflow } from '@/api/entities';
import { useUser } from '@/components/shared/useUser.js';
import { BACKEND_URL } from '@/api/entities';
import { Webhook, Search, Save, Plus, X, Copy, Check, RefreshCw, Sparkles } from 'lucide-react';
import WorkflowCanvas from './WorkflowCanvas';
import NodeLibrary from './NodeLibrary';
import WorkflowTemplatesBrowser from './WorkflowTemplatesBrowser';
import { toast } from 'sonner';
import { WorkflowExecution } from '@/api/entities';
import { Switch } from '@/components/ui/switch';

export default function WorkflowBuilder({ workflow, onSave, onCancel }) {
  const [name, setName] = useState(workflow?.name || '');
  const [description, setDescription] = useState(workflow?.description || '');
  const [nodes, setNodes] = useState(workflow?.nodes || []);
  const [connections, setConnections] = useState(workflow?.connections || []);
  const { user } = useUser();
  const [saving, setSaving] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [testPayload, setTestPayload] = useState(null);
  const [showPayload, setShowPayload] = useState(false);
  const [copied, setCopied] = useState(false);
  // Removed [loadingPayload, setLoadingPayload]

  // Added new states for execution history viewer
  const [waitingForWebhook, setWaitingForWebhook] = useState(false);
  const [recentExecutions, setRecentExecutions] = useState([]);
  const [showExecutions, setShowExecutions] = useState(false);
  const [loadingExecutions, setLoadingExecutions] = useState(false);
  const [executionLimit, setExecutionLimit] = useState(10);
  const [executionOffset, setExecutionOffset] = useState(0);
  
  const [autoConnect, setAutoConnect] = useState(true);
  const [showTemplates, setShowTemplates] = useState(false);

  // Template handler
  const handleSelectTemplate = (template) => {
    setName(template.name);
    setDescription(template.description);
    setNodes(template.nodes || []);
    setConnections(template.connections || []);
    setShowTemplates(false);
    toast.success(`Template "${template.name}" loaded successfully!`);
  };

  // Update state when workflow prop changes (for editing)
  useEffect(() => {
    console.log("!!! FRONTEND VERSION CHECK: FIX APPLIED (v2) !!!");
    if (workflow) {
      console.log('[WorkflowBuilder] Workflow prop changed:', {
        id: workflow.id,
        name: workflow.name,
        hasNodes: !!workflow.nodes,
        nodesLength: workflow.nodes?.length,
        nodesData: workflow.nodes,
        hasConnections: !!workflow.connections,
        connectionsLength: workflow.connections?.length,
        connectionsData: workflow.connections
      });

      setName(workflow.name || '');
      setDescription(workflow.description || '');
      setNodes(workflow.nodes || []);
      setConnections(workflow.connections || []);

      if (workflow.nodes && workflow.nodes.length > 0) {
        setSelectedNodeId(workflow.nodes[0].id);
      }
    }
  }, [workflow]);

  useEffect(() => {
    if (!workflow && nodes.length === 0) {
      const initialNode = {
        id: 'trigger-1',
        type: 'webhook_trigger',
        config: {},
        position: { x: 400, y: 200 } // Center of canvas for better expansion
      };
      setNodes([initialNode]);
      // Make the initial webhook trigger node selectable
      setSelectedNodeId(initialNode.id);
    }
  }, [workflow, nodes.length]);

  const handleAddNode = (nodeType) => {
    const newNode = {
      id: `node-${Date.now()}`,
      type: nodeType,
      config: {},
      position: { x: 400, y: 200 + (nodes.length * 150) } // Centered horizontally, spaced vertically
    };
    setNodes([...nodes, newNode]);
    setSelectedNodeId(newNode.id);
  };

  const handleUpdateNode = (nodeId, updates) => {
    setNodes(nodes.map(node =>
      node.id === nodeId ? { ...node, ...updates } : node
    ));
  };

  const updateNodeConfig = (nodeId, newConfig) => {
    setNodes(nodes.map(node =>
      node.id === nodeId ? { ...node, config: newConfig } : node
    ));
  };

  const handleDeleteNode = (nodeId) => {
    setNodes(nodes.filter(node => node.id !== nodeId));
    setConnections(connections.filter(conn => conn.from !== nodeId && conn.to !== nodeId));
    if (selectedNodeId === nodeId) {
      setSelectedNodeId(null);
    }
  };

  const handleConnect = (fromId, toId) => {
    const filteredConnections = connections.filter(conn => conn.from !== fromId);
    setConnections([...filteredConnections, { from: fromId, to: toId }]);
  };

  const handleSelectNode = (nodeId) => {
    setSelectedNodeId(nodeId);
  };

  const handleCopyWebhookUrl = () => {
    const localWebhook = `${BACKEND_URL}/api/workflows/execute?workflow_id=${workflow?.id || 'PENDING'}`;
    const webhookUrl = workflow?.webhook_url || localWebhook;
    navigator.clipboard.writeText(webhookUrl);
    setCopied(true);
    toast.success('Webhook URL copied to clipboard');
    setTimeout(() => setCopied(false), 2000);
  };

  // New function: handleUseSamplePayload (replaces part of old handleTestPayload logic)
  const handleUseSamplePayload = () => {
    const genericSamplePayload = {
      email: "test@example.com",
      first_name: "John",
      last_name: "Doe",
      status: "qualified",
      score: 85,
      company: "Test Corp",
      phone: "+1234567890",
      notes: "Sample lead from webhook",
      source: "website",
      next_action: "Schedule demo"
    };
    setTestPayload(genericSamplePayload);
    setShowPayload(true);
    toast.info('Loaded a generic sample payload.');
    setShowExecutions(false); // Hide executions list if showing
  };

  const handleWaitForWebhook = async () => {
    if (!workflow?.id) {
      toast.error('Please save the workflow first to wait for a real webhook.');
      return;
    }

    setWaitingForWebhook(true);
    setShowPayload(false);
    setShowExecutions(false);

    try {
      toast.info('Waiting for a new webhook to be sent (max 30 seconds)...');
      
      // Get the current latest execution timestamp
      const currentExecutions = await WorkflowExecution.filter(
        { workflow_id: workflow.id },
        '-created_date',
        1
      );
      const lastTimestamp = currentExecutions[0]?.created_date || new Date(0).toISOString();

      // Poll for new executions
      let attempts = 0;
      const maxAttempts = 15; // 30 seconds (15 attempts * 2 seconds)
      
      const checkForNew = async () => {
        attempts++;
        
        const latestExecutions = await WorkflowExecution.filter(
          { workflow_id: workflow.id },
          '-created_date',
          1
        );

        if (latestExecutions && latestExecutions.length > 0) {
          const latest = latestExecutions[0];
          
          // Check if this is a new execution
          if (latest.created_date > lastTimestamp && latest.trigger_data) {
            setTestPayload(latest.trigger_data);
            setShowPayload(true);
            setWaitingForWebhook(false);
            toast.success('Webhook received! Payload loaded successfully.');
            return true;
          }
        }

        if (attempts >= maxAttempts) {
          setWaitingForWebhook(false);
          toast.warn('No new webhook detected. Try sending a test webhook to the URL above, or use a sample payload.');
          handleUseSamplePayload(); // Fallback to sample
          return true;
        }

        // Continue polling
        setTimeout(checkForNew, 2000);
        return false;
      };

      // Start polling
      checkForNew();

    } catch (error) {
      console.error('Error waiting for webhook:', error);
      toast.error('Failed to wait for webhook. Using sample payload instead.');
      handleUseSamplePayload(); // Fallback to sample on error
      setWaitingForWebhook(false);
    }
  };

  // New function: loadRecentExecutions (from outline)
  const loadRecentExecutions = async () => {
    if (!workflow?.id) {
      toast.error('Please save the workflow first');
      return;
    }

    setLoadingExecutions(true);
    setShowPayload(false); // Hide current payload when loading history
    try {
      const executions = await WorkflowExecution.filter({
        workflow_id: workflow.id,
        limit: executionLimit,
        offset: executionOffset,
        order: '-created_date'
      });
      setRecentExecutions(executions || []);
      setShowExecutions(true); // Show the executions list
      if (executions && executions.length > 0) {
        toast.success('Recent webhook executions loaded.');
      } else {
        toast.info('No recent webhook executions found for this workflow.');
      }
    } catch (error) {
      console.error('Error loading executions:', error);
      toast.error('Failed to load webhook history');
    } finally {
      setLoadingExecutions(false);
    }
  };

  const handleNextExecutionsPage = async () => {
    if (recentExecutions.length < executionLimit) {
      toast.info('You are on the last page');
      return;
    }
    setExecutionOffset(executionOffset + executionLimit);
    setTimeout(loadRecentExecutions, 0);
  };

  const handlePrevExecutionsPage = async () => {
    if (executionOffset === 0) return;
    const newOffset = Math.max(0, executionOffset - executionLimit);
    setExecutionOffset(newOffset);
    setTimeout(loadRecentExecutions, 0);
  };

  // New function: handleUseExecutionPayload (from outline)
  const handleUseExecutionPayload = (execution) => {
    if (execution.trigger_data) {
      setTestPayload(execution.trigger_data);
      setShowPayload(true);
      toast.success('Payload loaded from execution');
      setShowExecutions(false); // Hide executions list once a payload is selected
    } else {
      toast.error('No payload data in this execution');
    }
  };

  const getAvailableFields = () => {
    if (!testPayload) return [];
    return Object.keys(testPayload);
  };

  const renderNodeConfig = (node) => {
    if (!node) return null;

    switch (node.type) {
      case 'webhook_trigger':
        return (
          <div className="space-y-4">
            <div>
              <Label className="text-slate-200">Webhook Trigger</Label>
              <p className="text-sm text-slate-400 mt-1">
                This workflow executes when the webhook receives data
              </p>
            </div>

            {workflow?.webhook_url && (
              <div>
                <Label className="text-slate-200">Webhook URL</Label>
                <div className="flex gap-2 mt-1">
                  <Input
                    value={workflow.webhook_url}
                    readOnly
                    className="bg-slate-800 border-slate-700 text-slate-300 text-xs"
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={handleCopyWebhookUrl}
                    className="bg-slate-800 border-slate-700"
                  >
                    {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
                  </Button>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Button
                variant="outline"
                onClick={handleWaitForWebhook}
                disabled={waitingForWebhook || !workflow?.id}
                className="w-full bg-purple-600 hover:bg-purple-700 text-white border-purple-500"
              >
                {waitingForWebhook ? (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                    Waiting for Webhook...
                  </>
                ) : (
                  <>
                    <Webhook className="w-4 h-4 mr-2" />
                    Wait for Real Webhook
                  </>
                )}
              </Button>

              <Button
                variant="outline"
                onClick={loadRecentExecutions}
                disabled={loadingExecutions || !workflow?.id}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white border-blue-500"
              >
                {loadingExecutions ? (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                    Loading...
                  </>
                ) : (
                  <>
                    <Search className="w-4 h-4 mr-2" />
                    View Webhook History
                  </>
                )}
              </Button>

              <Button
                variant="outline"
                onClick={handleUseSamplePayload}
                className="w-full bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700"
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Use Sample Payload
              </Button>
            </div>

            {!workflow?.id && (
              <p className="text-xs text-amber-400">
                💡 Save the workflow first to capture real webhook data
              </p>
            )}

            {/* Recent Executions List */}
            {showExecutions && (
              <div className="border border-slate-700 rounded-lg p-3">
                <div className="flex items-center justify-between mb-3 gap-3">
                  <Label className="text-slate-200">Recent Webhook Executions</Label>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500">Rows per page</span>
                    <Select
                      value={String(executionLimit)}
                      onValueChange={(v) => {
                        const next = parseInt(v, 10);
                        setExecutionLimit(next);
                        setExecutionOffset(0);
                        setTimeout(loadRecentExecutions, 0);
                      }}
                    >
                      <SelectTrigger className="h-8 w-18 bg-slate-800 border-slate-700 text-slate-200">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-slate-800 border-slate-700">
                        <SelectItem value="5">5</SelectItem>
                        <SelectItem value="10">10</SelectItem>
                        <SelectItem value="25">25</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowExecutions(false)}
                      className="text-slate-400 hover:text-slate-200"
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
                
                <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                  {recentExecutions.length === 0 ? (
                    <p className="text-sm text-slate-500 text-center py-4">
                      No webhook executions yet. Send a test webhook to see it here.
                    </p>
                  ) : (
                    recentExecutions.map((execution) => (
                      <div
                        key={execution.id}
                        className="bg-slate-800 border border-slate-700 rounded p-3 hover:bg-slate-750 cursor-pointer transition-colors duration-200"
                        onClick={() => handleUseExecutionPayload(execution)}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className={`text-xs px-2 py-1 rounded ${
                            execution.status === 'success' ? 'bg-green-900/30 text-green-400' :
                            execution.status === 'failed' ? 'bg-red-900/30 text-red-400' :
                            'bg-blue-900/30 text-blue-400'
                          }`}>
                            {execution.status}
                          </span>
                          <span className="text-xs text-slate-500">
                            {new Date(execution.created_date).toLocaleString()}
                          </span>
                        </div>
                        
                        {execution.trigger_data && (
                          <div className="bg-slate-950 rounded p-2 mt-2">
                            <pre className="text-xs text-slate-400 overflow-x-auto whitespace-pre-wrap break-all">
                              {JSON.stringify(execution.trigger_data, null, 2).substring(0, 200)}
                              {JSON.stringify(execution.trigger_data, null, 2).length > 200 && '...'}
                            </pre>
                          </div>
                        )}
                        
                        <p className="text-xs text-slate-500 mt-2">
                          Click to use this payload
                        </p>
                      </div>
                    ))
                  )}
                </div>
                <div className="flex items-center justify-between mt-3">
                  <span className="text-xs text-slate-500">
                    {executionOffset + 1}
                    {recentExecutions.length > 0 ? `–${executionOffset + recentExecutions.length}` : ''}
                  </span>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handlePrevExecutionsPage}
                      disabled={loadingExecutions || executionOffset === 0}
                      className="bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700"
                    >
                      Prev
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleNextExecutionsPage}
                      disabled={loadingExecutions || recentExecutions.length < executionLimit}
                      className="bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700"
                    >
                      Next
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* Current Payload Display */}
            {showPayload && testPayload && (
              <div>
                <Label className="text-slate-200">Current Payload</Label>
                <div className="mt-2 p-3 bg-slate-950 border border-slate-700 rounded max-h-60 overflow-y-auto">
                  <pre className="text-xs text-slate-300">
                    {JSON.stringify(testPayload, null, 2)}
                  </pre>
                </div>
                <p className="text-xs text-slate-500 mt-2">
                  Available fields: {Object.keys(testPayload).join(', ')}
                </p>
              </div>
            )}
          </div>
        );

      case 'find_lead':
        return (
          <div className="space-y-4">
            <div>
              <Label className="text-slate-200">Search Field</Label>
              <Select
                value={node.config?.search_field || 'email'}
                onValueChange={(value) => {
                  updateNodeConfig(node.id, { ...node.config, search_field: value });
                }}
              >
                <SelectTrigger className="bg-slate-800 border-slate-700 text-slate-200">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700">
                  <SelectItem value="email">Email</SelectItem>
                  <SelectItem value="phone">Phone</SelectItem>
                  <SelectItem value="unique_id">Unique ID</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-slate-200">Search Value</Label>
              {getAvailableFields().length > 0 ? (
                <Select
                  value={node.config?.search_value || ''}
                  onValueChange={(value) => {
                    updateNodeConfig(node.id, { ...node.config, search_value: `{{${value}}}` });
                  }}
                >
                  <SelectTrigger className="bg-slate-800 border-slate-700 text-slate-200">
                    <SelectValue placeholder="Select webhook field" />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-800 border-slate-700">
                    {getAvailableFields().map(field => (
                      <SelectItem key={field} value={field}>
                        {'{{'}{field}{'}}'}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  value={node.config?.search_value || '{{email}}'}
                  onChange={(e) => {
                    updateNodeConfig(node.id, { ...node.config, search_value: e.target.value });
                  }}
                  placeholder="{{email}}"
                  className="bg-slate-800 border-slate-700 text-slate-200"
                />
              )}
              <p className="text-xs text-slate-500 mt-1">
                Use {'{{field_name}}'} to reference webhook data
              </p>
            </div>
          </div>
        );

      case 'create_lead':
        return (
          <div className="space-y-4">
            <div>
              <Label className="text-slate-200">Field Mappings</Label>
              <p className="text-sm text-slate-400 mb-3">
                Map webhook fields to new lead fields
              </p>

              <div className="max-h-96 overflow-y-auto pr-2 space-y-2">
                {(node.config?.field_mappings || []).map((mapping, index) => (
                  <div key={index} className="flex gap-2 items-center">
                    <Select
                      value={mapping.lead_field}
                      onValueChange={(value) => {
                        const newMappings = [...(node.config?.field_mappings || [])];
                        newMappings[index] = { ...mapping, lead_field: value };
                        updateNodeConfig(node.id, { ...node.config, field_mappings: newMappings });
                      }}
                    >
                      <SelectTrigger className="bg-slate-800 border-slate-700 text-slate-200">
                        <SelectValue placeholder="Lead Field" />
                      </SelectTrigger>
                      <SelectContent className="bg-slate-800 border-slate-700">
                        <SelectItem value="first_name">First Name</SelectItem>
                        <SelectItem value="last_name">Last Name</SelectItem>
                        <SelectItem value="email">Email</SelectItem>
                        <SelectItem value="phone">Phone</SelectItem>
                        <SelectItem value="company">Company</SelectItem>
                        <SelectItem value="status">Status</SelectItem>
                        <SelectItem value="score">Score</SelectItem>
                        <SelectItem value="job_title">Job Title</SelectItem>
                        <SelectItem value="source">Source</SelectItem>
                        <SelectItem value="next_action">Next Action</SelectItem>
                        <SelectItem value="notes">Notes</SelectItem>
                      </SelectContent>
                    </Select>

                    {getAvailableFields().length > 0 ? (
                      <Select
                        value={mapping.webhook_field}
                        onValueChange={(value) => {
                          const newMappings = [...(node.config?.field_mappings || [])];
                          newMappings[index] = { ...mapping, webhook_field: value };
                          updateNodeConfig(node.id, { ...node.config, field_mappings: newMappings });
                        }}
                      >
                        <SelectTrigger className="bg-slate-800 border-slate-700 text-slate-200">
                          <SelectValue placeholder="Webhook Field" />
                        </SelectTrigger>
                        <SelectContent className="bg-slate-800 border-slate-700">
                          {getAvailableFields().map(field => (
                            <SelectItem key={field} value={field}>{field}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input
                        value={mapping.webhook_field}
                        onChange={(e) => {
                          const newMappings = [...(node.config?.field_mappings || [])];
                          newMappings[index] = { ...mapping, webhook_field: e.target.value };
                          updateNodeConfig(node.id, { ...node.config, field_mappings: newMappings });
                        }}
                        placeholder="webhook_field"
                        className="bg-slate-800 border-slate-700 text-slate-200"
                      />
                    )}

                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        const newMappings = (node.config?.field_mappings || []).filter((_, i) => i !== index);
                        updateNodeConfig(node.id, { ...node.config, field_mappings: newMappings });
                      }}
                      className="text-red-400 hover:text-red-300 hover:bg-red-900/20 flex-shrink-0"
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const newMappings = [...(node.config?.field_mappings || []), { lead_field: '', webhook_field: '' }];
                  updateNodeConfig(node.id, { ...node.config, field_mappings: newMappings });
                }}
                className="bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700 mt-2 w-full"
              >
                <Plus className="w-4 h-4 mr-2" />
                Add Mapping
              </Button>
            </div>
          </div>
        );

      case 'update_lead':
        return (
          <div className="space-y-4">
            <div>
              <Label className="text-slate-200">Field Mappings</Label>
              <p className="text-sm text-slate-400 mb-3">
                Map webhook fields to lead fields
              </p>

              <div className="max-h-96 overflow-y-auto pr-2 space-y-2">
                {(node.config?.field_mappings || []).map((mapping, index) => (
                  <div key={index} className="flex gap-2 items-center">
                    <Select
                      value={mapping.lead_field}
                      onValueChange={(value) => {
                        const newMappings = [...(node.config?.field_mappings || [])];
                        newMappings[index] = { ...mapping, lead_field: value };
                        updateNodeConfig(node.id, { ...node.config, field_mappings: newMappings });
                      }}
                    >
                      <SelectTrigger className="bg-slate-800 border-slate-700 text-slate-200">
                        <SelectValue placeholder="Lead Field" />
                      </SelectTrigger>
                      <SelectContent className="bg-slate-800 border-slate-700">
                        <SelectItem value="status">Status</SelectItem>
                        <SelectItem value="score">Score</SelectItem>
                        <SelectItem value="company">Company</SelectItem>
                        <SelectItem value="phone">Phone</SelectItem>
                        <SelectItem value="job_title">Job Title</SelectItem>
                        <SelectItem value="source">Source</SelectItem>
                        <SelectItem value="next_action">Next Action</SelectItem>
                        <SelectItem value="score_reason">Score Reason</SelectItem>
                        <SelectItem value="notes">Notes</SelectItem>
                      </SelectContent>
                    </Select>

                    {getAvailableFields().length > 0 ? (
                      <Select
                        value={mapping.webhook_field}
                        onValueChange={(value) => {
                          const newMappings = [...(node.config?.field_mappings || [])];
                          newMappings[index] = { ...mapping, webhook_field: value };
                          updateNodeConfig(node.id, { ...node.config, field_mappings: newMappings });
                        }}
                      >
                        <SelectTrigger className="bg-slate-800 border-slate-700 text-slate-200">
                          <SelectValue placeholder="Webhook Field" />
                        </SelectTrigger>
                        <SelectContent className="bg-slate-800 border-slate-700">
                          {getAvailableFields().map(field => (
                            <SelectItem key={field} value={field}>{field}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input
                        value={mapping.webhook_field}
                        onChange={(e) => {
                          const newMappings = [...(node.config?.field_mappings || [])];
                          newMappings[index] = { ...mapping, webhook_field: e.target.value };
                          updateNodeConfig(node.id, { ...node.config, field_mappings: newMappings });
                        }}
                        placeholder="webhook_field"
                        className="bg-slate-800 border-slate-700 text-slate-200"
                      />
                    )}

                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        const newMappings = (node.config?.field_mappings || []).filter((_, i) => i !== index);
                        updateNodeConfig(node.id, { ...node.config, field_mappings: newMappings });
                      }}
                      className="text-red-400 hover:text-red-300 hover:bg-red-900/20 flex-shrink-0"
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const newMappings = [...(node.config?.field_mappings || []), { lead_field: '', webhook_field: '' }];
                  updateNodeConfig(node.id, { ...node.config, field_mappings: newMappings });
                }}
                className="bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700 mt-2 w-full"
              >
                <Plus className="w-4 h-4 mr-2" />
                Add Mapping
              </Button>
            </div>
          </div>
        );

      case 'http_request':
        return (
          <div className="space-y-4">
            <div>
              <Label className="text-slate-200">HTTP Method</Label>
              <Select
                value={node.config?.method || 'POST'}
                onValueChange={(value) => {
                  updateNodeConfig(node.id, { ...node.config, method: value });
                }}
              >
                <SelectTrigger className="bg-slate-800 border-slate-700 text-slate-200">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700">
                  <SelectItem value="GET">GET</SelectItem>
                  <SelectItem value="POST">POST</SelectItem>
                  <SelectItem value="PUT">PUT</SelectItem>
                  <SelectItem value="PATCH">PATCH</SelectItem>
                  <SelectItem value="DELETE">DELETE</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-slate-200">URL</Label>
              <Input
                value={node.config?.url || ''}
                onChange={(e) => {
                  updateNodeConfig(node.id, { ...node.config, url: e.target.value });
                }}
                placeholder="https://api.example.com/endpoint"
                className="bg-slate-800 border-slate-700 text-slate-200"
              />
              <p className="text-xs text-slate-500 mt-1">
                Supports {'{{field_name}}'} variables
              </p>
            </div>

            <div>
              <Label className="text-slate-200">Headers</Label>
              <div className="space-y-2 max-h-40 overflow-y-auto pr-2">
                {(node.config?.headers || []).map((header, index) => (
                  <div key={index} className="flex gap-2">
                    <Input
                      value={header.key}
                      onChange={(e) => {
                        const newHeaders = [...(node.config?.headers || [])];
                        newHeaders[index] = { ...header, key: e.target.value };
                        updateNodeConfig(node.id, { ...node.config, headers: newHeaders });
                      }}
                      placeholder="Header name"
                      className="bg-slate-800 border-slate-700 text-slate-200 flex-1"
                    />
                    <Input
                      value={header.value}
                      onChange={(e) => {
                        const newHeaders = [...(node.config?.headers || [])];
                        newHeaders[index] = { ...header, value: e.target.value };
                        updateNodeConfig(node.id, { ...node.config, headers: newHeaders });
                      }}
                      placeholder="Header value"
                      className="bg-slate-800 border-slate-700 text-slate-200 flex-1"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        const newHeaders = (node.config?.headers || []).filter((_, i) => i !== index);
                        updateNodeConfig(node.id, { ...node.config, headers: newHeaders });
                      }}
                      className="text-red-400 hover:text-red-300"
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const newHeaders = [...(node.config?.headers || []), { key: '', value: '' }];
                  updateNodeConfig(node.id, { ...node.config, headers: newHeaders });
                }}
                className="bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700 mt-2 w-full"
              >
                <Plus className="w-4 h-4 mr-2" />
                Add Header
              </Button>
            </div>

            {node.config?.method !== 'GET' && node.config?.method !== 'HEAD' && (
              <div>
                <Label className="text-slate-200">Body Type</Label>
                <Select
                  value={node.config?.body_type || 'mappings'}
                  onValueChange={(value) => {
                    updateNodeConfig(node.id, { ...node.config, body_type: value });
                  }}
                >
                  <SelectTrigger className="bg-slate-800 border-slate-700 text-slate-200">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-800 border-slate-700">
                    <SelectItem value="mappings">Field Mappings (JSON)</SelectItem>
                    <SelectItem value="raw">Raw JSON</SelectItem>
                  </SelectContent>
                </Select>

                {node.config?.body_type === 'raw' ? (
                  <div className="mt-2">
                    <Label className="text-slate-200">JSON Body</Label>
                    <textarea
                      value={node.config?.body || '{}'}
                      onChange={(e) => {
                        updateNodeConfig(node.id, { ...node.config, body: e.target.value });
                      }}
                      placeholder='{"key": "{{value}}"}'
                      className="w-full min-h-[120px] rounded-md bg-slate-800 border border-slate-700 text-slate-200 p-2 font-mono text-xs"
                    />
                    <p className="text-xs text-slate-500 mt-1">
                      Use {'{{field_name}}'} to inject webhook data
                    </p>
                  </div>
                ) : (
                  <div className="mt-2">
                    <Label className="text-slate-200">Body Field Mappings</Label>
                    <div className="space-y-2 max-h-60 overflow-y-auto pr-2 mt-2">
                      {(node.config?.body_mappings || []).map((mapping, index) => (
                        <div key={index} className="flex gap-2">
                          <Input
                            value={mapping.key}
                            onChange={(e) => {
                              const newMappings = [...(node.config?.body_mappings || [])];
                              newMappings[index] = { ...mapping, key: e.target.value };
                              updateNodeConfig(node.id, { ...node.config, body_mappings: newMappings });
                            }}
                            placeholder="JSON key"
                            className="bg-slate-800 border-slate-700 text-slate-200 flex-1"
                          />
                          {getAvailableFields().length > 0 ? (
                            <Select
                              value={mapping.value}
                              onValueChange={(value) => {
                                const newMappings = [...(node.config?.body_mappings || [])];
                                newMappings[index] = { ...mapping, value };
                                updateNodeConfig(node.id, { ...node.config, body_mappings: newMappings });
                              }}
                            >
                              <SelectTrigger className="bg-slate-800 border-slate-700 text-slate-200 flex-1">
                                <SelectValue placeholder="Select field" />
                              </SelectTrigger>
                              <SelectContent className="bg-slate-800 border-slate-700">
                                {getAvailableFields().map(field => (
                                  <SelectItem key={field} value={field}>{field}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <Input
                              value={mapping.value}
                              onChange={(e) => {
                                const newMappings = [...(node.config?.body_mappings || [])];
                                newMappings[index] = { ...mapping, value: e.target.value };
                                updateNodeConfig(node.id, { ...node.config, body_mappings: newMappings });
                              }}
                              placeholder="webhook_field"
                              className="bg-slate-800 border-slate-700 text-slate-200 flex-1"
                            />
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              const newMappings = (node.config?.body_mappings || []).filter((_, i) => i !== index);
                              updateNodeConfig(node.id, { ...node.config, body_mappings: newMappings });
                            }}
                            className="text-red-400 hover:text-red-300"
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const newMappings = [...(node.config?.body_mappings || []), { key: '', value: '' }];
                        updateNodeConfig(node.id, { ...node.config, body_mappings: newMappings });
                      }}
                      className="bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700 mt-2 w-full"
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      Add Field
                    </Button>
                  </div>
                )}
              </div>
            )}

            <div className="bg-blue-900/20 border border-blue-700 rounded-lg p-3">
              <p className="text-sm text-blue-300 font-semibold mb-2">
                💡 Common Use Cases:
              </p>
              <ul className="text-xs text-blue-400 space-y-1 ml-4 list-disc">
                <li>Send to Slack: POST to webhook URL</li>
                <li>Add to Google Sheets: Use Sheets API</li>
                <li>Update Airtable: POST to Airtable API</li>
                <li>Send SMS via Twilio: POST to Twilio API</li>
                <li>Trigger another workflow: POST to any webhook</li>
              </ul>
            </div>
          </div>
        );

      case 'send_email':
        return (
          <div className="space-y-4">
            <div>
              <Label className="text-slate-200">To</Label>
              <Input
                value={node.config?.to || '{{email}}'}
                onChange={(e) => {
                  updateNodeConfig(node.id, { ...node.config, to: e.target.value });
                }}
                placeholder="{{email}} or user@example.com"
                className="bg-slate-800 border-slate-700 text-slate-200"
              />
              <p className="text-xs text-slate-500 mt-1">
                Use {'{{field_name}}'} to reference webhook data
              </p>
            </div>
            <div>
              <Label className="text-slate-200">Subject</Label>
              <Input
                value={node.config?.subject || 'Hello from Workflow'}
                onChange={(e) => {
                  updateNodeConfig(node.id, { ...node.config, subject: e.target.value });
                }}
                placeholder="Subject"
                className="bg-slate-800 border-slate-700 text-slate-200"
              />
            </div>
            <div>
              <Label className="text-slate-200">Body</Label>
              <textarea
                value={node.config?.body || ''}
                onChange={(e) => {
                  updateNodeConfig(node.id, { ...node.config, body: e.target.value });
                }}
                placeholder="Email body (supports {{field}} replacements)"
                className="w-full min-h-[120px] rounded-md bg-slate-800 border border-slate-700 text-slate-200 p-2"
              />
            </div>
            <p className="text-xs text-slate-500">
              This queues an email as an Activity with type &quot;email&quot;. Delivery handling can be wired later.
            </p>
          </div>
        );

      case 'initiate_call':
        return (
          <div className="space-y-4">
            <div>
              <Label className="text-slate-200">AI Calling Provider</Label>
              <Select
                value={node.config?.provider || 'callfluent'}
                onValueChange={(value) => {
                  updateNodeConfig(node.id, { ...node.config, provider: value });
                }}
              >
                <SelectTrigger className="bg-slate-800 border-slate-700 text-slate-200">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700">
                  <SelectItem value="callfluent">CallFluent</SelectItem>
                  <SelectItem value="thoughtly">Thoughtly</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-slate-200">Phone Number</Label>
              {getAvailableFields().length > 0 ? (
                <Select
                  value={node.config?.phone_number?.replace(/[{}]/g, '') || 'phone'}
                  onValueChange={(value) => {
                    updateNodeConfig(node.id, { ...node.config, phone_number: `{{${value}}}` });
                  }}
                >
                  <SelectTrigger className="bg-slate-800 border-slate-700 text-slate-200">
                    <SelectValue placeholder="Select phone field" />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-800 border-slate-700">
                    {getAvailableFields().map(field => (
                      <SelectItem key={field} value={field}>
                        {'{{'}{field}{'}}'}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  value={node.config?.phone_number || '{{phone}}'}
                  onChange={(e) => {
                    updateNodeConfig(node.id, { ...node.config, phone_number: e.target.value });
                  }}
                  placeholder="{{phone}}"
                  className="bg-slate-800 border-slate-700 text-slate-200"
                />
              )}
              <p className="text-xs text-slate-500 mt-1">
                Phone number from webhook data or contact lookup
              </p>
            </div>
            <div>
              <Label className="text-slate-200">Call Purpose</Label>
              <Input
                value={node.config?.purpose || 'Follow-up call'}
                onChange={(e) => {
                  updateNodeConfig(node.id, { ...node.config, purpose: e.target.value });
                }}
                placeholder="Main objective for the AI call"
                className="bg-slate-800 border-slate-700 text-slate-200"
              />
            </div>
            <div>
              <Label className="text-slate-200">Talking Points</Label>
              <textarea
                value={(node.config?.talking_points || []).join('\n')}
                onChange={(e) => {
                  const points = e.target.value.split('\n').filter(p => p.trim());
                  updateNodeConfig(node.id, { ...node.config, talking_points: points });
                }}
                placeholder="Enter each talking point on a new line"
                className="w-full min-h-[80px] rounded-md bg-slate-800 border border-slate-700 text-slate-200 p-2"
              />
              <p className="text-xs text-slate-500 mt-1">
                Key points for the AI agent to cover during the call
              </p>
            </div>
            <div className="p-3 bg-slate-800/50 rounded-lg border border-slate-700">
              <p className="text-xs text-slate-400">
                <strong>Note:</strong> Requires CallFluent or Thoughtly integration configured in tenant settings.
                The AI agent will call the contact and follow the provided talking points.
              </p>
            </div>
          </div>
        );

      // Account: Find
      case 'find_account':
        return (
          <div className="space-y-4">
            <div>
              <Label className="text-slate-200">Search Field</Label>
              <Select
                value={node.config?.search_field || 'company'}
                onValueChange={(value) => {
                  updateNodeConfig(node.id, { ...node.config, search_field: value });
                }}
              >
                <SelectTrigger className="bg-slate-800 border-slate-700 text-slate-200">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700">
                  <SelectItem value="company">Company</SelectItem>
                  <SelectItem value="domain">Email Domain</SelectItem>
                  <SelectItem value="unique_id">Unique ID</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-slate-200">Search Value</Label>
              {getAvailableFields().length > 0 ? (
                <Select
                  value={node.config?.search_value || ''}
                  onValueChange={(value) => {
                    updateNodeConfig(node.id, { ...node.config, search_value: `{{${value}}}` });
                  }}
                >
                  <SelectTrigger className="bg-slate-800 border-slate-700 text-slate-200">
                    <SelectValue placeholder="Select webhook field" />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-800 border-slate-700">
                    {getAvailableFields().map(field => (
                      <SelectItem key={field} value={field}>
                        {'{{'}{field}{'}}'}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  value={node.config?.search_value || '{{company}}'}
                  onChange={(e) => {
                    updateNodeConfig(node.id, { ...node.config, search_value: e.target.value });
                  }}
                  placeholder="{{company}}"
                  className="bg-slate-800 border-slate-700 text-slate-200"
                />
              )}
              <p className="text-xs text-slate-500 mt-1">
                Use {'{{field_name}}'} to reference webhook data
              </p>
            </div>
          </div>
        );

      // Account: Update
      case 'update_account':
        return (
          <div className="space-y-4">
            <div>
              <Label className="text-slate-200">Field Mappings</Label>
              <p className="text-sm text-slate-400 mb-3">
                Map webhook fields to account fields
              </p>

              <div className="max-h-96 overflow-y-auto pr-2 space-y-2">
                {(node.config?.field_mappings || []).map((mapping, index) => (
                  <div key={index} className="flex gap-2 items-center">
                    <Select
                      value={mapping.account_field}
                      onValueChange={(value) => {
                        const newMappings = [...(node.config?.field_mappings || [])];
                        newMappings[index] = { ...mapping, account_field: value };
                        updateNodeConfig(node.id, { ...node.config, field_mappings: newMappings });
                      }}
                    >
                      <SelectTrigger className="bg-slate-800 border-slate-700 text-slate-200">
                        <SelectValue placeholder="Account Field" />
                      </SelectTrigger>
                      <SelectContent className="bg-slate-800 border-slate-700">
                        <SelectItem value="company">Company</SelectItem>
                        <SelectItem value="website">Website</SelectItem>
                        <SelectItem value="phone">Phone</SelectItem>
                        <SelectItem value="status">Status</SelectItem>
                        <SelectItem value="notes">Notes</SelectItem>
                      </SelectContent>
                    </Select>

                    {getAvailableFields().length > 0 ? (
                      <Select
                        value={mapping.webhook_field}
                        onValueChange={(value) => {
                          const newMappings = [...(node.config?.field_mappings || [])];
                          newMappings[index] = { ...mapping, webhook_field: value };
                          updateNodeConfig(node.id, { ...node.config, field_mappings: newMappings });
                        }}
                      >
                        <SelectTrigger className="bg-slate-800 border-slate-700 text-slate-200">
                          <SelectValue placeholder="Webhook Field" />
                        </SelectTrigger>
                        <SelectContent className="bg-slate-800 border-slate-700">
                          {getAvailableFields().map(field => (
                            <SelectItem key={field} value={field}>{field}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input
                        value={mapping.webhook_field}
                        onChange={(e) => {
                          const newMappings = [...(node.config?.field_mappings || [])];
                          newMappings[index] = { ...mapping, webhook_field: e.target.value };
                          updateNodeConfig(node.id, { ...node.config, field_mappings: newMappings });
                        }}
                        placeholder="webhook_field"
                        className="bg-slate-800 border-slate-700 text-slate-200"
                      />
                    )}

                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        const newMappings = (node.config?.field_mappings || []).filter((_, i) => i !== index);
                        updateNodeConfig(node.id, { ...node.config, field_mappings: newMappings });
                      }}
                      className="text-red-400 hover:text-red-300 hover:bg-red-900/20 flex-shrink-0"
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const newMappings = [...(node.config?.field_mappings || []), { account_field: '', webhook_field: '' }];
                  updateNodeConfig(node.id, { ...node.config, field_mappings: newMappings });
                }}
                className="bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700 mt-2 w-full"
              >
                <Plus className="w-4 h-4 mr-2" />
                Add Mapping
              </Button>
            </div>
          </div>
        );

      // Opportunity: Create
      case 'create_opportunity':
        return (
          <div className="space-y-4">
            <div>
              <Label className="text-slate-200">Field Mappings</Label>
              <p className="text-sm text-slate-400 mb-3">
                Map webhook fields to opportunity fields
              </p>

              <div className="max-h-96 overflow-y-auto pr-2 space-y-2">
                {(node.config?.field_mappings || []).map((mapping, index) => (
                  <div key={index} className="flex gap-2 items-center">
                    <Select
                      value={mapping.opportunity_field}
                      onValueChange={(value) => {
                        const newMappings = [...(node.config?.field_mappings || [])];
                        newMappings[index] = { ...mapping, opportunity_field: value };
                        updateNodeConfig(node.id, { ...node.config, field_mappings: newMappings });
                      }}
                    >
                      <SelectTrigger className="bg-slate-800 border-slate-700 text-slate-200">
                        <SelectValue placeholder="Opportunity Field" />
                      </SelectTrigger>
                      <SelectContent className="bg-slate-800 border-slate-700">
                        <SelectItem value="name">Name</SelectItem>
                        <SelectItem value="stage">Stage</SelectItem>
                        <SelectItem value="amount">Amount</SelectItem>
                        <SelectItem value="probability">Probability</SelectItem>
                        <SelectItem value="close_date">Close Date</SelectItem>
                        <SelectItem value="notes">Notes</SelectItem>
                      </SelectContent>
                    </Select>

                    {getAvailableFields().length > 0 ? (
                      <Select
                        value={mapping.webhook_field}
                        onValueChange={(value) => {
                          const newMappings = [...(node.config?.field_mappings || [])];
                          newMappings[index] = { ...mapping, webhook_field: value };
                          updateNodeConfig(node.id, { ...node.config, field_mappings: newMappings });
                        }}
                      >
                        <SelectTrigger className="bg-slate-800 border-slate-700 text-slate-200">
                          <SelectValue placeholder="Webhook Field" />
                        </SelectTrigger>
                        <SelectContent className="bg-slate-800 border-slate-700">
                          {getAvailableFields().map(field => (
                            <SelectItem key={field} value={field}>{field}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input
                        value={mapping.webhook_field}
                        onChange={(e) => {
                          const newMappings = [...(node.config?.field_mappings || [])];
                          newMappings[index] = { ...mapping, webhook_field: e.target.value };
                          updateNodeConfig(node.id, { ...node.config, field_mappings: newMappings });
                        }}
                        placeholder="webhook_field"
                        className="bg-slate-800 border-slate-700 text-slate-200"
                      />
                    )}

                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        const newMappings = (node.config?.field_mappings || []).filter((_, i) => i !== index);
                        updateNodeConfig(node.id, { ...node.config, field_mappings: newMappings });
                      }}
                      className="text-red-400 hover:text-red-300 hover:bg-red-900/20 flex-shrink-0"
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const newMappings = [...(node.config?.field_mappings || []), { opportunity_field: '', webhook_field: '' }];
                  updateNodeConfig(node.id, { ...node.config, field_mappings: newMappings });
                }}
                className="bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700 mt-2 w-full"
              >
                <Plus className="w-4 h-4 mr-2" />
                Add Mapping
              </Button>
            </div>
          </div>
        );

      // Opportunity: Update
      case 'update_opportunity':
        return (
          <div className="space-y-4">
            <div>
              <Label className="text-slate-200">Field Mappings</Label>
              <p className="text-sm text-slate-400 mb-3">
                Map webhook fields to opportunity fields
              </p>

              <div className="max-h-96 overflow-y-auto pr-2 space-y-2">
                {(node.config?.field_mappings || []).map((mapping, index) => (
                  <div key={index} className="flex gap-2 items-center">
                    <Select
                      value={mapping.opportunity_field}
                      onValueChange={(value) => {
                        const newMappings = [...(node.config?.field_mappings || [])];
                        newMappings[index] = { ...mapping, opportunity_field: value };
                        updateNodeConfig(node.id, { ...node.config, field_mappings: newMappings });
                      }}
                    >
                      <SelectTrigger className="bg-slate-800 border-slate-700 text-slate-200">
                        <SelectValue placeholder="Opportunity Field" />
                      </SelectTrigger>
                      <SelectContent className="bg-slate-800 border-slate-700">
                        <SelectItem value="stage">Stage</SelectItem>
                        <SelectItem value="amount">Amount</SelectItem>
                        <SelectItem value="probability">Probability</SelectItem>
                        <SelectItem value="close_date">Close Date</SelectItem>
                        <SelectItem value="notes">Notes</SelectItem>
                      </SelectContent>
                    </Select>

                    {getAvailableFields().length > 0 ? (
                      <Select
                        value={mapping.webhook_field}
                        onValueChange={(value) => {
                          const newMappings = [...(node.config?.field_mappings || [])];
                          newMappings[index] = { ...mapping, webhook_field: value };
                          updateNodeConfig(node.id, { ...node.config, field_mappings: newMappings });
                        }}
                      >
                        <SelectTrigger className="bg-slate-800 border-slate-700 text-slate-200">
                          <SelectValue placeholder="Webhook Field" />
                        </SelectTrigger>
                        <SelectContent className="bg-slate-800 border-slate-700">
                          {getAvailableFields().map(field => (
                            <SelectItem key={field} value={field}>{field}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input
                        value={mapping.webhook_field}
                        onChange={(e) => {
                          const newMappings = [...(node.config?.field_mappings || [])];
                          newMappings[index] = { ...mapping, webhook_field: e.target.value };
                          updateNodeConfig(node.id, { ...node.config, field_mappings: newMappings });
                        }}
                        placeholder="webhook_field"
                        className="bg-slate-800 border-slate-700 text-slate-200"
                      />
                    )}

                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        const newMappings = (node.config?.field_mappings || []).filter((_, i) => i !== index);
                        updateNodeConfig(node.id, { ...node.config, field_mappings: newMappings });
                      }}
                      className="text-red-400 hover:text-red-300 hover:bg-red-900/20 flex-shrink-0"
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const newMappings = [...(node.config?.field_mappings || []), { opportunity_field: '', webhook_field: '' }];
                  updateNodeConfig(node.id, { ...node.config, field_mappings: newMappings });
                }}
                className="bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700 mt-2 w-full"
              >
                <Plus className="w-4 h-4 mr-2" />
                Add Mapping
              </Button>
            </div>
          </div>
        );

      // Activities: Create
      case 'create_activity':
        return (
          <div className="space-y-4">
            <div>
              <Label className="text-slate-200">Activity Type</Label>
              <Select
                value={node.config?.type || 'note'}
                onValueChange={(value) => {
                  updateNodeConfig(node.id, { ...node.config, type: value });
                }}
              >
                <SelectTrigger className="bg-slate-800 border-slate-700 text-slate-200">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700">
                  <SelectItem value="email">Email</SelectItem>
                  <SelectItem value="call">Call</SelectItem>
                  <SelectItem value="task">Task</SelectItem>
                  <SelectItem value="note">Note</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-slate-200">Subject/Title</Label>
              <Input
                value={node.config?.title || ''}
                onChange={(e) => {
                  updateNodeConfig(node.id, { ...node.config, title: e.target.value });
                }}
                placeholder="e.g., Follow-up email"
                className="bg-slate-800 border-slate-700 text-slate-200"
              />
            </div>

            <div>
              <Label className="text-slate-200">Details</Label>
              <textarea
                value={node.config?.details || ''}
                onChange={(e) => {
                  updateNodeConfig(node.id, { ...node.config, details: e.target.value });
                }}
                placeholder="Activity details (supports {{field}} replacements)"
                className="w-full min-h-[120px] rounded-md bg-slate-800 border border-slate-700 text-slate-200 p-2"
              />
              <p className="text-xs text-slate-500 mt-1">
                Use {'{{field_name}}'} to reference webhook data
              </p>
            </div>

            <div>
              <Label className="text-slate-200">Associate With</Label>
              <Select
                value={node.config?.associate || 'lead'}
                onValueChange={(value) => {
                  updateNodeConfig(node.id, { ...node.config, associate: value });
                }}
              >
                <SelectTrigger className="bg-slate-800 border-slate-700 text-slate-200">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700">
                  <SelectItem value="lead">Lead</SelectItem>
                  <SelectItem value="contact">Contact</SelectItem>
                  <SelectItem value="account">Account</SelectItem>
                  <SelectItem value="opportunity">Opportunity</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        );

      // AI: Classify Opportunity Stage
      case 'ai_classify_opportunity_stage':
        return (
          <div className="space-y-4">
            <div>
              <Label className="text-slate-200">Provider</Label>
              <Select
                value={node.config?.provider || 'mcp'}
                onValueChange={(value) => {
                  updateNodeConfig(node.id, { ...node.config, provider: value });
                }}
              >
                <SelectTrigger className="bg-slate-800 border-slate-700 text-slate-200">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700">
                  <SelectItem value="mcp">Braid MCP</SelectItem>
                  <SelectItem value="openai">OpenAI (stub)</SelectItem>
                  <SelectItem value="anthropic">Anthropic (stub)</SelectItem>
                  <SelectItem value="google">Gemini (stub)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-slate-200">Model</Label>
              <Input
                value={node.config?.model || 'default'}
                onChange={(e) => updateNodeConfig(node.id, { ...node.config, model: e.target.value })}
                placeholder="e.g., gpt-4.1, claude-3.5, gemini-1.5-pro or 'default'"
                className="bg-slate-800 border-slate-700 text-slate-200"
              />
            </div>
            <div>
              <Label className="text-slate-200">Text/Context</Label>
              <textarea
                value={node.config?.text || ''}
                onChange={(e) => updateNodeConfig(node.id, { ...node.config, text: e.target.value })}
                placeholder="Provide notes or use {{field}} variables from payload/context"
                className="w-full min-h-[120px] rounded-md bg-slate-800 border border-slate-700 text-slate-200 p-2"
              />
              <p className="text-xs text-slate-500 mt-1">Output stored in {'{{ai_stage}}'} with {'{{ai_stage.stage}}'} and {'{{ai_stage.confidence}}'}</p>
            </div>
          </div>
        );

      // AI: Generate Email
      case 'ai_generate_email':
        return (
          <div className="space-y-4">
            <div>
              <Label className="text-slate-200">Provider</Label>
              <Select
                value={node.config?.provider || 'mcp'}
                onValueChange={(value) => updateNodeConfig(node.id, { ...node.config, provider: value })}
              >
                <SelectTrigger className="bg-slate-800 border-slate-700 text-slate-200">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700">
                  <SelectItem value="mcp">Braid MCP</SelectItem>
                  <SelectItem value="openai">OpenAI (stub)</SelectItem>
                  <SelectItem value="anthropic">Anthropic (stub)</SelectItem>
                  <SelectItem value="google">Gemini (stub)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-slate-200">Prompt</Label>
              <textarea
                value={node.config?.prompt || ''}
                onChange={(e) => updateNodeConfig(node.id, { ...node.config, prompt: e.target.value })}
                placeholder="Describe the email to generate. Use {{field}} variables."
                className="w-full min-h-[120px] rounded-md bg-slate-800 border border-slate-700 text-slate-200 p-2"
              />
              <p className="text-xs text-slate-500 mt-1">Output stored in {'{{ai_email}}'} with {'{{ai_email.subject}}'} and {'{{ai_email.body}}'}</p>
            </div>
          </div>
        );

      // AI: Enrich Account
      case 'ai_enrich_account':
        return (
          <div className="space-y-4">
            <div>
              <Label className="text-slate-200">Provider</Label>
              <Select
                value={node.config?.provider || 'mcp'}
                onValueChange={(value) => updateNodeConfig(node.id, { ...node.config, provider: value })}
              >
                <SelectTrigger className="bg-slate-800 border-slate-700 text-slate-200">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700">
                  <SelectItem value="mcp">Braid MCP</SelectItem>
                  <SelectItem value="openai">OpenAI (stub)</SelectItem>
                  <SelectItem value="anthropic">Anthropic (stub)</SelectItem>
                  <SelectItem value="google">Gemini (stub)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-slate-200">Input (e.g., domain)</Label>
              <Input
                value={node.config?.input || '{{company}}'}
                onChange={(e) => updateNodeConfig(node.id, { ...node.config, input: e.target.value })}
                placeholder="e.g., {{domain}} or {{company}}"
                className="bg-slate-800 border-slate-700 text-slate-200"
              />
              <p className="text-xs text-slate-500 mt-1">Output stored in {'{{ai_enrichment}}'} (e.g., website, industry, size)</p>
            </div>
          </div>
        );

      // AI: Route Activity
      case 'ai_route_activity':
        return (
          <div className="space-y-4">
            <div>
              <Label className="text-slate-200">Provider</Label>
              <Select
                value={node.config?.provider || 'mcp'}
                onValueChange={(value) => updateNodeConfig(node.id, { ...node.config, provider: value })}
              >
                <SelectTrigger className="bg-slate-800 border-slate-700 text-slate-200">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700">
                  <SelectItem value="mcp">Braid MCP</SelectItem>
                  <SelectItem value="openai">OpenAI (stub)</SelectItem>
                  <SelectItem value="anthropic">Anthropic (stub)</SelectItem>
                  <SelectItem value="google">Gemini (stub)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-slate-200">Context</Label>
              <textarea
                value={node.config?.context || ''}
                onChange={(e) => updateNodeConfig(node.id, { ...node.config, context: e.target.value })}
                placeholder="Provide context for next best action (use {{field}} variables)"
                className="w-full min-h-[120px] rounded-md bg-slate-800 border border-slate-700 text-slate-200 p-2"
              />
              <p className="text-xs text-slate-500 mt-1">Output stored in {'{{ai_route}}'}: {'{{type}}'}, {'{{title}}'}, {'{{details}}'}, {'{{priority}}'}</p>
            </div>
          </div>
        );

      case 'condition':
        return (
          <div className="space-y-4">
            <div>
              <Label className="text-slate-200">Condition</Label>
              <p className="text-sm text-slate-400 mb-3">
                Branch the workflow based on a field value
              </p>
            </div>

            <div>
              <Label className="text-slate-200">Field to Check</Label>
              <Select
                value={node.config?.field || ''}
                onValueChange={(value) => {
                  updateNodeConfig(node.id, { ...node.config, field: value });
                }}
              >
                <SelectTrigger className="bg-slate-800 border-slate-700 text-slate-200">
                  <SelectValue placeholder="Select field" />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700">
                  <SelectItem value="lead.status">Lead Status</SelectItem>
                  <SelectItem value="lead.score">Lead Score</SelectItem>
                  <SelectItem value="lead.source">Lead Source</SelectItem>
                  <SelectItem value="lead.company">Lead Company</SelectItem>
                  <SelectItem value="lead.email">Lead Email</SelectItem>
                  <SelectItem value="contact.status">Contact Status</SelectItem>
                  <SelectItem value="contact.email">Contact Email</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-slate-500 mt-1">
                This checks the field from the previous node&#39;s output
              </p>
            </div>

            <div>
              <Label className="text-slate-200">Operator</Label>
              <Select
                value={node.config?.operator || 'equals'}
                onValueChange={(value) => {
                  updateNodeConfig(node.id, { ...node.config, operator: value });
                }}
              >
                <SelectTrigger className="bg-slate-800 border-slate-700 text-slate-200">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700">
                  <SelectItem value="equals">Equals</SelectItem>
                  <SelectItem value="not_equals">Not Equals</SelectItem>
                  <SelectItem value="contains">Contains</SelectItem>
                  <SelectItem value="greater_than">Greater Than</SelectItem>
                  <SelectItem value="less_than">Less Than</SelectItem>
                  <SelectItem value="exists">Exists</SelectItem>
                  <SelectItem value="not_exists">Does Not Exist</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {node.config?.operator !== 'exists' && node.config?.operator !== 'not_exists' && (
              <div>
                <Label className="text-slate-200">Value to Compare</Label>
                <Input
                  value={node.config?.value || ''}
                  onChange={(e) => {
                    updateNodeConfig(node.id, { ...node.config, value: e.target.value });
                  }}
                  placeholder="Enter value or {{webhook_field}}"
                  className="bg-slate-800 border-slate-700 text-slate-200"
                />
                <p className="text-xs text-slate-500 mt-1">
                  Use {'{{field_name}}'} to reference webhook data
                </p>
              </div>
            )}

            <div className="bg-blue-900/20 border border-blue-700 rounded-lg p-3 mt-4">
              <p className="text-sm text-blue-300">
                <strong>How to connect:</strong> After saving, connect this node to two different nodes:
              </p>
              <ul className="text-xs text-blue-400 mt-2 space-y-1 ml-4 list-disc">
                <li>First connection = TRUE path (condition matches)</li>
                <li>Second connection = FALSE path (condition fails)</li>
              </ul>
            </div>
          </div>
        );

      case 'wait':
        return (
          <div className="space-y-4">
            <div>
              <Label className="text-slate-200">Wait Duration</Label>
              <div className="flex gap-2">
                <Input
                  type="number"
                  min="1"
                  value={node.config?.duration_value || 1}
                  onChange={(e) => {
                    updateNodeConfig(node.id, { ...node.config, duration_value: parseInt(e.target.value) || 1 });
                  }}
                  placeholder="1"
                  className="bg-slate-800 border-slate-700 text-slate-200 flex-1"
                />
                <Select
                  value={node.config?.duration_unit || 'minutes'}
                  onValueChange={(value) => {
                    updateNodeConfig(node.id, { ...node.config, duration_unit: value });
                  }}
                >
                  <SelectTrigger className="bg-slate-800 border-slate-700 text-slate-200 w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-800 border-slate-700">
                    <SelectItem value="seconds">Seconds</SelectItem>
                    <SelectItem value="minutes">Minutes</SelectItem>
                    <SelectItem value="hours">Hours</SelectItem>
                    <SelectItem value="days">Days</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Workflow will pause execution for the specified duration
              </p>
            </div>
            <div className="bg-amber-900/20 border border-amber-700 rounded-lg p-3">
              <p className="text-sm text-amber-300 font-semibold mb-2">
                ⚠️ Important Notes:
              </p>
              <ul className="text-xs text-amber-400 space-y-1 ml-4 list-disc">
                <li>Use for follow-up delays (e.g., wait 3 days then send email)</li>
                <li>Workflow execution continues after delay completes</li>
                <li>Maximum recommended: 7 days</li>
              </ul>
            </div>
          </div>
        );

      case 'send_sms':
        return (
          <div className="space-y-4">
            <div>
              <Label className="text-slate-200">To (Phone Number)</Label>
              {getAvailableFields().length > 0 ? (
                <Select
                  value={node.config?.to || ''}
                  onValueChange={(value) => {
                    updateNodeConfig(node.id, { ...node.config, to: `{{${value}}}` });
                  }}
                >
                  <SelectTrigger className="bg-slate-800 border-slate-700 text-slate-200">
                    <SelectValue placeholder="Select phone field" />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-800 border-slate-700">
                    {getAvailableFields().map(field => (
                      <SelectItem key={field} value={field}>
                        {'{{' + field + '}}'}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  value={node.config?.to || ''}
                  onChange={(e) => {
                    updateNodeConfig(node.id, { ...node.config, to: e.target.value });
                  }}
                  placeholder="{{phone}} or +1234567890"
                  className="bg-slate-800 border-slate-700 text-slate-200"
                />
              )}
              <p className="text-xs text-slate-500 mt-1">
                Use {'{{field_name}}'} to reference webhook data
              </p>
            </div>
            <div>
              <Label className="text-slate-200">Message</Label>
              <textarea
                value={node.config?.message || ''}
                onChange={(e) => {
                  updateNodeConfig(node.id, { ...node.config, message: e.target.value });
                }}
                maxLength={160}
                placeholder="SMS message. Use {{field_name}} for dynamic content."
                className="w-full min-h-[120px] rounded-md bg-slate-800 border border-slate-700 text-slate-200 p-2"
              />
              <p className="text-xs text-slate-500 mt-1">
                {(node.config?.message || '').length}/160 characters
              </p>
            </div>
            <div className="bg-fuchsia-900/20 border border-fuchsia-700 rounded-lg p-3">
              <p className="text-sm text-fuchsia-300 font-semibold mb-2">
                📱 SMS Integration:
              </p>
              <ul className="text-xs text-fuchsia-400 space-y-1 ml-4 list-disc">
                <li>Requires Twilio or SMS provider configuration</li>
                <li>Phone numbers must include country code (+1 for US)</li>
                <li>Keep messages under 160 characters to avoid splitting</li>
              </ul>
            </div>
          </div>
        );

      case 'assign_record':
        return (
          <div className="space-y-4">
            <div>
              <Label className="text-slate-200">Assignment Method</Label>
              <Select
                value={node.config?.method || 'specific_user'}
                onValueChange={(value) => {
                  updateNodeConfig(node.id, { ...node.config, method: value });
                }}
              >
                <SelectTrigger className="bg-slate-800 border-slate-700 text-slate-200">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700">
                  <SelectItem value="specific_user">Specific User</SelectItem>
                  <SelectItem value="round_robin">Round Robin</SelectItem>
                  <SelectItem value="least_assigned">Least Assigned</SelectItem>
                  <SelectItem value="record_owner">Record Owner</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {node.config?.method === 'specific_user' && (
              <div>
                <Label className="text-slate-200">User ID</Label>
                <Input
                  value={node.config?.user_id || ''}
                  onChange={(e) => {
                    updateNodeConfig(node.id, { ...node.config, user_id: e.target.value });
                  }}
                  placeholder="User UUID or {{webhook_field}}"
                  className="bg-slate-800 border-slate-700 text-slate-200"
                />
              </div>
            )}
            {node.config?.method === 'round_robin' && (
              <div>
                <Label className="text-slate-200">Round Robin Group</Label>
                <Input
                  value={node.config?.group || 'sales_team'}
                  onChange={(e) => {
                    updateNodeConfig(node.id, { ...node.config, group: e.target.value });
                  }}
                  placeholder="Team name (e.g., sales_team, support)"
                  className="bg-slate-800 border-slate-700 text-slate-200"
                />
                <p className="text-xs text-slate-500 mt-1">
                  Distributes records evenly among users in the specified group
                </p>
              </div>
            )}
            <div className="bg-lime-900/20 border border-lime-700 rounded-lg p-3">
              <p className="text-sm text-lime-300 font-semibold mb-2">
                👥 Assignment Methods:
              </p>
              <ul className="text-xs text-lime-400 space-y-1 ml-4 list-disc">
                <li>**Specific User**: Assign to a designated user ID</li>
                <li>**Round Robin**: Rotate assignments evenly across team</li>
                <li>**Least Assigned**: Assign to user with fewest active records</li>
                <li>**Record Owner**: Keep current owner (useful in update flows)</li>
              </ul>
            </div>
          </div>
        );

      case 'update_status':
        return (
          <div className="space-y-4">
            <div>
              <Label className="text-slate-200">Record Type</Label>
              <Select
                value={node.config?.record_type || 'lead'}
                onValueChange={(value) => {
                  updateNodeConfig(node.id, { ...node.config, record_type: value });
                }}
              >
                <SelectTrigger className="bg-slate-800 border-slate-700 text-slate-200">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700">
                  <SelectItem value="lead">Lead</SelectItem>
                  <SelectItem value="contact">Contact</SelectItem>
                  <SelectItem value="opportunity">Opportunity</SelectItem>
                  <SelectItem value="account">Account</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-slate-200">New Status</Label>
              <Input
                value={node.config?.new_status || ''}
                onChange={(e) => {
                  updateNodeConfig(node.id, { ...node.config, new_status: e.target.value });
                }}
                placeholder="e.g., 'qualified', 'contacted', 'closed won'"
                className="bg-slate-800 border-slate-700 text-slate-200"
              />
              <p className="text-xs text-slate-500 mt-1">
                Use exact status values from your CRM
              </p>
            </div>
            <div className="bg-sky-900/20 border border-sky-700 rounded-lg p-3">
              <p className="text-sm text-sky-300 font-semibold mb-2">
                📊 Common Status Updates:
              </p>
              <ul className="text-xs text-sky-400 space-y-1 ml-4 list-disc">
                <li>**Leads**: new, contacted, qualified, disqualified, converted</li>
                <li>**Opportunities**: prospecting, qualification, proposal, negotiation, closed won, closed lost</li>
                <li>**Contacts**: active, inactive, churned</li>
              </ul>
            </div>
          </div>
        );

      default:
        return (
          <div className="text-slate-400 text-sm">
            No configuration needed for this node type
          </div>
        );
    }
  };

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error('Please enter a workflow name');
      return;
    }

    if (nodes.length === 0) {
      toast.error('Add at least one node to your workflow');
      return;
    }

    if (!user) {
      toast.error('User not loaded. Please try again.');
      return;
    }

    setSaving(true);
    try {
      // Resolve tenant id with robust fallbacks
      let tenantId = user?.tenant_id ?? null;
      try {
        if (!tenantId && typeof window !== 'undefined') {
          const selected = localStorage.getItem('selected_tenant_id');
          if (selected) tenantId = selected;
        }
      } catch { /* noop */ }
      if (!tenantId && import.meta.env.DEV) {
        // Dev fallback to seeded tenant
        tenantId = '6cb4c008-4847-426a-9a2e-918ad70e7b69';
      }

      if (!tenantId) {
        toast.error('No tenant selected. Please choose a tenant and try again.');
        setSaving(false);
        return;
      }

      const workflowData = {
        tenant_id: tenantId,
        name,
        description,
        is_active: true,
        trigger: {
          type: 'webhook',
          config: {}
        },
        nodes,
        connections,
        webhook_url: workflow?.webhook_url || `${BACKEND_URL}/api/workflows/execute?workflow_id=PENDING`
      };

      console.log('[WorkflowBuilder] Saving workflow with nodes:', nodes);
      console.log('[WorkflowBuilder] Workflow data being sent:', workflowData);

      let savedWorkflow;
      if (workflow) {
        savedWorkflow = await Workflow.update(workflow.id, workflowData);
      } else {
        savedWorkflow = await Workflow.create(workflowData);
        console.log('[WorkflowBuilder] Created workflow:', savedWorkflow);

        if (!savedWorkflow || !savedWorkflow.id) {
          console.error('[WorkflowBuilder] Created workflow missing ID!', savedWorkflow);
          throw new Error('Failed to create workflow: No ID returned');
        }

        // Explicitly pass nodes and connections again to ensure they aren't lost
        // if the backend merge logic fails or if existing metadata is empty
        await Workflow.update(savedWorkflow.id, {
          webhook_url: `${BACKEND_URL}/api/workflows/execute?workflow_id=${savedWorkflow.id}`,
          nodes,
          connections,
          tenant_id: tenantId // Ensure tenant_id is passed
        });
      }

      toast.success('Workflow saved successfully');
      onSave();
    } catch (error) {
      console.error('Failed to save workflow:', error);
      toast.error('Failed to save workflow');
    } finally {
      setSaving(false);
    }
  };

  const selectedNode = nodes.find(node => node.id === selectedNodeId);

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-slate-700">
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <Label htmlFor="workflow-name" className="text-slate-300">Workflow Name</Label>
            <Input
              id="workflow-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Update Lead from Webhook"
              className="bg-slate-800 border-slate-700 text-slate-100"
            />
          </div>
          <div>
            <Label htmlFor="workflow-description" className="text-slate-300">Description</Label>
            <Input
              id="workflow-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What does this workflow do?"
              className="bg-slate-800 border-slate-700 text-slate-100"
            />
          </div>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden min-h-0">
        <div className="w-64 border-r border-slate-700 flex-shrink-0 flex flex-col">
          <style>{`
            .workflow-node-scroll::-webkit-scrollbar {
              width: 8px;
            }
            .workflow-node-scroll::-webkit-scrollbar-track {
              background: #1e293b;
            }
            .workflow-node-scroll::-webkit-scrollbar-thumb {
              background: #475569;
              border-radius: 4px;
            }
            .workflow-node-scroll::-webkit-scrollbar-thumb:hover {
              background: #64748b;
            }
          `}</style>
          <div className="workflow-node-scroll overflow-y-auto flex-1 p-4">
            <NodeLibrary onAddNode={handleAddNode} />
          </div>
        </div>

        <div className="flex-1 bg-slate-950 overflow-auto min-h-0">
          <WorkflowCanvas
            nodes={nodes}
            connections={connections}
            onUpdateNode={handleUpdateNode}
            onDeleteNode={handleDeleteNode}
            onConnect={handleConnect}
            onSelectNode={handleSelectNode}
            selectedNodeId={selectedNodeId}
          />
        </div>

        <div className="w-80 border-l border-slate-700 overflow-y-auto p-4 bg-slate-900 flex-shrink-0">
          <h3 className="text-lg font-semibold text-slate-100 mb-4">
            {selectedNode ? `${selectedNode.type.replace(/_/g, ' ').replace(/\b\w/g, char => char.toUpperCase())} Config` : 'Node Configuration'}
          </h3>
          {selectedNode ? (
            renderNodeConfig(selectedNode)
          ) : (
            <p className="text-slate-400 text-sm">Select a node to configure</p>
          )}
        </div>
      </div>

      <div className="p-4 border-t border-slate-700 flex justify-between">
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => setShowTemplates(!showTemplates)}
            className="border-purple-600 text-purple-400 hover:bg-purple-600/10"
          >
            <Sparkles className="w-4 h-4 mr-2" />
            Use Template
          </Button>
          <Button variant="outline" onClick={onCancel} className="border-slate-600 text-slate-300">
            Cancel
          </Button>
        </div>
        <div className="flex gap-2 items-center">
          <div className="flex items-center gap-2 mr-4">
            <Switch 
              id="auto-connect" 
              checked={autoConnect} 
              onCheckedChange={setAutoConnect} 
            />
            <Label htmlFor="auto-connect" className="text-slate-300 cursor-pointer text-sm">
              Auto-connect
            </Label>
          </div>
          <Button
            onClick={handleSave}
            disabled={saving}
            className="bg-purple-600 hover:bg-purple-700"
          >
            <Save className="w-4 h-4 mr-2" />
            {saving ? 'Saving...' : 'Save Workflow'}
          </Button>
        </div>
      </div>

      {/* Template Browser */}
      {showTemplates && (
        <div className="absolute inset-0 z-50 bg-slate-900">
          <WorkflowTemplatesBrowser
            onSelectTemplate={handleSelectTemplate}
            onClose={() => setShowTemplates(false)}
          />
        </div>
      )}
    </div>
  );
}
