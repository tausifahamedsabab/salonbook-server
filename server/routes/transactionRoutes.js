const express = require('express');
const transactionController = require('../controllers/transactionController');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

// Admin-only: full transaction list (customer info, service, amount, etc.)
router.get('/', requireAuth, requireRole('admin'), transactionController.listTransactions);
router.get('/:id', requireAuth, requireRole('admin'), transactionController.getTransaction);
router.get('/by-payment/:paymentId', requireAuth, requireRole('admin'), transactionController.getTransactionsForAppointment);

module.exports = router;
