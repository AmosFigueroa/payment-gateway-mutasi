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

// --- FUNGSI STANDAR QRIS DINAMIS ---
function generateCRC16(str) {
  let crc = 0xffff;
  for (let i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      if ((crc & 0x8000) !== 0) crc = (crc << 1) ^ 0x1021;
      else crc = crc << 1;
    }
  }
  let hex = (crc & 0xffff).toString(16).toUpperCase();
  return hex.padStart(4, "0");
}

function makeDynamic(qrisRaw, amount) {
  // Hapus CRC lama (4 digit terakhir)
  qrisRaw = qrisRaw.substring(0, qrisRaw.length - 4);

  // Buat Tag 54 (Nominal)
  const amountStr = amount.toString();
  const tag54 = "54" + amountStr.length.toString().padStart(2, "0") + amountStr;

  // Cari posisi pemisah (Tag 58 = Negara ID)
  const splitAt = qrisRaw.indexOf("5802ID");
  const before = qrisRaw.substring(0, splitAt);
  const after = qrisRaw.substring(splitAt);

  // Gabungkan & Hitung ulang CRC
  const finalString = before + tag54 + after;
  return finalString + generateCRC16(finalString);
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  try {
    if (mongoose.connection.readyState !== 1) {
      await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
    }

    const { price, product_name, store_name } = req.body;

    // String QRIS Statis Mas Yusuf
    const QRIS_STATIS =
      "00020101021126670016COM.NOBUBANK.WWW01189360050300000879140214504244849705970303UMI51440014ID.CO.QRIS.WWW0215ID20232921381120303UMI5204541153033605802ID5907WAGO ID6006JEPARA61055941162070703A016304CF48";

    const uniqueCode = Math.floor(Math.random() * 99) + 1;
    const totalPay = parseInt(price) + uniqueCode;
    const orderId = "ORD-" + Date.now();

    // UBAH MENJADI DINAMIS DENGAN NOMINAL
    const qrisDinamis = makeDynamic(QRIS_STATIS, totalPay);

    // Generate Gambar QR dari string yang sudah ada nominalnya
    const qrImage = await QRCode.toDataURL(qrisDinamis, {
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
    return res.status(500).json({ error: error.message });
  }
}
