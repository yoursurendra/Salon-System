/**
 * SERVICES ROUTE
 */
const express = require("express");
const serviceRouter = express.Router();
const { Service } = require("../models/Service");

function requireAdmin(req, res, next) {
  const key = req.headers["x-admin-key"];
  if (key !== process.env.ADMIN_SECRET_KEY) return res.status(401).json({ error: "Unauthorized" });
  next();
}

// GET all active services (public - used by WhatsApp bot)
serviceRouter.get("/", async (req, res) => {
  try {
    const filter = req.query.all ? {} : { isActive: true };
    const services = await Service.find(filter).sort("displayOrder name");
    res.json(services);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST create service
serviceRouter.post("/", requireAdmin, async (req, res) => {
  try {
    const service = new Service(req.body);
    await service.save();
    res.status(201).json(service);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PUT update service
serviceRouter.put("/:id", requireAdmin, async (req, res) => {
  try {
    const service = await Service.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!service) return res.status(404).json({ error: "Not found" });
    res.json(service);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE (soft delete - sets isActive=false)
serviceRouter.delete("/:id", requireAdmin, async (req, res) => {
  try {
    await Service.findByIdAndUpdate(req.params.id, { isActive: false });
    res.json({ message: "Service deactivated" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = serviceRouter;
