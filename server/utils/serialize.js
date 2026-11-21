function serializeUser(user) {
  if (!user) return null;
  const plain = user.toObject ? user.toObject({ virtuals: true }) : { ...user };
  delete plain.passwordHash;
  return plain;
}

function serializeService(service) {
  if (!service) return null;
  return service.toObject ? service.toObject({ virtuals: true }) : { ...service };
}

function deref(value) {
  // A populated mongoose doc is an object with _id; a plain ref is the id itself.
  if (value && typeof value === 'object' && typeof value._id !== 'undefined') return value._id;
  return value;
}

function serializeAppointment(a) {
  if (!a) return null;
  const plain = a.toObject({ virtuals: true });
  plain.customerId = deref(plain.customerId);
  plain.serviceId = deref(plain.serviceId);
  plain.requestedAt = plain.requestedAt
    ? new Date(plain.requestedAt).toISOString()
    : (plain.createdAt ? new Date(plain.createdAt).toISOString() : null);
  plain.appointmentDate = new Date(plain.appointmentDate).toISOString();
  // Display-friendly populated fields
  plain.service = a.serviceId || null;
  plain.customer = a.customerId || null;
  return plain;
}

function serializePayment(p) {
  if (!p) return null;
  const plain = p.toObject({ virtuals: true });
  plain.appointmentId = deref(plain.appointmentId);
  plain.customerId = deref(plain.customerId);
  plain.appointment = p.appointmentId || null;
  const populatedAppointment = p.appointmentId && typeof p.appointmentId === 'object' ? p.appointmentId : null;
  plain.service = populatedAppointment?.serviceName || null;
  plain.serviceId = populatedAppointment?.serviceId || null;
  plain.appointmentDate = populatedAppointment?.appointmentDate || plain.appointmentDate || null;
  plain.updatedAt = new Date(plain.updatedAt).toISOString();
  return plain;
}

module.exports = { serializeUser, serializeService, serializeAppointment, serializePayment };
