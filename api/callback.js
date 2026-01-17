import mongoose from 'mongoose';

// --- KONEKSI DATABASE (Sama dengan checkout.js) ---
const MONGODB_URI = process.env.MONGODB_URI;

const OrderSchema = new mongoose.Schema({
  order_id: String,
  ref_id: String,
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
  // Izinkan method POST (dari jasa mutasi) dan GET (untuk tes manual Anda)
  if (req.method !== 'POST' && req.method !== 'GET') {
      return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    if (mongoose.connection.readyState !== 1) {
      await mongoose.connect(MONGODB_URI);
    }

    // 1. TANGKAP DATA (Support berbagai format)
    // Bisa dari Query URL (?amount=50123) atau Body JSON ({ amount: 50123 })
    let amountReceived = 0;
    
    if (req.method === 'GET') {
        amountReceived = parseInt(req.query.amount);
    } else {
        // Logika untuk menangkap data dari Body (sesuaikan dengan jasa mutasi yang dipakai)
        // Contoh umum: req.body.amount, req.body.data.amount, dll.
        amountReceived = parseInt(req.body.amount || req.body.nominal || 0);
    }

    if (!amountReceived) {
        return res.status(400).json({ error: 'Nominal (amount) tidak ditemukan/nol.' });
    }

    // 2. CARI ORDER BERDASARKAN TOTAL BAYAR (KODE UNIK)
    // Mencari order UNPAID yang total bayarnya cocok persis
    const order = await Order.findOne({ 
        total_pay: amountReceived, 
        status: 'UNPAID' 
    });

    if (!order) {
        return res.status(404).json({ 
            error: 'Order tidak ditemukan atau sudah lunas.', 
            amount_searched: amountReceived 
        });
    }

    // 3. UPDATE STATUS JADI PAID
    order.status = 'PAID';
    await order.save();

    // 4. KIRIM WEBHOOK KE WEBSITE TOKO (AUTO NOTIF)
    let webhookResult = "Skipped (No URL)";
    if (order.notify_url && order.notify_url !== "-") {
        console.log(`Mengirim Notifikasi Lunas ke: ${order.notify_url}`);
        
        const payload = {
            status: 'success',
            event: 'PAYMENT_PAID',
            order_id: order.order_id,
            ref_id: order.ref_id,
            total_pay: order.total_pay,
            product_name: order.product_name,
            paid_at: new Date().toISOString()
        };

        try {
            await fetch(order.notify_url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            webhookResult = "Sent Successfully";
        } catch (err) {
            webhookResult = "Failed: " + err.message;
        }
    }

    // 5. SELESAI
    return res.status(200).json({
        status: 'success',
        message: 'Pembayaran berhasil diverifikasi otomatis',
        order_id: order.order_id,
        amount_matched: amountReceived,
        webhook_status: webhookResult
    });

  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Server Error: ' + error.message });
  }
}
