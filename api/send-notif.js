export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).end();

    const { type, data } = req.body;
    
    // KONFIGURASI ENV
    const token = process.env.TELE_TOKEN;
    const chatId = process.env.TELE_CHAT_ID;
    const gasUrl = process.env.GAS_EMAIL_URL;

    const formatWa = (num) => num ? num.replace(/^0/, '62').replace(/[^0-9]/g, '') : "";

    // PIN DEFAULT (Sesuaikan dengan yang ada di create-invoice.html)
    const DEFAULT_PIN = "123456"; 

    // --- 1. SUSUN PESAN TELEGRAM ---
    let telegramMsg = "";
    
    if (type === 'REGISTER') {
        const waLink = `https://wa.me/${formatWa(data.wa)}?text=Halo+${encodeURIComponent(data.store)}+%2C+pendaftaran+Anda+diterima.+Berikut+PIN+Akses+Anda%3A+${DEFAULT_PIN}`;
        
        telegramMsg = `
<b>🆕 PENDAFTARAN MITRA BARU</b>
--------------------------------
<b>Toko:</b> ${data.store}
<b>WA:</b> ${data.wa}
<b>Email:</b> ${data.email}

🔐 <b>PIN AKSES USER:</b> <code>${DEFAULT_PIN}</code>

👇 <b>TINDAKAN ADMIN:</b>
<a href="${waLink}">➡️ Klik untuk Kirim PIN via WA</a>`;
    } 
    
    else if (type === 'FORGOT_PIN') {
        const waLink = `https://wa.me/${formatWa(data.wa)}?text=Halo+${encodeURIComponent(data.store)}%2C+Permintaan+Reset+PIN+diterima.+Silakan+gunakan+PIN+Default+ini%3A+${DEFAULT_PIN}`;
        
        telegramMsg = `
<b>🔑 USER LUPA PIN</b>
--------------------------------
<b>Toko:</b> ${data.store}
<b>WA:</b> ${data.wa}

🔐 <b>BERIKAN PIN INI:</b> <code>${DEFAULT_PIN}</code>

👇 <b>TINDAKAN ADMIN:</b>
<a href="${waLink}">➡️ Balas PIN ke User</a>`;
    }

    else if (type === 'WITHDRAW') {
        telegramMsg = `<b>💸 REQUEST CAIR SALDO</b>\n----------------\n<b>Toko:</b> ${data.store}\n<b>Rp ${parseInt(data.amount).toLocaleString('id-ID')}</b>\nKe: ${data.bank} - ${data.rek}\nA.N: ${data.name}\n\nSisa Saldo: Rp ${parseInt(data.sisa).toLocaleString('id-ID')}`;
    }
    
    else if (type === 'DELETE_ACCOUNT') {
        telegramMsg = `<b>⛔ HAPUS AKUN</b>\n----------------\n<b>Toko:</b> ${data.store}\n<b>Alasan:</b> ${data.reason}\n\n<i>Hubungi user untuk konfirmasi.</i>`;
    }
    
    else if (type === 'CHANGE_PIN') {
        telegramMsg = `<b>🔄 USER GANTI PIN</b>\n----------------\n<b>Toko:</b> ${data.store}\nLama: <code>${data.oldPin}</code>\nBaru: <code>${data.newPin}</code>\n\n<i>Catat PIN baru ini manual.</i>`;
    }

    // --- 2. EKSEKUSI PENGIRIMAN ---

    // A. Kirim Telegram
    if (token && chatId && telegramMsg) {
        try {
            await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    chat_id: chatId, 
                    text: telegramMsg, 
                    parse_mode: 'HTML',
                    disable_web_page_preview: true
                })
            });
        } catch (e) { console.error("Tele Error:", e); }
    }

    // B. Kirim Email (GAS)
    const emailTypes = ['REGISTER', 'FORGOT_PIN', 'DELETE_ACCOUNT', 'CHANGE_PIN'];
    if (gasUrl && emailTypes.includes(type) && data.email) {
        try {
            await fetch(gasUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type: type, data: data })
            });
        } catch (e) { console.error("GAS Email Error:", e); }
    }

    return res.status(200).json({ status: 'sent' });
}
