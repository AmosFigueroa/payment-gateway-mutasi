import mongoose from "mongoose";
import QRCode from "qrcode";

const MONGODB_URI = process.env.MONGODB_URI;

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
  qris_string: String,
  created_at: { type: Date, default: Date.now },
});

const Order = mongoose.models.Order || mongoose.model("Order", OrderSchema);

// HELPER: CRC16 & Dynamic QRIS
function crc16(str) {
  let crc = 0xffff;
  for (let i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      if ((crc & 0x8000) !== 0) crc = (crc << 1) ^ 0x1021;
      else crc = crc << 1;
    }
  }
  return (crc & 0xffff).toString(16).toUpperCase().padStart(4, "0");
}

function convertToDynamic(qrisRaw, amount) {
  let amountStr = amount.toString();
  let tag54 = "54" + amountStr.length.toString().padStart(2, "0") + amountStr;
  let cleanQris = qrisRaw.substring(0, qrisRaw.length - 4);
  let splitIndex = cleanQris.lastIndexOf("6304");
  if (splitIndex === -1) return qrisRaw;
  let beforeCRC = cleanQris.substring(0, splitIndex);
  let newString = beforeCRC + tag54 + "6304";
  return newString + crc16(newString);
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });

  const DATA_PAYMENT = {
    qris: "00020101021126610014COM.GO-JEK.WWW01189360091438225844470210G8225844470303UMI51440014ID.CO.QRIS.WWW0215ID10243639137310303UMI5204899953033605802ID5922Wago Digital Solutions6006SLEMAN61055529462070703A016304C0F0",
  };

  try {
    if (mongoose.connection.readyState !== 1)
      await mongoose.connect(MONGODB_URI);

    const {
      product_name,
      price,
      customer_email,
      merchant_email,
      store_name,
      ref_id,
    } = req.body;
    const uniqueCode = Math.floor(Math.random() * 99) + 1;
    const totalPay = parseInt(price) + uniqueCode;
    const orderId = "ORD-" + Date.now();

    const dynamicQris = convertToDynamic(DATA_PAYMENT.qris, totalPay);
    const qrImage = await QRCode.toDataURL(dynamicQris);

    const newOrder = await Order.create({
      order_id: orderId,
      ref_id: ref_id || "-",
      product_name: product_name, // Simpan Nama Produk Asli
      customer_email: customer_email,
      merchant_email: merchant_email,
      store_name: store_name || "Wago Store",
      total_pay: totalPay,
      status: "UNPAID",
      qris_string: qrImage,
    });

    return res.status(200).json({
      status: "success",
      order_id: newOrder.order_id,
      total_pay: totalPay,
      qr_image: qrImage,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
