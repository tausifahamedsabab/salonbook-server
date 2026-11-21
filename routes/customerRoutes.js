const express = require('express');
const customerController = require('../controllers/customerController');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

router.get('/', requireAuth, requireRole('admin'), customerController.listCustomers);

module.exports = router;
