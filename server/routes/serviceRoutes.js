const express = require('express');
const multer = require('multer');
const serviceController = require('../controllers/serviceController');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() }).single('image');

router.get('/', serviceController.getServices);
// Admin view: all services (active + inactive)
router.get('/all', requireAuth, requireRole('admin'), serviceController.getServicesAll);
router.get('/:id', serviceController.getService);
// Activate or deactivate a service (admin only)
router.put('/:id/status', requireAuth, requireRole('admin'), serviceController.setServiceStatus);
router.post('/', requireAuth, requireRole('admin'), serviceController.createService);
router.put('/:id', requireAuth, requireRole('admin'), serviceController.updateService);
router.delete('/:id', requireAuth, requireRole('admin'), serviceController.deleteService);
router.post('/upload', requireAuth, requireRole('admin'), upload, serviceController.uploadServiceImage);

module.exports = router;
