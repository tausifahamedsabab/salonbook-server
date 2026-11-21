const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'salonbook-dev-secret-change-me';

function issueToken(user) {
  return jwt.sign(
    { userId: user._id.toString(), name: user.name, role: user.role, email: user.email },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

module.exports = { issueToken, JWT_SECRET };
