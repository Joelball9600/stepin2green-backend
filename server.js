// Updated on 2026-08-02 with nodemailer
const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const nodemailer = require('nodemailer');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 8080;

// Middleware
app.use(cors());
app.use(express.json());

// ============================================
// 📧 EMAIL CONFIGURATION - FIXED
// ============================================

// Check if email is configured
if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    console.log('⚠️ Email not configured. Set EMAIL_USER and EMAIL_PASS in Railway Variables');
} else {
    console.log('📧 Email configured for:', process.env.EMAIL_USER);
}

// Create transporter with proper config
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    },
    tls: {
        rejectUnauthorized: false
    }
});

// Verify connection
transporter.verify((error, success) => {
    if (error) {
        console.error('❌ Email Error:', error.message);
        console.error('📧 Please check:');
        console.error('   1. EMAIL_USER is set to the correct Gmail address');
        console.error('   2. EMAIL_PASS is the 16-character App Password (no spaces)');
        console.error('   3. 2-Step Verification is enabled on the Gmail account');
        console.error('   4. App Password was generated correctly');
    } else {
        console.log('✅ Email service ready!');
    }
});

// Simple email function
async function sendConfirmationEmail(fullName, email, team) {
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
        console.log('⚠️ Email not configured - skipping email');
        return false;
    }

    try {
        await transporter.sendMail({
            from: `"Stepin2Green" <${process.env.EMAIL_USER}>`,
            to: email,
            subject: `🌱 Welcome to Stepin2Green - ${fullName}`,
            text: `
Hi ${fullName},

Thank you for applying to join Stepin2Green!

We have received your application for the ${team} team.
Our team managers are currently reviewing it.

We will get back to you shortly.

🌱 Together let's learn, create, and inspire!
— Stepin2Green Team
            `,
            html: `
                <h2>Hi ${fullName},</h2>
                <p>Thank you for applying to join <strong>Stepin2Green</strong>!</p>
                <p>We have received your application for the <strong>${team}</strong> team.</p>
                <p>Our team managers are currently reviewing it.</p>
                <p>We will get back to you shortly.</p>
                <br>
                <p>🌱 Together let's learn, create, and inspire!</p>
                <p>— Stepin2Green Team</p>
            `
        });
        console.log(`✅ Email sent to ${email}`);
        return true;
    } catch (error) {
        console.error('❌ Email error:', error.message);
        return false;
    }
}

// ============================================
// 🗄️ DATABASE CONNECTION
// ============================================

const dbConfig = {
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    connectTimeout: 60000,
    acquireTimeout: 60000
};

console.log('📊 MySQL Config:');
console.log('  Host:', dbConfig.host);
console.log('  Port:', dbConfig.port);
console.log('  Database:', dbConfig.database);
console.log('  User:', dbConfig.user);
console.log('  Password set:', !!dbConfig.password);

const db = mysql.createPool(dbConfig);

db.getConnection((err, connection) => {
    if (err) {
        console.error('❌ Database connection failed:');
        console.error('  Error:', err.message);
        console.error('  Host:', dbConfig.host);
        console.error('  Port:', dbConfig.port);
        return;
    }
    console.log('✅ Connected to MySQL database!');
    connection.release();
});

// ============================================
// 📋 ROUTES
// ============================================

// Root route
app.get('/', (req, res) => {
    res.json({
        message: 'Stepin2Green API',
        status: 'running',
        endpoints: [
            'GET /api/volunteers - View all applications',
            'POST /api/volunteers - Submit application',
            'GET /admin - Admin dashboard'
        ]
    });
});

// GET all volunteers
app.get('/api/volunteers', (req, res) => {
    db.query('SELECT * FROM volunteers ORDER BY submitted_at DESC', (err, results) => {
        if (err) {
            console.error('Query error:', err);
            return res.status(500).json({ error: err.message });
        }
        res.json(results);
    });
});

// POST - Submit volunteer application
app.post('/api/volunteers', async (req, res) => {
    const { fullName, email, background, team, message } = req.body;

    if (!fullName || !email) {
        return res.status(400).json({ error: 'Name and email are required' });
    }

    const sql = `INSERT INTO volunteers (full_name, email, background, team, message) VALUES (?, ?, ?, ?, ?)`;
    const values = [fullName, email, background || null, team || 'Not specified', message || null];

    db.query(sql, values, async (err, result) => {
        if (err) {
            console.error('Insert error:', err);
            return res.status(500).json({ error: err.message });
        }

        console.log(`✅ Application saved for ${fullName} (ID: ${result.insertId})`);

        // Send confirmation email (don't wait for it to complete)
        let emailSent = false;
        try {
            emailSent = await sendConfirmationEmail(fullName, email, team);
        } catch (emailError) {
            console.error('Email error:', emailError);
        }

        res.json({
            success: true,
            id: result.insertId,
            emailSent: emailSent,
            message: emailSent ?
                'Application submitted! A confirmation email has been sent.' :
                'Application submitted! (Email notification pending)'
        });
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
                .email-sent { color: #3bba8c; }
                .email-failed { color: #e67e22; }
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

// ============================================
// 🚀 START SERVER
// ============================================

app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📧 Email service: ${process.env.EMAIL_USER ? 'Configured' : 'Not configured'}`);
});
