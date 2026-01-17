import mongoose from 'mongoose';

const MONGODB_URI = process.env.MONGODB_URI;

// 1. Schema User (Wajib sama dengan api/user.js agar bisa update PIN)
const UserSchema = new mongoose.Schema({
  store_name: String,
  email: { type: String, unique: true, required: true },
  wa: String,
  pin: String,
  balance: { type: Number, default: 0 },
});
const User = mongoose.models.User || mongoose.model('User', UserSchema);

// 2. Schema Withdraw (Untuk tombol konfirmasi transfer)
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

    // Helper
    const sanitize = (str) => String(str || "-").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const host = req.headers.host || 'create-invoiceku.vercel.app';
    const protocol = host.includes('localhost') ? 'http' : 'https';
    const baseUrl = `${protocol}://${host}`;

    // GENERATE PIN BARU
    const REAL_PIN = Math.floor(100000 + Math.random() * 900000).toString();
    data.generatedPin = REAL_PIN; 

    // KONEKSI DATABASE (PENTING!)
    if (mongoose.connection.readyState !== 1) await mongoose.connect(MONGODB_URI);

    let telegramMsg = "";
    let replyMarkup = null;

    // --- LOGIKA UTAMA ---

    // A. RESET PIN (UPDATE DATABASE)
    if (type === 'FORGOT_PIN') {
        // Cari User & Update PIN di MongoDB
        const updatedUser = await User.findOneAndUpdate(
            { email: data.email },
            { pin: REAL_PIN } // <-- INI PERBAIKANNYA (Simpan PIN Baru)
        );

        if (!updatedUser) {
            // Jika email tidak ada di database
            return res.status(404).json({ error: 'Email tidak terdaftar di database' });
        }

        telegramMsg = `
🔑 <b>PERMINTAAN RESET PIN</b>
────────────────
👤 <b>${sanitize(data.email)}</b>
────────────────
🔐 PIN Baru : <code>${REAL_PIN}</code>
────────────────
<i>✅ PIN di Database sudah diupdate.</i>
<i>✅ Email notifikasi terkirim.</i>
`;
    }

    // B. REGISTER (LOG)
    // Note: Register sebenarnya sudah simpan PIN di api/user.js, 
    // tapi notif ini hanya laporan. Kita tampilkan PIN yg diinput user (jika ada) atau generated.
    else if (type === 'REGISTER') {
        // Tidak perlu update DB karena api/user.js sudah melakukannya saat register
        // Kita pakai PIN yang dikirim dari frontend (jika ada) atau generated
        const pinDisplay = data.pin || REAL_PIN; 
        
        telegramMsg = `
🆕 <b>PENDAFTARAN MITRA BARU</b>
────────────────
🏪 <b>${sanitize(data.store)}</b>
────────────────
📧 Email : ${sanitize(data.email)}
📱 WA    : <code>${sanitize(data.wa)}</code>
🔐 PIN   : <code>${pinDisplay}</code>
────────────────
<i>✅ User berhasil disimpan di Database.</i>
`;
    }

    // C. CREATE INVOICE
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

    // D. WITHDRAW (SIMPAN DB UTK TOMBOL)
    else if (type === 'WITHDRAW') {
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
        replyMarkup = { 
            inline_keyboard: [[
                { text: "✅ SAYA SUDAH TRANSFER", callback_data: `ACC_WD:${newWd._id}` }
            ]] 
        };
    }

    // E. HAPUS AKUN
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

    // --- EKSEKUSI KIRIM ---

    // 1. Kirim Telegram
    if (token && chatId && telegramMsg) {
        try {
            await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    chat_id: chatId, text: telegramMsg, parse_mode: 'HTML', 
                    disable_web_page_preview: true, reply_markup: replyMarkup
                })
            });
        } catch (e) { console.error("Tele Error:", e); }
    }

    // 2. Kirim Email (GAS)
    const emailTypes = ['REGISTER', 'FORGOT_PIN', 'CREATE_INVOICE', 'DELETE_ACCOUNT'];
    if (gasUrl && emailTypes.includes(type) && data.email) {
        fetch(gasUrl, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: type, data: data })
        }).catch(e => console.error("GAS Error:", e));
    }

    return res.status(200).json({ status: 'sent', generatedPin: REAL_PIN });
}
