const express = require('express');
const paymentController = require('../controllers/paymentController');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.get('/', requireAuth, paymentController.getPayments);
router.get('/:id', requireAuth, paymentController.getPayment);
router.post('/checkout/:appointmentId', requireAuth, paymentController.createCheckout);
router.get('/:id/verify', requireAuth, paymentController.verifyPayment);

module.exports = router;
