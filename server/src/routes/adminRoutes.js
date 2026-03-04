const express = require('express');
const router = express.Router();
const { Pool } = require('pg');
const authenticateToken = require('../middleware/authMiddleware');

const pool = new Pool({
    user: process.env.DB_USER, host: process.env.DB_HOST, database: process.env.DB_NAME, password: process.env.DB_PASSWORD, port: process.env.DB_PORT,
});

// Middleware to verify the user has user-management permissions
const verifyAdmin = async (req, res, next) => {
    try {
        // Fallback for legacy role_id 3 (Super Admin), plus check for new dynamic permissions
        if (req.user.role_id === 3) return next();
        
        const roleQuery = await pool.query('SELECT can_manage_users FROM dynamic_roles WHERE id = $1', [req.user.role_id]);
        if (roleQuery.rows.length > 0 && roleQuery.rows[0].can_manage_users) {
            return next();
        }
        return res.status(403).json({ message: 'Access Denied: You do not have permission to manage users or roles.' });
    } catch (err) {
        res.status(500).json({ message: 'Server error verifying permissions.' });
    }
};

// ==========================================
// DEPARTMENTS API
// ==========================================
router.get('/departments', authenticateToken, verifyAdmin, async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM departments ORDER BY name ASC');
        res.status(200).json(result.rows);
    } catch (err) {
        res.status(500).json({ message: 'Error fetching departments' });
    }
});

router.post('/departments', authenticateToken, verifyAdmin, async (req, res) => {
    const { name } = req.body;
    try {
        const result = await pool.query('INSERT INTO departments (name) VALUES ($1) RETURNING *', [name]);
        await pool.query("INSERT INTO audit_logs (user_id, action) VALUES ($1, $2)", [req.user.id, `Created department: ${name}`]);
        res.status(201).json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ message: 'Error creating department. Name might already exist.' });
    }
});

// ==========================================
// DYNAMIC ROLES API
// ==========================================
router.get('/roles', authenticateToken, verifyAdmin, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT r.*, d.name as department_name 
            FROM dynamic_roles r 
            LEFT JOIN departments d ON r.department_id = d.id 
            ORDER BY r.id ASC
        `);
        res.status(200).json(result.rows);
    } catch (err) {
        res.status(500).json({ message: 'Error fetching roles' });
    }
});

router.post('/roles', authenticateToken, verifyAdmin, async (req, res) => {
    const { name, department_id, can_create_workflows, requires_workflow_approval, can_manage_users } = req.body;
    try {
        const result = await pool.query(
            `INSERT INTO dynamic_roles (name, department_id, can_create_workflows, requires_workflow_approval, can_manage_users) 
             VALUES ($1, $2, $3, $4, $5) RETURNING *`,
            [name, department_id || null, can_create_workflows || false, requires_workflow_approval || false, can_manage_users || false]
        );
        await pool.query("INSERT INTO audit_logs (user_id, action) VALUES ($1, $2)", [req.user.id, `Created custom role: ${name}`]);
        res.status(201).json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ message: 'Error creating dynamic role' });
    }
});

// ==========================================
// LEGACY ROUTES (Users, Stats, Audit Logs)
// ==========================================
router.get('/users', authenticateToken, verifyAdmin, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT u.id, u.name, u.email, u.role_id, d.name as department_name 
            FROM users u 
            LEFT JOIN departments d ON u.department_id = d.id 
            ORDER BY u.created_at DESC
        `);
        res.status(200).json(result.rows);
    } catch (err) {
        res.status(500).json({ message: 'Error fetching users' });
    }
});

router.put('/users/:id/role', authenticateToken, verifyAdmin, async (req, res) => {
    const { role_id, department_id } = req.body;
    try {
        await pool.query('UPDATE users SET role_id = $1, department_id = $2 WHERE id = $3', [role_id, department_id || null, req.params.id]);
        await pool.query("INSERT INTO audit_logs (user_id, action) VALUES ($1, $2)", [req.user.id, `Updated role/department for user ID: ${req.params.id}`]);
        res.status(200).json({ message: 'User updated successfully' });
    } catch (err) {
        res.status(500).json({ message: 'Error updating user' });
    }
});

router.get('/audit-logs', authenticateToken, verifyAdmin, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT a.id, a.action, a.timestamp, u.name as user_name, d.title as document_title
            FROM audit_logs a
            LEFT JOIN users u ON a.user_id = u.id
            LEFT JOIN documents d ON a.document_id = d.id
            ORDER BY a.timestamp DESC LIMIT 100
        `);
        res.status(200).json(result.rows);
    } catch (err) {
        res.status(500).json({ message: 'Error fetching audit logs' });
    }
});

router.get('/stats', authenticateToken, verifyAdmin, async (req, res) => {
    try {
        const totalDocs = await pool.query('SELECT COUNT(*) FROM documents');
        const approvedDocs = await pool.query("SELECT COUNT(*) FROM documents WHERE status = 'Approved'");
        const pendingDocs = await pool.query("SELECT COUNT(*) FROM documents WHERE status = 'Pending'");
        const rejectedDocs = await pool.query("SELECT COUNT(*) FROM documents WHERE status = 'Rejected'");
        const totalUsers = await pool.query('SELECT COUNT(*) FROM users');
        const totalWorkflows = await pool.query('SELECT COUNT(*) FROM workflows');

        res.status(200).json({
            documents: {
                total: parseInt(totalDocs.rows[0].count), approved: parseInt(approvedDocs.rows[0].count),
                pending: parseInt(pendingDocs.rows[0].count), rejected: parseInt(rejectedDocs.rows[0].count)
            },
            users: parseInt(totalUsers.rows[0].count), workflows: parseInt(totalWorkflows.rows[0].count)
        });
    } catch (err) {
        res.status(500).json({ message: 'Error fetching stats' });
    }
});

module.exports = router;