const Transaction = require('../models/Transaction');

async function listTransactions(req, res) {
  const query = {};
  if (req.query.status) query.status = String(req.query.status);
  if (req.user.role !== 'admin') query.customerId = new (require('mongoose').Types.ObjectId)(req.user.id);
  const transactions = await Transaction.find(query).sort({ createdAt: -1 });
  return res.json({ success: true, transactions });
}

async function getTransaction(req, res) {
  const transaction = await Transaction.findById(req.params.id);
  if (!transaction) return res.status(404).json({ success: false, error: 'Transaction not found' });
  return res.json({ success: true, transaction });
}

async function getTransactionsForAppointment(req, res) {
  const transactions = await Transaction.find({ appointmentId: req.params.id });
  return res.json({ success: true, transactions });
}

module.exports = { listTransactions, getTransaction, getTransactionsForAppointment };
