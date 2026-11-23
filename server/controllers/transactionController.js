const mongoose = require('mongoose');
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
  // The route parameter is `paymentId`; reading `req.params.id` here used to
  // produce an unbounded query that returned every transaction in the system.
  const paymentId = String(req.params.paymentId || '');
  if (!mongoose.Types.ObjectId.isValid(paymentId)) {
    return res.status(400).json({ success: false, error: 'Invalid payment id' });
  }
  const transactions = await Transaction.find({ appointmentId: paymentId });
  return res.json({ success: true, transactions });
}

module.exports = { listTransactions, getTransaction, getTransactionsForAppointment };
