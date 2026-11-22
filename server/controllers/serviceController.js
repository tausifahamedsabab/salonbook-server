const Service = require('../models/Service');
const { uploadImageToImgBB } = require('../services/imgbb');
const { serializeService } = require('../utils/serialize');

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Backend sorting: `?sort=priceLow|priceHigh` on services lists (default: by name).
function applySort(query, sortParam) {
  const s = String(sortParam || '').trim().toLowerCase();
  if (s === 'pricelow' || s === 'price') return query.sort({ price: 1 });
  if (s === 'pricehigh') return query.sort({ price: -1 });
  return query.sort({ name: 1 });
}

async function getServices(req, res) {
  // Public browse page: only active services are visible.
  const query = { $or: [{ status: 'active' }, { status: { $exists: false }, isActive: { $ne: false } }] };
  if (req.query.category) query.category = String(req.query.category);
  if (req.query.search) {
    const pattern = new RegExp(escapeRegExp(String(req.query.search)), 'i');
    query.$or = [{ name: pattern }, { description: pattern }, { category: pattern }];
  }
  const services = await applySort(Service.find(query).select('name description category price duration image status'), req.query.sort);
  return res.json({ success: true, services });
}

async function getServicesAll(req, res) {
  // Admin view: every service, active and inactive.
  const query = {};
  if (req.query.category) query.category = String(req.query.category);
  if (req.query.search) {
    const pattern = new RegExp(escapeRegExp(String(req.query.search)), 'i');
    query.$or = [{ name: pattern }, { description: pattern }, { category: pattern }];
  }
  const services = await applySort(Service.find(query).select('name description category price duration image status'), req.query.sort);
  return res.json({ success: true, services: services.map(serializeService) });
}

async function getService(req, res) {
  const service = await Service.findById(req.params.id);
  if (!service || service.status !== 'active') {
    return res.status(404).json({ success: false, error: 'Service not found' });
  }
  return res.json({ success: true, service: serializeService(service) });
}

async function createService(req, res) {
  const { name, description, category, price, duration, image, status } = req.body || {};
  if (!name) {
    return res.status(400).json({ success: false, error: 'Name is required' });
  }
  if (price === undefined || price === null || price === '' || !Number.isFinite(Number(price)) || Number(price) <= 0) {
    return res.status(400).json({ success: false, error: 'Price must be a positive number' });
  }
  const durationRaw = duration === undefined || duration === null || duration === '' ? 60 : Number(duration);
  if (!Number.isFinite(durationRaw) || durationRaw <= 0) {
    return res.status(400).json({ success: false, error: 'Duration must be a positive number of minutes' });
  }
  const service = await Service.create({
    name: String(name).trim(),
    description: description ? String(description) : '',
    category: category ? String(category).trim() : 'general',
    price: Number(price),
    duration: durationRaw,
    image: image ? String(image) : '',
    status: status === undefined ? 'active' : String(status),
  });
  return res.status(201).json({ success: true, service: serializeService(service) });
}

async function updateService(req, res) {
  const { id } = req.params;
  const update = {};
  if (req.body.name !== undefined) update.name = String(req.body.name).trim();
  if (req.body.description !== undefined) update.description = String(req.body.description || '');
  if (req.body.category !== undefined) update.category = String(req.body.category || '').trim() || 'general';
  if (req.body.price !== undefined) update.price = Number(req.body.price);
  if (req.body.duration !== undefined) update.duration = Number(req.body.duration);
  if (req.body.image !== undefined) update.image = String(req.body.image || '');
  if (req.body.status !== undefined) update.status = String(req.body.status);
  const service = await Service.findByIdAndUpdate(id, update, { new: true });
  if (!service) return res.status(404).json({ success: false, error: 'Service not found' });
  return res.json({ success: true, service: serializeService(service) });
}

// Activate or deactivate a service (admin only).
async function setServiceStatus(req, res) {
  const { id } = req.params;
  const status = req.body?.status;
  if (status !== 'active' && status !== 'inactive') {
    return res.status(400).json({ success: false, error: 'status must be "active" or "inactive"' });
  }
  const service = await Service.findByIdAndUpdate(id, { status }, { new: true });
  if (!service) return res.status(404).json({ success: false, error: 'Service not found' });
  return res.json({ success: true, service: serializeService(service) });
}

async function deleteService(req, res) {
  const service = await Service.findByIdAndDelete(req.params.id);
  if (!service) return res.status(404).json({ success: false, error: 'Service not found' });
  return res.json({ success: true });
}

async function uploadServiceImage(req, res) {
  if (!req.file || !req.file.buffer) {
    return res.status(400).json({ success: false, error: 'Please upload a file under the key "image"' });
  }
  const base64 = req.file.buffer.toString('base64');
  const url = await uploadImageToImgBB(base64);
  return res.json({ success: true, url, filename: req.file.originalname });
}

module.exports = {
  getServices, getServicesAll, getService,
  createService, updateService, deleteService, setServiceStatus, uploadServiceImage,
};
