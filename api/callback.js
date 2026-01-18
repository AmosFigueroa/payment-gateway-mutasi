import mongoose from 'mongoose';

// --- KONFIGURASI ENV ---
const MONGODB_URI = process.env.MONGODB_URI;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const GAS_EMAIL_URL = process.env.GAS_EMAIL_URL;
const SECRET_KEY = process.env.SECRET_KEY; // Password dari App Mutasi

// --- 1. SCHEMA DATABASE (Wajib Sinkron) ---

// Schema Order (Sama dengan api/checkout.js)
const OrderSchema = new mongoose.Schema({
  order_id: String,
  ref_id: String,
  notify_url: String,
  product_name: String,
  customer_contact: String,
  customer_email: String,
  merchant_email: String, // <--- KUNCI UPDATE SALDO
  store_name: String,
  amount_original: Number,
  unique_code: Number,
  total_pay: Number,
  method: String,
  status: { type: String, default: 'UNPAID' },
  created_at: { type: Date, default: Date.now }
});
const Order = mongoose.models.Order || mongoose.model('Order', OrderSchema);

// Schema User (Sama dengan api/user.js)
const UserSchema = new mongoose.Schema({
  store_name: String,
  email: { type: String, unique: true },
  balance: { type: Number, default: 0 },
});
const User = mongoose.models.User || mongoose.model('User', UserSchema);

export default async function handler(req, res) {
  // Hanya menerima Method POST
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  // Keamanan: Cek Secret Key dari App Mutasi
  const { secret, package_name, message, title, text, big_text } = req.body;
  if (SECRET_KEY && secret !== SECRET_KEY) return res.status(401).send('Unauthorized');

  try {
    // Koneksi Database
    if (mongoose.connection.readyState !== 1) await mongoose.connect(MONGODB_URI);
    
    // --- 2. PARSING DATA MUTASI ---
    const fullMsg = `${message||''} ${title||''} ${text||''} ${big_text||''}`;
    const pkg = package_name ? package_name.toLowerCase() : "";
    
    // Deteksi Bank/E-Wallet (Untuk Laporan)
    let source = "Bank Transfer"; 
    let icon = "🏦";
    
    if (pkg.includes("orderkuota")) { source = "OrderKuota"; icon = "🏪"; }
    else if (pkg.includes("gobiz") || pkg.includes("gopay")) { source = "GoPay/QRIS"; icon = "🟢"; } 
    else if (pkg.includes("dana")) { source = "DANA"; icon = "🔵"; }
    else if (pkg.includes("bca")) { source = "BCA"; icon = "🏦"; }
    else if (pkg.includes("seabank")) { source = "SeaBank"; icon = "🟧"; }
    else if (pkg.includes("bri")) { source = "BRI"; icon = "blue_square"; }
    else if (pkg.includes("mandiri")) { source = "Mandiri"; icon = "yellow_square"; }

    // Ambil Angka Rupiah (Regex Pintar)
    // Mencari format Rp 10.000, 10000, 10.000.00
    const match = fullMsg.match(/Rp\s?\.?([\d,.]+)/i);
    
    // Jika tidak ada angka rupiah di notif, abaikan
    if (!match) return res.status(200).send('No Nominal Detected'); 
    
    // Bersihkan angka (hapus titik, koma, dan 00 di belakang desimal jika ada)
    const rawNominal = match[1].replace(/\./g, '').replace(/,/g, '.'); 
    const nominal = parseInt(rawNominal.split('.')[0]); // Ambil angka bulat saja

    console.log(`Log Mutasi: ${source} - Rp ${nominal}`);

    // --- 3. CARI ORDER YANG COCOK ---
    // Syarat: Status UNPAID & Total Bayar SAMA PERSIS dengan uang masuk
    const paidOrder = await Order.findOne({ status: 'UNPAID', total_pay: nominal });
    
    if (paidOrder) {
      // A. UPDATE STATUS JADI LUNAS
      paidOrder.status = 'PAID';
      await paidOrder.save();

      // B. UPDATE SALDO MERCHANT (Sesuai Email Pemilik Invoice)
      if (paidOrder.merchant_email) {
        await User.findOneAndUpdate(
            { email: paidOrder.merchant_email },
            { $inc: { balance: paidOrder.total_pay } } // Increment saldo
        );
        console.log(`Saldo Updated: ${paidOrder.merchant_email} +${paidOrder.total_pay}`);
      }

      // C. KIRIM EMAIL STRUK KE PEMBELI (Via Google Apps Script)
      if (GAS_EMAIL_URL && paidOrder.customer_email) {
        fetch(GAS_EMAIL_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                type: 'PAYMENT_SUCCESS',
                data: {
                    store: paidOrder.store_name || "Wago Store",
                    email: paidOrder.customer_email,
                    amount: paidOrder.total_pay.toLocaleString('id-ID'),
                    product: paidOrder.product_name,
                    ref: paidOrder.ref_id,
                    date: new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }),
                    bank: source
                }
            })
        }).catch(e => console.error("Email Error:", e));
      }

      // D. NOTIFIKASI TELEGRAM (KE ANDA/ADMIN)
      if (TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID) {
        const textTele = `
${icon} <b>DANA MASUK: Rp ${nominal.toLocaleString('id-ID')}</b>
────────────────────
📦 <b>${paidOrder.product_name}</b>
👤 ${paidOrder.customer_contact || 'Guest'}
🏪 Toko: ${paidOrder.store_name}
────────────────────
✅ <b>STATUS: LUNAS (AUTO)</b>
💰 Saldo Merchant: +Rp ${nominal.toLocaleString('id-ID')}
📧 Email Pembeli: Terkirim
`;
        fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text: textTele, parse_mode: 'HTML' })
        }).catch(e => console.error("Tele Error:", e));
      }

      // E. WEBHOOK KE WEBSITE UTAMA (Jika Integrasi Web Luar)
      // Ini memberitahu website toko Anda bahwa user sudah bayar
      if (paidOrder.notify_url && paidOrder.notify_url.startsWith('http')) {
          fetch(paidOrder.notify_url, {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ 
                  status: 'PAID', 
                  order_id: paidOrder.order_id,
                  ref_id: paidOrder.ref_id,
                  amount: nominal 
              })
          }).catch(e => console.error("Webhook Error:", e));
      }
      
      return res.status(200).json({ status: 'success', message: 'Order Paid & Processed' });
    }

    // Jika tidak ada order yang cocok, tetap return 200 agar App Mutasi tidak mengulang request
    return res.status(200).json({ status: 'ignored', message: 'No matching unpaid order' });

  } catch (e) {
      console.error("Callback Error:", e);
      return res.status(500).send('Server Error'); 
  }
}
