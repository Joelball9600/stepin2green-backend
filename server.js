const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 8080;

// Middleware
app.use(cors());
app.use(express.json());

// MySQL Connection
const db = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// Test connection
db.getConnection((err, connection) => {
    if (err) {
        console.error('❌ Database connection failed:', err);
        return;
    }
    console.log('✅ Connected to MySQL database');
    connection.release();
});

// GET all volunteers (for admin)
app.get('/api/volunteers', (req, res) => {
    db.query('SELECT * FROM volunteers ORDER BY submitted_at DESC', (err, results) => {
        if (err) {
            console.error('Query error:', err);
            return res.status(500).json({ error: 'Database error' });
        }
        res.json(results);
    });
});

// POST - Submit volunteer application
app.post('/api/volunteers', (req, res) => {
    const { fullName, email, background, team, message } = req.body;

    if (!fullName || !email) {
        return res.status(400).json({ 
            error: 'Name and email are required fields' 
        });
    }

    const sql = `
        INSERT INTO volunteers (full_name, email, background, team, message) 
        VALUES (?, ?, ?, ?, ?)
    `;
    
    const values = [fullName, email, background || null, team || 'Not specified', message || null];

    db.query(sql, values, (err, result) => {
        if (err) {
            console.error('Insert error:', err);
            return res.status(500).json({ 
                error: 'Failed to save application' 
            });
        }

        res.status(201).json({
            success: true,
            message: 'Application submitted successfully!',
            id: result.insertId
        });
    });
});

// Admin page to view submissions
app.get('/admin', (req, res) => {
    db.query('SELECT * FROM volunteers ORDER BY submitted_at DESC', (err, results) => {
        if (err) {
            return res.status(500).send('Database error');
        }
        
        let html = `
        <!DOCTYPE html>
        <html>
        <head>
            <title>Stepin2Green - Admin</title>
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
                * { box-sizing: border-box; }
                body { 
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                    background: #0b1f1c; 
                    color: #e2f0e9; 
                    padding: 1rem; 
                    margin: 0;
                }
                .container { max-width: 1200px; margin: 0 auto; }
                h1 { color: #8ce0c0; }
                .stats { 
                    background: rgba(23,52,46,0.6);
                    padding: 1rem;
                    border-radius: 12px;
                    margin-bottom: 1.5rem;
                }
                .table-wrapper {
                    overflow-x: auto;
                    background: rgba(23,52,46,0.6);
                    border-radius: 12px;
                    padding: 0.5rem;
                }
                table { 
                    width: 100%; 
                    border-collapse: collapse;
                    font-size: 0.9rem;
                }
                th, td { 
                    padding: 12px 8px; 
                    text-align: left; 
                    border-bottom: 1px solid #2d5a4f; 
                }
                th { 
                    background: #1a3d35; 
                    color: #8ce0c0; 
                    position: sticky;
                    top: 0;
                }
                tr:hover { background: rgba(59,186,140,0.1); }
                .badge {
                    display: inline-block;
                    background: rgba(59,186,140,0.2);
                    padding: 2px 10px;
                    border-radius: 20px;
                    font-size: 0.75rem;
                }
                @media (max-width: 600px) {
                    th, td { padding: 8px 4px; font-size: 0.75rem; }
                }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>🌱 Volunteer Applications</h1>
                <div class="stats">Total: ${results.length} submissions</div>
                <div class="table-wrapper">
                    <table>
                        <tr>
                            <th>ID</th>
                            <th>Name</th>
                            <th>Email</th>
                            <th>Team</th>
                            <th>Background</th>
                            <th>Message</th>
                            <th>Submitted</th>
                        </tr>
                        ${results.map(row => `
                            <tr>
                                <td>${row.id}</td>
                                <td><strong>${row.full_name}</strong></td>
                                <td><a href="mailto:${row.email}" style="color: #6cd4b0;">${row.email}</a></td>
                                <td><span class="badge">${row.team}</span></td>
                                <td>${row.background || '-'}</td>
                                <td>${row.message ? row.message.substring(0, 50) + (row.message.length > 50 ? '...' : '') : '-'}</td>
                                <td>${new Date(row.submitted_at).toLocaleString()}</td>
                            </tr>
                        `).join('')}
                    </table>
                </div>
            </div>
        </body>
        </html>`;
        res.send(html);
    });
});

// Root route
app.get('/', (req, res) => {
    res.json({ 
        message: 'Stepin2Green API', 
        endpoints: [
            '/api/volunteers (GET) - View all applications',
            '/api/volunteers (POST) - Submit application',
            '/admin - Admin dashboard'
        ]
    });
});

app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});
