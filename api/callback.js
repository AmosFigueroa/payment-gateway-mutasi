import mongoose from "mongoose";

const MONGODB_URI = process.env.MONGODB_URI;
const GAS_EMAIL_URL = process.env.GAS_EMAIL_URL;
const SECRET_KEY = process.env.SECRET_KEY;

// 1. SCHEMA LENGKAP (Agar semua data terbaca)
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

const User =
  mongoose.models.User ||
  mongoose.model(
    "User",
    new mongoose.Schema({
      email: { type: String, unique: true },
      balance: { type: Number, default: 0 },
    }),
  );

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).send("Method Not Allowed");

  const { secret, message, title, text, package_name } = req.body;
  if (SECRET_KEY && secret !== SECRET_KEY)
    return res.status(401).send("Unauthorized");

  try {
    if (mongoose.connection.readyState !== 1) {
      await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
    }

    // Gabungkan pesan untuk deteksi nominal
    const fullMsg = `${title || ""} ${text || ""} ${message || ""}`;
    const pkg = package_name ? package_name.toLowerCase() : "";

    // Deteksi Bank
    let source = "QRIS";
    if (pkg.includes("gopay") || pkg.includes("gobiz")) source = "GoPay";
    else if (pkg.includes("dana")) source = "DANA";
    else if (pkg.includes("bca")) source = "BCA";

    // Parsing Angka Nominal
    const matches = fullMsg.match(/([\d\.]+)/g);
    let nominal = 0;
    if (matches) {
      for (let m of matches) {
        let num = parseInt(m.replace(/\./g, ""));
        if (num >= 1000) {
          nominal = num;
          break;
        }
      }
    }

    console.log(`🔎 MENCARI ORDER: Rp ${nominal} dari ${source}`);

    // UPDATE STATUS JADI PAID
    const updatedOrder = await Order.findOneAndUpdate(
      { total_pay: nominal, status: "UNPAID" },
      { $set: { status: "PAID" } },
      { new: true },
    );

    if (updatedOrder) {
      console.log(`✅ LUNAS: ${updatedOrder.order_id}`);

      // A. UPDATE SALDO MERCHANT (Penting!)
      if (updatedOrder.merchant_email) {
        await User.findOneAndUpdate(
          { email: updatedOrder.merchant_email },
          { $inc: { balance: updatedOrder.total_pay } },
        );
      }

      // B. KIRIM EMAIL STRUK PREMIUM (Sesuai Apps Script Mas)
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
      .json({ status: "ignored", reason: "Order not found" });
  } catch (e) {
    return res.status(500).send(e.message);
  }
}
