const Service = require('../models/Service');
const { uploadImageToImgBB } = require('../services/imgbb');
const { serializeService } = require('../utils/serialize');

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function getServices(req, res) {
  // Public browse page: only active services are visible.
  const query = { isActive: true };
  if (req.query.category) query.category = String(req.query.category);
  if (req.query.search) {
    const pattern = new RegExp(escapeRegExp(String(req.query.search)), 'i');
    query.$or = [{ name: pattern }, { description: pattern }, { category: pattern }];
  }
  const services = await Service.find(query)
    .select('name description category price durationMinutes imageUrl isActive')
    .sort({ name: 1 });
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
  const services = await Service.find(query)
    .select('name description category price durationMinutes imageUrl isActive')
    .sort({ name: 1 });
  return res.json({ success: true, services: services.map(serializeService) });
}

async function getService(req, res) {
  const service = await Service.findById(req.params.id);
  if (!service || !service.isActive) {
    return res.status(404).json({ success: false, error: 'Service not found' });
  }
  return res.json({ success: true, service: serializeService(service) });
}

async function createService(req, res) {
  const { name, description, category, price, durationMinutes, imageUrl, isActive } = req.body || {};
  if (!name) {
    return res.status(400).json({ success: false, error: 'Name is required' });
  }
  if (price === undefined || price === null || price === '' || !Number.isFinite(Number(price)) || Number(price) <= 0) {
    return res.status(400).json({ success: false, error: 'Price must be a positive number' });
  }
  const durationRaw = durationMinutes === undefined || durationMinutes === null || durationMinutes === ''
    ? 60
    : Number(durationMinutes);
  if (!Number.isFinite(durationRaw) || durationRaw <= 0) {
    return res.status(400).json({ success: false, error: 'Duration must be a positive number of minutes' });
  }
  const service = await Service.create({
    name: String(name).trim(),
    description: description ? String(description) : '',
    category: category ? String(category).trim() : 'general',
    price: Number(price),
    durationMinutes: durationRaw,
    imageUrl: imageUrl ? String(imageUrl) : '',
    isActive: isActive === undefined ? true : Boolean(isActive),
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
  if (req.body.durationMinutes !== undefined) update.durationMinutes = Number(req.body.durationMinutes);
  if (req.body.imageUrl !== undefined) update.imageUrl = String(req.body.imageUrl || '');
  if (req.body.isActive !== undefined) update.isActive = Boolean(req.body.isActive);
  const service = await Service.findByIdAndUpdate(id, update, { new: true });
  if (!service) return res.status(404).json({ success: false, error: 'Service not found' });
  return res.json({ success: true, service: serializeService(service) });
}

// Activate or deactivate a service (admin only).
async function setServiceStatus(req, res) {
  const { id } = req.params;
  const isActive = req.body?.isActive;
  if (typeof isActive !== 'boolean') {
    return res.status(400).json({ success: false, error: 'isActive must be a boolean' });
  }
  const service = await Service.findByIdAndUpdate(id, { isActive }, { new: true });
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
