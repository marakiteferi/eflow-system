import React, { useState, useEffect, useCallback, useMemo } from 'react';
import ReactFlow, { addEdge, applyNodeChanges, applyEdgeChanges, Background, Controls, Handle, Position, MarkerType } from 'reactflow';
import 'reactflow/dist/style.css';
import api from '../api';

// ==========================================
// 1. CUSTOM NODE: Standard Task (NOW WITH CHECKLIST!)
// ==========================================
const TaskNode = ({ id, data }) => {
  const [newTask, setNewTask] = useState('');

  const handleAddTask = () => {
    if (newTask.trim() !== '') {
      data.onAddChecklistItem(id, newTask.trim());
      setNewTask('');
    }
  };

  return (
    <div className="bg-white border-2 border-blue-500 rounded-lg p-3 shadow-md w-[240px]">
      <Handle type="target" position={Position.Top} className="w-3 h-3 bg-blue-500" />
      
      {/* Node Header */}
      <div className="font-bold text-sm text-gray-800 border-b pb-1 mb-2">
        <input 
          type="text" value={data.label} onChange={(e) => data.onLabelChange(id, e.target.value)} 
          className="w-full outline-none nodrag bg-transparent" placeholder="Task Name" 
        />
      </div>
      
      {/* Assignee Selection */}
      <div className="text-xs text-gray-500 mb-2">Assign to:</div>
      <select 
        className="w-full text-xs border border-gray-300 rounded p-1 nodrag bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 mb-3" 
        value={data.assignee || ''} onChange={(e) => data.onAssign(id, e.target.value)}
      >
        <option value="">-- Any Staff --</option>
        {data.staffList && data.staffList.map(staff => <option key={staff.id} value={staff.id}>{staff.name}</option>)}
      </select>

      {/* NEW: Mandatory Checklist Builder */}
      <div className="bg-gray-50 border border-gray-200 rounded p-2 nodrag">
        <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2">Mandatory Checklist</div>
        
        {/* Render Existing Items */}
        <ul className="space-y-1 mb-2">
          {(data.checklist || []).map((item, index) => (
            <li key={index} className="flex justify-between items-start bg-white border border-gray-100 p-1 rounded text-xs shadow-sm">
              <span className="text-gray-700 leading-tight">{item}</span>
              <button onClick={() => data.onRemoveChecklistItem(id, index)} className="text-red-500 font-bold hover:text-red-700 ml-1">&times;</button>
            </li>
          ))}
        </ul>

        {/* Input to Add New Item */}
        <div className="flex gap-1">
          <input 
            type="text" value={newTask} onChange={e => setNewTask(e.target.value)} 
            onKeyDown={(e) => e.key === 'Enter' && handleAddTask()}
            placeholder="e.g. Verify Signature" 
            className="text-xs border border-gray-300 rounded p-1 w-full focus:outline-none focus:border-blue-400" 
          />
          <button onClick={handleAddTask} className="bg-blue-500 text-white px-2 rounded text-xs font-bold hover:bg-blue-600 transition-colors">+</button>
        </div>
      </div>

      <Handle type="source" position={Position.Bottom} className="w-3 h-3 bg-blue-500" />
    </div>
  );
};

// ==========================================
// 2. CUSTOM NODE: Conditional Branch (If/Else)
// ==========================================
const ConditionNode = ({ id, data }) => (
  <div className="bg-amber-50 border-2 border-amber-500 rounded-lg p-3 shadow-md w-[220px]">
    <Handle type="target" position={Position.Top} className="w-3 h-3 bg-amber-500" />
    <div className="font-bold text-sm text-amber-900 border-b border-amber-200 pb-1 mb-2 flex items-center gap-2">
      <span>🔀</span> Condition (If Tag Matches)
    </div>
    <div className="text-xs text-amber-700 mb-1">If Document Tag is exactly:</div>
    <input 
      type="text" value={data.conditionValue || ''} onChange={(e) => data.onConditionChange(id, e.target.value)} 
      className="w-full text-xs border border-amber-300 rounded p-1 nodrag bg-white focus:outline-none focus:ring-1 focus:ring-amber-500" 
      placeholder="e.g. Urgent, Finance..." 
    />
    <Handle type="source" position={Position.Bottom} id="true" style={{ left: '25%', background: '#22c55e', width: '12px', height: '12px' }} />
    <div className="absolute -bottom-5 left-[15%] text-[10px] font-bold text-green-600">TRUE</div>
    <Handle type="source" position={Position.Bottom} id="false" style={{ left: '75%', background: '#ef4444', width: '12px', height: '12px' }} />
    <div className="absolute -bottom-5 left-[65%] text-[10px] font-bold text-red-600">FALSE</div>
  </div>
);

