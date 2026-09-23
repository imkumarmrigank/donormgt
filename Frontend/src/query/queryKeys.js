export const queryKeys = {
  donors: (params = {}) => ['donors', params],
  pickups: (params = {}) => ['pickups', params],
  pickupPartners: (params = {}) => ['pickupPartners', params],
  sksInflows: (params = {}) => ['sksInflows', params],
  sksOutflows: (params = {}) => ['sksOutflows', params],
  sksStock: () => ['sksStock'],
  masterData: () => ['masterData'],
  locations: () => ['locations'],
  dashboardStats: (params = {}) => ['dashboardStats', params],
  schedulerSummary: () => ['schedulerSummary'],
  users: (params = {}) => ['users', params],
  partnerSummary: (params = {}) => ['partnerSummary', params],
  raddiRecords: (params = {}) => ['raddiRecords', params],
  payments: (params = {}) => ['payments', params],
}

