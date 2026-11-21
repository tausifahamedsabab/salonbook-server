const express = require('express');
const appointmentController = require('../controllers/appointmentController');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

router.get('/', requireAuth, appointmentController.getAppointments);
router.post('/', requireAuth, appointmentController.createAppointment);
router.put('/:id/confirm', requireAuth, requireRole('admin'), appointmentController.confirmAppointment);
router.put('/:id/cancel', requireAuth, appointmentController.cancelAppointment);

module.exports = router;
