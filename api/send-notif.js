export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).end();

    const { type, data } = req.body;
    
    // KONFIGURASI ENV (Pastikan sudah disetting di Vercel)
    const token = process.env.TELE_TOKEN;
    const chatId = process.env.TELE_CHAT_ID;
    const gasUrl = process.env.GAS_EMAIL_URL; // URL Script Google tadi

    // Helper: Format nomor WA
    const formatWa = (num) => num ? num.replace(/^0/, '62').replace(/[^0-9]/g, '') : "";

    // --- 1. SUSUN PESAN TELEGRAM ---
    let telegramMsg = "";
    
    if (type === 'REGISTER') {
        const waLink = `https://wa.me/${formatWa(data.wa)}?text=Halo+${encodeURIComponent(data.store)}+%2C+pendaftaran+diterima.+PIN+Anda%3A+123456`;
        telegramMsg = `<b>🆕 DAFTAR MITRA BARU</b>\n----------------\n<b>Toko:</b> ${data.store}\n<b>WA:</b> ${data.wa}\n<b>Email:</b> ${data.email}\n\n👇 <a href="${waLink}">Kirim PIN via WA</a>`;
    } 
    else if (type === 'FORGOT_PIN') {
        const waLink = `https://wa.me/${formatWa(data.wa)}?text=Halo+${encodeURIComponent(data.store)}%2C+Reset+PIN+berhasil.+PIN+Baru%3A+...`;
        telegramMsg = `<b>🔑 LUPA PIN (RESET)</b>\n----------------\n<b>Toko:</b> ${data.store}\n<b>WA:</b> ${data.wa}\n<b>Email:</b> ${data.email}\n\n👇 <a href="${waLink}">Balas PIN Baru</a>`;
    }
    else if (type === 'WITHDRAW') {
        telegramMsg = `<b>💸 REQUEST CAIR SALDO</b>\n----------------\n<b>Toko:</b> ${data.store}\n<b>Rp ${parseInt(data.amount).toLocaleString('id-ID')}</b>\nKe: ${data.bank} - ${data.rek}\nA.N: ${data.name}\n\nSisa Saldo: Rp ${parseInt(data.sisa).toLocaleString('id-ID')}`;
    }
    else if (type === 'DELETE_ACCOUNT') {
        telegramMsg = `<b>⛔ HAPUS AKUN</b>\n----------------\n<b>Toko:</b> ${data.store}\n<b>Alasan:</b> ${data.reason}\n\n<i>Hubungi user untuk konfirmasi.</i>`;
    }
    else if (type === 'CHANGE_PIN') {
        telegramMsg = `<b>🔄 USER GANTI PIN</b>\n----------------\n<b>Toko:</b> ${data.store}\nLama: <code>${data.oldPin}</code>\nBaru: <code>${data.newPin}</code>`;
    }

    // --- 2. EKSEKUSI PENGIRIMAN ---

    // A. Kirim Telegram (Prioritas Utama)
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

    // B. Kirim Email via Google Apps Script (Background Process)
    // Hanya kirim email untuk tipe tertentu yang butuh notif ke user
    const emailTypes = ['REGISTER', 'FORGOT_PIN', 'DELETE_ACCOUNT', 'CHANGE_PIN'];
    
    if (gasUrl && emailTypes.includes(type) && data.email) {
        try {
            // Kita gunakan fetch tanpa await (fire and forget) agar respon UI cepat
            // Atau gunakan await jika ingin memastikan email terkirim
            await fetch(gasUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type: type, data: data })
            });
        } catch (e) { console.error("GAS Email Error:", e); }
    }

    return res.status(200).json({ status: 'sent' });
}
