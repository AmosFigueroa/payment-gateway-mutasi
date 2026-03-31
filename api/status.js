import mongoose from "mongoose";

const MONGODB_URI = process.env.MONGODB_URI;

const OrderSchema = new mongoose.Schema({
  order_id: String,
  status: String,
  total_pay: Number,
  product_name: String,
});
const Order = mongoose.models.Order || mongoose.model("Order", OrderSchema);

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Credentials", true);
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");

  if (req.method === "OPTIONS") return res.status(200).end();

  const { order_id } = req.query;
  if (!order_id) return res.status(400).json({ error: "Butuh order_id" });

  try {
    if (mongoose.connection.readyState !== 1)
      await mongoose.connect(MONGODB_URI);

    // Mencari order dan mengambil status serta nominal asli dari database
    const order = await Order.findOne(
      { order_id },
      "status total_pay product_name",
    );

    if (!order) return res.status(404).json({ status: "NOT_FOUND" });

    return res.status(200).json({
      status: order.status,
      total_pay: order.total_pay,
      product_name: order.product_name,
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
