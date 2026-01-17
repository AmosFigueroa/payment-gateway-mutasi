import mongoose from 'mongoose';

const MONGODB_URI = process.env.MONGODB_URI;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const GAS_EMAIL_URL = process.env.GAS_EMAIL_URL;
const STORE_WEBHOOK_URL = process.env.STORE_WEBHOOK_URL;
const SECRET_KEY = process.env.SECRET_KEY;

// Schema Order (Tambahkan field merchant_email)
const OrderSchema = new mongoose.Schema({
  order_id: String, ref_id: String, store_name: String,
  product_name: String, customer_email: String, customer_contact: String,
  total_pay: Number, status: { type: String, default: 'UNPAID' },
  merchant_email: String, // <--- INI KUNCINYA (Pemilik Invoice)
  created_at: { type: Date, default: Date.now }
});
const Order = mongoose.models.Order || mongoose.model('Order', OrderSchema);

// Schema User (Untuk Update Saldo)
const UserSchema = new mongoose.Schema({
  email: String, balance: Number
});
const User = mongoose.models.User || mongoose.model('User', UserSchema);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Not Allowed');
  
  // Cek Secret Key
  const { secret, package_name, message, title, text, big_text } = req.body;
  if (SECRET_KEY && secret !== SECRET_KEY) return res.status(401).send('Unauthorized');

  try {
    if (mongoose.connection.readyState !== 1) await mongoose.connect(MONGODB_URI);
    
    // --- PARSING NOMINAL ---
    const fullMsg = `${message||''} ${title||''} ${text||''} ${big_text||''}`;
    const match = fullMsg.match(/Rp[\s.]*([\d,.]+)/i);
    if (!match) return res.status(200).send('No Nominal');
    const nominal = parseInt(match[1].replace(/[^0-9]/g, '').replace(/00$/g, ''));

    // --- CARI ORDER ---
    const paidOrder = await Order.findOne({ status: 'UNPAID', total_pay: nominal });
    
    if (paidOrder) {
      // 1. Update Status Invoice
      paidOrder.status = 'PAID';
      await paidOrder.save();

      // 2. UPDATE SALDO MERCHANT (USER)
      if (paidOrder.merchant_email) {
        await User.findOneAndUpdate(
            { email: paidOrder.merchant_email },
            { $inc: { balance: paidOrder.total_pay } } // Tambah Saldo
        );
      }

      // 3. Kirim Email Struk ke Pembeli
      if (GAS_EMAIL_URL && paidOrder.customer_email) {
        fetch(GAS_EMAIL_URL, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                type: 'PAYMENT_SUCCESS', 
                data: {
                    store: paidOrder.store_name, email: paidOrder.customer_email,
                    amount: paidOrder.total_pay.toLocaleString('id-ID'),
                    product: paidOrder.product_name, ref: paidOrder.ref_id,
                    date: new Date().toLocaleString('id-ID'), bank: "Otomatis"
                }
            })
        }).catch(e => console.log(e));
      }
      
      // 4. Lapor Telegram (Opsional, kode sama spt sebelumnya...)
    }

    return res.status(200).json({ status: 'success' });
  } catch (e) { 
      console.error(e);
      return res.status(500).send('Error'); 
  }
}
