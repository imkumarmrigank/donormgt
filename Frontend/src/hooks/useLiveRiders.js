import { useQuery } from '@tanstack/react-query'
import { fetchLiveRiders } from '../services/api'

/** Riders with an accepted pickup and today's rider summary, refreshed while the tab is visible. */
export default function useLiveRiders(pollMs = 15000) {
  const query = useQuery({
    queryKey: ['liveRiders'],
    queryFn: () => fetchLiveRiders(),
    refetchInterval: pollMs,
    refetchIntervalInBackground: false,
  })
  return { data: query.data, error: query.error?.message || '' }
}
