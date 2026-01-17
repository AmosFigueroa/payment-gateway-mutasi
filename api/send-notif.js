export default async function handler(req, res) {
    // 1. Cek Metode
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { type, data } = req.body;
    
    // 2. Ambil Config & Cek Kelengkapan
    const token = process.env.TELE_TOKEN;
    const chatId = process.env.TELE_CHAT_ID;
    const gasUrl = process.env.GAS_EMAIL_URL;

    // Jika Token belum diset di Vercel, hentikan biar gak error diam-diam
    if (!token || !chatId) {
        console.error("TELE_TOKEN atau TELE_CHAT_ID belum diset di Vercel!");
        return res.status(500).json({ error: 'Config Telegram Missing' });
    }

    // --- HELPER: BERSIHKAN TEKS (Agar Telegram Gak Error) ---
    // Mengubah karakter < > & menjadi aman
    const sanitize = (str) => {
        if (!str) return "-";
        return String(str)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");
    };

    // Generate PIN Acak
    const REAL_PIN = Math.floor(100000 + Math.random() * 900000).toString();
    data.generatedPin = REAL_PIN; // Simpan untuk dikirim ke Email juga

    // URL Helper
    const host = req.headers.host || 'create-invoiceku.vercel.app';
    const protocol = host.includes('localhost') ? 'http' : 'https';
    const baseUrl = `${protocol}://${host}`;

    let telegramMsg = "";
    let replyMarkup = null;

    // --- 3. SUSUN PESAN (DENGAN SANITIZE) ---

    if (type === 'REGISTER') {
        const cleanStore = sanitize(data.store);
        const waLink = `https://wa.me/${data.wa.replace(/^0/, '62')}?text=Halo+${encodeURIComponent(data.store)}+%2C+PIN+Akses+Anda%3A+${REAL_PIN}`;
        
        telegramMsg = `
<b>🆕 PENDAFTARAN MITRA</b>
---------------------------
<b>Toko:</b> ${cleanStore}
<b>WA:</b> <code>${sanitize(data.wa)}</code>
<b>Email:</b> <code>${sanitize(data.email)}</code>

🔐 <b>PIN SYSTEM:</b> <code>${REAL_PIN}</code>

<i>(Email berisi PIN sudah dikirim ke user)</i>
👇 <a href="${waLink}">Chat WA Manual</a>`;
    } 
    
    else if (type === 'FORGOT_PIN') {
        telegramMsg = `
<b>🔑 REQUEST RESET PIN</b>
---------------------------
<b>User:</b> <code>${sanitize(data.email)}</code>

🔐 <b>PIN BARU:</b> <code>${REAL_PIN}</code>

<i>(Sistem otomatis mengirim PIN ini ke email user)</i>`;
    }

    else if (type === 'CREATE_INVOICE') {
        telegramMsg = `
<b>🧾 LINK INVOICE DIBUAT</b>
---------------------------
<b>Toko:</b> ${sanitize(data.store)}
<b>Total:</b> Rp ${data.price}
<b>Item:</b> ${sanitize(data.prod)}

🔗 <a href="${data.url}">Lihat Link Pembayaran</a>`;
    }

    else if (type === 'WITHDRAW') {
        telegramMsg = `
<b>💸 REQUEST CAIR SALDO</b>
---------------------------
<b>Toko:</b> ${sanitize(data.store)}
<b>Nominal:</b> Rp ${parseInt(data.amount).toLocaleString('id-ID')}
---------------------------
<b>Bank:</b> ${sanitize(data.bank)}
<b>Rek:</b> <code>${sanitize(data.rek)}</code>
<b>A.N:</b> ${sanitize(data.name)}
---------------------------
<i>Klik tombol di bawah JIKA SUDAH TRANSFER manual.</i>`;
        
        // Data untuk tombol konfirmasi
        const payloadStr = JSON.stringify({
            store: data.store, email: data.email, 
            amount: parseInt(data.amount).toLocaleString('id-ID'),
            bank: data.bank, rek: data.rek, name: data.name
        });
        const encoded = Buffer.from(payloadStr).toString('base64');
        const link = `${baseUrl}/api/confirm-withdraw?data=${encoded}`;

        replyMarkup = { inline_keyboard: [[{ text: "✅ SAYA SUDAH TRANSFER", url: link }]] };
    }

    else if (type === 'DELETE_ACCOUNT') {
        telegramMsg = `<b>⛔ HAPUS AKUN</b>\nToko: ${sanitize(data.store)}\nAlasan: ${sanitize(data.reason)}`;
    }
    
    else if (type === 'CHANGE_PIN') {
        telegramMsg = `<b>🔄 GANTI PIN</b>\nToko: ${sanitize(data.store)}`;
    }

    // --- 4. KIRIM KE TELEGRAM ---
    if (telegramMsg) {
        const payload = { 
            chat_id: chatId, 
            text: telegramMsg, 
            parse_mode: 'HTML', 
            disable_web_page_preview: true 
        };
        if (replyMarkup) payload.reply_markup = replyMarkup;

        try {
            const teleRes = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            
            // Log jika Telegram menolak pesan (Misal karena format salah)
            if (!teleRes.ok) {
                const errData = await teleRes.text();
                console.error("TELEGRAM ERROR:", errData);
            }
        } catch (e) {
            console.error("FETCH ERROR:", e);
        }
    }

    // --- 5. KIRIM KE EMAIL (GOOGLE SCRIPT) ---
    // Pastikan 'FORGOT_PIN' masuk list
    const allowedEmailTypes = ['REGISTER', 'FORGOT_PIN', 'CREATE_INVOICE', 'DELETE_ACCOUNT', 'CHANGE_PIN'];
    
    if (gasUrl && allowedEmailTypes.includes(type) && data.email) {
        try {
            // Gunakan mode 'no-cors' atau abaikan result agar tidak membebani response time
            fetch(gasUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type: type, data: data })
            }).catch(e => console.error("GAS Error:", e));
        } catch (e) { console.error("GAS Fetch Error:", e); }
    }

    return res.status(200).json({ status: 'sent', generatedPin: REAL_PIN });
}
