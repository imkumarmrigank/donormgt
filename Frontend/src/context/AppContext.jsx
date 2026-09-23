/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { useQueries, useQueryClient } from "@tanstack/react-query";
import * as api from "../services/api";
import { useRole } from "./RoleContext";
import { queryKeys } from "../query/queryKeys";

const AppContext = createContext(null);

const EMPTY_DASHBOARD = {
  totalDonors: 0,
  activeDonors: 0,
  postponedDonors: 0,
  lostDonors: 0,
  totalPickupsCompleted: 0,
  totalPickupsThisMonth: 0,
  totalRSTValue: 0,
  pendingPayments: 0,
  upcomingPickups: 0,
  overduePickups: 0,
  drivePickups: 0,
  individualPickups: 0,
  totalRaddiKg: 0,
  totalRevenue: 0,
  amountReceived: 0,
  pendingFromPickupPartners: 0,
  totalSKSItems: 0,
  totalSKSPickups: 0,
};

const EMPTY_SCHEDULER = { overdue: [], scheduled: [], atRisk: [], churned: [] };
const EMPTY_MASTER = {
  RST_ITEMS: [],
  SKS_ITEMS: [],
  rstItemsFull: [],
  sksItemsFull: [],
  PICKUP_MODES: [],
  DONOR_STATUSES: [],
  PICKUP_STATUSES: [],
  PAYMENT_STATUSES: [],
  POSTPONE_REASONS: [],
  LOST_REASONS: [],
};
const EMPTY_LOCATIONS = {
  cities: [],
  sectors: [],
  societies: [],
  citySectors: {},
  sectorSocieties: {},
};
const EMPTY_DASHBOARD_PAYLOAD = {
  stats: EMPTY_DASHBOARD,
  monthlyData: [],
  itemBreakdown: [],
  monthlyRSTChart: [],
  monthlySKSChart: [],
  rstBreakdown: [],
  sksBreakdown: [],
  rstFinancialSummary: {
    totalRevenue: 0,
    totalReceived: 0,
    totalPending: 0,
    collectionPct: 0,
    partnerBreakdown: [],
  },
  sksDispatchSummary: {
    totalDispatched: 0,
    totalReceived: 0,
    totalValue: 0,
    dispatches: 0,
    collectionPct: 0,
    recipientBreakdown: [],
  },
};

const CORE_LIMITS = {
  donors: 100,
  pickups: 100,
  partners: 100,
  sks: 100,
};

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used inside <AppProvider>");
  return ctx;
}

function names(list = []) {
  return list.map(item => (typeof item === "string" ? item : item.name)).filter(Boolean);
}

function upsertById(list = [], item) {
  if (!item?.id) return list;
  return [item, ...list.filter(existing => existing.id !== item.id)];
}

function updateById(list = [], id, item) {
  if (!id || !item) return list;
  return list.some(existing => existing.id === id)
    ? list.map(existing => (existing.id === id ? item : existing))
    : upsertById(list, item);
}

function removeById(list = [], id) {
  return list.filter(item => item.id !== id);
}

function limitList(list = [], limit = 500) {
  return list.slice(0, limit);
}

function toNumber(value) {
  return Number(value) || 0;
}

