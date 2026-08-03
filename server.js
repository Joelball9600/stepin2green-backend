const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const SibApiV3Sdk = require('sib-api-v3-sdk');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 8080;

app.use(cors());
app.use(express.json());

// ============================================
// 📧 BREVO (Sendinblue) EMAIL CONFIG
// ============================================

const BREVO_API_KEY = process.env.BREVO_API_KEY;

if (BREVO_API_KEY) {
    const defaultClient = SibApiV3Sdk.ApiClient.instance;
    defaultClient.authentications['api-key'].apiKey = BREVO_API_KEY;
    console.log('✅ Brevo email service configured');
} else {
    console.log('⚠️ Brevo NOT configured - add BREVO_API_KEY');
}

async function sendConfirmationEmail(fullName, email, team) {
    if (!BREVO_API_KEY) {
        console.log('⚠️ Brevo not configured - skipping email');
        return false;
    }

    try {
        const apiInstance = new SibApiV3Sdk.TransactionalEmailsApi();
        const sendSmtpEmail = new SibApiV3Sdk.SendSmtpEmail();
        sendSmtpEmail.subject = `🌱 Welcome to Stepin2Green - ${fullName}`;
        sendSmtpEmail.htmlContent = `
            <h2 style="color:#2d5a4f;">Hi ${fullName},</h2>
            <p>Thank you for applying to join <strong>Stepin2Green</strong>!</p>
            <p>We have received your application for the <strong>${team}</strong> team.</p>
            <p>Our team managers are currently reviewing it.</p>
            <p>We will get back to you shortly.</p>
            <br>
            <p>🌱 Together let's learn, create, and inspire!</p>
            <p>— Stepin2Green Team</p>
        `;
        sendSmtpEmail.sender = { 
            name: "Stepin2Green", 
            email: process.env.EMAIL_USER || "stepin2green2@gmail.com" 
        };
        sendSmtpEmail.to = [{ email: email }];

        await apiInstance.sendTransacEmail(sendSmtpEmail);
        console.log(`✅ Email sent to ${email}`);
        return true;
    } catch (error) {
        console.error('❌ Email error:', error.message);
        return false;
    }
}

// ============================================
// 🗄️ DATABASE CONNECTION - WITH TIMEZONE
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
    acquireTimeout: 60000,
    timezone: '+08:00'  // 👈 MALAYSIA TIME (UTC+8)
};

console.log('📊 MySQL Config:');
console.log('  Host:', dbConfig.host);
console.log('  Port:', dbConfig.port);
console.log('  Database:', dbConfig.database);
console.log('  User:', dbConfig.user);
console.log('  Timezone:', dbConfig.timezone);

const db = mysql.createPool(dbConfig);

db.getConnection((err, connection) => {
    if (err) {
        console.error('❌ Database connection failed:', err.message);
        return;
    }
    console.log('✅ Connected to MySQL database!');
    connection.release();
});

// ============================================
// 📋 ROUTES
// ============================================

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

    const sql = `INSERT INTO volunteers (full_name, email, background, team, message, submitted_at) VALUES (?, ?, ?, ?, ?, NOW())`;
    const values = [fullName, email, background || null, team || 'Not specified', message || null];

    db.query(sql, values, async (err, result) => {
        if (err) {
            console.error('Insert error:', err);
            return res.status(500).json({ error: err.message });
        }

        console.log(`✅ Application saved for ${fullName} (ID: ${result.insertId})`);

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

// ============================================
// ADMIN PAGE - WITH TEXT WRAPPING
// ============================================

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
                    table-layout: fixed;
                }
                th, td { 
                    padding: 12px 8px; 
                    text-align: left; 
                    border-bottom: 1px solid #2d5a4f;
                    word-wrap: break-word;
                    word-break: break-word;
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
                /* Column widths */
                .col-id { width: 50px; }
                .col-name { width: 120px; }
                .col-email { width: 180px; }
                .col-team { width: 100px; }
                .col-background { width: 130px; }
                .col-message { width: 250px; }
                .col-submitted { width: 150px; }

                .message-cell {
                    max-width: 250px;
                    word-wrap: break-word;
                    word-break: break-word;
                    white-space: normal;
                    line-height: 1.5;
                }
                .message-cell .full-text {
                    display: block;
                    max-height: none;
                    overflow: visible;
                    font-size: 0.85rem;
                    color: #c6f0df;
                }
                .message-cell .label {
                    color: #6a8f82;
                    font-size: 0.7rem;
                    display: block;
                    margin-bottom: 2px;
                }

                @media (max-width: 600px) {
                    th, td { padding: 8px 4px; font-size: 0.75rem; }
                    .col-id { width: 30px; }
                    .col-name { width: 80px; }
                    .col-email { width: 100px; }
                    .col-message { width: 120px; }
                    .col-submitted { width: 100px; }
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
                            <th class="col-id">ID</th>
                            <th class="col-name">Name</th>
                            <th class="col-email">Email</th>
                            <th class="col-team">Team</th>
                            <th class="col-background">Background</th>
                            <th class="col-message">Message</th>
                            <th class="col-submitted">Submitted</th>
                        </tr>
                        ${results.map(row => `
                            <tr>
                                <td class="col-id">${row.id}</td>
                                <td class="col-name"><strong>${row.full_name}</strong></td>
                                <td class="col-email"><a href="mailto:${row.email}" style="color: #6cd4b0;">${row.email}</a></td>
                                <td class="col-team"><span class="badge">${row.team}</span></td>
                                <td class="col-background">${row.background || '-'}</td>
                                <td class="col-message message-cell">
                                    <span class="label">📝 Message:</span>
                                    <span class="full-text">${row.message ? row.message : '-'}</span>
                                </td>
                                <td class="col-submitted">${row.submitted_at ? new Date(row.submitted_at).toLocaleString('en-MY', { timeZone: 'Asia/Kuala_Lumpur' }) : '-'}</td>
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
});
