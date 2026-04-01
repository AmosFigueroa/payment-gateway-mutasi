import mongoose from "mongoose";
import QRCode from "qrcode";

const MONGODB_URI = process.env.MONGODB_URI;

const OrderSchema = new mongoose.Schema({
  order_id: String,
  total_pay: Number,
  status: { type: String, default: "UNPAID" },
  product_name: String,
  qr_image: String,
  created_at: { type: Date, default: Date.now },
});
const Order = mongoose.models.Order || mongoose.model("Order", OrderSchema);

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  try {
    // 1. Koneksi DB dipercepat
    if (mongoose.connection.readyState !== 1) {
      await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
    }

    const { price, product_name, store_name, merchant_email } = req.body;

    // 2. Logika QRIS Dinamis (Pastikan QRIS_STATIS Mas Valid)
    const QRIS_STATIS =
      "00020101021126670016COM.NOBUBANK.WWW01189360050300000879140214504244849705970303UMI51440014ID.CO.QRIS.WWW0215ID20232921381120303UMI5204541153033605802ID5907WAGO ID6006JEPARA61055941162070703A016304CF48git add .
git commit -m "Fix: Speed up checkout API and ensure QRIS image generated"
git push origin main --force";

    const uniqueCode = Math.floor(Math.random() * 99) + 1;
    const totalPay = parseInt(price) + uniqueCode;
    const orderId = "ORD-" + Date.now();

    // Generate QR Image (Gunakan margin kecil agar cepat)
    const qrImage = await QRCode.toDataURL(QRIS_STATIS, {
      margin: 2,
      scale: 10,
    });

    await Order.create({
      order_id: orderId,
      total_pay: totalPay,
      product_name: product_name,
      qr_image: qrImage,
    });

    return res.status(200).json({
      status: "success",
      order_id: orderId,
      total_pay: totalPay,
      qr_image: qrImage,
      qris_name: store_name || "Wago Merchant",
    });
  } catch (error) {
    console.error("Checkout Error:", error);
    return res.status(500).json({ error: "Gagal membuat tagihan" });
  }
}
