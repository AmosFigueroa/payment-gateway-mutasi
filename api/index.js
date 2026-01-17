import mongoose from 'mongoose';

// 1. KONFIGURASI (Sesuai Screenshot Environment Variables Anda)
const MONGODB_URI = process.env.MONGODB_URI;
const STORE_WEBHOOK_URL = process.env.STORE_WEBHOOK_URL; 
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN; // Sesuai Screenshot
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;     // Sesuai Screenshot
const GAS_EMAIL_URL = process.env.GAS_EMAIL_URL;           // Sesuai Screenshot
const SECRET_KEY = process.env.SECRET_KEY;                 // Sesuai Screenshot

// SCHEMA (Harus sama dengan checkout.js)
const OrderSchema = new mongoose.Schema({
  order_id: String, ref_id: String, store_name: String,
  product_name: String, customer_email: String, customer_contact: String,
  total_pay: Number, status: { type: String, default: 'UNPAID' },
  created_at: { type: Date, default: Date.now }
});
const Order = mongoose.models.Order || mongoose.model('Order', OrderSchema);

export default async function handler(req, res) {
  // Hanya Izinkan POST
  if (req.method !== 'POST') return res.status(405).send('Not Allowed');

  // Cek Secret Key (Keamanan)
  const { secret, package_name, message, title, text, big_text } = req.body;
  if (SECRET_KEY && secret !== SECRET_KEY) {
      return res.status(401).send('Unauthorized');
  }

  try {
    if (mongoose.connection.readyState !== 1) await mongoose.connect(MONGODB_URI);
    
    // --- 2. PARSING PESAN MUTASI ---
    const fullMsg = `${message||''} ${title||''} ${text||''} ${big_text||''}`;
    const pkg = package_name ? package_name.toLowerCase() : "";
    
    // Deteksi Aplikasi (Ikon & Nama)
    let source = "Bank/E-Wallet"; let icon = "📱";
    if (pkg.includes("orderkuota")) { source = "OrderKuota"; icon = "🏪"; }
    else if (pkg.includes("gobiz")) { source = "GoBiz / GoPay Merchant"; icon = "🏪"; } 
    else if (pkg.includes("dana")) { source = "DANA"; icon = "🔵"; }
    else if (pkg.includes("bca")) { source = "BCA Mobile"; icon = "🏦"; }
    else if (pkg.includes("gojek") || pkg.includes("gopay")) { source = "GoPay"; icon = "🟢"; }
    else if (pkg.includes("seabank") || pkg.includes("bankbkemobile")) { source = "Digital Bank"; icon = "🟧"; }

    // Ambil Nominal (Regex)
    const match = fullMsg.match(/Rp[\s.]*([\d,.]+)/i);
    if (!match) return res.status(200).send('No Nominal');
    const nominal = parseInt(match[1].replace(/[^0-9]/g, '').replace(/00$/g, ''));

    // --- 3. CARI ORDER & UPDATE STATUS ---
    const paidOrder = await Order.findOne({ status: 'UNPAID', total_pay: nominal });
    
    if (paidOrder) {
      paidOrder.status = 'PAID';
      await paidOrder.save();

      // A. KIRIM EMAIL STRUK KE USER (INTEGRASI GOOGLE SCRIPT)
      // Ini penting agar user dapat notifikasi email seperti screenshot Anda
      if (GAS_EMAIL_URL && paidOrder.customer_email) {
        try {
            await fetch(GAS_EMAIL_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    type: 'PAYMENT_SUCCESS', // Trigger Email Struk
                    data: {
                        store: paidOrder.store_name || "Wago Payment",
                        email: paidOrder.customer_email,
                        amount: paidOrder.total_pay.toLocaleString('id-ID'),
                        product: paidOrder.product_name,
                        ref: paidOrder.ref_id,
                        date: new Date().toLocaleString('id-ID'),
                        bank: source
                    }
                })
            });
        } catch (e) { console.error("GAS Email Error:", e); }
      }

      // B. KIRIM WEBHOOK BALIK (JIKA ADA)
      if (STORE_WEBHOOK_URL) {
        try {
            await fetch(STORE_WEBHOOK_URL, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'x-secret-key': SECRET_KEY },
              body: JSON.stringify({ 
                event: 'PAYMENT_SUCCESS', 
                order_id: paidOrder.order_id, 
                ref_id: paidOrder.ref_id,
                customer_email: paidOrder.customer_email,
                product_name: paidOrder.product_name,
                amount: paidOrder.total_pay,
                source_app: source 
              })
            });
        } catch(e) {}
      }
    }

    // --- 4. LAPOR KE TELEGRAM (FORMAT RAPI) ---
    if(TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID) {
        // Data Tampilan
        const pName = paidOrder ? paidOrder.product_name : 'Menunggu Order...';
        const pContact = paidOrder ? paidOrder.customer_contact : '-';
        const pRef = paidOrder ? paidOrder.ref_id : '-';
        const pOid = paidOrder ? paidOrder.order_id : '-';
        const pEmail = paidOrder ? paidOrder.customer_email : '-';

        const statusIcon = paidOrder ? '✅' : '⚠️';
        const statusLabel = paidOrder ? 'LUNAS / PAID' : 'BELUM COCOK';

        // Format Pesan Markdown
        const textTele = `
${icon} *MUTASI ${source.toUpperCase()}*
────────────────────
💰 *Rp ${nominal.toLocaleString('id-ID')}*
────────────────────
📦 *${pName}*

👤 Kontak : ${pContact}
📧 Email  : ${pEmail}
🆔 Ref ID : \`${pRef}\`
🧾 Ord ID : \`${pOid}\`

${statusIcon} *STATUS: ${statusLabel}*
────────────────────
🔍 _Pesan Bank: ${fullMsg.substring(0, 40).replace(/\n/g, ' ')}..._
        `.trim();

        // Kirim Telegram
        await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text: textTele, parse_mode: 'Markdown' })
        });
    }

    return res.status(200).json({ status: 'success' });
  } catch (e) { 
      console.error(e);
      return res.status(500).send('Server Error'); 
  }
}
