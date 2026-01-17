export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { type, data } = req.body;
    
    // 1. KONFIGURASI (Sesuai Screenshot Anda)
    const token = process.env.TELEGRAM_BOT_TOKEN; 
    const chatId = process.env.TELEGRAM_CHAT_ID;
    const gasUrl = process.env.GAS_EMAIL_URL;

    // Helper: Bersihkan Teks agar Telegram tidak Error HTML
    const sanitize = (str) => {
        if (!str) return "-";
        return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    };

    // Helper: URL Base
    const host = req.headers.host || 'create-invoiceku.vercel.app';
    const protocol = host.includes('localhost') ? 'http' : 'https';
    const baseUrl = `${protocol}://${host}`;

    // FITUR: Generate PIN 6 Digit Acak (Untuk Reset/Daftar)
    const REAL_PIN = Math.floor(100000 + Math.random() * 900000).toString();
    // Masukkan PIN ke data agar dikirim ke Email juga
    data.generatedPin = REAL_PIN; 

    let telegramMsg = "";
    let replyMarkup = null;

    // --- LOGIKA NOTIFIKASI ---

    // A. RESET PIN (LUPA PIN)
    if (type === 'FORGOT_PIN') {
        telegramMsg = `
<b>🔑 PERMINTAAN RESET PIN</b>
────────────────────
👤 User: <code>${sanitize(data.email)}</code>

🔐 <b>PIN BARU:</b> <code>${REAL_PIN}</code>

<i>(Sistem telah otomatis mengirim PIN ini ke email user)</i>
`;
    }

    // B. CREATE INVOICE (BUAT LINK)
    else if (type === 'CREATE_INVOICE') {
        telegramMsg = `
<b>🧾 LINK INVOICE DIBUAT</b>
────────────────────
🏪 Toko: ${sanitize(data.store)}
💰 Total: Rp ${data.price}
📦 Item: ${sanitize(data.prod)}

🔗 <a href="${data.url}">Lihat Link Pembayaran</a>
`;
    }

    // C. WITHDRAW (PENCAIRAN)
    else if (type === 'WITHDRAW') {
        telegramMsg = `
<b>💸 REQUEST CAIR SALDO</b>
────────────────────
🏪 Toko: ${sanitize(data.store)}
💰 <b>Rp ${parseInt(data.amount).toLocaleString('id-ID')}</b>
────────────────────
🏦 Bank: ${sanitize(data.bank)}
💳 Rek : <code>${sanitize(data.rek)}</code>
👤 A.N : ${sanitize(data.name)}

<i>👉 Silakan transfer manual, lalu klik tombol di bawah.</i>
`;
        
        // Buat Link Konfirmasi (Tombol Telegram)
        const payloadStr = JSON.stringify({
            store: data.store, email: data.email, 
            amount: parseInt(data.amount).toLocaleString('id-ID'),
            bank: data.bank, rek: data.rek, name: data.name
        });
        const encoded = Buffer.from(payloadStr).toString('base64');
        const link = `${baseUrl}/api/confirm-withdraw?data=${encoded}`;

        replyMarkup = { inline_keyboard: [[{ text: "✅ SAYA SUDAH TRANSFER", url: link }]] };
    }

    // D. HAPUS AKUN
    else if (type === 'DELETE_ACCOUNT') {
        telegramMsg = `
<b>⛔ PERMINTAAN HAPUS AKUN</b>
────────────────────
🏪 Toko: ${sanitize(data.store)}
❓ Alasan: ${sanitize(data.reason)}

<i>(Harap tinjau database dan hapus manual jika perlu)</i>
`;
    }

    // E. DAFTAR BARU
    else if (type === 'REGISTER') {
        telegramMsg = `
<b>🆕 PENDAFTARAN MITRA</b>
────────────────────
🏪 Toko: ${sanitize(data.store)}
📧 Email: ${sanitize(data.email)}
📱 WA: ${sanitize(data.wa)}

🔐 <b>PIN AWAL:</b> <code>${REAL_PIN}</code>
`;
    }

    // --- EKSEKUSI ---

    // 1. Kirim ke Telegram Admin
    if (token && chatId && telegramMsg) {
        const payload = { 
            chat_id: chatId, 
            text: telegramMsg, 
            parse_mode: 'HTML', 
            disable_web_page_preview: true 
        };
        if (replyMarkup) payload.reply_markup = replyMarkup;

        try {
            await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
        } catch (e) { console.error("Tele Error:", e); }
    }

    // 2. Kirim ke Google Script (Agar User dapat Email)
    const emailTypes = ['REGISTER', 'FORGOT_PIN', 'CREATE_INVOICE', 'DELETE_ACCOUNT'];
    
    if (gasUrl && emailTypes.includes(type) && data.email) {
        try {
            await fetch(gasUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type: type, data: data })
            });
        } catch (e) { console.error("GAS Error:", e); }
    }

    // Kembalikan PIN ke Frontend (Untuk Login tanpa Database)
    return res.status(200).json({ status: 'sent', generatedPin: REAL_PIN });
}
