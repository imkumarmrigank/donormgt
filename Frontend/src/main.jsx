// src/main.jsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import App from './App.jsx'
import './index.css'

//Prevent mouse-wheel from accidentally changing
//    <input type="number"> values globally — affects SKS qty inputs,
//    Record-Payment amount, rate-chart inputs, etc.
document.addEventListener('wheel', () => {
  if (document.activeElement?.type === 'number') {
    document.activeElement.blur()
  }
}, { passive: true })

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 10 * 60_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>,
)
