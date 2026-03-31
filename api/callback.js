import mongoose from "mongoose";

const MONGODB_URI = process.env.MONGODB_URI;
const GAS_EMAIL_URL = process.env.GAS_EMAIL_URL;
const SECRET_KEY = process.env.SECRET_KEY;

// --- 1. SKEMA DATABASE LENGKAP ---
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
  name: String,
});
const User = mongoose.models.User || mongoose.model("User", UserSchema);

export default async function handler(req, res) {
  // Hanya izinkan metode POST
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  // Ambil data dari Body Request MacroDroid
  const { secret, message, title, text, package_name } = req.body;

  // Keamanan: Cek Secret Key
  if (SECRET_KEY && secret !== SECRET_KEY) {
    console.error("❌ Unauthorized: Secret Key tidak cocok");
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    // Koneksi Database dengan Timeout
    if (mongoose.connection.readyState !== 1) {
      await mongoose.connect(MONGODB_URI, {
        serverSelectionTimeoutMS: 5000,
        connectTimeoutMS: 10000,
      });
    }

    // Gabungkan pesan untuk pencarian nominal
    const fullMsg = `${title || ""} ${text || ""} ${message || ""}`;
    const pkg = package_name ? package_name.toLowerCase() : "";

    // Log pesan masuk untuk debugging
    console.log("📩 Notifikasi Masuk:", fullMsg);

    // --- 2. DETEKSI SUMBER PEMBAYARAN DETAIL ---
    let source = "QRIS";
    if (pkg.includes("gopay") || pkg.includes("gobiz")) source = "GoPay";
    else if (pkg.includes("dana")) source = "DANA";
    else if (pkg.includes("bca") || fullMsg.toLowerCase().includes("bca"))
      source = "BCA";
    else if (pkg.includes("seabank")) source = "SeaBank";
    else if (pkg.includes("linkaja")) source = "LinkAja";
    else if (pkg.includes("ovo")) source = "OVO";

    // --- 3. PARSING NOMINAL TRANSFER (Smart Regex) ---
    const matches = fullMsg.match(/([\d\.]+)/g);
    let nominalTransfer = 0;
    if (matches) {
      for (let m of matches) {
        // Hapus titik ribuan dan ubah ke angka
        let num = parseInt(m.replace(/\./g, ""));
        // Minimal nominal 1000 untuk menghindari angka sampah (jam/tanggal)
        if (num >= 1000) {
          nominalTransfer = num;
          break;
        }
      }
    }

    console.log(`🔎 MENCARI ORDER: Rp ${nominalTransfer} dari ${source}`);

    if (nominalTransfer === 0) {
      return res
        .status(200)
        .json({ status: "ignored", reason: "Nominal tidak terdeteksi" });
    }

    // --- 4. PROSES UPDATE STATUS ORDER ---
    const updatedOrder = await Order.findOneAndUpdate(
      { total_pay: nominalTransfer, status: "UNPAID" },
      { $set: { status: "PAID" } },
      { new: true, sort: { created_at: -1 } }, // Ambil order terbaru jika ada nominal kembar
    );

    if (updatedOrder) {
      console.log(`✅ BERHASIL! Order ${updatedOrder.order_id} LUNAS`);

      // A. UPDATE SALDO MERCHANT
      if (updatedOrder.merchant_email) {
        const updatedUser = await User.findOneAndUpdate(
          { email: updatedOrder.merchant_email },
          { $inc: { balance: updatedOrder.total_pay } },
          { upsert: true, new: true },
        );
        console.log(
          `💰 Saldo ${updatedOrder.merchant_email} bertambah. Total: Rp ${updatedUser.balance}`,
        );
      }

      // B. KIRIM EMAIL BUKTI PEMBAYARAN KE PELANGGAN
      if (GAS_EMAIL_URL && updatedOrder.customer_email) {
        console.log(`📧 Mengirim email ke: ${updatedOrder.customer_email}`);

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
        })
          .then((response) => response.json())
          .then((resData) => console.log("✔️ Respon Apps Script:", resData))
          .catch((e) => console.error("❌ Email Error:", e.message));
      }

      // C. KIRIM NOTIFIKASI WEBHOOK KE URL TOKO (Jika ada)
      if (updatedOrder.notify_url) {
        const notifyUrls = updatedOrder.notify_url.split(",");
        notifyUrls.forEach((url) => {
          fetch(url.trim(), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              order_id: updatedOrder.order_id,
              status: "PAID",
              amount: updatedOrder.total_pay,
              ref_id: updatedOrder.ref_id,
            }),
          }).catch((err) => console.error("❌ Webhook Error:", err.message));
        });
      }

      return res.status(200).json({
        status: "success",
        order_id: updatedOrder.order_id,
        message: "Order updated and notifications sent",
      });
    }

    console.log(
      `⚠️ Tidak ada order UNPAID yang cocok dengan nominal Rp ${nominalTransfer}`,
    );
    return res
      .status(200)
      .json({ status: "ignored", reason: "No matching order found" });
  } catch (e) {
    console.error("🔥 Server Error:", e.message);
    return res.status(500).json({ error: e.message });
  }
}
