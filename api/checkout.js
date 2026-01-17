import mongoose from 'mongoose';
import QRCode from 'qrcode';

const MONGODB_URI = process.env.MONGODB_URI;

// UPDATE SCHEMA: Tambahkan 'merchant_email' & 'store_name' agar saldo jalan
const OrderSchema = new mongoose.Schema({
  order_id: String,
  ref_id: String,
  notify_url: String,
  product_name: String,
  customer_contact: String,
  customer_email: String,
  merchant_email: String, // <--- WAJIB ADA (Untuk Saldo)
  store_name: String,     // <--- WAJIB ADA (Untuk Laporan)
  amount_original: Number,
  unique_code: Number,
  total_pay: Number,
  method: String,
  status: { type: String, default: 'UNPAID' },
  qris_string: String,
  created_at: { type: Date, default: Date.now }
});

const Order = mongoose.models.Order || mongoose.model('Order', OrderSchema);

// --- HELPER 1: CRC16 (JANGAN DIUBAH) ---
function crc16(str) {
  let crc = 0xFFFF;
  for (let i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      if ((crc & 0x8000) !== 0) crc = (crc << 1) ^ 0x1021;
      else crc = crc << 1;
    }
  }
  let hex = (crc & 0xFFFF).toString(16).toUpperCase();
  return hex.padStart(4, '0');
}

// --- HELPER 2: Generate Dynamic String (JANGAN DIUBAH) ---
function convertToDynamic(qrisRaw, amount) {
  let amountStr = amount.toString();
  let tag54 = "54" + amountStr.length.toString().padStart(2, '0') + amountStr;
  let cleanQris = qrisRaw.substring(0, qrisRaw.length - 4);
  let splitIndex = cleanQris.lastIndexOf("6304");
  if (splitIndex === -1) return qrisRaw;
  let beforeCRC = cleanQris.substring(0, splitIndex);
  let newString = beforeCRC + tag54 + "6304";
  return newString + crc16(newString);
}

// --- HELPER 3: PARSE DATA (JANGAN DIUBAH) ---
function parseQrisData(qrisStr) {
    let i = 0;
    let name = "MERCHANT QRIS"; 
    let nmid = "-";
    
    try {
        while (i < qrisStr.length) {
            const id = qrisStr.substr(i, 2);
            const len = parseInt(qrisStr.substr(i + 2, 2));
            const val = qrisStr.substr(i + 4, len);

            if (id === '59') name = val;
            if (id === '51') {
                let j = 0;
                while (j < val.length) {
                    const subId = val.substr(j, 2);
                    const subLen = parseInt(val.substr(j + 2, 2));
                    const subVal = val.substr(j + 4, subLen);
                    if (subId === '02') nmid = subVal;
                    j += 4 + subLen;
                }
            }
            i += 4 + len;
        }
    } catch (e) { console.log("Error parsing QRIS", e); }
    return { name, nmid };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // --- DATA REKENING UTAMA ---
  const DATA_PAYMENT = {
    qris: "00020101021126610014COM.GO-JEK.WWW01189360091438225844470210G8225844470303UMI51440014ID.CO.QRIS.WWW0215ID10243639137310303UMI5204899953033605802ID5922Wago Digital Solutions6006SLEMAN61055529462070703A016304C0F0", 
    bcava: "70001085171592306 a.n Wago Payment",
    seabank: "901168080844 a.n Wago Payment",
    bni: "1868174575 a.n Wago Payment",
    jago: "100356111569 a.n Wago Payment",
    neobank: "5859459402765464 a.n Wago Payment",
  };

  try {
    if (mongoose.connection.readyState !== 1) {
      await mongoose.connect(MONGODB_URI);
    }

    // UPDATE: Ambil merchant_email & store_name dari Request
    const { product_name, price, customer_contact, customer_email, method, ref_id, notify_url, merchant_email, store_name } = req.body;
    
    let selectedMethod = method || 'qris';
    const nominal = parseInt(price);

    if (nominal < 1000) return res.status(400).json({ error: "Minimal Rp 1.000" });
    if (nominal > 2000000) return res.status(400).json({ error: "Maksimal Rp 2.000.000" });
    if (nominal < 50000 && selectedMethod !== 'qris') return res.status(400).json({ error: "Transfer Bank minimal Rp 50.000" });

    const uniqueCode = Math.floor(Math.random() * 99) + 1;
    const totalPay = nominal + uniqueCode;

    let qrImage = null;
    let accNo = "";
    let accName = "";
    let qrisDetails = { name: "", nmid: "" };

    if (selectedMethod === 'qris') {
      const dynamicQris = convertToDynamic(DATA_PAYMENT.qris, totalPay);
      qrImage = await QRCode.toDataURL(dynamicQris);
      qrisDetails = parseQrisData(DATA_PAYMENT.qris); 
    } else {
      if(DATA_PAYMENT[selectedMethod]) {
          const rawInfo = DATA_PAYMENT[selectedMethod];
          const parts = rawInfo.split(' a.n ');
          accNo = parts[0];
          accName = parts[1] || "";
      } else {
          return res.status(400).json({ error: "Metode tidak tersedia" });
      }
    }

    const webhookTarget = notify_url || process.env.STORE_WEBHOOK_URL || "-";

    // SIMPAN KE DATABASE (LENGKAP DENGAN MERCHANT EMAIL)
    const newOrder = await Order.create({
      order_id: "ORD-" + Date.now() + "-" + Math.floor(Math.random() * 1000),
      ref_id: ref_id || "-",
      notify_url: webhookTarget,
      product_name: product_name,
      customer_contact: customer_contact,
      customer_email: customer_email,
      merchant_email: merchant_email, // <--- PENTING: Agar callback tau ini punya siapa
      store_name: store_name || "Wago Store",
      amount_original: nominal,
      unique_code: uniqueCode,
      total_pay: totalPay,
      method: selectedMethod,
      status: 'UNPAID',
      qris_string: selectedMethod === 'qris' ? qrImage : '-'
    });

    return res.status(200).json({
      status: 'success',
      order_id: newOrder.order_id,
      total_pay: totalPay,
      qr_image: qrImage,
      qris_meta: qrisDetails, 
      payment_details: {
          type: selectedMethod === 'qris' ? 'qris' : 'bank',
          bank_code: selectedMethod,
          acc_no: accNo,
          acc_name: accName
      }
    });

  } catch (error) {
    console.error("Checkout Error:", error);
    return res.status(500).json({ error: 'Server Error: ' + error.message });
  }
}
