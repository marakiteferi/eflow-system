import React, { useState, useEffect } from 'react';
import api from '../api';

const DocumentUpload = ({ onUploadSuccess }) => {
  const [title, setTitle] = useState('');
  const [file, setFile] = useState(null);
  const [tag, setTag] = useState(''); // NEW: Tag state
  const [workflows, setWorkflows] = useState([]);
  const [selectedWorkflow, setSelectedWorkflow] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });

  useEffect(() => {
    const fetchWorkflows = async () => {
      try {
        const res = await api.get('/workflows');
        setWorkflows(res.data);
      } catch (err) {
        console.error('Failed to load workflows', err);
      }
    };
    fetchWorkflows();
  }, []);

  const handleFileChange = (e) => setFile(e.target.files[0]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!file || !title) return setMessage({ type: 'error', text: 'Title and document are required.' });

    setIsLoading(true);
    setMessage({ type: '', text: '' });

    const formData = new FormData();
    formData.append('title', title);
    formData.append('document', file);
    formData.append('metadata_tag', tag); // NEW: Send tag to backend
    if (selectedWorkflow) formData.append('workflow_id', selectedWorkflow);

    try {
      await api.post('/documents/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setMessage({ type: 'success', text: 'Document submitted successfully!' });
      setTitle(''); setFile(null); setTag(''); setSelectedWorkflow('');
      if (onUploadSuccess) onUploadSuccess();
    } catch (error) {
      setMessage({ type: 'error', text: error.response?.data?.message || 'Error uploading document.' });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
      <h3 className="text-xl font-semibold mb-4 text-gray-800">Submit New Document</h3>
      
      {message.text && (
        <div className={`p-3 rounded mb-4 text-sm font-medium ${message.type === 'error' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
          {message.text}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Document Title</label>
          <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-indigo-500" placeholder="e.g. Leave Request Form" required />
        </div>
        
        {/* NEW: Tag Input */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Metadata Tag (Optional)</label>
          <input type="text" value={tag} onChange={(e) => setTag(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-amber-500" placeholder="e.g. Urgent, Finance, Scholarship" />
          <p className="text-xs text-gray-500 mt-1">Tags are used by automated routing rules to direct your file.</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Upload File (Image or PDF)</label>
          <input type="file" accept="image/*,.pdf" onChange={handleFileChange} className="w-full px-3 py-2 border border-gray-300 rounded-md file:mr-4 file:bg-indigo-50 file:text-indigo-700 file:border-0 file:px-4 file:py-2 file:rounded hover:file:bg-indigo-100 cursor-pointer" />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Select Workflow</label>
          <select value={selectedWorkflow} onChange={(e) => setSelectedWorkflow(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white">
            <option value="">-- Select routing path --</option>
            {workflows.map(wf => <option key={wf.id} value={wf.id}>{wf.name}</option>)}
          </select>
        </div>

        <button type="submit" disabled={isLoading} className={`w-full text-white py-2 px-4 rounded-md font-bold shadow-sm transition-colors ${isLoading ? 'bg-indigo-400' : 'bg-indigo-600 hover:bg-indigo-700'}`}>
          {isLoading ? 'Processing OCR & Saving...' : 'Submit Document'}
        </button>
      </form>
    </div>
  );
};

export default DocumentUpload;