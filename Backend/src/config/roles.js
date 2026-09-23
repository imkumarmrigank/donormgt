const ROLES = Object.freeze({
  ADMIN: "admin",
  MANAGER: "manager",
  EXECUTIVE: "executive"
});

const ROLE_VALUES = Object.values(ROLES);

const PERMISSIONS = Object.freeze({
  // Data management
  WRITE_MASTER_DATA:    [ROLES.ADMIN, ROLES.MANAGER],
  DELETE_MASTER_DATA:   [ROLES.ADMIN],

  // User management
  MANAGE_USERS:         [ROLES.ADMIN],

  // Location management
  WRITE_LOCATIONS:      [ROLES.ADMIN, ROLES.MANAGER],
  DELETE_LOCATIONS:     [ROLES.ADMIN],

  // Donor management
  WRITE_DONORS:         [ROLES.ADMIN, ROLES.MANAGER],
  DELETE_DONORS:        [ROLES.ADMIN, ROLES.MANAGER],

  // Pickup management
  SCHEDULE_PICKUPS:     [ROLES.ADMIN, ROLES.MANAGER],
  EXECUTE_PICKUPS:      [ROLES.ADMIN, ROLES.MANAGER, ROLES.EXECUTIVE],
  DELETE_PICKUPS:       [ROLES.ADMIN],

  // Partner management
  WRITE_PARTNERS:       [ROLES.ADMIN, ROLES.MANAGER],
  DELETE_PARTNERS:      [ROLES.ADMIN],

  // Payment management
  MANAGE_PAYMENTS:      [ROLES.ADMIN, ROLES.MANAGER],

  // Reports & dashboard
  VIEW_REPORTS:         [ROLES.ADMIN, ROLES.MANAGER],
  VIEW_DASHBOARD:       [ROLES.ADMIN, ROLES.MANAGER],

  // SKS management
  WRITE_SKS:            [ROLES.ADMIN, ROLES.MANAGER, ROLES.EXECUTIVE],
  DELETE_SKS:           [ROLES.ADMIN, ROLES.MANAGER],

  // Raddi master
  VIEW_RADDI_MASTER:    [ROLES.ADMIN],
});

module.exports = {
  ROLES,
  ROLE_VALUES,
  PERMISSIONS
};
