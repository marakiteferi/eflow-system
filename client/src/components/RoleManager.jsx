import React, { useState, useEffect } from 'react';
import api from '../api';

const RoleManager = () => {
  const [departments, setDepartments] = useState([]);
  const [roles, setRoles] = useState([]);
  
  const [newDeptName, setNewDeptName] = useState('');
  
  // New Role Form State
  const [newRole, setNewRole] = useState({
    name: '',
    department_id: '',
    can_create_workflows: false,
    requires_workflow_approval: true,
    can_manage_users: false
  });

  const fetchData = async () => {
    try {
      const [deptRes, rolesRes] = await Promise.all([
        api.get('/admin/departments'),
        api.get('/admin/roles')
      ]);
      setDepartments(deptRes.data);
      setRoles(rolesRes.data);
    } catch (error) {
      console.error('Failed to load hierarchy data', error);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const handleCreateDepartment = async (e) => {
    e.preventDefault();
    if (!newDeptName.trim()) return;
    try {
      await api.post('/admin/departments', { name: newDeptName });
      setNewDeptName('');
      fetchData();
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to create department');
    }
  };

  const handleCreateRole = async (e) => {
    e.preventDefault();
    if (!newRole.name.trim()) return alert("Role name is required");
    try {
      await api.post('/admin/roles', {
        ...newRole,
        department_id: newRole.department_id === '' ? null : newRole.department_id
      });
      setNewRole({ name: '', department_id: '', can_create_workflows: false, requires_workflow_approval: true, can_manage_users: false });
      fetchData();
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to create role');
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
      
      {/* LEFT COLUMN: Departments */}
      <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
        <h3 className="text-xl font-bold text-gray-800 mb-4 border-b pb-2">University Departments</h3>
        <form onSubmit={handleCreateDepartment} className="flex gap-2 mb-6">
          <input 
            type="text" placeholder="e.g. Computer Science" value={newDeptName} onChange={(e) => setNewDeptName(e.target.value)}
            className="flex-grow px-3 py-2 border rounded focus:ring-2 focus:ring-indigo-500 outline-none"
          />
          <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded font-bold hover:bg-blue-700 shadow-sm">Add</button>
        </form>
        
        <ul className="divide-y divide-gray-100">
          {departments.map(dept => (
            <li key={dept.id} className="py-3 text-gray-700 font-medium flex items-center before:content-['🏢'] before:mr-3">
              {dept.name}
            </li>
          ))}
          {departments.length === 0 && <p className="text-gray-500 text-sm">No departments created yet.</p>}
        </ul>
      </div>

      {/* RIGHT COLUMN: Custom Roles */}
      <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
        <h3 className="text-xl font-bold text-gray-800 mb-4 border-b pb-2">Dynamic Roles</h3>
        
        <form onSubmit={handleCreateRole} className="mb-8 space-y-4 bg-gray-50 p-4 rounded-lg border border-gray-200">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-gray-600 mb-1">Role Title</label>
              <input type="text" placeholder="e.g. Department Head" value={newRole.name} onChange={(e) => setNewRole({...newRole, name: e.target.value})} className="w-full px-3 py-2 border rounded" required />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-600 mb-1">Scope (Optional)</label>
              <select value={newRole.department_id} onChange={(e) => setNewRole({...newRole, department_id: e.target.value})} className="w-full px-3 py-2 border rounded bg-white">
                <option value="">-- Global / Cross-Department --</option>
                {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
          </div>
          
          <div className="space-y-2 pt-2">
            <label className="flex items-center space-x-3 cursor-pointer">
              <input type="checkbox" checked={newRole.can_create_workflows} onChange={(e) => setNewRole({...newRole, can_create_workflows: e.target.checked})} className="w-5 h-5 text-indigo-600 rounded border-gray-300 focus:ring-indigo-500" />
              <span className="text-sm font-medium text-gray-800">Can Create & Edit Workflows</span>
            </label>
            {newRole.can_create_workflows && (
              <label className="flex items-center space-x-3 cursor-pointer pl-8">
                <input type="checkbox" checked={newRole.requires_workflow_approval} onChange={(e) => setNewRole({...newRole, requires_workflow_approval: e.target.checked})} className="w-4 h-4 text-indigo-600 rounded border-gray-300 focus:ring-indigo-500" />
                <span className="text-sm font-medium text-gray-600">Workflows require Admin Approval before activating</span>
              </label>
            )}
            <label className="flex items-center space-x-3 cursor-pointer">
              <input type="checkbox" checked={newRole.can_manage_users} onChange={(e) => setNewRole({...newRole, can_manage_users: e.target.checked})} className="w-5 h-5 text-indigo-600 rounded border-gray-300 focus:ring-indigo-500" />
              <span className="text-sm font-medium text-gray-800">Can Manage Users & Permissions</span>
            </label>
          </div>
          <button type="submit" className="w-full bg-indigo-600 text-white py-2 rounded font-bold hover:bg-indigo-700 shadow-sm mt-4">Generate Custom Role</button>
        </form>

        <div className="overflow-y-auto max-h-60">
          <ul className="divide-y divide-gray-100">
            {roles.map(role => (
              <li key={role.id} className="py-3 flex flex-col gap-1">
                <div className="flex justify-between">
                  <span className="font-bold text-gray-800">{role.name}</span>
                  <span className="text-xs font-bold text-white bg-gray-600 px-2 py-1 rounded-full">{role.department_name || 'Global'}</span>
                </div>
                <div className="flex gap-2 text-[10px] uppercase font-bold text-gray-500 tracking-wider">
                  {role.can_create_workflows && <span className="text-indigo-600">Workflows</span>}
                  {role.can_manage_users && <span className="text-green-600">Users</span>}
                </div>
              </li>
            ))}
            {roles.length === 0 && <p className="text-gray-500 text-sm">No custom roles created.</p>}
          </ul>
        </div>
      </div>
    </div>
  );
};

export default RoleManager;