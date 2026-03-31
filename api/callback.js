import mongoose from "mongoose";

const MONGODB_URI = process.env.MONGODB_URI;
const GAS_EMAIL_URL = process.env.GAS_EMAIL_URL;
const SECRET_KEY = process.env.SECRET_KEY;

// --- 1. SKEMA DATABASE ---
const OrderSchema = new mongoose.Schema({
  order_id: String,
  ref_id: String,
  total_pay: Number,
  status: { type: String, default: "UNPAID" },
  customer_email: String,
  merchant_email: String,
  store_name: String,
  product_name: String,
  method: String,
  created_at: { type: Date, default: Date.now },
});
const Order = mongoose.models.Order || mongoose.model("Order", OrderSchema);

const UserSchema = new mongoose.Schema({
  email: { type: String, unique: true },
  balance: { type: Number, default: 0 },
});
const User = mongoose.models.User || mongoose.model("User", UserSchema);

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const { secret, message, title, text, package_name } = req.body;

  // Validasi Keamanan
  if (SECRET_KEY && secret !== SECRET_KEY) {
    console.error("❌ Unauthorized: Secret Key tidak cocok");
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    if (mongoose.connection.readyState !== 1) {
      await mongoose.connect(MONGODB_URI, {
        serverSelectionTimeoutMS: 5000,
        connectTimeoutMS: 10000,
      });
    }

    const fullMsg = `${title || ""} ${text || ""} ${message || ""}`;
    const pkg = package_name ? package_name.toLowerCase() : "";

    // 2. Deteksi Sumber Pembayaran
    let source = "QRIS";
    if (pkg.includes("gopay") || pkg.includes("gobiz")) source = "GoPay";
    else if (pkg.includes("dana")) source = "DANA";
    else if (pkg.includes("bca") || fullMsg.toLowerCase().includes("bca"))
      source = "BCA";
    else if (pkg.includes("seabank")) source = "SeaBank";

    // 3. Parsing Nominal (Smart Regex)
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
      return res
        .status(200)
        .json({ status: "ignored", reason: "Nominal tidak terdeteksi" });
    }

    // 4. Update Status Order
    const updatedOrder = await Order.findOneAndUpdate(
      { total_pay: nominalTransfer, status: "UNPAID" },
      { $set: { status: "PAID" } },
      { new: true, sort: { created_at: -1 } },
    );

    if (updatedOrder) {
      // A. Update Saldo Merchant
      if (updatedOrder.merchant_email) {
        await User.findOneAndUpdate(
          { email: updatedOrder.merchant_email },
          { $inc: { balance: updatedOrder.total_pay } },
          { upsert: true },
        );
      }

      // B. Kirim Email (Perbaikan Order ID)
      if (GAS_EMAIL_URL && updatedOrder.customer_email) {
        // Menggunakan fetch ke Google Apps Script
        await fetch(GAS_EMAIL_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "PAYMENT_SUCCESS",
            data: {
              store: updatedOrder.store_name || "Wago Payment",
              email: updatedOrder.customer_email,
              amount: updatedOrder.total_pay.toLocaleString("id-ID"),
              product: updatedOrder.product_name || "Produk Digital",
              // MEMASTIKAN KEY 'ref' BERISI ORDER ID AGAR MUNCUL DI EMAIL
              ref: updatedOrder.order_id,
              bank: source,
              date: new Date().toLocaleString("id-ID", {
                timeZone: "Asia/Jakarta",
              }),
            },
          }),
        }).catch((e) => console.error("❌ Email Error:", e.message));
      }

      return res.status(200).json({
        status: "success",
        order_id: updatedOrder.order_id,
        message: "Order updated and notification sent",
      });
    }

    return res
      .status(200)
      .json({ status: "ignored", reason: "No matching order found" });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
