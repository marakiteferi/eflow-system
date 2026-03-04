import { useContext, useEffect, useState, useCallback } from 'react';
import { AuthContext } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import WorkflowBuilder from '../components/WorkflowBuilder';
import DocumentUpload from '../components/DocumentUpload';
import DocumentDetailsModal from '../components/DocumentDetailsModal';
import RoleManager from '../components/RoleManager';
import api from '../api';

const Dashboard = () => {
  const { user, logout } = useContext(AuthContext);
  const navigate = useNavigate();
  
  const [documents, setDocuments] = useState([]);
  const [viewingDocument, setViewingDocument] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  
  const [auditLogs, setAuditLogs] = useState([]);
  const [usersList, setUsersList] = useState([]);
  const [adminView, setAdminView] = useState('overview');
  const [adminStats, setAdminStats] = useState(null);
  const [dynamicRoles, setDynamicRoles] = useState([]);
  
  // NEW: Workflows state for the checklist logic
  const [workflows, setWorkflows] = useState([]);

  // Modal States
  const [showOtpModal, setShowOtpModal] = useState(false);
  const [selectedDocId, setSelectedDocId] = useState(null);
  const [otpInput, setOtpInput] = useState('');
  
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectComment, setRejectComment] = useState('');
  const [showResubmitModal, setShowResubmitModal] = useState(false);
  const [resubmitDocId, setResubmitDocId] = useState(null);
  const [resubmitFile, setResubmitFile] = useState(null);
  const [isResubmitting, setIsResubmitting] = useState(false);

  // NEW: Checklist Modal States
  const [showChecklistModal, setShowChecklistModal] = useState(false);
  const [currentChecklist, setCurrentChecklist] = useState([]);
  const [checkedItems, setCheckedItems] = useState([]);

  const isStudent = user?.role_id === 1;
  const isStaffOrReviewer = user?.role_id === 2 || user?.role_id > 3;
  const canManageUsers = user?.role_id === 3 || user?.can_manage_users;
  const canCreateWorkflows = user?.role_id === 3 || user?.can_create_workflows;

  const fetchData = useCallback(async () => {
    try {
      if (isStudent || isStaffOrReviewer) {
        const docResponse = await api.get('/documents');
        setDocuments(docResponse.data);
      }
      if (isStaffOrReviewer) {
        // Staff need workflow data to read the checklists!
        const wfResponse = await api.get('/workflows');
        setWorkflows(wfResponse.data);
      }
      if (canManageUsers || canCreateWorkflows) {
        const logsResponse = await api.get('/admin/audit-logs');
        setAuditLogs(logsResponse.data);
        const statsResponse = await api.get('/admin/stats');
        setAdminStats(statsResponse.data);
      }
      if (canManageUsers) {
        const usersResponse = await api.get('/admin/users');
        setUsersList(usersResponse.data);
        const rolesResponse = await api.get('/admin/roles');
        setDynamicRoles(rolesResponse.data);
      }
    } catch (error) {
      console.error("Failed to fetch data", error);
    }
  }, [isStudent, isStaffOrReviewer, canManageUsers, canCreateWorkflows]);

  useEffect(() => {
    if (user) fetchData();
  }, [user, fetchData]);

  useEffect(() => {
    if (canManageUsers || canCreateWorkflows) {
        setAdminView(prev => prev || 'overview');
    }
  }, [canManageUsers, canCreateWorkflows]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const handleRoleChange = async (targetUserId, newRoleId) => {
    if (targetUserId === user.id) return alert("You cannot change your own role!");
    try {
      await api.put(`/admin/users/${targetUserId}/role`, { role_id: parseInt(newRoleId) });
      alert('User role updated!');
      fetchData(); 
    } catch (error) {
      console.error('Failed to update role', error);
    }
  };

  // ==========================================
  // NEW: The Checklist Lock Engine
  // ==========================================
  const handleRequestApproval = async (docId) => {
    const doc = documents.find(d => d.id === docId);
    setSelectedDocId(docId);

    let checklist = [];
    
    // Check if this document's current node has a mandatory checklist
    if (doc && doc.workflow_id && doc.current_node_id) {
      const wf = workflows.find(w => w.id === doc.workflow_id);
      if (wf) {
        const flowData = typeof wf.flow_structure === 'string' ? JSON.parse(wf.flow_structure) : wf.flow_structure;
        const currentNode = (flowData.nodes || []).find(n => n.id === doc.current_node_id);
        
        if (currentNode && currentNode.data?.checklist && currentNode.data.checklist.length > 0) {
          checklist = currentNode.data.checklist;
        }
      }
    }

    if (checklist.length > 0) {
      // If a checklist exists, lock the approval and open the checklist modal
      setCurrentChecklist(checklist);
      setCheckedItems([]); // Reset checked boxes
      setShowChecklistModal(true);
    } else {
      // If no checklist exists, proceed straight to OTP
      proceedToOtp(docId);
    }
  };

  const proceedToOtp = async (docId) => {
    try {
      await api.post('/approvals/request-otp', { documentId: docId });
      setShowChecklistModal(false);
      setShowOtpModal(true);
    } catch (err) {
      console.error(err);
      alert('Failed to request OTP');
    }
  };

  const handleSubmitOtp = async () => {
    try {
      await api.post('/approvals/approve', { documentId: selectedDocId, otp: otpInput, comments: 'Verified by Staff' });
      setShowOtpModal(false);
      setOtpInput('');
      fetchData(); 
      alert('Approved successfully!');
    } catch (err) {
      alert(err.response?.data?.message || 'Invalid OTP');
    }
  };

  // ... (Reject and Resubmit logic remains exactly the same) ...
  const openRejectModal = (docId) => {
    setSelectedDocId(docId);
    setRejectComment('');
    setShowRejectModal(true);
  };

  const handleRejectSubmit = async () => {
    if (!rejectComment.trim()) return alert('Reason required.');
    try {
      await api.post('/approvals/reject', { documentId: selectedDocId, comments: rejectComment });
      setShowRejectModal(false);
      setRejectComment('');
      fetchData();
    } catch (error) {
      console.error(error);
    }
  };

  const openResubmitModal = (docId) => {
    setResubmitDocId(docId);
    setResubmitFile(null);
    setShowResubmitModal(true);
  };

  const handleResubmit = async () => {
    if (!resubmitFile) return alert('Please select a new file.');
    setIsResubmitting(true);
    const formData = new FormData();
    formData.append('document', resubmitFile);

    try {
      await api.put(`/documents/resubmit/${resubmitDocId}`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      alert('Document successfully resubmitted!');
      setShowResubmitModal(false);
      setResubmitFile(null);
      fetchData(); 
    } catch (error) {
      alert('Failed to resubmit document.');
    } finally {
      setIsResubmitting(false);
    }
  };

  const filteredDocs = documents.filter(doc => {
    const titleMatch = doc.title?.toLowerCase().includes(searchQuery.toLowerCase());
    const textMatch = doc.extracted_text?.toLowerCase().includes(searchQuery.toLowerCase());
    return titleMatch || textMatch;
  });

  const renderDashboardContent = () => {
    return (
      <div className="space-y-8">
        
        {/* SECTION 1: Standard Document Upload & Submissions */}
        {(isStudent || isStaffOrReviewer) && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <DocumentUpload onUploadSuccess={fetchData} />
            
            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-3">
                <h3 className="text-xl font-semibold">My Submissions</h3>
                <input 
                  type="text" placeholder="Search title or OCR text..." 
                  className="w-full sm:w-auto px-3 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>

              {filteredDocs.filter(d => d.submitter_id === user.id).length === 0 ? (
                <p className="text-gray-500">No documents found.</p>
              ) : (
                <ul className="divide-y divide-gray-200">
                  {filteredDocs.filter(d => d.submitter_id === user.id).map((doc) => (
                    <li key={doc.id} className="py-3 flex flex-col gap-2">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-medium text-blue-600 cursor-pointer hover:underline" onClick={() => setViewingDocument(doc)}>{doc.title}</p>
                          <p className="text-sm text-gray-500">{new Date(doc.created_at).toLocaleDateString()}</p>
                        </div>
                        <div className="flex flex-col items-end gap-2">
                          <span className={`px-3 py-1 text-xs font-semibold rounded-full ${doc.status === 'Approved' ? 'bg-green-100 text-green-800' : doc.status === 'Rejected' ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800'}`}>
                            {doc.status}
                          </span>
                          {doc.status === 'Rejected' && (
                            <button onClick={() => openResubmitModal(doc.id)} className="text-xs bg-indigo-100 text-indigo-700 px-3 py-1 rounded hover:bg-indigo-200 font-bold transition-colors">Fix & Resubmit</button>
                          )}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}

        {/* SECTION 2: Staff Review Queue */}
        {isStaffOrReviewer && (
          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 border-l-4 border-l-yellow-400 mt-8">
            <h3 className="text-xl font-semibold mb-4">My Review Queue</h3>
            {filteredDocs.filter(d => d.status === 'Pending').length === 0 ? (
              <p className="text-gray-500">No pending documents to review.</p>
            ) : (
              <ul className="divide-y divide-gray-200">
                {filteredDocs.filter(d => d.status === 'Pending').map((doc) => (
                  <li key={doc.id} className="py-4 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
                    <div>
                      <p className="font-medium text-gray-900">{doc.title}</p>
                      <p className="text-sm text-gray-500">Submitted on: {new Date(doc.created_at).toLocaleDateString()}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button onClick={() => setViewingDocument(doc)} className="bg-blue-50 text-blue-600 px-3 py-1 rounded hover:bg-blue-100 font-medium text-sm">View Details</button>
                      <button onClick={() => openRejectModal(doc.id)} className="bg-red-50 text-red-600 px-3 py-1 rounded hover:bg-red-100 font-medium text-sm">Reject</button>
                      
                      {/* THIS BUTTON NOW TRIGGERS THE CHECKLIST ENGINE */}
                      <button onClick={() => handleRequestApproval(doc.id)} className="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 font-medium text-sm">Approve</button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* SECTION 3: Administrative Powers */}
        {(canManageUsers || canCreateWorkflows) && (
          <div className="space-y-6 mt-8">
            <div className="bg-white p-4 rounded-lg flex flex-wrap gap-2 border border-gray-200 shadow-sm items-center">
              <span className="text-gray-800 font-bold mr-4">Admin Tools:</span>
              <button onClick={() => setAdminView('overview')} className={`px-4 py-2 rounded text-sm font-medium transition-colors ${adminView === 'overview' ? 'bg-indigo-600 text-white' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'}`}>Overview</button>
              {canCreateWorkflows && <button onClick={() => setAdminView('workflows')} className={`px-4 py-2 rounded text-sm font-medium transition-colors ${adminView === 'workflows' ? 'bg-indigo-600 text-white' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'}`}>Workflow Builder</button>}
              {canManageUsers && <button onClick={() => setAdminView('users')} className={`px-4 py-2 rounded text-sm font-medium transition-colors ${adminView === 'users' ? 'bg-indigo-600 text-white' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'}`}>Users</button>}
              <button onClick={() => setAdminView('logs')} className={`px-4 py-2 rounded text-sm font-medium transition-colors ${adminView === 'logs' ? 'bg-indigo-600 text-white' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'}`}>Audit Logs</button>
              {canManageUsers && <button onClick={() => setAdminView('hierarchy')} className={`px-4 py-2 rounded text-sm font-medium transition-colors ${adminView === 'hierarchy' ? 'bg-indigo-600 text-white' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'}`}>Hierarchy</button>}
            </div>

            {adminView === 'overview' && adminStats && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-200 border-l-4 border-l-blue-500">
                  <h4 className="text-gray-500 text-sm font-medium uppercase tracking-wider mb-2">Total Documents</h4>
                  <p className="text-3xl font-bold text-gray-800">{adminStats.documents.total}</p>
                </div>
                <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-200 border-l-4 border-l-yellow-400">
                  <h4 className="text-gray-500 text-sm font-medium uppercase tracking-wider mb-2">Pending Review</h4>
                  <p className="text-3xl font-bold text-gray-800">{adminStats.documents.pending}</p>
                </div>
                <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-200 border-l-4 border-l-green-500">
                  <h4 className="text-gray-500 text-sm font-medium uppercase tracking-wider mb-2">Fully Approved</h4>
                  <p className="text-3xl font-bold text-gray-800">{adminStats.documents.approved}</p>
                </div>
                <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-200 border-l-4 border-l-red-500">
                  <h4 className="text-gray-500 text-sm font-medium uppercase tracking-wider mb-2">Rejected</h4>
                  <p className="text-3xl font-bold text-gray-800">{adminStats.documents.rejected}</p>
                </div>
              </div>
            )}

            {adminView === 'workflows' && canCreateWorkflows && <WorkflowBuilder />}
            {adminView === 'hierarchy' && canManageUsers && <RoleManager />}
            
            {adminView === 'users' && canManageUsers && (
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Email</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Role</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200 text-sm">
                    {usersList.map((listUser) => (
                      <tr key={listUser.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap font-medium text-gray-900">{listUser.name}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-gray-500">{listUser.email}</td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <select 
                            className="block w-full pl-3 pr-10 py-2 text-base border-gray-300 rounded-md"
                            value={listUser.role_id || ''}
                            onChange={(e) => handleRoleChange(listUser.id, e.target.value)}
                            disabled={listUser.id === user.id}
                          >
                            <option value={1}>Student (Legacy)</option>
                            <option value={2}>Staff (Legacy)</option>
                            <option value={3}>Super Admin</option>
                            <optgroup label="Custom Roles">
                              {dynamicRoles.map(role => (
                                <option key={role.id} value={role.id}>{role.name}</option>
                              ))}
                            </optgroup>
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {adminView === 'logs' && (
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden flex flex-col">
                <div className="p-4 bg-gray-50 border-b border-gray-200 flex justify-between items-center">
                  <h4 className="text-sm font-bold text-gray-700 uppercase tracking-wider">System Audit Trail</h4>
                  <button 
                    onClick={() => {
                      if (auditLogs.length === 0) return alert('No logs to export.');
                      let csvContent = "data:text/csv;charset=utf-8,Timestamp,Action,Document,User\n";
                      auditLogs.forEach(log => {
                        const date = new Date(log.timestamp).toLocaleString().replace(/,/g, ''); 
                        csvContent += `${date},"${log.action}","${log.document_title || 'System'}","${log.user_name || 'System'}"\n`;
                      });
                      const link = document.createElement("a");
                      link.setAttribute("href", encodeURI(csvContent));
                      link.setAttribute("download", `Eflow_Audit_Logs.csv`);
                      document.body.appendChild(link); link.click(); document.body.removeChild(link);
                    }}
                    className="bg-green-600 text-white px-4 py-2 rounded text-sm font-medium hover:bg-green-700"
                  >
                    📥 Export
                  </button>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Time</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Action</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Document</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">User</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200 text-sm">
                      {auditLogs.map((log) => (
                        <tr key={log.id} className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap text-gray-500">{new Date(log.timestamp).toLocaleString()}</td>
                          <td className="px-6 py-4 whitespace-nowrap font-medium text-gray-900">{log.action}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-gray-600">{log.document_title || 'System Action'}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-gray-600">{log.user_name || 'System'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <nav className="bg-white shadow-sm px-6 py-4 flex flex-wrap justify-between items-center gap-4 border-b border-gray-200">
        <h1 className="text-2xl font-black text-indigo-700 tracking-tight">E-flow</h1>
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-600 hidden sm:inline">Logged in as: <span className="font-bold text-gray-900">{user?.name}</span></span>
          <button onClick={() => navigate('/profile')} className="text-sm text-indigo-600 hover:text-indigo-800 font-bold border-r border-gray-300 pr-4">My Profile</button>
          <button onClick={handleLogout} className="text-sm text-red-600 hover:text-red-800 font-bold">Logout</button>
        </div>
      </nav>
      
      <main className="flex-grow max-w-7xl w-full mx-auto py-8 px-4 sm:px-6 lg:px-8">
        {renderDashboardContent()}

        {/* MODAL 1: MANDATORY CHECKLIST */}
        {showChecklistModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white p-6 rounded-xl shadow-lg w-full max-w-md border-t-4 border-amber-500">
              <h3 className="text-xl font-black text-gray-800 mb-2">Mandatory Tasks</h3>
              <p className="text-sm text-gray-600 mb-4">You must complete all checklist items to unlock approval.</p>
              
              <div className="space-y-3 mb-6">
                {currentChecklist.map((item, idx) => (
                  <label key={idx} className="flex items-start gap-3 p-3 bg-gray-50 border border-gray-200 rounded cursor-pointer hover:bg-gray-100 transition-colors">
                    <input 
                      type="checkbox" 
                      className="mt-1 w-5 h-5 text-indigo-600 rounded border-gray-300 focus:ring-indigo-500"
                      checked={checkedItems.includes(idx)}
                      onChange={(e) => {
                        if (e.target.checked) setCheckedItems([...checkedItems, idx]);
                        else setCheckedItems(checkedItems.filter(i => i !== idx));
                      }}
                    />
                    <span className="text-sm font-medium text-gray-800 leading-snug">{item}</span>
                  </label>
                ))}
              </div>

              <div className="flex justify-end gap-3">
                <button onClick={() => setShowChecklistModal(false)} className="px-4 py-2 text-gray-600 font-bold hover:bg-gray-100 rounded">Cancel</button>
                <button 
                  onClick={() => proceedToOtp(selectedDocId)} 
                  disabled={checkedItems.length !== currentChecklist.length}
                  className={`px-4 py-2 rounded font-bold text-white transition-colors ${checkedItems.length === currentChecklist.length ? 'bg-indigo-600 hover:bg-indigo-700 shadow-md' : 'bg-gray-300 cursor-not-allowed text-gray-500'}`}
                >
                  Proceed to Sign
                </button>
              </div>
            </div>
          </div>
        )}

        {/* MODAL 2: OTP / 2FA */}
        {showOtpModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white p-6 rounded-xl shadow-lg w-full max-w-sm">
              <h3 className="text-lg font-bold mb-2">2FA Authentication</h3>
              <input type="text" placeholder="Enter OTP" className="w-full px-3 py-2 border rounded-md mb-4" value={otpInput} onChange={(e) => setOtpInput(e.target.value)} />
              <div className="flex justify-end gap-2">
                <button onClick={() => setShowOtpModal(false)} className="px-4 py-2 text-gray-600">Cancel</button>
                <button onClick={handleSubmitOtp} className="px-4 py-2 bg-green-600 text-white rounded font-bold">Verify</button>
              </div>
            </div>
          </div>
        )}

        {/* MODAL 3: REJECT */}
        {showRejectModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white p-6 rounded-xl shadow-lg w-full max-w-md">
              <h3 className="text-lg font-bold text-red-600 mb-2">Reject Document</h3>
              <textarea className="w-full px-3 py-2 border rounded-md mb-4" rows="3" placeholder="Reason..." value={rejectComment} onChange={(e) => setRejectComment(e.target.value)} />
              <div className="flex justify-end gap-2">
                <button onClick={() => setShowRejectModal(false)} className="px-4 py-2 text-gray-600">Cancel</button>
                <button onClick={handleRejectSubmit} className="px-4 py-2 bg-red-600 text-white rounded font-bold">Submit</button>
              </div>
            </div>
          </div>
        )}

        {/* MODAL 4: RESUBMIT */}
        {showResubmitModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white p-6 rounded-xl shadow-lg w-full max-w-md">
              <h3 className="text-lg font-bold text-indigo-600 mb-2">Fix & Resubmit</h3>
              <input type="file" accept="image/*,.pdf" onChange={(e) => setResubmitFile(e.target.files[0])} className="w-full px-3 py-2 border rounded-md mb-4" />
              <div className="flex justify-end gap-2">
                <button onClick={() => setShowResubmitModal(false)} className="px-4 py-2 text-gray-600">Cancel</button>
                <button onClick={handleResubmit} disabled={isResubmitting} className={`px-4 py-2 text-white rounded font-bold ${isResubmitting ? 'bg-indigo-400' : 'bg-indigo-600'}`}>
                  {isResubmitting ? 'Processing...' : 'Upload & Resubmit'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* DOCUMENT VIEWER MODAL */}
        {viewingDocument && (
          <DocumentDetailsModal document={viewingDocument} onClose={() => setViewingDocument(null)} />
        )}
      </main>
    </div>
  );
};

export default Dashboard;