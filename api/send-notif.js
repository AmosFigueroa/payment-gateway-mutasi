export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).end();

    const { type, data } = req.body;
    
    // 1. KIRIM KE TELEGRAM (Tetap Jalan)
    const token = process.env.TELE_TOKEN;
    const chatId = process.env.TELE_CHAT_ID;
    
    // Pesan Telegram (Sama seperti sebelumnya, dipersingkat di sini)
    // ... Logika pesan Telegram Anda yang sudah ada ...
    let telegramMsg = `<b>🔔 NOTIFIKASI BARU: ${type}</b>\nToko: ${data.store}`; 
    // (Gunakan template lengkap dari jawaban sebelumnya untuk hasil terbaik)

    if (token && chatId) {
        try {
            await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chat_id: chatId, text: telegramMsg, parse_mode: 'HTML' })
            });
        } catch (e) { console.error("Tele Error:", e); }
    }

    // 2. [BARU] KIRIM KE GOOGLE APPS SCRIPT (EMAIL)
    const gasUrl = process.env.GAS_EMAIL_URL;
    
    // Hanya kirim email jika ada URL GAS dan ada Email User di data
    if (gasUrl && data.email) {
        try {
            await fetch(gasUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type: type, data: data })
            });
        } catch (e) {
            console.error("GAS Email Error:", e);
            // Jangan return error, biarkan sukses walau email gagal (fail-safe)
        }
    }

    return res.status(200).json({ status: 'sent' });
}
