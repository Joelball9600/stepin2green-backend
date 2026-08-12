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
// 📧 EMAIL CONFIGURATION - BREVO
// ============================================

const transporter = nodemailer.createTransport({
    host: 'smtp-relay.brevo.com',
    port: 587,
    secure: false,
    auth: {
        user: process.env.BREVO_SMTP_USERNAME,
        pass: process.env.BREVO_SMTP_PASSWORD
    }
});

transporter.verify((error, success) => {
    if (error) {
        console.error('❌ Brevo SMTP Error:', error.message);
    } else {
        console.log('✅ Brevo SMTP email service ready!');
    }
});

// Email function - updated with Instagram
async function sendConfirmationEmail(fullName, email, team, instagram) {
    try {
        const mailOptions = {
            from: `"Stepin2Green" <${process.env.BREVO_SENDER_EMAIL || 'stepin2green2@brevo.com'}>`,
            to: email,
            subject: `🌱 Welcome to Stepin2Green - ${fullName}`,
            html: `
                <!DOCTYPE html>
                <html>
                <body style="margin:0; padding:0; font-family: 'Segoe UI', Arial, sans-serif; background-color: #0a1a17; color: #e2f0e9;">
                    <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #0a1a17; padding: 20px;">
                        <tr>
                            <td align="center">
                                <table width="100%" max-width="600" cellpadding="0" cellspacing="0" style="max-width: 600px; background-color: #0b1f1c; border-radius: 20px; border: 1px solid rgba(86, 204, 151, 0.15); padding: 30px;">
                                    <tr>
                                        <td align="center" style="padding-bottom: 20px;">
                                            <h1 style="color: #8ce0c0; font-size: 2rem; margin: 0; font-weight: 700;">🌱 Stepin2Green</h1>
                                            <p style="color: #6a8f82; margin: 5px 0 0; font-size: 0.9rem;">science · art · community</p>
                                        </td>
                                    </tr>
                                    <tr>
                                        <td>
                                            <h2 style="color: #c6f0df; font-weight: 600; margin: 10px 0 15px;">Hi ${fullName},</h2>
                                            <p style="line-height: 1.7; font-size: 1rem; color: #e2f0e9;">Thank you for applying to join <strong style="color: #8ce0c0;">Stepin2Green</strong>!</p>
                                            <p style="line-height: 1.7; font-size: 1rem; color: #e2f0e9;">We have received your application for the <strong style="color: #8ce0c0;">${team}</strong> team.</p>
                                            <p style="line-height: 1.7; font-size: 1rem; color: #e2f0e9;">We'll reach out to you on Instagram at <strong style="color: #8ce0c0;">${instagram}</strong> for next steps.</p>
                                            
                                            <div style="background: rgba(59, 186, 140, 0.08); border-left: 4px solid #3bba8c; padding: 15px 20px; border-radius: 12px; margin: 20px 0;">
                                                <p style="margin: 0; color: #c6f0df; font-size: 0.95rem;">
                                                    📧 We will get back to you shortly with our decision. 
                                                    <span style="display: block; margin-top: 6px; color: #6a8f82; font-size: 0.85rem;">
                                                        Keep an eye on your inbox and Instagram DMs!
                                                    </span>
                                                </p>
                                            </div>
                                            
                                            <hr style="border: none; border-top: 1px solid rgba(86, 204, 151, 0.15); margin: 25px 0 15px;">
                                            
                                            <p style="color: #8ce0c0; font-size: 1rem; margin: 0;">
                                                🌱 Together let's learn, create, and inspire!
                                            </p>
                                            <p style="color: #6a8f82; font-size: 0.9rem; margin: 5px 0 0;">
                                                — Stepin2Green Team
                                            </p>
                                            <p style="color: #4a6f62; font-size: 0.75rem; margin-top: 15px; border-top: 1px solid rgba(86, 204, 151, 0.05); padding-top: 15px;">
                                                This is an automated confirmation email. Please do not reply directly to this email.
                                            </p>
                                        </td>
                                    </tr>
                                </table>
                            </td>
                        </tr>
                    </table>
                </body>
                </html>
            `
        };

        await transporter.sendMail(mailOptions);
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
    timezone: '+08:00'
};

console.log('📊 MySQL Config:');
console.log('  Host:', dbConfig.host);
console.log('  Port:', dbConfig.port);
console.log('  Database:', dbConfig.database);
console.log('  User:', dbConfig.user);

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

// POST - Submit volunteer application (updated with Instagram)
app.post('/api/volunteers', async (req, res) => {
    const { fullName, email, background, team, message, instagram } = req.body;

    if (!fullName || !email || !instagram) {
        return res.status(400).json({ error: 'Name, email and Instagram handle are required' });
    }

    const sql = `INSERT INTO volunteers (full_name, email, instagram, background, team, message, submitted_at) VALUES (?, ?, ?, ?, ?, ?, NOW())`;
    const values = [fullName, email, instagram, background || null, team || 'Not specified', message || null];

    db.query(sql, values, async (err, result) => {
        if (err) {
            console.error('Insert error:', err);
            return res.status(500).json({ error: err.message });
        }

        console.log(`✅ Application saved for ${fullName} (ID: ${result.insertId})`);

        // Send confirmation email with Instagram
        let emailSent = false;
        try {
            emailSent = await sendConfirmationEmail(fullName, email, team, instagram);
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
// ADMIN PAGE - WITH INSTAGRAM COLUMN
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
                .container { max-width: 1300px; margin: 0 auto; }
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
                    font-size: 0.85rem;
                    table-layout: fixed;
                }
                th, td { 
                    padding: 10px 6px; 
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
                tr:hover { background: rgba(59,186,140,0.08); }
                .badge {
                    display: inline-block;
                    background: rgba(59,186,140,0.2);
                    padding: 2px 10px;
                    border-radius: 20px;
                    font-size: 0.7rem;
                }
                .col-id { width: 45px; }
                .col-name { width: 110px; }
                .col-email { width: 160px; }
                .col-instagram { width: 110px; }
                .col-team { width: 85px; }
                .col-background { width: 110px; }
                .col-message { width: 200px; }
                .col-submitted { width: 130px; }

                .message-cell {
                    max-width: 200px;
                    word-wrap: break-word;
                    word-break: break-word;
                    white-space: normal;
                    line-height: 1.4;
                }
                .message-cell .full-text {
                    display: block;
                    max-height: none;
                    overflow: visible;
                    font-size: 0.8rem;
                    color: #c6f0df;
                }
                .message-cell .label {
                    color: #6a8f82;
                    font-size: 0.65rem;
                    display: block;
                    margin-bottom: 2px;
                }
                .instagram-handle {
                    color: #e67e22;
                    font-weight: 500;
                }
                .instagram-handle i {
                    margin-right: 4px;
                    color: #e4405f;
                }

                @media (max-width: 600px) {
                    th, td { padding: 6px 3px; font-size: 0.7rem; }
                    .col-id { width: 30px; }
                    .col-name { width: 70px; }
                    .col-email { width: 80px; }
                    .col-instagram { width: 70px; }
                    .col-message { width: 100px; }
                    .col-submitted { width: 80px; }
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
                            <th class="col-instagram">Instagram</th>
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
                                <td class="col-instagram">
                                    <span class="instagram-handle">
                                        <i class="fab fa-instagram"></i> ${row.instagram || '-'}
                                    </span>
                                </td>
                                <td class="col-team"><span class="badge">${row.team}</span></td>
                                <td class="col-background">${row.background || '-'}</td>
                                <td class="col-message message-cell">
                                    <span class="label">📝 Message:</span>
                                    <span class="full-text">${row.message ? row.message : '-'}</span>
                                </td>
                                <td class="col-submitted">${row.submitted_at ? new Date(row.submitted_at).toLocaleString('en-MY', { timeZone: 'Asia/Kuala_Lumpur', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }) : '-'}</td>
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
    console.log(`📧 Email sender: ${process.env.BREVO_SENDER_EMAIL || 'stepin2green2@brevo.com'}`);
});
