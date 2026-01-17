import mongoose from 'mongoose';

const MONGODB_URI = process.env.MONGODB_URI;
const TELE_TOKEN = process.env.TELE_TOKEN;
const TELE_CHAT_ID = process.env.TELE_CHAT_ID;

// Schema Database (Pastikan sama dengan checkout)
const OrderSchema = new mongoose.Schema({
  order_id: String,
  ref_id: String,
  store_name: String, // Menambahkan field nama toko
  notify_url: String,
  product_name: String,
  customer_contact: String,
  customer_email: String,
  amount_original: Number,
  unique_code: Number,
  total_pay: Number,
  method: String,
  status: { type: String, default: 'UNPAID' },
  created_at: { type: Date, default: Date.now }
});

const Order = mongoose.models.Order || mongoose.model('Order', OrderSchema);

export default async function handler(req, res) {
  // Hanya izinkan POST (dari Mutasi) & GET (Test Manual)
  if (req.method !== 'POST' && req.method !== 'GET') {
      return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    if (mongoose.connection.readyState !== 1) {
      await mongoose.connect(MONGODB_URI);
    }

    // 1. TANGKAP NOMINAL
    let amountReceived = 0;
    if (req.method === 'GET') {
        amountReceived = parseInt(req.query.amount);
    } else {
        // Support berbagai format JSON dari layanan mutasi
        amountReceived = parseInt(req.body.amount || req.body.nominal || req.body.data?.amount || 0);
    }

    if (!amountReceived) {
        return res.status(400).json({ error: 'Nominal tidak ditemukan.' });
    }

    // 2. CARI ORDER (Cari yang UNPAID & Nominal Cocok)
    const order = await Order.findOne({ 
        total_pay: amountReceived, 
        status: 'UNPAID' 
    });

    if (!order) {
        return res.status(404).json({ 
            error: 'Order tidak ditemukan atau sudah lunas.', 
            amount_recieved: amountReceived 
        });
    }

    // 3. UPDATE STATUS JADI PAID
    order.status = 'PAID';
    await order.save();

    // 4. KIRIM WEBHOOK KE TOKO USER (Opsional)
    let webhookResult = "No Webhook URL";
    if (order.notify_url && order.notify_url !== "-") {
        try {
            await fetch(order.notify_url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    status: 'success',
                    event: 'PAYMENT_PAID',
                    order_id: order.order_id,
                    ref_id: order.ref_id,
                    total_pay: order.total_pay,
                    product_name: order.product_name,
                    paid_at: new Date().toISOString()
                })
            });
            webhookResult = "Sent Success";
        } catch (err) {
            webhookResult = "Failed: " + err.message;
        }
    }

    // 5. [BARU] KIRIM NOTIFIKASI KE TELEGRAM ADMIN
    if (TELE_TOKEN && TELE_CHAT_ID) {
        const message = `
<b>💰 PEMBAYARAN DITERIMA (LUNAS)</b>
--------------------------------
<b>Toko:</b> ${order.store_name || 'Merchant'}
<b>Produk:</b> ${order.product_name}
<b>Total:</b> Rp ${order.total_pay.toLocaleString('id-ID')}
<b>Ref ID:</b> ${order.ref_id}
<b>Metode:</b> ${order.method === 'qris' ? 'QRIS' : 'Bank Transfer'}
--------------------------------
<i>Status berhasil diupdate otomatis.</i>
`;
        try {
            await fetch(`https://api.telegram.org/bot${TELE_TOKEN}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: TELE_CHAT_ID,
                    text: message,
                    parse_mode: 'HTML'
                })
            });
        } catch (e) {
            console.error("Gagal kirim Telegram:", e);
        }
    }

    // 6. SELESAI
    return res.status(200).json({
        status: 'success',
        message: 'Pembayaran diverifikasi & Notifikasi terkirim',
        order_id: order.order_id,
        amount: amountReceived
    });

  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: error.message });
  }
}
