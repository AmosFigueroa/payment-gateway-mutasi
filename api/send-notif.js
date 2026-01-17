export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).end();

    const { type, data } = req.body;
    
    // Config
    const token = process.env.TELE_TOKEN;
    const chatId = process.env.TELE_CHAT_ID;
    const gasUrl = process.env.GAS_EMAIL_URL;
    const DEFAULT_PIN = "123456";

    // Helper URL
    const host = req.headers.host; 
    const protocol = host.includes('localhost') ? 'http' : 'https';
    const baseUrl = `${protocol}://${host}`;

    let telegramMsg = "";
    let replyMarkup = null;

    // --- 1. SETUP PESAN TELEGRAM ---

    if (type === 'REGISTER') {
        telegramMsg = `<b>🆕 DAFTAR BARU</b>\nToko: ${data.store}\nEmail: ${data.email}\n✅ PIN terkirim ke email.`;
    } 
    
    else if (type === 'FORGOT_PIN') {
        // Notif Admin simpel saja
        telegramMsg = `<b>🔑 LUPA PIN (RESET)</b>\nUser: <code>${data.email}</code>\n✅ PIN Reset otomatis dikirim ke email user.`;
    }

    else if (type === 'CREATE_INVOICE') {
        telegramMsg = `<b>🧾 INVOICE DIBUAT</b>\nToko: ${data.store}\nTotal: ${data.price}\nLink: ${data.url}`;
    }

    else if (type === 'WITHDRAW') {
        telegramMsg = `
<b>💸 REQUEST CAIR</b>
Toko: ${data.store}
Total: Rp ${parseInt(data.amount).toLocaleString('id-ID')}
Bank: ${data.bank} - ${data.rek}
A.N: ${data.name}
        `;
        
        // Tombol Konfirmasi Transfer
        const payloadStr = JSON.stringify({
            store: data.store, email: data.email, 
            amount: parseInt(data.amount).toLocaleString('id-ID'),
            bank: data.bank, rek: data.rek, name: data.name
        });
        const encoded = Buffer.from(payloadStr).toString('base64');
        const link = `${baseUrl}/api/confirm-withdraw?data=${encoded}`;

        replyMarkup = { inline_keyboard: [[{ text: "✅ SUDAH DITRANSFER", url: link }]] };
    }

    else if (type === 'DELETE_ACCOUNT') {
        telegramMsg = `<b>⛔ HAPUS AKUN</b>\nToko: ${data.store}\nAlasan: ${data.reason}`;
    }
    
    else if (type === 'CHANGE_PIN') {
        telegramMsg = `<b>🔄 GANTI PIN</b>\nToko: ${data.store}`;
    }

    // --- 2. KIRIM KE TELEGRAM (ADMIN) ---
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

    // --- 3. KIRIM KE EMAIL (USER) ---
    // Pastikan 'FORGOT_PIN' ada di sini!
    const allowedEmailTypes = ['REGISTER', 'FORGOT_PIN', 'CREATE_INVOICE', 'DELETE_ACCOUNT', 'CHANGE_PIN'];
    
    if (gasUrl && allowedEmailTypes.includes(type) && data.email) {
        try {
            await fetch(gasUrl, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type: type, data: data })
            });
        } catch (e) { console.error("GAS Error:", e); }
    }

    return res.status(200).json({ status: 'sent' });
}
