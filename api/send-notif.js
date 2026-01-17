export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).end();

    const { type, data } = req.body;
    
    // Config
    const token = process.env.TELE_TOKEN;
    const chatId = process.env.TELE_CHAT_ID;
    const gasUrl = process.env.GAS_EMAIL_URL;
    const DEFAULT_PIN = "123456";

    // Auto-detect domain website Anda (agar link tombolnya benar)
    const host = req.headers.host; 
    const protocol = host.includes('localhost') ? 'http' : 'https';
    const baseUrl = `${protocol}://${host}`;

    let telegramMsg = "";
    let replyMarkup = null; // Untuk tombol

    // --- 1. LOGIKA WITHDRAW (UPDATE UTAMA) ---
    if (type === 'WITHDRAW') {
        telegramMsg = `
<b>💸 REQUEST CAIR SALDO</b>
---------------------------
<b>Toko:</b> ${data.store}
<b>Nominal:</b> Rp ${parseInt(data.amount).toLocaleString('id-ID')}
---------------------------
<b>Bank:</b> ${data.bank}
<b>Rek:</b> <code>${data.rek}</code>
<b>A.N:</b> ${data.name}
---------------------------
<i>1. Silakan transfer manual ke rekening di atas.</i>
<i>2. Jika sudah, klik tombol di bawah untuk notif user.</i>
`;
        
        // Bungkus data untuk dikirim ke link konfirmasi
        const wdPayload = JSON.stringify({
            store: data.store,
            email: data.email, // Email User (PENTING)
            amount: parseInt(data.amount).toLocaleString('id-ID'),
            bank: data.bank,
            rek: data.rek,
            name: data.name
        });
        
        // Enkripsi data jadi kode aneh (Base64) agar aman di URL
        const encodedData = Buffer.from(wdPayload).toString('base64');
        const approvalUrl = `${baseUrl}/api/confirm-withdraw?data=${encodedData}`;

        // Tombol Telegram
        replyMarkup = {
            inline_keyboard: [[
                { text: "✅ SAYA SUDAH TRANSFER", url: approvalUrl }
            ]]
        };
    }

    // --- LOGIKA LAIN (TETAP SAMA) ---
    else if (type === 'REGISTER') {
        telegramMsg = `<b>🆕 DAFTAR BARU</b>\nUser: ${data.store}\nEmail: ${data.email}\n✅ <i>PIN dikirim ke email.</i>`;
    } 
    else if (type === 'FORGOT_PIN') {
        telegramMsg = `<b>🔑 LUPA PIN</b>\nUser: ${data.email}\n✅ <i>PIN Reset dikirim ke email.</i>`;
    }
    else if (type === 'DELETE_ACCOUNT') {
        telegramMsg = `<b>⛔ HAPUS AKUN</b>\nUser: ${data.store}\nAlasan: ${data.reason}`;
    }
    else if (type === 'CREATE_INVOICE') {
        telegramMsg = `<b>🧾 INVOICE BARU</b>\nToko: ${data.store}\nTotal: ${data.price}\nLink: ${data.url}`;
    }

    // --- EKSEKUSI ---
    
    // 1. Kirim Telegram (Dengan Tombol jika ada)
    if (token && chatId && telegramMsg) {
        const payload = { chat_id: chatId, text: telegramMsg, parse_mode: 'HTML', disable_web_page_preview: true };
        if (replyMarkup) payload.reply_markup = replyMarkup; // Pasang tombol

        try {
            await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
        } catch (e) { console.error("Tele Error:", e); }
    }

    // 2. Kirim Email (Langsung) untuk tipe NON-Withdraw
    // Withdraw dikirim nanti, setelah admin klik tombol
    const directEmailTypes = ['REGISTER', 'FORGOT_PIN', 'DELETE_ACCOUNT', 'CREATE_INVOICE'];
    if (gasUrl && directEmailTypes.includes(type) && data.email) {
        try {
            await fetch(gasUrl, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type: type, data: data })
            });
        } catch (e) { console.error("GAS Error:", e); }
    }

    return res.status(200).json({ status: 'sent' });
}
