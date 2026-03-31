import mongoose from "mongoose";

const MONGODB_URI = process.env.MONGODB_URI;
const GAS_EMAIL_URL = process.env.GAS_EMAIL_URL;
const SECRET_KEY = process.env.SECRET_KEY;

// 1. SCHEMA DATABASE (Pastikan field product_name dan ref_id ada)
const OrderSchema = new mongoose.Schema({
  order_id: String,
  ref_id: String,
  total_pay: Number,
  status: { type: String, default: "UNPAID" },
  customer_email: String,
  merchant_email: String,
  store_name: String,
  product_name: String,
});
const Order = mongoose.models.Order || mongoose.model("Order", OrderSchema);

const UserSchema = new mongoose.Schema({
  email: { type: String, unique: true },
  balance: { type: Number, default: 0 },
});
const User = mongoose.models.User || mongoose.model("User", UserSchema);

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).send("Method Not Allowed");

  const { secret, message, title, text, package_name } = req.body;
  if (SECRET_KEY && secret !== SECRET_KEY)
    return res.status(401).send("Unauthorized");

  try {
    if (mongoose.connection.readyState !== 1) {
      await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
    }

    // Gabungkan teks dari notifikasi HP
    const fullMsg = `${title || ""} ${text || ""} ${message || ""}`;
    const pkg = package_name ? package_name.toLowerCase() : "";

    // Deteksi Sumber Bank
    let source = "QRIS";
    if (pkg.includes("gopay") || pkg.includes("gobiz")) source = "GoPay";
    else if (pkg.includes("dana")) source = "DANA";
    else if (pkg.includes("bca")) source = "BCA";
    else if (pkg.includes("seabank")) source = "SeaBank";

    // Cari Angka Nominal (Regex Pintar)
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

    console.log(`🔎 MENCARI ORDER: Rp ${nominalTransfer} dari ${source}`);

    // UPDATE STATUS ORDER & DAPATKAN DATANYA
    const updatedOrder = await Order.findOneAndUpdate(
      { total_pay: nominalTransfer, status: "UNPAID" },
      { $set: { status: "PAID" } },
      { new: true },
    );

    if (updatedOrder) {
      console.log(`✅ LUNAS: ${updatedOrder.order_id}`);

      // Update Saldo Merchant
      if (updatedOrder.merchant_email) {
        await User.findOneAndUpdate(
          { email: updatedOrder.merchant_email },
          { $inc: { balance: updatedOrder.total_pay } },
        );
      }

      // 2. KIRIM EMAIL BUKTI BAYAR (SINKRON DENGAN APPS SCRIPT MAS)
      if (GAS_EMAIL_URL && updatedOrder.customer_email) {
        fetch(GAS_EMAIL_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "PAYMENT_SUCCESS",
            data: {
              store: updatedOrder.store_name || "Wago Payment",
              email: updatedOrder.customer_email,
              amount: updatedOrder.total_pay.toLocaleString("id-ID"),
              product: updatedOrder.product_name || "Produk Digital",
              ref: updatedOrder.ref_id || updatedOrder.order_id,
              bank: source,
              date: new Date().toLocaleString("id-ID", {
                timeZone: "Asia/Jakarta",
              }),
            },
          }),
        }).catch((e) => console.error("Email Error:", e));
      }

      return res.status(200).json({ status: "success" });
    }

    return res
      .status(200)
      .json({ status: "ignored", reason: "No matching order" });
  } catch (e) {
    console.error("🔥 Error:", e.message);
    return res.status(500).send(e.message);
  }
}
