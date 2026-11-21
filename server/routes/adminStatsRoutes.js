const express = require('express');
const adminStatsController = require('../controllers/adminStatsController');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

router.get('/stats', requireAuth, requireRole('admin'), adminStatsController.getAdminStats);

module.exports = router;
