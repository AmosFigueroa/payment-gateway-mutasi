import mongoose from 'mongoose';

const MONGODB_URI = process.env.MONGODB_URI;

// Schema User (Harus sama persis)
const UserSchema = new mongoose.Schema({
  store_name: String,
  email: { type: String, unique: true, required: true },
  wa: String,
  pin: String,
  balance: { type: Number, default: 0 },
});
const User = mongoose.models.User || mongoose.model('User', UserSchema);

// Schema Withdraw
const WithdrawSchema = new mongoose.Schema({
  store: String, email: String, amount: Number,
  bank: String, rek: String, name: String,
  status: { type: String, default: 'PENDING' },
  created_at: { type: Date, default: Date.now }
});
const Withdraw = mongoose.models.Withdraw || mongoose.model('Withdraw', WithdrawSchema);

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    const { type, data } = req.body;
    
    const token = process.env.TELEGRAM_BOT_TOKEN; 
    const chatId = process.env.TELEGRAM_CHAT_ID;
    const gasUrl = process.env.GAS_EMAIL_URL;

    // Helper
    const sanitize = (str) => String(str || "-").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const REAL_PIN = Math.floor(100000 + Math.random() * 900000).toString();
    const host = req.headers.host || 'create-invoiceku.vercel.app';
    const protocol = host.includes('localhost') ? 'http' : 'https';
    const baseUrl = `${protocol}://${host}`;
    
    // BERSIHKAN EMAIL (PENTING AGAR COCOK DG DATABASE)
    const cleanEmail = data.email ? data.email.toLowerCase().trim() : "";
    data.generatedPin = REAL_PIN; 

    // Koneksi DB
    if (mongoose.connection.readyState !== 1) await mongoose.connect(MONGODB_URI);

    let telegramMsg = "";
    let replyMarkup = null;
    let shouldSendEmail = false; // Flag cek sukses/gagal

    // --- LOGIKA ---

    // 1. RESET PIN (DENGAN PENGECEKAN)
    if (type === 'FORGOT_PIN') {
        // Coba Update di Database
        const user = await User.findOneAndUpdate(
            { email: cleanEmail },
            { pin: REAL_PIN }
        );

        if (user) {
            // JIKA SUKSES (User Ketemu)
            shouldSendEmail = true;
            telegramMsg = `
🔑 <b>PERMINTAAN RESET PIN</b>
────────────────
👤 <b>${sanitize(cleanEmail)}</b>
────────────────
🔐 PIN Baru : <code>${REAL_PIN}</code>
────────────────
<i>✅ Database Updated. User bisa login sekarang.</i>
`;
        } else {
            // JIKA GAGAL (Email Salah/Typo)
            shouldSendEmail = false;
            telegramMsg = `
⚠️ <b>RESET PIN GAGAL</b>
────────────────
👤 Email: ${sanitize(cleanEmail)}
❌ <b>Error: Email tidak ditemukan di Database!</b>
────────────────
<i>User mungkin salah ketik email saat daftar.</i>
`;
        }
    }

    // 2. WITHDRAW
    else if (type === 'WITHDRAW') {
        shouldSendEmail = false; // WD request gak kirim email, cuma notif admin
        const newWd = new Withdraw({
            store: data.store, email: cleanEmail, amount: data.amount,
            bank: data.bank, rek: data.rek, name: data.name
        });
        await newWd.save();

        telegramMsg = `
💸 <b>PENCAIRAN SALDO</b>
────────────────
🏪 <b>${sanitize(data.store)}</b>
💰 <b>Rp ${parseInt(data.amount).toLocaleString('id-ID')}</b>
────────────────
🏦 Bank : ${sanitize(data.bank)}
💳 Rek  : <code>${sanitize(data.rek)}</code>
👤 A.N  : ${sanitize(data.name)}
────────────────
<i>👉 Klik tombol jika sudah transfer.</i>
`;
        replyMarkup = { 
            inline_keyboard: [[ { text: "✅ SAYA SUDAH TRANSFER", callback_data: `ACC_WD:${newWd._id}` } ]] 
        };
    }

    // 3. LAINNYA (Register/Invoice)
    else {
        shouldSendEmail = true; // Default kirim email
        if (type === 'REGISTER') {
            telegramMsg = `🆕 <b>DAFTAR BARU</b>\nStore: ${sanitize(data.store)}\nEmail: ${sanitize(cleanEmail)}\nPIN: <code>${REAL_PIN}</code>`;
        } else if (type === 'CREATE_INVOICE') {
            telegramMsg = `🧾 <b>INVOICE BARU</b>\nStore: ${sanitize(data.store)}\nTotal: Rp ${data.price}`;
        } else if (type === 'DELETE_ACCOUNT') {
            telegramMsg = `⛔ <b>HAPUS AKUN</b>\nStore: ${sanitize(data.store)}\nAlasan: ${sanitize(data.reason)}`;
        }
    }

    // --- EKSEKUSI ---

    // A. Kirim Telegram
    if (token && chatId && telegramMsg) {
        try {
            await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    chat_id: chatId, text: telegramMsg, parse_mode: 'HTML', 
                    disable_web_page_preview: true, reply_markup: replyMarkup
                })
            });
        } catch (e) { console.error("Tele Error:", e); }
    }

    // B. Kirim Email (Hanya jika Database User ditemukan/Valid)
    const emailTypes = ['REGISTER', 'FORGOT_PIN', 'CREATE_INVOICE', 'DELETE_ACCOUNT'];
    
    if (gasUrl && emailTypes.includes(type) && cleanEmail && shouldSendEmail) {
        fetch(gasUrl, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: type, data: data })
        }).catch(e => console.error("GAS Error:", e));
    }

    return res.status(200).json({ status: 'sent', generatedPin: REAL_PIN });
}