function updateStock(stock = [], items = [], direction = 1) {
  const map = new Map(stock.map(item => [item.name, toNumber(item.qty)]));
  items.forEach(item => {
    if (!item?.name) return;
    const nextQty = (map.get(item.name) || 0) + direction * toNumber(item.qty);
    if (nextQty === 0) map.delete(item.name);
    else map.set(item.name, nextQty);
  });

  return Array.from(map.entries())
    .map(([name, qty]) => ({ name, qty }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function deltaItems(oldItems = [], newItems = []) {
  const map = new Map();
  (oldItems || []).forEach(it => {
    if (!it?.name) return;
    map.set(it.name, (map.get(it.name) || 0) - toNumber(it.qty));
  });
  (newItems || []).forEach(it => {
    if (!it?.name) return;
    map.set(it.name, (map.get(it.name) || 0) + toNumber(it.qty));
  });
  return Array.from(map.entries())
    .filter(([, qty]) => qty !== 0)
    .map(([name, qty]) => ({ name, qty }));
}

function patchDonorAfterCompletedPickup(donor, pickup) {
  if (!donor || pickup.status !== "Completed") return donor;
  return {
    ...donor,
    lastPickup: pickup.date || donor.lastPickup,
    nextPickup: pickup.nextDate || donor.nextPickup || null,
    totalRST: toNumber(donor.totalRST) + toNumber(pickup.totalValue),
    totalSKS: toNumber(donor.totalSKS) + ((pickup.sksItems || []).length ? 1 : 0),
    status: "Active",
  };
}

function patchPartnerAfterCompletedPickup(partner, pickup) {
  if (!partner || pickup.status !== "Completed") return partner;
  const pending = Math.max(0, toNumber(pickup.totalValue) - toNumber(pickup.amountPaid));
  return {
    ...partner,
    totalPickups: toNumber(partner.totalPickups) + 1,
    totalValue: toNumber(partner.totalValue) + toNumber(pickup.totalValue),
    amountReceived: toNumber(partner.amountReceived) + toNumber(pickup.amountPaid),
    pendingAmount: toNumber(partner.pendingAmount) + pending,
  };
}

export function AppProvider({ children }) {
  const { role } = useRole();
  const queryClient = useQueryClient();
  const locationRefreshTimer = useRef(null);

  const [donors, setDonors] = useState([]);
  const [pickups, setPickups] = useState([]);
  const [PickupPartners, setPickupPartners] = useState([]);
  const [sksInflows, setSksInflows] = useState([]);
  const [sksOutflows, setSksOutflows] = useState([]);
  const [sksStock, setSksStock] = useState([]);

  const [dashboardPayload, setDashboardPayload] = useState(EMPTY_DASHBOARD_PAYLOAD);
  const [schedulerTabData, setSchedulerTabData] = useState(EMPTY_SCHEDULER);

  const [masterData, setMasterData] = useState(EMPTY_MASTER);
  const [locations, setLocations] = useState(EMPTY_LOCATIONS);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const canReadReports = role === "admin" || role === "manager";

  const coreQueries = useQueries({
    queries: [
      {
        queryKey: queryKeys.donors({ limit: CORE_LIMITS.donors }),
        queryFn: () => api.fetchDonors({ limit: CORE_LIMITS.donors }),
        enabled: Boolean(role),
      },
      {
        queryKey: queryKeys.pickups({ limit: CORE_LIMITS.pickups }),
        queryFn: () => api.fetchPickups({ limit: CORE_LIMITS.pickups }),
        enabled: Boolean(role),
      },
      {
        queryKey: queryKeys.pickupPartners({ limit: CORE_LIMITS.partners }),
        queryFn: () => api.fetchPickupPartners({ limit: CORE_LIMITS.partners }),
        enabled: Boolean(role),
      },
      {
        queryKey: queryKeys.sksInflows({ limit: CORE_LIMITS.sks }),
        queryFn: () => api.fetchSksInflows({ limit: CORE_LIMITS.sks }),
        enabled: Boolean(role),
      },
      {
        queryKey: queryKeys.sksOutflows({ limit: CORE_LIMITS.sks }),
        queryFn: () => api.fetchSksOutflows({ limit: CORE_LIMITS.sks }),
        enabled: Boolean(role),
      },
      {
        queryKey: queryKeys.sksStock(),
        queryFn: () => api.fetchSksStock(),
        enabled: Boolean(role),
      },
      {
        queryKey: queryKeys.masterData(),
        queryFn: () => api.fetchMasterData(),
        enabled: Boolean(role),
      },
      {
        queryKey: queryKeys.locations(),
        queryFn: () => api.fetchLocations(),
        enabled: Boolean(role),
      },
      {
        queryKey: queryKeys.dashboardStats({ limit: 100 }),
        queryFn: () => api.fetchDashboardStats({ limit: 100 }),
        enabled: canReadReports,
      },
      {
        queryKey: queryKeys.schedulerSummary(),
        queryFn: () => api.fetchSchedulerSummary(),
        enabled: canReadReports,
      },
    ],
  });
  const donorsQuery = coreQueries[0];
  const pickupsQuery = coreQueries[1];
  const partnersQuery = coreQueries[2];
  const inflowsQuery = coreQueries[3];
  const outflowsQuery = coreQueries[4];
  const stockQuery = coreQueries[5];
  const masterQuery = coreQueries[6];
  const locationsQuery = coreQueries[7];
  const dashboardQuery = coreQueries[8];
  const schedulerQuery = coreQueries[9];

  const fetchDashboardStats = useCallback((filters = {}, options = {}) => (
    queryClient.fetchQuery({
      queryKey: queryKeys.dashboardStats({ limit: 100, ...filters }),
      queryFn: () => api.fetchDashboardStats({ limit: 100, ...filters }, options),
      staleTime: options.force ? 0 : 60_000,
    })
  ), [queryClient]);

  const refreshCoreData = useCallback(async ({ force = false } = {}) => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["donors"] }),
      queryClient.invalidateQueries({ queryKey: ["pickups"] }),
      queryClient.invalidateQueries({ queryKey: ["pickupPartners"] }),
      queryClient.invalidateQueries({ queryKey: ["sksInflows"] }),
      queryClient.invalidateQueries({ queryKey: ["sksOutflows"] }),
      queryClient.invalidateQueries({ queryKey: ["sksStock"] }),
      queryClient.invalidateQueries({ queryKey: ["masterData"] }),
      queryClient.invalidateQueries({ queryKey: ["locations"] }),
      queryClient.invalidateQueries({ queryKey: ["dashboardStats"] }),
      queryClient.invalidateQueries({ queryKey: ["schedulerSummary"] }),
    ]);
    if (force) {
      await Promise.all([
        queryClient.refetchQueries({ queryKey: ["donors"] }),
        queryClient.refetchQueries({ queryKey: ["pickups"] }),
        queryClient.refetchQueries({ queryKey: ["pickupPartners"] }),
        queryClient.refetchQueries({ queryKey: ["sksInflows"] }),
        queryClient.refetchQueries({ queryKey: ["sksOutflows"] }),
        queryClient.refetchQueries({ queryKey: ["sksStock"] }),
        queryClient.refetchQueries({ queryKey: ["masterData"] }),
        queryClient.refetchQueries({ queryKey: ["locations"] }),
        queryClient.refetchQueries({ queryKey: ["dashboardStats"] }),
        queryClient.refetchQueries({ queryKey: ["schedulerSummary"] }),
      ]);
    }
  }, [queryClient]);

  const refetchAll = useCallback(async (options = {}) => {
    const force = options?.force === true;
    setError("");
    setLoading(true);
    try {
      await refreshCoreData({ force });
    } catch (err) {
      setError(err.message || "Unable to load data");
    } finally {
      setLoading(false);
    }
  }, [refreshCoreData]);

  // ── Data-sync effect ─────────────────────────────────────────────────────
  // IMPORTANT: this effect intentionally depends ONLY on *.data references.
  // Do NOT add isFetching / isLoading here.  Those flags change when a
  // background refetch starts (e.g. after invalidateQueries), but at that
  // moment *.data still holds the previous server snapshot.  If isFetching
  // were in the deps array the effect would fire and overwrite the optimistic
  // local-state update that mutations apply via setDonors / setPickups / etc.,
  // making the Donors and Supporters pages appear to revert until the network
  // response eventually arrives.  Keeping data-sync and loading-state tracking
  // in separate effects eliminates that race condition entirely.
  useEffect(() => {
    if (donorsQuery?.data)    setDonors(donorsQuery.data);
    if (pickupsQuery?.data)   setPickups(pickupsQuery.data);
    if (partnersQuery?.data)  setPickupPartners(partnersQuery.data);
    if (inflowsQuery?.data)   setSksInflows(inflowsQuery.data);
    if (outflowsQuery?.data)  setSksOutflows(outflowsQuery.data);
    if (stockQuery?.data)     setSksStock(stockQuery.data);
    if (masterQuery?.data)    setMasterData({ ...EMPTY_MASTER, ...masterQuery.data });
    if (locationsQuery?.data) setLocations({ ...EMPTY_LOCATIONS, ...locationsQuery.data });
    if (dashboardQuery?.data) setDashboardPayload({ ...EMPTY_DASHBOARD_PAYLOAD, ...dashboardQuery.data });
    if (schedulerQuery?.data) setSchedulerTabData(schedulerQuery.data);
  }, [
    donorsQuery?.data,
    pickupsQuery?.data,
    partnersQuery?.data,
    inflowsQuery?.data,
    outflowsQuery?.data,
    stockQuery?.data,
    masterQuery?.data,
    locationsQuery?.data,
    dashboardQuery?.data,
    schedulerQuery?.data,
  ]);

  // ── Loading / error tracking effect ──────────────────────────────────────
  // Separated from the data-sync effect so that isFetching / isLoading
  // transitions never trigger a data overwrite (see comment above).
  useEffect(() => {
    const allQueries = [
      donorsQuery, pickupsQuery, partnersQuery,
      inflowsQuery, outflowsQuery, stockQuery,
      masterQuery, locationsQuery, dashboardQuery, schedulerQuery,
    ];
    const hasLoading = allQueries.some(q => q?.isLoading || q?.isFetching);
    const firstError = allQueries.find(q => q?.error)?.error;
    setLoading(hasLoading);
    if (firstError) setError(firstError.message || "Unable to load data");
  }, [
    donorsQuery?.isLoading,    donorsQuery?.isFetching,    donorsQuery?.error,
    pickupsQuery?.isLoading,   pickupsQuery?.isFetching,   pickupsQuery?.error,
    partnersQuery?.isLoading,  partnersQuery?.isFetching,  partnersQuery?.error,
    inflowsQuery?.isLoading,   inflowsQuery?.isFetching,   inflowsQuery?.error,
    outflowsQuery?.isLoading,  outflowsQuery?.isFetching,  outflowsQuery?.error,
    stockQuery?.isLoading,     stockQuery?.isFetching,     stockQuery?.error,
    masterQuery?.isLoading,    masterQuery?.isFetching,    masterQuery?.error,
    locationsQuery?.isLoading, locationsQuery?.isFetching, locationsQuery?.error,
    dashboardQuery?.isLoading, dashboardQuery?.isFetching, dashboardQuery?.error,
    schedulerQuery?.isLoading, schedulerQuery?.isFetching, schedulerQuery?.error,
  ]);

  useEffect(() => () => {
    if (locationRefreshTimer.current) clearTimeout(locationRefreshTimer.current);
  }, []);

  const runMutation = useCallback(async (operation) => {
    setSaving(true);
    setError("");
    try {
      return await operation();
    } catch (err) {
      setError(err.message || "Request failed");
      throw err;
    } finally {
      setSaving(false);
    }
  }, []);

  const refreshLocationsQuietly = useCallback(() => {
    clearTimeout(locationRefreshTimer.current);
    locationRefreshTimer.current = setTimeout(async () => {
      try {
        const locationTree = await api.fetchLocations({ force: true });
        setLocations({ ...EMPTY_LOCATIONS, ...(locationTree || {}) });
        queryClient.invalidateQueries({ queryKey: ["locations"] });
      } catch {
        // Location lookups are supportive data; primary mutations should remain successful.
      }
    }, 500);
  }, [queryClient]);

  const upsertLocation = useCallback((payload) => runMutation(async () => {
    const tree = await api.createLocation(payload);
    setLocations({ ...EMPTY_LOCATIONS, ...(tree || {}) });
    queryClient.invalidateQueries({ queryKey: ["locations"] });
    return tree;
  }), [runMutation, queryClient]);

  const applyCompletedPickupLocally = useCallback((pickup, previousPickup = null) => {
    if (pickup.status !== "Completed" || previousPickup?.status === "Completed") return;

    setDonors(prev => prev.map(donor => (
      donor.id === pickup.donorId ? patchDonorAfterCompletedPickup(donor, pickup) : donor
    )));
    setPickupPartners(prev => prev.map(partner => {
      const matchesPartner = partner.id === pickup.partnerId || partner.name === pickup.PickupPartner;
      return matchesPartner ? patchPartnerAfterCompletedPickup(partner, pickup) : partner;
    }));
  }, []);

  const fetchFilteredDonors = useCallback(
    (params = {}, options = {}) => queryClient.fetchQuery({
      queryKey: queryKeys.donors(params),
      queryFn: () => api.fetchDonors(params, options),
      staleTime: options.force ? 0 : 60_000,
    }),
    [queryClient]
  );

  const fetchFilteredPickups = useCallback(
    (params = {}, options = {}) => queryClient.fetchQuery({
      queryKey: queryKeys.pickups(params),
      queryFn: () => api.fetchPickups(params, options),
      staleTime: options.force ? 0 : 60_000,
    }),
    [queryClient]
  );

  const fetchPartnerSummary = useCallback(
    (params = {}, options = {}) => queryClient.fetchQuery({
      queryKey: queryKeys.partnerSummary(params),
      queryFn: () => api.fetchPartnerSummary(params, options),
      staleTime: options.force ? 0 : 30_000,
    }),
    [queryClient]
  );

  const fetchFilteredRaddiRecords = useCallback(
    (params = {}, options = {}) => queryClient.fetchQuery({
      queryKey: queryKeys.raddiRecords(params),
      queryFn: () => api.fetchRaddiRecords(params, options),
      staleTime: options.force ? 0 : 60_000,
    }),
    [queryClient]
  );

  // ── Donor query-cache sync ────────────────────────────────────────────────
  // Immediately writes a local change into every cached donors query so that
  // when invalidateQueries triggers a background refetch (and isFetching
  // flips to true), the data-sync useEffect reads the already-correct value
  // rather than the pre-mutation snapshot.  Without this step the split
  // useEffect fix alone still leaves a brief window where donorsQuery.data
  // lags behind the local setDonors() call; belt-and-suspenders approach.
  const syncDonorQueryCache = useCallback((updater) => {
    queryClient.setQueriesData({ queryKey: ["donors"] }, (old) => {
      if (!old || !Array.isArray(old)) return old;
      return updater(old);
    });
  }, [queryClient]);

  const addDonor = useCallback(data => runMutation(async () => {
    const created = await api.createDonor(data);
    const localUpdater = prev => limitList(upsertById(prev, created), CORE_LIMITS.donors);
    setDonors(localUpdater);
    syncDonorQueryCache(localUpdater);
    queryClient.invalidateQueries({ queryKey: ["donors"] });
    queryClient.invalidateQueries({ queryKey: ["dashboardStats"] });
    queryClient.invalidateQueries({ queryKey: ["schedulerSummary"] });
    refreshLocationsQuietly();
    return created;
  }), [runMutation, refreshLocationsQuietly, syncDonorQueryCache, queryClient]);

  const updateDonor = useCallback((id, data) => runMutation(async () => {
    const updated = await api.updateDonor(id, data);
    const localUpdater = prev => updateById(prev, id, updated);
    setDonors(localUpdater);
    syncDonorQueryCache(localUpdater);
    queryClient.invalidateQueries({ queryKey: ["donors"] });
    queryClient.invalidateQueries({ queryKey: ["dashboardStats"] });
    queryClient.invalidateQueries({ queryKey: ["schedulerSummary"] });
    refreshLocationsQuietly();
    return updated;
  }), [runMutation, refreshLocationsQuietly, syncDonorQueryCache, queryClient]);

  const deleteDonor = useCallback(id => runMutation(async () => {
    const removed = await api.deleteDonor(id);
    const localUpdater = prev => removeById(prev, id);
    setDonors(localUpdater);
    syncDonorQueryCache(localUpdater);
    queryClient.invalidateQueries({ queryKey: ["donors"] });
    queryClient.invalidateQueries({ queryKey: ["dashboardStats"] });
    queryClient.invalidateQueries({ queryKey: ["schedulerSummary"] });
    return removed;
  }), [runMutation, syncDonorQueryCache, queryClient]);

  const createPickup = useCallback(data => runMutation(async () => {
    const created = await api.createPickup(data);
    setPickups(prev => limitList(upsertById(prev, created), CORE_LIMITS.pickups));
    applyCompletedPickupLocally(created);
    queryClient.invalidateQueries({ queryKey: ["pickups"] });
    queryClient.invalidateQueries({ queryKey: ["dashboardStats"] });
    queryClient.invalidateQueries({ queryKey: ["schedulerSummary"] });
    queryClient.invalidateQueries({ queryKey: ["partnerSummary"] });
    refreshLocationsQuietly();
    return created;
  }), [runMutation, applyCompletedPickupLocally, refreshLocationsQuietly, queryClient]);

  const schedulePickup = useCallback(data => createPickup({ ...data, status: "Pending" }), [createPickup]);

  const recordPickup = useCallback((id, data) => runMutation(async () => {
    const previousPickup = pickups.find(pickup => pickup.id === id);
    const recorded = await api.recordPickup(id, data);
    setPickups(prev => updateById(prev, id, recorded));
    applyCompletedPickupLocally(recorded, previousPickup);
    queryClient.invalidateQueries({ queryKey: ["pickups"] });
    queryClient.invalidateQueries({ queryKey: ["dashboardStats"] });
    queryClient.invalidateQueries({ queryKey: ["schedulerSummary"] });
    queryClient.invalidateQueries({ queryKey: ["partnerSummary"] });
    // Immediate refetch so TodayPickups, PickupOverview scheduler tab, and
    // Dashboard stats all update without the user needing to navigate away.
    queryClient.refetchQueries({ queryKey: ["pickups"] });
    queryClient.refetchQueries({ queryKey: ["schedulerSummary"] });
    queryClient.refetchQueries({ queryKey: ["dashboardStats"] });
    return recorded;
  }), [runMutation, applyCompletedPickupLocally, pickups, queryClient]);

  const updatePickup = useCallback((id, data) => runMutation(async () => {
    const previousPickup = pickups.find(pickup => pickup.id === id);
    const updated = await api.updatePickup(id, data);
    setPickups(prev => updateById(prev, id, updated));
    applyCompletedPickupLocally(updated, previousPickup);
    queryClient.invalidateQueries({ queryKey: ["pickups"] });
    queryClient.invalidateQueries({ queryKey: ["dashboardStats"] });
    queryClient.invalidateQueries({ queryKey: ["schedulerSummary"] });
    queryClient.invalidateQueries({ queryKey: ["partnerSummary"] });
    // Immediate refetch ensures that rescheduled pickups immediately reflect in
    // TodayPickups (date filter), PickupOverview scheduler tabs, and Dashboard
    // stats without requiring a manual page refresh.
    queryClient.refetchQueries({ queryKey: ["pickups"] });
    queryClient.refetchQueries({ queryKey: ["schedulerSummary"] });
    queryClient.refetchQueries({ queryKey: ["dashboardStats"] });
    refreshLocationsQuietly();
    return updated;
  }), [runMutation, applyCompletedPickupLocally, refreshLocationsQuietly, pickups, queryClient]);

  const deletePickup = useCallback(id => runMutation(async () => {
    const removed = await api.deletePickup(id);
    setPickups(prev => removeById(prev, id));
    queryClient.invalidateQueries({ queryKey: ["pickups"] });
    queryClient.invalidateQueries({ queryKey: ["dashboardStats"] });
    queryClient.invalidateQueries({ queryKey: ["schedulerSummary"] });
    queryClient.invalidateQueries({ queryKey: ["partnerSummary"] });
    return removed;
  }), [runMutation, queryClient]);

  const reschedulePickup = useCallback((id, data) => runMutation(async () => {
    const updated = await api.reschedulePickup(id, data);
    setPickups(prev => updateById(prev, id, updated));
    // Immediately synchronise all scheduler-aware views and analytics.
    queryClient.invalidateQueries({ queryKey: ["pickups"] });
    queryClient.invalidateQueries({ queryKey: ["dashboardStats"] });
    queryClient.invalidateQueries({ queryKey: ["schedulerSummary"] });
    queryClient.refetchQueries({ queryKey: ["pickups"] });
    queryClient.refetchQueries({ queryKey: ["schedulerSummary"] });
    queryClient.refetchQueries({ queryKey: ["dashboardStats"] });
    refreshLocationsQuietly();
    return updated;
  }), [runMutation, refreshLocationsQuietly, queryClient]);

  const addPickupPartner = useCallback(data => runMutation(async () => {
    const created = await api.createPickupPartner(data);
    setPickupPartners(prev => limitList(upsertById(prev, created), CORE_LIMITS.partners));
    queryClient.invalidateQueries({ queryKey: ["pickupPartners"] });
    queryClient.invalidateQueries({ queryKey: ["dashboardStats"] });
    queryClient.invalidateQueries({ queryKey: ["partnerSummary"] });
    refreshLocationsQuietly();
    return created;
  }), [runMutation, refreshLocationsQuietly, queryClient]);

  const updatePickupPartner = useCallback((id, data) => runMutation(async () => {
    const updated = await api.updatePickupPartner(id, data);
    setPickupPartners(prev => updateById(prev, id, updated));
    queryClient.invalidateQueries({ queryKey: ["pickupPartners"] });
    queryClient.invalidateQueries({ queryKey: ["dashboardStats"] });
    queryClient.invalidateQueries({ queryKey: ["partnerSummary"] });
    refreshLocationsQuietly();
    return updated;
  }), [runMutation, refreshLocationsQuietly, queryClient]);

  const deletePickupPartner = useCallback(id => runMutation(async () => {
    const removed = await api.deletePickupPartner(id);
    setPickupPartners(prev => removeById(prev, id));
    queryClient.invalidateQueries({ queryKey: ["pickupPartners"] });
    queryClient.invalidateQueries({ queryKey: ["dashboardStats"] });
    queryClient.invalidateQueries({ queryKey: ["partnerSummary"] });
    return removed;
  }), [runMutation, queryClient]);

  const recordPickupPartnerPayment = useCallback(
    (partnerId, data) => runMutation(async () => {
      const result = await api.recordPickupPartnerPayment(partnerId, data);
      queryClient.invalidateQueries({ queryKey: ["pickupPartners"] });
      queryClient.invalidateQueries({ queryKey: ["pickups"] });
      queryClient.invalidateQueries({ queryKey: ["payments"] });
      queryClient.invalidateQueries({ queryKey: ["partnerSummary"] });
      queryClient.invalidateQueries({ queryKey: ["dashboardStats"] });
      return result;
    }),
    [runMutation, queryClient]
  );

  const clearPartnerBalance = useCallback(
    ({ pickuppartnerId }, paymentInfo) => runMutation(async () => {
      const result = await api.clearPartnerBalance(pickuppartnerId, paymentInfo);
      queryClient.invalidateQueries({ queryKey: ["pickupPartners"] });
      queryClient.invalidateQueries({ queryKey: ["pickups"] });
      queryClient.invalidateQueries({ queryKey: ["payments"] });
      queryClient.invalidateQueries({ queryKey: ["partnerSummary"] });
      queryClient.invalidateQueries({ queryKey: ["dashboardStats"] });
      return result;
    }),
    [runMutation, queryClient]
  );

  const addSksInflow = useCallback(data => runMutation(async () => {
    const created = await api.createSksInflow(data);
    setSksInflows(prev => limitList(upsertById(prev, created), CORE_LIMITS.sks));
    setSksStock(prev => updateStock(prev, created.items, 1));
    queryClient.invalidateQueries({ queryKey: ["sksInflows"] });
    queryClient.invalidateQueries({ queryKey: ["sksStock"] });
    queryClient.invalidateQueries({ queryKey: ["dashboardStats"] });
    return created;
  }), [runMutation, queryClient]);

  const addSksOutflow = useCallback(data => runMutation(async () => {
    const created = await api.createSksOutflow(data);
    setSksOutflows(prev => limitList(upsertById(prev, created), CORE_LIMITS.sks));
    setSksStock(prev => updateStock(prev, created.items, -1));
    queryClient.invalidateQueries({ queryKey: ["sksOutflows"] });
    queryClient.invalidateQueries({ queryKey: ["sksStock"] });
    queryClient.invalidateQueries({ queryKey: ["dashboardStats"] });
    return created;
  }), [runMutation, queryClient]);

  const updateSksInflow = useCallback((id, patch) => runMutation(async () => {
    const existing = sksInflows.find(entry => entry.id === id);
    const updated = await api.updateSksInflow(id, patch);
    setSksInflows(prev => updateById(prev, id, updated));
    if (existing) {
      const diff = deltaItems(existing.items, updated.items);
      if (diff.length) setSksStock(stock => updateStock(stock, diff, 1));
    }
    queryClient.invalidateQueries({ queryKey: ["sksInflows"] });
    queryClient.invalidateQueries({ queryKey: ["sksStock"] });
    queryClient.invalidateQueries({ queryKey: ["dashboardStats"] });
    return updated;
  }), [runMutation, sksInflows, queryClient]);

  const updateSksOutflow = useCallback((id, patch) => runMutation(async () => {
    const existing = sksOutflows.find(entry => entry.id === id);
    const updated = await api.updateSksOutflow(id, patch);
    setSksOutflows(prev => updateById(prev, id, updated));
    if (existing) {
      const diff = deltaItems(existing.items, updated.items);
      if (diff.length) setSksStock(stock => updateStock(stock, diff, -1));
    }
    queryClient.invalidateQueries({ queryKey: ["sksOutflows"] });
    queryClient.invalidateQueries({ queryKey: ["sksStock"] });
    queryClient.invalidateQueries({ queryKey: ["dashboardStats"] });
    return updated;
  }), [runMutation, sksOutflows, queryClient]);

  const recordSksOutflowPayment = useCallback((id, payment) => runMutation(async () => {
    const updated = await api.recordSksOutflowPayment(id, payment);
    setSksOutflows(prev => updateById(prev, id, updated));
    queryClient.invalidateQueries({ queryKey: ["sksOutflows"] });
    queryClient.invalidateQueries({ queryKey: ["dashboardStats"] });
    return updated;
  }), [runMutation, queryClient]);

  const deleteSksInflow = useCallback(id => runMutation(async () => {
    const existing = sksInflows.find(entry => entry.id === id);
    const removed = await api.deleteSksInflow(id);
    setSksInflows(prev => removeById(prev, id));
    if (existing) setSksStock(stock => updateStock(stock, existing.items, -1));
    queryClient.invalidateQueries({ queryKey: ["sksInflows"] });
    queryClient.invalidateQueries({ queryKey: ["sksStock"] });
    queryClient.invalidateQueries({ queryKey: ["dashboardStats"] });
    return removed;
  }), [runMutation, sksInflows, queryClient]);

  const deleteSksOutflow = useCallback(id => runMutation(async () => {
    const existing = sksOutflows.find(entry => entry.id === id);
    const removed = await api.deleteSksOutflow(id);
    setSksOutflows(prev => removeById(prev, id));
    if (existing) setSksStock(stock => updateStock(stock, existing.items, 1));
    queryClient.invalidateQueries({ queryKey: ["sksOutflows"] });
    queryClient.invalidateQueries({ queryKey: ["sksStock"] });
    queryClient.invalidateQueries({ queryKey: ["dashboardStats"] });
    return removed;
  }), [runMutation, sksOutflows, queryClient]);

  const CITIES = useMemo(() => names(locations.cities), [locations.cities]);
  const CITY_SECTORS = useMemo(() => locations.citySectors || {}, [locations.citySectors]);
  const GURGAON_SOCIETIES = useMemo(() => {
    const grouped = {};
    Object.entries(locations.sectorSocieties || {}).forEach(([key, socs]) => {
      const [, sector] = key.split("::");
      if (sector) grouped[sector] = socs;
    });
    return grouped;
  }, [locations.sectorSocieties]);

  const value = useMemo(() => ({
    donors,
    pickups,
    PickupPartners,
    partners: PickupPartners,
    sksInflows,
    sksOutflows,
    sksStock,

    dashboardStats: dashboardPayload.stats || EMPTY_DASHBOARD,
    monthlyData: dashboardPayload.monthlyData || [],
    itemBreakdown: dashboardPayload.itemBreakdown || [],
    monthlyRSTChart: dashboardPayload.monthlyRSTChart || [],
    monthlySKSChart: dashboardPayload.monthlySKSChart || [],
    rstBreakdown: dashboardPayload.rstBreakdown || [],
    sksBreakdown: dashboardPayload.sksBreakdown || [],
    rstFinancialSummary: dashboardPayload.rstFinancialSummary || {},
    sksDispatchSummary: dashboardPayload.sksDispatchSummary || {},
    schedulerTabData,

    masterData,
    locations,
    CITIES,
    CITY_SECTORS,
    GURGAON_SOCIETIES,
    RST_ITEMS: masterData.RST_ITEMS || [],
    SKS_ITEMS: masterData.SKS_ITEMS || [],
    PICKUP_MODES: masterData.PICKUP_MODES || [],
    DONOR_STATUSES: masterData.DONOR_STATUSES || [],
    PICKUP_STATUSES: masterData.PICKUP_STATUSES || [],
    PAYMENT_STATUSES: masterData.PAYMENT_STATUSES || [],
    POSTPONE_REASONS: masterData.POSTPONE_REASONS || [],
    LOST_REASONS: masterData.LOST_REASONS || [],

    loading,
    saving,
    error,

    refetchAll,
    fetchDashboardStats,
    fetchFilteredDonors,
    fetchFilteredPickups,
    fetchPartnerSummary,
    fetchFilteredRaddiRecords,

    addDonor,
    updateDonor,
    deleteDonor,

    createPickup,
    schedulePickup,
    recordPickup,
    updatePickup,
    deletePickup,
    reschedulePickup,

    addPickupPartner,
    updatePickupPartner,
    deletePickupPartner,
    addPartner: addPickupPartner,
    updatePartner: updatePickupPartner,
    deletePartner: deletePickupPartner,

    recordPickupPartnerPayment,
    clearPartnerBalance,

    addSksInflow,
    addSksOutflow,
    updateSksInflow,
    updateSksOutflow,
    deleteSksInflow,
    deleteSksOutflow,
    recordSksOutflowPayment,

    upsertLocation,
  }), [
    donors,
    pickups,
    PickupPartners,
    sksInflows,
    sksOutflows,
    sksStock,
    dashboardPayload,
    schedulerTabData,
    masterData,
    locations,
    CITIES,
    CITY_SECTORS,
    GURGAON_SOCIETIES,
    loading,
    saving,
    error,
    refetchAll,
    fetchDashboardStats,
    fetchFilteredDonors,
    fetchFilteredPickups,
    fetchPartnerSummary,
    fetchFilteredRaddiRecords,
    addDonor,
    updateDonor,
    deleteDonor,
    createPickup,
    schedulePickup,
    recordPickup,
    updatePickup,
    deletePickup,
    reschedulePickup,
    addPickupPartner,
    updatePickupPartner,
    deletePickupPartner,
    recordPickupPartnerPayment,
    clearPartnerBalance,
    addSksInflow,
    addSksOutflow,
    updateSksInflow,
    updateSksOutflow,
    deleteSksInflow,
    deleteSksOutflow,
    recordSksOutflowPayment,
    upsertLocation,
  ]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}