const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');

// Initialize database connection
const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
});

// User Registration
const registerUser = async (req, res) => {
    try {
        const { name, email, password, role_id } = req.body;

        // Check if user already exists
        const userExists = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        if (userExists.rows.length > 0) {
            return res.status(400).json({ message: 'User already exists' });
        }

        // Hash the password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // Insert into database
        const newUser = await pool.query(
            'INSERT INTO users (name, email, password_hash, role_id) VALUES ($1, $2, $3, $4) RETURNING id, name, email',
            [name, email, hashedPassword, role_id]
        );

        res.status(201).json({ message: 'User registered successfully', user: newUser.rows[0] });
    } catch (error) {
        console.error(error.message);
        res.status(500).json({ message: 'Server error during registration' });
    }
};

// User Login
const loginUser = async (req, res) => {
    try {
        const { email, password } = req.body;

        // Fetch user AND their dynamic role permissions in one query
        const userQuery = await pool.query(`
            SELECT u.*, 
                   COALESCE(r.can_create_workflows, false) as can_create_workflows,
                   COALESCE(r.can_manage_users, false) as can_manage_users,
                   COALESCE(r.requires_workflow_approval, false) as requires_workflow_approval
            FROM users u
            LEFT JOIN dynamic_roles r ON u.role_id = r.id
            WHERE u.email = $1
        `, [email]);

        if (userQuery.rows.length === 0) {
            return res.status(400).json({ message: 'Invalid credentials' });
        }

        const user = userQuery.rows[0];

        // Check password
        const validPassword = await bcrypt.compare(password, user.password_hash);
        if (!validPassword) {
            return res.status(400).json({ message: 'Invalid credentials' });
        }

        // Generate JWT
        const token = jwt.sign(
            { id: user.id, role_id: user.role_id },
            process.env.JWT_SECRET,
            { expiresIn: '8h' }
        );

        await pool.query(
            "INSERT INTO audit_logs (user_id, action) VALUES ($1, 'User logged into the system')", 
            [user.id]
        );

        // Package up the legacy roles + new dynamic permissions
        const isSuperAdmin = user.role_id === 3;
        
        res.status(200).json({ 
            token, 
            user: { 
                id: user.id, 
                name: user.name, 
                email: user.email,
                role_id: user.role_id,
                department_id: user.department_id,
                // If they are legacy Admin (3), they get everything. Otherwise, use their dynamic role settings.
                can_create_workflows: isSuperAdmin ? true : user.can_create_workflows,
                can_manage_users: isSuperAdmin ? true : user.can_manage_users,
                requires_workflow_approval: isSuperAdmin ? false : user.requires_workflow_approval
            } 
        });
    } catch (error) {
        console.error(error.message);
        res.status(500).json({ message: 'Server error during login' });
    }
};
module.exports = { registerUser, loginUser };