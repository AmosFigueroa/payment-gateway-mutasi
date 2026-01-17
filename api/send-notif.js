// api/send-notif.js
export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).end();

    const { type, data } = req.body;
    const token = process.env.TELE_TOKEN;
    const chatId = process.env.TELE_CHAT_ID;

    if (!token || !chatId) {
        return res.status(500).json({ error: 'Telegram config missing' });
    }

    let message = "";

    // FORMAT PESAN DAFTAR AKUN
    if (type === 'REGISTER') {
        message = `
<b>🆕 PERMINTAAN PENDAFTARAN MITRA</b>
--------------------------------
<b>Nama Toko:</b> ${data.store}
<b>WhatsApp:</b> ${data.wa}
<b>Email:</b> ${data.email}
--------------------------------
<i>Segera hubungi via WA untuk berikan PIN Login.</i>
`;
    } 
    
    // FORMAT PESAN PENCAIRAN SALDO
    else if (type === 'WITHDRAW') {
        message = `
<b>💸 REQUEST PENCAIRAN SALDO</b>
--------------------------------
<b>Toko:</b> ${data.store}
<b>Nominal:</b> Rp ${parseInt(data.amount).toLocaleString('id-ID')}
<b>Bank:</b> ${data.bank}
<b>No. Rek:</b> ${data.rek}
<b>A.N:</b> ${data.name}
--------------------------------
<b>Sisa Saldo:</b> Rp ${parseInt(data.sisa).toLocaleString('id-ID')}
<i>⚠️ Cairkan H+1 (Besok). Cek mutasi sebelum transfer!</i>
`;
    }

    // KIRIM KE TELEGRAM
    try {
        const url = `https://api.telegram.org/bot${token}/sendMessage`;
        await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: chatId,
                text: message,
                parse_mode: 'HTML'
            })
        });
        return res.status(200).json({ status: 'sent' });
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}
