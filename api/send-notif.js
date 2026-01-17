export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).end();

    const { type, data } = req.body;
    
    // Config
    const token = process.env.TELE_TOKEN;
    const chatId = process.env.TELE_CHAT_ID;
    const gasUrl = process.env.GAS_EMAIL_URL;
    const host = req.headers.host; 
    const protocol = host.includes('localhost') ? 'http' : 'https';
    const baseUrl = `${protocol}://${host}`;

    // --- FITUR BARU: GENERATE PIN ACAK (PRODUKSI) ---
    // Ini membuat PIN 6 digit acak (contoh: 839201, 119283, dll)
    const REAL_PIN = Math.floor(100000 + Math.random() * 900000).toString();

    let telegramMsg = "";
    let replyMarkup = null;
    
    // Kita simpan PIN yang digenerate ke dalam payload data
    // Agar Google Script mengirim PIN yang SAMA dengan yang di Telegram
    data.generatedPin = REAL_PIN; 

    // --- 1. LOGIKA PESAN TELEGRAM ---

    if (type === 'REGISTER') {
        const waLink = `https://wa.me/${data.wa.replace(/^0/, '62')}?text=Halo+${encodeURIComponent(data.store)}+%2C+PIN+Akses+Anda%3A+${REAL_PIN}`;
        telegramMsg = `
<b>🆕 PENDAFTARAN (REAL DATA)</b>
---------------------------
<b>Toko:</b> ${data.store}
<b>Email:</b> <code>${data.email}</code>
<b>WA:</b> <code>${data.wa}</code>

🔐 <b>PIN GENERATED:</b> <code>${REAL_PIN}</code>

<i>(PIN ini sudah dikirim otomatis ke email user)</i>
👇 <a href="${waLink}">Kirim Manual via WA</a>`;
    } 
    
    else if (type === 'FORGOT_PIN') {
        telegramMsg = `
<b>🔑 RESET PIN (REAL DATA)</b>
---------------------------
<b>User:</b> <code>${data.email}</code>

🔐 <b>PIN BARU:</b> <code>${REAL_PIN}</code>

<i>(User telah menerima PIN baru ini via Email)</i>`;
    }

    else if (type === 'CREATE_INVOICE') {
        telegramMsg = `<b>🧾 INVOICE BARU</b>\nToko: ${data.store}\nTotal: ${data.price}\nLink: ${data.url}`;
    }

    else if (type === 'WITHDRAW') {
        telegramMsg = `
<b>💸 REQUEST CAIR</b>
Toko: ${data.store}
Total: Rp ${parseInt(data.amount).toLocaleString('id-ID')}
Bank: ${data.bank} - ${data.rek}
A.N: ${data.name}
        `;
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

    // --- 2. KIRIM KE TELEGRAM ---
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

    // --- 3. KIRIM KE EMAIL (GOOGLE SCRIPT) ---
    // Kita kirimkan 'generatedPin' ke Google Script agar isinya sinkron
    const allowedEmailTypes = ['REGISTER', 'FORGOT_PIN', 'CREATE_INVOICE', 'DELETE_ACCOUNT', 'CHANGE_PIN'];
    
    if (gasUrl && allowedEmailTypes.includes(type) && data.email) {
        try {
            await fetch(gasUrl, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type: type, data: data }) // Data sudah mengandung generatedPin
            });
        } catch (e) { console.error("GAS Error:", e); }
    }

    return res.status(200).json({ status: 'sent' });
}