// ==========================================
// MAIN BUILDER COMPONENT
// ==========================================
const WorkflowBuilder = () => {
  const [nodes, setNodes] = useState([]);
  const [edges, setEdges] = useState([]);
  const [workflowName, setWorkflowName] = useState('');
  const [staffList, setStaffList] = useState([]);
  const [savedWorkflows, setSavedWorkflows] = useState([]);
  const [selectedWorkflowId, setSelectedWorkflowId] = useState('');

  const nodeTypes = useMemo(() => ({ task: TaskNode, condition: ConditionNode }), []);

  const fetchWorkflows = async () => {
    try {
      const res = await api.get('/workflows');
      setSavedWorkflows(res.data);
    } catch (err) { console.error('Failed to load workflows', err); }
  };

  useEffect(() => {
    const fetchStaff = async () => {
      try {
        const res = await api.get('/admin/users');
        setStaffList(res.data.filter(u => u.role_id === 2 || u.role_name === 'Staff' || u.role_id > 3));
      } catch (err) { console.error(err); }
    };
    fetchStaff();
    fetchWorkflows();
  }, []);

  const onNodesChange = useCallback((changes) => setNodes((nds) => applyNodeChanges(changes, nds)), []);
  const onEdgesChange = useCallback((changes) => setEdges((eds) => applyEdgeChanges(changes, eds)), []);
  
  const onConnect = useCallback((params) => {
    let edgeStyle = { stroke: '#9ca3af', strokeWidth: 2 };
    let animated = false;
    if (params.sourceHandle === 'true') { edgeStyle.stroke = '#22c55e'; animated = true; }
    if (params.sourceHandle === 'false') { edgeStyle.stroke = '#ef4444'; }

    const newEdge = { ...params, type: 'smoothstep', style: edgeStyle, animated, markerEnd: { type: MarkerType.ArrowClosed, color: edgeStyle.stroke } };
    setEdges((eds) => addEdge(newEdge, eds));
  }, []);

  // Update Functions for Nodes
  const onLabelChange = (id, newLabel) => setNodes(nds => nds.map(n => n.id === id ? { ...n, data: { ...n.data, label: newLabel } } : n));
  const onAssign = (id, newAssignee) => setNodes(nds => nds.map(n => n.id === id ? { ...n, data: { ...n.data, assignee: newAssignee } } : n));
  const onConditionChange = (id, newValue) => setNodes(nds => nds.map(n => n.id === id ? { ...n, data: { ...n.data, conditionValue: newValue } } : n));
  
  // NEW: Checklist State Handlers
  const onAddChecklistItem = (id, itemStr) => {
    setNodes(nds => nds.map(n => {
      if (n.id === id) {
        const currentList = n.data.checklist || [];
        return { ...n, data: { ...n.data, checklist: [...currentList, itemStr] } };
      }
      return n;
    }));
  };

  const onRemoveChecklistItem = (id, indexToRemove) => {
    setNodes(nds => nds.map(n => {
      if (n.id === id) {
        const currentList = n.data.checklist || [];
        return { ...n, data: { ...n.data, checklist: currentList.filter((_, idx) => idx !== indexToRemove) } };
      }
      return n;
    }));
  };

  // Toolbar Actions
  const addTaskNode = () => {
    const newNode = {
      id: `task_${Date.now()}`, type: 'task', position: { x: 250, y: nodes.length * 150 + 50 },
      data: { label: `Review Step`, staffList, assignee: '', checklist: [], onAssign, onLabelChange, onAddChecklistItem, onRemoveChecklistItem },
    };
    setNodes((nds) => nds.concat(newNode));
  };

  const addConditionNode = () => {
    const newNode = {
      id: `cond_${Date.now()}`, type: 'condition', position: { x: 450, y: nodes.length * 150 + 50 },
      data: { conditionValue: '', onConditionChange },
    };
    setNodes((nds) => nds.concat(newNode));
  };

  // Re-inject functions into loaded nodes
  useEffect(() => {
    setNodes((nds) => nds.map(node => ({
      ...node,
      data: { ...node.data, staffList, onAssign, onLabelChange, onConditionChange, onAddChecklistItem, onRemoveChecklistItem }
    })));
  }, [staffList]);

  const handleLoadWorkflow = (e) => {
    const wfId = e.target.value;
    setSelectedWorkflowId(wfId);
    if (!wfId) { setNodes([]); setEdges([]); setWorkflowName(''); return; }

    const wf = savedWorkflows.find(w => w.id === parseInt(wfId));
    if (wf) {
      setWorkflowName(wf.name);
      const flowData = typeof wf.flow_structure === 'string' ? JSON.parse(wf.flow_structure) : wf.flow_structure;
      const loadedNodes = (flowData.nodes || []).map(node => ({
        ...node, data: { ...node.data, checklist: node.data.checklist || [], staffList, onAssign, onLabelChange, onConditionChange, onAddChecklistItem, onRemoveChecklistItem }
      }));
      setNodes(loadedNodes); setEdges(flowData.edges || []);
    }
  };

  const saveWorkflow = async () => {
    if (!workflowName) return alert('Enter a workflow name');
    try {
      const flowData = JSON.stringify({ nodes, edges });
      if (selectedWorkflowId) {
        await api.put(`/workflows/${selectedWorkflowId}`, { name: workflowName, flow_structure: flowData });
        alert('Workflow updated successfully!');
      } else {
        await api.post('/workflows', { name: workflowName, flow_structure: flowData });
        alert('New workflow created successfully!');
      }
      fetchWorkflows();
    } catch (err) { alert('Failed to save workflow'); }
  };

  return (
    <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
      <div className="flex gap-4 mb-6 pb-4 border-b border-gray-200 items-center">
        <span className="text-sm font-bold text-gray-700">Manage:</span>
        <select value={selectedWorkflowId} onChange={handleLoadWorkflow} className="flex-grow px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500">
          <option value="">+ Create New Workflow</option>
          {savedWorkflows.map(wf => <option key={wf.id} value={wf.id}>{wf.name}</option>)}
        </select>
      </div>

      <div className="flex gap-3 mb-4 items-center">
        <input 
          type="text" placeholder="Workflow Name" value={workflowName} onChange={(e) => setWorkflowName(e.target.value)}
          className="w-1/3 px-3 py-2 border border-gray-300 rounded-md font-bold text-gray-800"
        />
        <div className="h-8 w-px bg-gray-300 mx-2"></div>
        <button onClick={addTaskNode} className="bg-blue-50 text-blue-700 border border-blue-200 px-4 py-2 rounded-md hover:bg-blue-100 font-bold shadow-sm flex items-center gap-2">
          <span className="text-blue-500">📄</span> + Task
        </button>
        <button onClick={addConditionNode} className="bg-amber-50 text-amber-700 border border-amber-200 px-4 py-2 rounded-md hover:bg-amber-100 font-bold shadow-sm flex items-center gap-2">
          <span className="text-amber-500">🔀</span> + Condition
        </button>

        <div className="flex-grow"></div>
        <button onClick={saveWorkflow} className="bg-indigo-600 text-white px-6 py-2 rounded-md hover:bg-indigo-700 font-bold shadow-sm">
          {selectedWorkflowId ? 'Update Flow' : 'Save Flow'}
        </button>
      </div>

      <div className="h-[600px] border-2 border-slate-300 rounded-xl bg-slate-50 relative overflow-hidden shadow-inner">
        <ReactFlow nodes={nodes} edges={edges} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect} nodeTypes={nodeTypes} fitView>
          <Background color="#94a3b8" gap={24} size={2} />
          <Controls />
        </ReactFlow>
      </div>
    </div>
  );
};

export default WorkflowBuilder;