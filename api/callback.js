import mongoose from "mongoose";

const MONGODB_URI = process.env.MONGODB_URI;
const GAS_EMAIL_URL = process.env.GAS_EMAIL_URL;
const SECRET_KEY = process.env.SECRET_KEY;

// 1. SCHEMA DATABASE
const OrderSchema = new mongoose.Schema({
  order_id: String,
  ref_id: String,
  notify_url: String,
  product_name: String,
  customer_contact: String,
  customer_email: String,
  merchant_email: String,
  store_name: String,
  amount_original: Number,
  unique_code: Number,
  total_pay: Number,
  method: String,
  status: { type: String, default: "UNPAID" },
  created_at: { type: Date, default: Date.now },
});
const Order = mongoose.models.Order || mongoose.model("Order", OrderSchema);

const UserSchema = new mongoose.Schema({
  store_name: String,
  email: { type: String, unique: true },
  balance: { type: Number, default: 0 },
});
const User = mongoose.models.User || mongoose.model("User", UserSchema);

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).send("Method Not Allowed");

  const { secret, package_name, message, title, text, big_text } = req.body;
  if (SECRET_KEY && secret !== SECRET_KEY)
    return res.status(401).send("Unauthorized");

  try {
    // Koneksi DB dengan Timeout agar tidak stuck 3 detik
    if (mongoose.connection.readyState !== 1) {
      await mongoose.connect(MONGODB_URI, {
        serverSelectionTimeoutMS: 5000,
      });
    }

    // --- 2. DETEKSI NAMA BANK (LOGIKA YANG MAS CARI) ---
    const fullMsg = `${message || ""} ${title || ""} ${text || ""} ${big_text || ""}`;
    const pkg = package_name ? package_name.toLowerCase() : "";

    let source = "Bank Transfer";
    if (pkg.includes("orderkuota")) {
      source = "OrderKuota";
    } else if (pkg.includes("gobiz") || pkg.includes("gopay")) {
      source = "GoPay/QRIS";
    } else if (pkg.includes("dana")) {
      source = "DANA";
    } else if (pkg.includes("bca")) {
      source = "BCA";
    } else if (pkg.includes("seabank")) {
      source = "SeaBank";
    } else if (pkg.includes("bri")) {
      source = "BRI";
    } else if (pkg.includes("mandiri")) {
      source = "Mandiri";
    }

    // --- 3. PARSING ANGKA (VERSI LEBIH KUAT) ---
    const matches = fullMsg.match(/([\d\.]+)/g);
    let nominalTerdeteksi = 0;

    if (matches) {
      for (let m of matches) {
        let num = parseInt(m.replace(/\./g, ""));
        if (num >= 1000) {
          nominalTerdeteksi = num;
          break;
        }
      }
    }

    console.log(`Log Mutasi: ${source} - Rp ${nominalTerdeteksi}`);

    if (nominalTerdeteksi === 0) {
      return res
        .status(200)
        .json({ status: "ignored", reason: "No nominal detected" });
    }

    // --- 4. CARI & UPDATE ORDER ---
    const paidOrder = await Order.findOne({
      status: "UNPAID",
      total_pay: nominalTerdeteksi,
    });

    if (paidOrder) {
      paidOrder.status = "PAID";
      await paidOrder.save();

      if (paidOrder.merchant_email) {
        await User.findOneAndUpdate(
          { email: paidOrder.merchant_email },
          { $inc: { balance: paidOrder.total_pay } },
        );
      }

      // Kirim Email Struk dengan info Bank/Source
      if (GAS_EMAIL_URL && paidOrder.customer_email) {
        fetch(GAS_EMAIL_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "PAYMENT_SUCCESS",
            data: {
              store: paidOrder.store_name || "Wago Store",
              email: paidOrder.customer_email,
              amount: paidOrder.total_pay.toLocaleString("id-ID"),
              product: paidOrder.product_name,
              ref: paidOrder.ref_id,
              date: new Date().toLocaleString("id-ID", {
                timeZone: "Asia/Jakarta",
              }),
              bank: source, // Nama bank muncul di sini
            },
          }),
        }).catch((e) => console.error("Email Error:", e));
      }

      // Webhook ke website utama
      if (paidOrder.notify_url && paidOrder.notify_url.startsWith("http")) {
        fetch(paidOrder.notify_url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            status: "PAID",
            order_id: paidOrder.order_id,
            ref_id: paidOrder.ref_id,
            amount: nominalTerdeteksi,
          }),
        }).catch((e) => console.error("Webhook Error:", e));
      }

      return res.status(200).json({ status: "success", message: "Order Paid" });
    }

    return res
      .status(200)
      .json({ status: "ignored", message: "No matching order" });
  } catch (e) {
    console.error("Callback Error:", e.message);
    return res.status(500).send("Server Error");
  }
}
