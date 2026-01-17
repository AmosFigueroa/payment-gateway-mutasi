import mongoose from 'mongoose';

const MONGODB_URI = process.env.MONGODB_URI;

// Schema Withdraw (Simpan data sementara)
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
    
    // Config
    const token = process.env.TELEGRAM_BOT_TOKEN; 
    const chatId = process.env.TELEGRAM_CHAT_ID;
    const gasUrl = process.env.GAS_EMAIL_URL;

    // Helper: Bersihkan Teks (Anti Error HTML Telegram)
    const sanitize = (str) => String(str || "-").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    
    // Helper: Generate PIN & URL
    const REAL_PIN = Math.floor(100000 + Math.random() * 900000).toString();
    data.generatedPin = REAL_PIN; 
    const host = req.headers.host || 'create-invoiceku.vercel.app';
    const protocol = host.includes('localhost') ? 'http' : 'https';
    const baseUrl = `${protocol}://${host}`;

    // Connect DB jika perlu
    if (type === 'WITHDRAW' && mongoose.connection.readyState !== 1) {
        await mongoose.connect(MONGODB_URI);
    }

    let telegramMsg = "";
    let replyMarkup = null;

    // --- TEMPLATE DESAIN BARU ---

    // 1. RESET PIN
    if (type === 'FORGOT_PIN') {
        telegramMsg = `
🔑 <b>PERMINTAAN RESET PIN</b>
────────────────
👤 <b>${sanitize(data.email)}</b>
────────────────
🔐 PIN Baru : <code>${REAL_PIN}</code>
────────────────
<i>✅ Sistem otomatis mengirim email ke user.</i>
`;
    }

    // 2. CREATE INVOICE
    else if (type === 'CREATE_INVOICE') {
        telegramMsg = `
🧾 <b>TAGIHAN BARU DIBUAT</b>
────────────────
🏪 <b>${sanitize(data.store)}</b>
💰 <b>Rp ${data.price}</b>
────────────────
📦 Item : ${sanitize(data.prod)}
🔗 <a href="${data.url}">Buka Link Pembayaran</a>
`;
    }

    // 3. WITHDRAW (PENCAIRAN)
    else if (type === 'WITHDRAW') {
        // Simpan ke DB dulu untuk callback button
        const newWd = new Withdraw({
            store: data.store, email: data.email, amount: data.amount,
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
<i>👉 Transfer manual, lalu klik tombol konfirmasi.</i>
`;
        // Tombol Callback (Tanpa Link Browser)
        replyMarkup = { 
            inline_keyboard: [[
                { text: "✅ SAYA SUDAH TRANSFER", callback_data: `ACC_WD:${newWd._id}` }
            ]] 
        };
    }

    // 4. HAPUS AKUN
    else if (type === 'DELETE_ACCOUNT') {
        telegramMsg = `
⛔ <b>PERMINTAAN HAPUS AKUN</b>
────────────────
🏪 <b>${sanitize(data.store)}</b>
📝 Alasan: ${sanitize(data.reason)}
────────────────
<i>⚠️ Harap tinjau sebelum menghapus data.</i>
`;
    }

    // 5. REGISTER
    else if (type === 'REGISTER') {
        telegramMsg = `
🆕 <b>PENDAFTARAN MITRA BARU</b>
────────────────
🏪 <b>${sanitize(data.store)}</b>
────────────────
📧 Email : ${sanitize(data.email)}
📱 WA    : <code>${sanitize(data.wa)}</code>
🔐 PIN   : <code>${REAL_PIN}</code>
────────────────
<i>✅ Email sambutan telah dikirim.</i>
`;
    }

    // --- EKSEKUSI KIRIM ---

    // 1. Kirim ke Telegram
    if (token && chatId && telegramMsg) {
        try {
            await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    chat_id: chatId, 
                    text: telegramMsg, 
                    parse_mode: 'HTML', 
                    disable_web_page_preview: true,
                    reply_markup: replyMarkup
                })
            });
        } catch (e) { console.error("Tele Error:", e); }
    }

    // 2. Kirim ke Email (GAS)
    const emailTypes = ['REGISTER', 'FORGOT_PIN', 'CREATE_INVOICE', 'DELETE_ACCOUNT'];
    if (gasUrl && emailTypes.includes(type) && data.email) {
        fetch(gasUrl, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: type, data: data })
        }).catch(e => console.error("GAS Error:", e));
    }

    return res.status(200).json({ status: 'sent', generatedPin: REAL_PIN });
}
