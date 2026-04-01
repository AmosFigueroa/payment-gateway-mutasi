import mongoose from "mongoose";
import QRCode from "qrcode";

const MONGODB_URI = process.env.MONGODB_URI;

const OrderSchema = new mongoose.Schema({
  order_id: String,
  ref_id: String,
  product_name: String,
  customer_email: String,
  merchant_email: String,
  store_name: String,
  amount_original: Number,
  unique_code: Number,
  total_pay: Number,
  status: { type: String, default: "UNPAID" },
  qris_string: String,
  created_at: { type: Date, default: Date.now },
});
const Order = mongoose.models.Order || mongoose.model("Order", OrderSchema);

// Helper Parse Nama dari Data QRIS (Tag 59)
function parseQrisName(qrisStr) {
  let i = 0;
  while (i < qrisStr.length) {
    const id = qrisStr.substr(i, 2);
    const len = parseInt(qrisStr.substr(i + 2, 2));
    const val = qrisStr.substr(i + 4, len);
    if (id === "59") return val;
    i += 4 + len;
  }
  return "Wago Merchant";
}

// Helper Dynamic QRIS (Tag 54)
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
  let beforeCRC = cleanQris.substring(0, splitIndex);
  let newString = beforeCRC + tag54 + "6304";
  return newString + crc16(newString);
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
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

    const qrisRaw =
      "00020101021126670016COM.NOBUBANK.WWW01189360050300000879140214504244849705970303UMI51440014ID.CO.QRIS.WWW0215ID20232921381120303UMI5204541153033605802ID5907WAGO ID6006JEPARA61055941162070703A016304CF48";
    const qrisName = parseQrisName(qrisRaw);
    const dynamicQris = convertToDynamic(qrisRaw, totalPay);
    const qrImage = await QRCode.toDataURL(dynamicQris);

    await Order.create({
      order_id: orderId,
      ref_id: ref_id || "-",
      product_name: product_name || "Produk Digital",
      customer_email: customer_email,
      merchant_email: merchant_email,
      store_name: store_name || qrisName,
      amount_original: parseInt(price),
      unique_code: uniqueCode,
      total_pay: totalPay,
      status: "UNPAID",
      qris_string: qrImage,
    });

    return res
      .status(200)
      .json({
        status: "success",
        order_id: orderId,
        total_pay: totalPay,
        qr_image: qrImage,
        qris_name: qrisName,
        unique_code: uniqueCode,
      });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
