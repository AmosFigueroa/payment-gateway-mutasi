import mongoose from 'mongoose';

// KONFIGURASI
const MONGODB_URI = process.env.MONGODB_URI;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const GAS_EMAIL_URL = process.env.GAS_EMAIL_URL;
const SECRET_KEY = process.env.SECRET_KEY;
const STORE_WEBHOOK_URL = process.env.STORE_WEBHOOK_URL;

// 1. SCHEMA ORDER (Wajib sama persis dengan api/checkout.js)
const OrderSchema = new mongoose.Schema({
  order_id: String,
  ref_id: String,
  notify_url: String,
  product_name: String,
  customer_contact: String,
  customer_email: String,
  merchant_email: String, // <--- Data Pemilik Toko (Untuk Update Saldo)
  store_name: String,
  amount_original: Number,
  unique_code: Number,
  total_pay: Number,
  method: String,
  status: { type: String, default: 'UNPAID' },
  qris_string: String,
  created_at: { type: Date, default: Date.now }
});
const Order = mongoose.models.Order || mongoose.model('Order', OrderSchema);

// 2. SCHEMA USER (Untuk Update Saldo Merchant)
const UserSchema = new mongoose.Schema({
  store_name: String,
  email: { type: String, unique: true },
  balance: { type: Number, default: 0 },
});
const User = mongoose.models.User || mongoose.model('User', UserSchema);

export default async function handler(req, res) {
  // Hanya menerima POST (Dari Aplikasi Mutasi)
  if (req.method !== 'POST') return res.status(405).send('Not Allowed');

  // Keamanan: Cek Secret Key
  const { secret, package_name, message, title, text, big_text } = req.body;
  if (SECRET_KEY && secret !== SECRET_KEY) return res.status(401).send('Unauthorized');

  try {
    if (mongoose.connection.readyState !== 1) await mongoose.connect(MONGODB_URI);
    
    // --- 1. DETEKSI BANK & NOMINAL ---
    const fullMsg = `${message||''} ${title||''} ${text||''} ${big_text||''}`;
    const pkg = package_name ? package_name.toLowerCase() : "";
    
    // Deteksi Sumber Dana (Ikon Telegram)
    let source = "Bank Transfer"; let icon = "🏦";
    if (pkg.includes("orderkuota")) { source = "OrderKuota"; icon = "🏪"; }
    else if (pkg.includes("gobiz")) { source = "GoPay Merchant"; icon = "🟢"; } 
    else if (pkg.includes("dana")) { source = "DANA"; icon = "🔵"; }
    else if (pkg.includes("bca")) { source = "BCA Mobile"; icon = "🏦"; }
    else if (pkg.includes("seabank")) { source = "SeaBank"; icon = "🟧"; }

    // Ambil Angka Rupiah (Regex)
    const match = fullMsg.match(/Rp[\s.]*([\d,.]+)/i);
    if (!match) return res.status(200).send('No Nominal Found'); // Abaikan jika tidak ada angka
    const nominal = parseInt(match[1].replace(/[^0-9]/g, '').replace(/00$/g, ''));

    // --- 2. CARI ORDER YANG COCOK ---
    // Cari status UNPAID dengan nominal yang SAMA PERSIS
    const paidOrder = await Order.findOne({ status: 'UNPAID', total_pay: nominal });
    
    if (paidOrder) {
      // A. UPDATE STATUS JADI LUNAS
      paidOrder.status = 'PAID';
      await paidOrder.save();

      // B. UPDATE SALDO MERCHANT (PENTING!)
      if (paidOrder.merchant_email) {
        await User.findOneAndUpdate(
            { email: paidOrder.merchant_email },
            { $inc: { balance: paidOrder.total_pay } } // Tambah Saldo
        );
      }

      // C. KIRIM EMAIL STRUK KE PEMBELI (Otomatis)
      if (GAS_EMAIL_URL && paidOrder.customer_email) {
        fetch(GAS_EMAIL_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                type: 'PAYMENT_SUCCESS', // Trigger Template Email
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
        }).catch(e => console.error("Gagal Kirim Email:", e));
      }

      // D. NOTIFIKASI TELEGRAM (KE ADMIN/MERCHANT)
      if (TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID) {
        const textTele = `
${icon} <b>DANA MASUK: Rp ${nominal.toLocaleString('id-ID')}</b>
────────────────────
📦 <b>${paidOrder.product_name}</b>
👤 ${paidOrder.customer_contact || '-'}
🏪 Toko: ${paidOrder.store_name}
────────────────────
✅ <b>STATUS: LUNAS / PAID</b>
💰 Saldo Merchant Ditambah
📧 Email Struk Terkirim
`;
        fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text: textTele, parse_mode: 'HTML' })
        }).catch(e => console.error("Gagal Kirim Tele:", e));
      }

      // E. WEBHOOK BALIK (OPSIONAL)
      if (paidOrder.notify_url && paidOrder.notify_url.startsWith('http')) {
          fetch(paidOrder.notify_url, {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ status: 'PAID', order_id: paidOrder.order_id, amount: nominal })
          }).catch(() => {});
      }
    }

    return res.status(200).json({ status: 'success', match: !!paidOrder });

  } catch (e) {
      console.error(e);
      return res.status(500).send('Server Error'); 
  }
}
