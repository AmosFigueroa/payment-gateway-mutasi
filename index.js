const express = require('express');
const app = express();

app.use(express.json());

// --- KONFIGURASI PRODUKSI ---
// Password diambil dari Environment Variable Vercel (Aman)
const SECRET_KEY = process.env.SECRET_KEY;

// --- FUNGSI BANTUAN ---
function parseAmount(text) {
    if (!text) return 0;
    // Hapus karakter non-angka (Rp, titik, koma)
    const cleanNumber = text.replace(/[^0-9]/g, '');
    return parseInt(cleanNumber, 10) || 0;
}

// --- ROUTE UTAMA ---
app.get('/', (req, res) => {
    res.json({ status: "active", mode: "production" });
});

app.post('/webhook/mutasi', async (req, res) => {
    try {
        const { secret_key, message, app_name } = req.body;

        // 1. Validasi Keamanan (Wajib ada SECRET_KEY di Vercel)
        if (!SECRET_KEY) {
            console.error("[CRITICAL] SECRET_KEY belum disetting di Vercel!");
            return res.status(500).json({ status: 'error', message: 'Server misconfiguration' });
        }

        if (secret_key !== SECRET_KEY) {
            console.warn(`[WARNING] Percobaan akses ilegal dari IP: ${req.ip}`);
            return res.status(401).json({ status: 'error', message: 'Akses Ditolak: Password Salah' });
        }

        // 2. Parsing Data
        const amount = parseAmount(message);
        console.log(`[INFO] Mutasi Masuk: Rp ${amount} via ${app_name}`);

        if (amount <= 0) {
            return res.status(400).json({ status: 'ignored', message: 'Nominal tidak terdeteksi' });
        }

        // 3. TODO: INTEGRASI DATABASE (Production)
        // Di sini tempat Anda update status order user di database Anda (MySQL/Mongo/Supabase)
        // Contoh logika:
        // const order = await db.orders.find({ total_tagihan: amount, status: 'UNPAID' });
        // if (order) { await db.orders.update({ id: order.id }, { status: 'PAID' }); }

        return res.json({
            status: 'success',
            data: {
                received_amount: amount,
                source_app: app_name,
                timestamp: new Date().toISOString()
            }
        });

    } catch (error) {
        console.error("[ERROR]", error);
        return res.status(500).json({ status: 'error', message: 'Internal Server Error' });
    }
});

module.exports = app;
