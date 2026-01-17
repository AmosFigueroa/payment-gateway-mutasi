import mongoose from 'mongoose';

const MONGODB_URI = process.env.MONGODB_URI;

// Schema Withdraw (Untuk menyimpan data sementara)
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

    // Helper Sanitize
    const sanitize = (str) => String(str || "-").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const REAL_PIN = Math.floor(100000 + Math.random() * 900000).toString();
    data.generatedPin = REAL_PIN; 

    // Connect DB jika perlu (Untuk Withdraw)
    if (type === 'WITHDRAW') {
        if (mongoose.connection.readyState !== 1) await mongoose.connect(MONGODB_URI);
    }

    let telegramMsg = "";
    let replyMarkup = null;

    // --- LOGIKA PESAN ---

    if (type === 'WITHDRAW') {
        // 1. SIMPAN KE DB
        const newWd = new Withdraw({
            store: data.store, email: data.email, amount: data.amount,
            bank: data.bank, rek: data.rek, name: data.name
        });
        await newWd.save();

        telegramMsg = `
<b>💸 REQUEST CAIR SALDO</b>
────────────────────
🏪 Toko: ${sanitize(data.store)}
💰 <b>Rp ${parseInt(data.amount).toLocaleString('id-ID')}</b>
────────────────────
🏦 Bank: ${sanitize(data.bank)}
💳 Rek : <code>${sanitize(data.rek)}</code>
👤 A.N : ${sanitize(data.name)}

<i>👉 Transfer manual, lalu TAP tombol di bawah.</i>
`;
        // 2. TOMBOL CALLBACK (Tanpa Link Browser)
        replyMarkup = { 
            inline_keyboard: [[
                { text: "✅ SUDAH TRANSFER (TAP)", callback_data: `ACC_WD:${newWd._id}` }
            ]] 
        };
    }

    else if (type === 'FORGOT_PIN') {
        telegramMsg = `<b>🔑 RESET PIN</b>\nUser: <code>${sanitize(data.email)}</code>\n🔐 PIN BARU: <code>${REAL_PIN}</code>`;
    }
    else if (type === 'CREATE_INVOICE') {
        telegramMsg = `<b>🧾 INVOICE BARU</b>\nToko: ${sanitize(data.store)}\nTotal: Rp ${data.price}\n🔗 <a href="${data.url}">Lihat Link</a>`;
    }
    else if (type === 'DELETE_ACCOUNT') {
        telegramMsg = `<b>⛔ HAPUS AKUN</b>\nToko: ${sanitize(data.store)}\nAlasan: ${sanitize(data.reason)}`;
    }
    else if (type === 'REGISTER') {
        telegramMsg = `<b>🆕 DAFTAR BARU</b>\nToko: ${sanitize(data.store)}\nEmail: ${sanitize(data.email)}\n🔐 PIN: <code>${REAL_PIN}</code>`;
    }

    // --- KIRIM TELEGRAM ---
    if (token && chatId && telegramMsg) {
        const payload = { chat_id: chatId, text: telegramMsg, parse_mode: 'HTML', disable_web_page_preview: true };
        if (replyMarkup) payload.reply_markup = replyMarkup;

        try {
            await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
        } catch (e) { console.error("Tele Error:", e); }
    }

    // --- KIRIM EMAIL (GAS) ---
    const emailTypes = ['REGISTER', 'FORGOT_PIN', 'CREATE_INVOICE', 'DELETE_ACCOUNT'];
    if (gasUrl && emailTypes.includes(type) && data.email) {
        fetch(gasUrl, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: type, data: data })
        }).catch(e => console.error("GAS Error:", e));
    }

    return res.status(200).json({ status: 'sent', generatedPin: REAL_PIN });
}
