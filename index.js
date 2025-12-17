export default async function handler(req, res) {
  // --- KONFIGURASI ---
  // Masukkan Secret Key Anda di sini
  const MY_SECRET_KEY = "RYZR6.CY6W-u6-Do"; 

  // --- 1. CEK METODE (Wajib POST) ---
  if (req.method !== 'POST') {
    return res.status(405).json({ 
      success: false, 
      message: 'Method Not Allowed. Gunakan POST.' 
    });
  }

  try {
    // --- 2. VALIDASI KUNCI RAHASIA (UNIVERSAL) ---
    // Script ini akan mencari kunci di 4 tempat berbeda secara urut:
    const receivedKey = 
      req.query.secret_key ||                                 // 1. Cek di URL (?secret_key=...) -> INI SOLUSI UTAMA ANDA
      (req.headers['authorization'] && req.headers['authorization'].split(' ')[1]) || // 2. Cek Header Bearer
      req.headers['x-api-key'] ||                             // 3. Cek Header X-API-KEY
      req.body.secret_key;                                    // 4. Cek di dalam Body JSON

    // Jika kunci tidak ditemukan atau salah
    if (receivedKey !== MY_SECRET_KEY) {
      console.warn(`[WARNING] Akses ditolak dari IP: ${req.headers['x-forwarded-for'] || 'Unknown'}`);
      return res.status(401).json({ 
        success: false, 
        message: 'Akses Ditolak: Secret Key salah atau tidak ditemukan.' 
      });
    }

    // --- 3. MENANGKAP DATA PESAN (FLEXIBLE) ---
    // Mencegah error "null" dengan mengecek berbagai kemungkinan nama variabel
    const sender = req.body.sender || req.body.title || req.body.from || "Unknown";
    const rawMessage = req.body.message || req.body.msg || req.body.body || req.body.text || "";

    // Log ke dashboard Vercel untuk memantau pesan masuk
    console.log(`[INFO] Pesan Masuk dari ${sender}: "${rawMessage}"`);

    // --- 4. (OPSIONAL) PARSING NOMINAL RUPIAH ---
    // Contoh sederhana mengambil angka setelah "Rp" (Misal: "Dana masuk Rp 50.000")
    let detectedAmount = 0;
    // Regex mencari pola "Rp" diikuti spasi opsional dan angka/titik
    const amountMatch = rawMessage.match(/Rp\s?([\d\.]+)/i); 
    if (amountMatch) {
      // Hapus titik (.) agar menjadi integer murni (50000)
      detectedAmount = parseInt(amountMatch[1].replace(/\./g, ''));
    }

    // --- 5. SUKSES (RESPON 200 OK) ---
    // Memberi tahu aplikasi Android bahwa data sudah diterima
    return res.status(200).json({
      success: true,
      message: 'Data berhasil diterima server',
      data: {
        sender: sender,
        amount: detectedAmount,
        original_message: rawMessage
      }
    });

  } catch (error) {
    console.error("[ERROR] Server Error:", error);
    return res.status(500).json({ 
      success: false, 
      message: 'Terjadi kesalahan pada server Vercel.' 
    });
  }
}
