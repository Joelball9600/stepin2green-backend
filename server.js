const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 8080;

app.use(cors());
app.use(express.json());

// MySQL Connection with proxy host
const dbConfig = {
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT) || 10076,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    connectTimeout: 60000,  // 60 seconds for proxy
    acquireTimeout: 60000
};

console.log('📊 MySQL Config:');
console.log('  Host:', dbConfig.host);
console.log('  Port:', dbConfig.port);
console.log('  Database:', dbConfig.database);
console.log('  User:', dbConfig.user);
console.log('  Password set:', !!dbConfig.password);

const db = mysql.createPool(dbConfig);

// Test connection
db.getConnection((err, connection) => {
    if (err) {
        console.error('❌ Database connection failed:');
        console.error('  Error:', err.message);
        console.error('  Code:', err.code);
        console.error('  Host:', dbConfig.host);
        console.error('  Port:', dbConfig.port);
        // Don't exit - keep server running
        return;
    }
    console.log('✅ Connected to MySQL database!');
    console.log('📊 Connection ID:', connection.threadId);
    connection.release();
});

// Routes
app.get('/', (req, res) => {
    res.json({
        message: 'Stepin2Green API',
        status: 'running',
        db_host: process.env.DB_HOST,
        db_port: process.env.DB_PORT
    });
});

app.get('/api/volunteers', (req, res) => {
    db.query('SELECT * FROM volunteers ORDER BY submitted_at DESC', (err, results) => {
        if (err) {
            console.error('Query error:', err);
            return res.status(500).json({ error: err.message });
        }
        res.json(results);
    });
});

app.post('/api/volunteers', (req, res) => {
    const { fullName, email, background, team, message } = req.body;

    if (!fullName || !email) {
        return res.status(400).json({ error: 'Name and email are required' });
    }

    const sql = `INSERT INTO volunteers (full_name, email, background, team, message) VALUES (?, ?, ?, ?, ?)`;
    const values = [fullName, email, background || null, team || 'Not specified', message || null];

    db.query(sql, values, (err, result) => {
        if (err) {
            console.error('Insert error:', err);
            return res.status(500).json({ error: err.message });
        }
        res.json({ success: true, id: result.insertId });
    });
});

// Admin page
app.get('/admin', (req, res) => {
    db.query('SELECT * FROM volunteers ORDER BY submitted_at DESC', (err, results) => {
        if (err) {
            console.error('Admin page error:', err);
            return res.send(`
                <!DOCTYPE html>
                <html>
                <head><title>Database Error</title></head>
                <body style="font-family: sans-serif; padding: 2rem; background: #0b1f1c; color: #e2f0e9;">
                    <h1>⚠️ Database Error</h1>
                    <p>Error: ${err.message}</p>
                    <p>Host: ${process.env.DB_HOST}</p>
                    <p>Port: ${process.env.DB_PORT}</p>
                    <p>Check Railway logs for details.</p>
                </body>
                </html>
            `);
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

app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});
