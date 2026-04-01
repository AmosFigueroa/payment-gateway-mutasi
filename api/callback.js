import mongoose from "mongoose";

const MONGODB_URI = process.env.MONGODB_URI;
const SECRET_KEY = process.env.SECRET_KEY;

const OrderSchema = new mongoose.Schema({
  order_id: String,
  total_pay: Number,
  status: { type: String, default: "UNPAID" },
  merchant_email: String,
  created_at: { type: Date, default: Date.now },
});
const Order = mongoose.models.Order || mongoose.model("Order", OrderSchema);

export default async function handler(req, res) {
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method Not Allowed" });

  // 1. Ambil data dari Body
  const { secret, message, title, text } = req.body;

  // 2. Validasi Secret Key (Pencegahan Error 400)
  if (!secret || secret !== SECRET_KEY) {
    console.error("❌ Unauthorized or Empty Secret");
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    if (mongoose.connection.readyState !== 1)
      await mongoose.connect(MONGODB_URI);

    // Gabungkan pesan untuk scanning nominal
    const fullMsg =
      `${title || ""} ${text || ""} ${message || ""}`.toLowerCase();

    // Regex untuk mencari nominal uang (Contoh: 1.034 atau 1034)
    const matches = fullMsg.match(/([\d\.]+)/g);
    let nominalTransfer = 0;

    if (matches) {
      for (let m of matches) {
        let num = parseInt(m.replace(/\./g, ""));
        if (num >= 1000) {
          nominalTransfer = num;
          break;
        }
      }
    }

    if (nominalTransfer === 0) {
      console.log("⚠️ Nominal tidak ditemukan dalam notifikasi");
      return res
        .status(200)
        .json({ status: "ignored", reason: "No nominal detected" });
    }

    // 3. Update status di database
    const updatedOrder = await Order.findOneAndUpdate(
      { total_pay: nominalTransfer, status: "UNPAID" },
      { $set: { status: "PAID" } },
      { new: true, sort: { created_at: -1 } },
    );

    if (updatedOrder) {
      console.log(`✅ Pembayaran Berhasil: ${nominalTransfer}`);
      return res
        .status(200)
        .json({ status: "success", order_id: updatedOrder.order_id });
    }

    console.log(`⚠️ Tidak ada order UNPAID dengan nominal: ${nominalTransfer}`);
    return res
      .status(200)
      .json({ status: "ignored", reason: "No matching order" });
  } catch (e) {
    console.error("❌ Callback Error:", e.message);
    return res.status(500).json({ error: e.message });
  }
}
