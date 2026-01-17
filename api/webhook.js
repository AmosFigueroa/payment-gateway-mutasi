import mongoose from 'mongoose';

const MONGODB_URI = process.env.MONGODB_URI;
const TELE_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const GAS_EMAIL_URL = process.env.GAS_EMAIL_URL;

// Schema Withdraw (Sama dengan send-notif)
const WithdrawSchema = new mongoose.Schema({
  store: String, email: String, amount: Number,
  bank: String, rek: String, name: String,
  status: { type: String, default: 'PENDING' },
});
const Withdraw = mongoose.models.Withdraw || mongoose.model('Withdraw', WithdrawSchema);

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(200).send('OK'); // Telegram butuh status 200

    const body = req.body;

    // --- HANDLE TOMBOL KLIK (CALLBACK QUERY) ---
    if (body.callback_query) {
        const callbackId = body.callback_query.id;
        const chatId = body.callback_query.message.chat.id;
        const messageId = body.callback_query.message.message_id;
        const data = body.callback_query.data; // Format: "ACC_WD:ID_MONGO"

        if (data.startsWith('ACC_WD:')) {
            const wdId = data.split(':')[1];

            try {
                if (mongoose.connection.readyState !== 1) await mongoose.connect(MONGODB_URI);

                // 1. Ambil Data Withdraw dari DB
                const wdData = await Withdraw.findById(wdId);
                
                if (!wdData) {
                    await answerCallback(callbackId, "❌ Data tidak ditemukan / kadaluarsa!");
                    return res.status(200).send('OK');
                }

                if (wdData.status === 'SUCCESS') {
                    await answerCallback(callbackId, "⚠️ Transaksi ini sudah diproses sebelumnya.");
                    return res.status(200).send('OK');
                }

                // 2. Kirim Email Notifikasi ke User (Via GAS)
                if (GAS_EMAIL_URL) {
                    await fetch(GAS_EMAIL_URL, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            type: 'WITHDRAW_SUCCESS',
                            data: {
                                store: wdData.store,
                                email: wdData.email,
                                amount: wdData.amount.toLocaleString('id-ID'),
                                bank: wdData.bank,
                                rek: wdData.rek,
                                name: wdData.name
                            }
                        })
                    });
                }

                // 3. Update Status DB
                wdData.status = 'SUCCESS';
                await wdData.save();

                // 4. Ubah Pesan Telegram Jadi "SUKSES" (Hapus Tombol)
                await editMessage(chatId, messageId, `
<b>✅ PENCAIRAN BERHASIL</b>
────────────────────
🏪 Toko: ${wdData.store}
💰 Total: Rp ${wdData.amount.toLocaleString('id-ID')}
────────────────────
User telah menerima email notifikasi sukses.
Status: 🟢 TRANSFER DONE
`);

                // 5. Tutup Loading Spinner di Telegram
                await answerCallback(callbackId, "✅ Berhasil dikonfirmasi!");

            } catch (error) {
                console.error(error);
                await answerCallback(callbackId, "❌ Terjadi kesalahan server.");
            }
        }
    }

    return res.status(200).send('OK');
}

// --- FUNGSI BANTUAN TELEGRAM ---

async function answerCallback(callback_query_id, text) {
    await fetch(`https://api.telegram.org/bot${TELE_TOKEN}/answerCallbackQuery`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callback_query_id, text })
    });
}

async function editMessage(chat_id, message_id, text) {
    await fetch(`https://api.telegram.org/bot${TELE_TOKEN}/editMessageText`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id, message_id, text, parse_mode: 'HTML' })
    });
}
