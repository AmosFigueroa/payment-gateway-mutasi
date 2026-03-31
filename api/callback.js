import mongoose from "mongoose";

const MONGODB_URI = process.env.MONGODB_URI;
const GAS_EMAIL_URL = process.env.GAS_EMAIL_URL;
const SECRET_KEY = process.env.SECRET_KEY;

const Order =
  mongoose.models.Order ||
  mongoose.model(
    "Order",
    new mongoose.Schema({
      order_id: String,
      ref_id: String,
      total_pay: Number,
      status: String,
      customer_email: String,
      merchant_email: String,
      store_name: String,
      product_name: String,
    }),
  );

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
  if (req.method !== "POST") return res.status(405).send("Not Allowed");
  const { secret, message, title, text } = req.body;
  if (SECRET_KEY && secret !== SECRET_KEY)
    return res.status(401).send("Unauthorized");

  try {
    if (mongoose.connection.readyState !== 1)
      await mongoose.connect(MONGODB_URI);

    const fullMsg = `${title || ""} ${text || ""} ${message || ""}`;
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

    const updatedOrder = await Order.findOneAndUpdate(
      { total_pay: nominal, status: "UNPAID" },
      { $set: { status: "PAID" } },
      { new: true, sort: { created_at: -1 } },
    );

    if (updatedOrder) {
      // 1. Tambah Saldo Merchant
      if (updatedOrder.merchant_email) {
        await User.findOneAndUpdate(
          { email: updatedOrder.merchant_email },
          { $inc: { balance: updatedOrder.total_pay } },
          { upsert: true },
        );
      }

      // 2. Kirim Email Bukti ke Pembeli
      if (GAS_EMAIL_URL && updatedOrder.customer_email) {
        fetch(GAS_EMAIL_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "PAYMENT_SUCCESS",
            data: {
              store: updatedOrder.store_name,
              email: updatedOrder.customer_email,
              amount: updatedOrder.total_pay.toLocaleString("id-ID"),
              product: updatedOrder.product_name, // MENGIRIM NAMA ASLI KE EMAIL
              ref: updatedOrder.ref_id,
              bank: "QRIS",
              date: new Date().toLocaleString("id-ID", {
                timeZone: "Asia/Jakarta",
              }),
            },
          }),
        }).catch((e) => console.error("Email Error:", e));
      }
      return res.status(200).json({ status: "success" });
    }
    return res.status(200).json({ status: "ignored" });
  } catch (e) {
    return res.status(500).send(e.message);
  }
}
