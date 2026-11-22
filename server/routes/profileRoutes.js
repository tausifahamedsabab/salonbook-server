const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { getProfile, updateProfile } = require('../controllers/profileController');

const router = express.Router();

// Self: GET/PUT /api/users/profile — the signed-in user's own profile.
router.get('/', requireAuth, getProfile);
router.put('/', requireAuth, updateProfile);

// By id: GET/PUT /api/users/profile/:id — self or (admin) another user.
router.get('/:id', requireAuth, getProfile);
router.put('/:id', requireAuth, updateProfile);

module.exports = router;
