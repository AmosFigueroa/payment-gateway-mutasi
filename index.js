const express = require("express");
const app = express();

app.use(express.json());

// --- KONFIGURASI ---
// Ganti ini dengan password rahasia yang sama dengan di MacroDroid
const SECRET_KEY = "rahasia123";

// --- FUNGSI BANTUAN ---
// Mengubah teks "Rp 100.123" menjadi angka 100123
function parseAmount(text) {
  if (!text) return 0;
  // Hapus semua karakter kecuali angka
  const cleanNumber = text.replace(/[^0-9]/g, "");
  return parseInt(cleanNumber, 10) || 0;
}

// --- ROUTE UTAMA ---
app.get("/", (req, res) => {
  res.send("Server Payment Gateway Aktif!");
});

app.post("/webhook/mutasi", (req, res) => {
  try {
    const { secret_key, message, app_name } = req.body;

    // 1. Cek Keamanan
    if (secret_key !== SECRET_KEY) {
      return res.status(401).json({
        status: "error",
        message: "Kunci rahasia salah!",
      });
    }

    console.log(`[INFO] Notifikasi dari ${app_name}: ${message}`);

    // 2. Ambil Nominal
    const amount = parseAmount(message);

    if (amount === 0) {
      return res.status(400).json({
        status: "error",
        message: "Tidak ada nominal terdeteksi",
      });
    }

    // 3. LOGIKA DATABASE (Di sini Anda sambungkan ke Database nanti)
    // Karena di Vercel tidak bisa simpan data variabel (hilang saat refresh),
    // di sini kita hanya simulasi sukses.

    /* TODO: Sambungkan ke Database (Supabase/MongoDB/MySQL)
           Contoh logika:
           let order = await db.orders.find({ total: amount, status: 'pending' });
           if(order) { updateStatus(order.id, 'success'); }
        */

    // Simulasi Respon Sukses
    return res.json({
      status: "success",
      data: {
        original_text: message,
        detected_amount: amount,
        note: "Silakan sambungkan ke database untuk update status order otomatis.",
      },
    });
  } catch (error) {
    console.error(error);
    return res
      .status(500)
      .json({ status: "error", message: "Internal Server Error" });
  }
});

// Penting untuk Vercel: Export app, jangan app.listen()
module.exports = app;
