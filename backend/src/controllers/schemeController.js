const schemeService = require("../services/schemeService");
const { validateAndNormalizeScheme } = require("../middleware/schemeValidator");
const { ValidationError } = require("../middleware/errorHandler");

async function getAllSchemes(req, res, next) {
  try {
    const { status, category, search } = req.query;
    const schemes = await schemeService.getAllSchemes({ status, category, search });

    res.status(200).json({
      success: true,
      count: schemes.length,
      data: schemes,
    });
  } catch (error) {
    next(error);
  }
}

async function getSchemeById(req, res, next) {
  try {
    const { id } = req.params;
    const scheme = await schemeService.getSchemeById(id);

    res.status(200).json({
      success: true,
      data: scheme,
    });
  } catch (error) {
    next(error);
  }
}

async function createScheme(req, res, next) {
  try {
    const { isValid, errors, normalized } = validateAndNormalizeScheme(req.body);
    if (!isValid) {
      throw new ValidationError("Scheme validation failed", errors);
    }

    const created = await schemeService.createScheme(normalized);

    res.status(201).json({
      success: true,
      message: "Scheme created successfully",
      data: created,
    });
  } catch (error) {
    next(error);
  }
}

async function updateScheme(req, res, next) {
  try {
    const { id } = req.params;
    const schemePayload = { ...req.body, scheme_id: id };

    const { isValid, errors, normalized } = validateAndNormalizeScheme(schemePayload, true);
    if (!isValid) {
      throw new ValidationError("Scheme validation failed", errors);
    }

    const updated = await schemeService.updateScheme(id, normalized);

    res.status(200).json({
      success: true,
      message: "Scheme updated successfully",
      data: updated,
    });
  } catch (error) {
    next(error);
  }
}

async function setSchemeStatus(req, res, next) {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!["active", "archived", "draft"].includes(status)) {
      throw new ValidationError("`status` must be 'active', 'archived', or 'draft'");
    }

    const updated = await schemeService.setSchemeStatus(id, status);

    res.status(200).json({
      success: true,
      message: `Scheme status updated to ${status}`,
      data: updated,
    });
  } catch (error) {
    next(error);
  }
}

async function deleteScheme(req, res, next) {
  try {
    const { id } = req.params;
    const deleted = await schemeService.deleteScheme(id);

    res.status(200).json({
      success: true,
      message: `Scheme '${id}' deleted successfully`,
      data: deleted,
    });
  } catch (error) {
    next(error);
  }
}

async function filterSchemes(req, res, next) {
  try {
    const schemes = await schemeService.filterSchemes(req.body);

    res.status(200).json({
      success: true,
      count: schemes.length,
      data: schemes,
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getAllSchemes,
  getSchemeById,
  createScheme,
  updateScheme,
  setSchemeStatus,
  deleteScheme,
  filterSchemes,
};