import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Customers from './pages/Customers'
import Loans from './pages/Loans'
import Payments from './pages/Payments'
import Collectors from './pages/Collectors'
import CreditScoring from './pages/CreditScoring'
import Deposits from './pages/Deposits'
import Expenses from './pages/Expenses'
import CashPosition from './pages/CashPosition'
import Reports from './pages/Reports'
import Users from './pages/Users'
import Branches from './pages/Branches'
import AuditTrail from './pages/AuditTrail'

function PrivateRoute({ children }) {
  const { user } = useAuth()
  return user ? children : <Navigate to="/login" replace />
}

export default function App() {
  const { user } = useAuth()
  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
      <Route path="/" element={<PrivateRoute><Layout /></PrivateRoute>}>
        <Route index element={<Dashboard />} />
        <Route path="customers" element={<Customers />} />
        <Route path="credit-scoring" element={<CreditScoring />} />
        <Route path="loans" element={<Loans />} />
        <Route path="payments" element={<Payments />} />
        <Route path="collectors" element={<Collectors />} />
        <Route path="deposits" element={<Deposits />} />
        <Route path="expenses" element={<Expenses />} />
        <Route path="cash" element={<CashPosition />} />
        <Route path="reports" element={<Reports />} />
        <Route path="branches" element={<Branches />} />
        <Route path="users" element={<Users />} />
        <Route path="audit" element={<AuditTrail />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
