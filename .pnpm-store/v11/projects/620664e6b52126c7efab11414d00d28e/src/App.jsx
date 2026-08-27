import { lazy, Suspense, useEffect } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
// Force Vite HMR invalidation
import { useAuth } from './context/AuthContext'
import { canAccessPath } from './access'
import Layout from './components/Layout'
import Login from './pages/Login'

const Dashboard = lazy(() => import('./pages/Dashboard'))
const Customers = lazy(() => import('./pages/Customers'))
const Loans = lazy(() => import('./pages/Loans'))
const Payments = lazy(() => import('./pages/Payments'))
const Collectors = lazy(() => import('./pages/Collectors'))
const DemandLetter = lazy(() => import('./pages/DemandLetter'))
const CreditScoring = lazy(() => import('./pages/CreditScoring'))
const Deposits = lazy(() => import('./pages/Deposits'))
const Transactions = lazy(() => import('./pages/Transactions'))
const DailyCashReport = lazy(() => import('./pages/DailyCashReport'))
const CashPosition = lazy(() => import('./pages/CashPosition'))
const Reports = lazy(() => import('./pages/Reports'))
const Users = lazy(() => import('./pages/Users'))
const Branches = lazy(() => import('./pages/Branches'))
const AuditTrail = lazy(() => import('./pages/AuditTrail'))
const GovernmentCompliance = lazy(() => import('./pages/GovernmentCompliance'))
const NoPaymentMonitoring = lazy(() => import('./pages/NoPaymentMonitoring'))
const PromiseToPayMonitoring = lazy(() => import('./pages/PromiseToPayMonitoring'))
const PromissoryDisclosure = lazy(() => import('./pages/PromissoryDisclosure'))
const CollectorPerformance = lazy(() => import('./pages/CollectorPerformance'))
const JcashMigration = lazy(() => import('./pages/JcashMigration'))

function PrivateRoute({ children }) {
  const { user } = useAuth()
  const location = useLocation()
  if (!user) return <Navigate to="/login" replace />
  if (!canAccessPath(user, location.pathname)) return <Navigate to="/" replace />
  return children
}

function PageLoader() {
  return <div className="page-loader">Loading...</div>
}

function renderPage(Page) {
  return (
    <Suspense fallback={<PageLoader />}>
      <Page />
    </Suspense>
  )
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
      <Route path="/login" element={user ? <Navigate to="/" replace /> : renderPage(Login)} />
      <Route path="/" element={<PrivateRoute><Layout /></PrivateRoute>}>
        <Route index element={renderPage(Dashboard)} />
        <Route path="customers" element={renderPage(Customers)} />
        <Route path="credit-scoring" element={renderPage(CreditScoring)} />
        <Route path="loans" element={renderPage(Loans)} />
        <Route path="promissory-disclosure" element={renderPage(PromissoryDisclosure)} />
        <Route path="payments" element={renderPage(Payments)} />
        <Route path="collectors" element={renderPage(Collectors)} />
        <Route path="demand-letter" element={renderPage(DemandLetter)} />
        <Route path="deposits" element={renderPage(Deposits)} />
        <Route path="transactions" element={renderPage(Transactions)} />
        <Route path="dcr" element={renderPage(DailyCashReport)} />
        <Route path="cash" element={renderPage(CashPosition)} />
        <Route path="reports" element={renderPage(Reports)} />
        <Route path="collector-performance" element={renderPage(CollectorPerformance)} />
        <Route path="jcash-migration" element={renderPage(JcashMigration)} />
        <Route path="government-compliance" element={renderPage(GovernmentCompliance)} />
        <Route path="branches" element={renderPage(Branches)} />
        <Route path="users" element={renderPage(Users)} />
        <Route path="audit" element={renderPage(AuditTrail)} />
        <Route path="monitoring" element={renderPage(NoPaymentMonitoring)} />
        <Route path="ptp-monitoring" element={renderPage(PromiseToPayMonitoring)} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
