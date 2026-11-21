const express = require('express');
const customerController = require('../controllers/customerController');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

router.get('/', requireAuth, requireRole('admin'), customerController.listCustomers);
router.post('/:id/block', requireAuth, requireRole('admin'), customerController.blockUser);
router.post('/:id/unblock', requireAuth, requireRole('admin'), customerController.unblockUser);

module.exports = router;
