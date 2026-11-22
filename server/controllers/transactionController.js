const Payment = require('../models/Payment');
const Transaction = require('../models/Transaction');
const { serializePayment } = require('../utils/serialize');

async function listTransactions(req, res) {
  const query = {};
  if (req.query.status) query.status = String(req.query.status);
  if (req.user.role !== 'admin') query.customerId = req.user.id;
  const transactions = await Transaction.find(query).sort({ createdAt: -1 });
  return res.json({ success: true, transactions });
}

async function getTransaction(req, res) {
  const transaction = await Transaction.findById(req.params.id);
  if (!transaction) return res.status(404).json({ success: false, error: 'Transaction not found' });
  return res.json({ success: true, transaction });
}

async function getTransactionsForPayment(req, res) {
  const transactions = await Transaction.find({ paymentId: req.params.id });
  return res.json({ success: true, transactions });
}

module.exports = { listTransactions, getTransaction, getTransactionsForPayment };
