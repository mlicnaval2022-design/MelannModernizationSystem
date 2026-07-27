import { useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
// Force Vite HMR invalidation
import { useAuth } from './context/AuthContext'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Customers from './pages/Customers'
import Loans from './pages/Loans'
import Payments from './pages/Payments'
import Collectors from './pages/Collectors'
import DemandLetter from './pages/DemandLetter'
import CreditScoring from './pages/CreditScoring'
import Deposits from './pages/Deposits'
import Transactions from './pages/Transactions'
import DailyCashReport from './pages/DailyCashReport'
import CashPosition from './pages/CashPosition'
import Reports from './pages/Reports'
import Users from './pages/Users'
import Branches from './pages/Branches'
import AuditTrail from './pages/AuditTrail'
import GovernmentCompliance from './pages/GovernmentCompliance'
import NoPaymentMonitoring from './pages/NoPaymentMonitoring'
import MonitoringSettings from './pages/MonitoringSettings'
import PromissoryDisclosure from './pages/PromissoryDisclosure'
import CollectorPerformance from './pages/CollectorPerformance'

function PrivateRoute({ children }) {
  const { user } = useAuth()
  return user ? children : <Navigate to="/login" replace />
}

export default function App() {
  const { user } = useAuth()
  useEffect(() => {
    const stopNumberWheel = event => {
      const target = event.target
      if (target instanceof HTMLInputElement && target.type === 'number') {
        target.blur()
      }
    }
    document.addEventListener('wheel', stopNumberWheel, true)
    return () => document.removeEventListener('wheel', stopNumberWheel, true)
  }, [])

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
      <Route path="/" element={<PrivateRoute><Layout /></PrivateRoute>}>
        <Route index element={<Dashboard />} />
        <Route path="customers" element={<Customers />} />
        <Route path="credit-scoring" element={<CreditScoring />} />
        <Route path="loans" element={<Loans />} />
        <Route path="promissory-disclosure" element={<PromissoryDisclosure />} />
        <Route path="payments" element={<Payments />} />
        <Route path="collectors" element={<Collectors />} />
        <Route path="demand-letter" element={<DemandLetter />} />
        <Route path="deposits" element={<Deposits />} />
        <Route path="transactions" element={<Transactions />} />
        <Route path="dcr" element={<DailyCashReport />} />
        <Route path="cash" element={<CashPosition />} />
        <Route path="reports" element={<Reports />} />
        <Route path="collector-performance" element={<CollectorPerformance />} />
        <Route path="government-compliance" element={<GovernmentCompliance />} />
        <Route path="branches" element={<Branches />} />
        <Route path="users" element={<Users />} />
        <Route path="audit" element={<AuditTrail />} />
        <Route path="monitoring" element={<NoPaymentMonitoring />} />
        <Route path="monitoring-settings" element={<MonitoringSettings />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
