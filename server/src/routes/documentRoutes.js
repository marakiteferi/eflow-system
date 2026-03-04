const express = require('express');
const router = express.Router();
const multer = require('multer');
const { Pool } = require('pg');
const authenticateToken = require('../middleware/authMiddleware');
const Tesseract = require('tesseract.js');
const fs = require('fs'); 
const pdfParse = require('pdf-parse');

const pool = new Pool({
    user: process.env.DB_USER, host: process.env.DB_HOST, database: process.env.DB_NAME, password: process.env.DB_PASSWORD, port: process.env.DB_PORT,
});

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'uploads/'),
    filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage });

// Helper function to extract text based on file type
const extractText = async (filePath, mimetype) => {
    try {
        if (mimetype === 'application/pdf') {
            const dataBuffer = fs.readFileSync(filePath);
            const pdfData = await pdfParse(dataBuffer); 
            
            if (!pdfData || !pdfData.text || pdfData.text.trim() === '') {
                return '[System Note: No digital text found. If this is a scanned PDF, please upload it as an Image (PNG/JPG) so the OCR system can read it.]';
            }
            return pdfData.text;
        } else {
            const { data: { text } } = await Tesseract.recognize(filePath, 'eng');
            return text;
        }
    } catch (error) {
        console.error('Extraction error details:', error);
        return `Text extraction failed: ${error.message}`;
    }
};

// 1. POST: Upload document (Includes metadata_tag support)
router.post('/upload', authenticateToken, upload.single('document'), async (req, res) => {
    try {
        const { title, workflow_id, metadata_tag } = req.body;
        const submitter_id = req.user.id;

        if (!title || !req.file) return res.status(400).json({ message: 'Title and document are required.' });

        let initialNodeId = null;
        let initialAssigneeId = null; 

        if (workflow_id) {
            const wfQuery = await pool.query('SELECT flow_structure FROM workflows WHERE id = $1', [workflow_id]);
            if (wfQuery.rows.length > 0) {
                const flowData = typeof wfQuery.rows[0].flow_structure === 'string' ? JSON.parse(wfQuery.rows[0].flow_structure) : wfQuery.rows[0].flow_structure;
                const nodes = flowData.nodes || [];
                const edges = flowData.edges || [];

                const startNode = nodes.find(node => !edges.some(edge => edge.target === node.id)) || nodes[0];
                if (startNode) {
                    initialNodeId = startNode.id;
                    initialAssigneeId = startNode.data?.assignee ? parseInt(startNode.data.assignee, 10) : null; 
                }
            }
        }

        const extracted_text = await extractText(req.file.path, req.file.mimetype);

        const newDoc = await pool.query(
            "INSERT INTO documents (title, file_path, extracted_text, submitter_id, workflow_id, current_node_id, current_assignee_id, metadata_tag, status) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'Pending') RETURNING *",
            [title, req.file.path, extracted_text, submitter_id, workflow_id || null, initialNodeId, initialAssigneeId, metadata_tag || null]
        );

        res.status(201).json({ message: 'Document submitted', document: newDoc.rows[0] });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error uploading' });
    }
});

// 2. PUT: Resubmit a rejected document
router.put('/resubmit/:id', authenticateToken, upload.single('document'), async (req, res) => {
    try {
        const documentId = req.params.id;
        if (!req.file) return res.status(400).json({ message: 'New document file is required.' });

        const docQuery = await pool.query('SELECT workflow_id FROM documents WHERE id = $1 AND submitter_id = $2 AND status = $3', [documentId, req.user.id, 'Rejected']);
        if (docQuery.rows.length === 0) return res.status(403).json({ message: 'Document not eligible for resubmission.' });

        const workflow_id = docQuery.rows[0].workflow_id;
        let initialNodeId = null;
        let initialAssigneeId = null;

        if (workflow_id) {
            const wfQuery = await pool.query('SELECT flow_structure FROM workflows WHERE id = $1', [workflow_id]);
            if (wfQuery.rows.length > 0) {
                const flowData = typeof wfQuery.rows[0].flow_structure === 'string' ? JSON.parse(wfQuery.rows[0].flow_structure) : wfQuery.rows[0].flow_structure;
                const nodes = flowData.nodes || [];
                const edges = flowData.edges || [];
                
                const startNode = nodes.find(node => !edges.some(edge => edge.target === node.id)) || nodes[0];
                if (startNode) {
                    initialNodeId = startNode.id;
                    initialAssigneeId = startNode.data?.assignee ? parseInt(startNode.data.assignee, 10) : null;
                }
            }
        }

        const extracted_text = await extractText(req.file.path, req.file.mimetype);

        await pool.query(
            "UPDATE documents SET file_path = $1, extracted_text = $2, status = 'Pending', current_node_id = $3, current_assignee_id = $4, updated_at = CURRENT_TIMESTAMP WHERE id = $5",
            [req.file.path, extracted_text, initialNodeId, initialAssigneeId, documentId]
        );

        await pool.query("INSERT INTO audit_logs (document_id, user_id, action) VALUES ($1, $2, 'Document Resubmitted by User')", [documentId, req.user.id]);
        res.status(200).json({ message: 'Document resubmitted successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error during resubmission' });
    }
});

// 3. GET: Fetch the approval history/timeline
router.get('/:id/history', authenticateToken, async (req, res) => {
    try {
        const query = `
            SELECT a.status, a.comments, a.created_at, u.name as approver_name, a.node_id
            FROM approvals a JOIN users u ON a.approver_id = u.id
            WHERE a.document_id = $1 ORDER BY a.created_at ASC
        `;
        const result = await pool.query(query, [req.params.id]);
        res.status(200).json(result.rows);
    } catch (err) {
        console.error('Error fetching document history:', err);
        res.status(500).json({ message: 'Server error fetching history' });
    }
});

// 4. GET: Fetch documents based on role
router.get('/', authenticateToken, async (req, res) => {
    try {
        let query; let values;
        if (req.user.role_id === 1) {
            query = "SELECT d.*, (SELECT comments FROM approvals a WHERE a.document_id = d.id ORDER BY id DESC LIMIT 1) as latest_comment FROM documents d WHERE d.submitter_id = $1 ORDER BY d.created_at DESC";
            values = [req.user.id];
        } else if (req.user.role_id === 2 || req.user.role_id > 3) { // Include custom reviewers!
            query = "SELECT * FROM documents WHERE status = 'Pending' AND (current_assignee_id = $1 OR current_assignee_id IS NULL) ORDER BY created_at ASC";
            values = [req.user.id];
        } else {
            query = "SELECT * FROM documents ORDER BY created_at DESC";
            values = [];
        }
        const result = await pool.query(query, values);
        res.status(200).json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error fetching' });
    }
});

module.exports = router;