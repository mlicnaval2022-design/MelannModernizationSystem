import { Fragment, useEffect, useMemo, useState } from 'react'
import { ArrowLeft, CalendarDays, CheckCircle2, Edit3, FileText, MapPin, Plus, Printer, RefreshCw, Trash2, TrendingUp, User, Users, X } from 'lucide-react'
import API from '../services/api'
import logo from '../assets/logo.png'
import '../dashboard.css'

const fmt = value => Number(value || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })
const countFmt = value => Number(value || 0).toLocaleString('en-PH')
const printAmount = value => Number(value || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const COLLECTOR_EDITS_STORAGE_KEY = 'collectorPerformanceEdits'
const MAX_PROFILE_PHOTO_DIMENSION = 320

const compressProfilePhoto = source => new Promise(resolve => {
  const image = new Image()

  image.onload = () => {
    const largestDimension = Math.max(image.naturalWidth, image.naturalHeight)
    const scale = largestDimension > MAX_PROFILE_PHOTO_DIMENSION
      ? MAX_PROFILE_PHOTO_DIMENSION / largestDimension
      : 1
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
    canvas.getContext('2d')?.drawImage(image, 0, 0, canvas.width, canvas.height)

    try {
      resolve(canvas.toDataURL('image/jpeg', 0.72))
    } catch {
      resolve(source)
    }
  }

  image.onerror = () => resolve(source)
  image.src = source
})

const compactCollectorEdits = async edits => Object.fromEntries(await Promise.all(
  Object.entries(edits).map(async ([collectorId, edit]) => {
    if (!String(edit?.photo || '').startsWith('data:image/')) return [collectorId, edit]
    return [collectorId, { ...edit, photo: await compressProfilePhoto(edit.photo) }]
  })
))

const toDateKey = date => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const getDefaultRange = () => {
  const to = new Date()
  if (to.getDay() === 0) to.setDate(to.getDate() - 1)
  const dateKey = toDateKey(to)
  return { date_to: dateKey, pastdue_cutoff: `${to.getFullYear()}-05-15` }
}

const displayDate = value => {
  if (!value) return ''
  return new Date(`${value}T00:00:00`).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  })
}

const displayWeekday = value => {
  if (!value) return ''
  return new Date(`${value}T00:00:00`).toLocaleDateString('en-US', {
    weekday: 'long'
  }).toUpperCase()
}

const shortDisplayDate = value => {
  if (!value) return ''
  return new Date(`${value}T00:00:00`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  })
}

const getOperationWeek = dateKey => {
  const selected = new Date(`${dateKey}T00:00:00`)
  const day = selected.getDay()
  const mondayOffset = day === 0 ? -6 : 1 - day
  const start = new Date(selected)
  start.setDate(selected.getDate() + mondayOffset)

  return Array.from({ length: 6 }, (_, index) => {
    const next = new Date(start)
    next.setDate(start.getDate() + index)
    return toDateKey(next)
  })
}

const getCollectionRemark = rate => {
  if (rate >= 90) return 'PASSED'
  if (rate >= 85) return 'WARNING'
  return 'NEEDS IMPROVEMENT'
}

const printDate = value => {
  if (!value) return ''
  return new Date(`${value}T00:00:00`).toLocaleDateString('en-US', {
    month: '2-digit',
    day: '2-digit',
    year: 'numeric'
  })
}

const ratingPeriod = dates => {
  if (!dates.length) return ''
  const first = new Date(`${dates[0]}T00:00:00`)
  const last = new Date(`${dates[dates.length - 1]}T00:00:00`)
  const firstLabel = first.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })
  const crossesMonth = first.getMonth() !== last.getMonth() || first.getFullYear() !== last.getFullYear()
  const lastLabel = crossesMonth
    ? last.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : `${last.getDate()}, ${last.getFullYear()}`
  return `${firstLabel} - ${lastLabel}`
}

const getRemarkStyle = remark => {
  if (remark === 'PASSED') return { background: '#dcfce7', color: '#047857', borderColor: '#bbf7d0' }
  if (remark === 'WARNING') return { background: '#fff7ed', color: '#c2410c', borderColor: '#fed7aa' }
  return { background: '#fff1f2', color: '#e11d48', borderColor: '#fecdd3' }
}

const getCollectorArea = name => {
  const lowerName = String(name || '').toLowerCase()
  if (lowerName.includes('torreta')) return 'ISABEL'
  if (lowerName.includes('domingono')) return 'BAYBAY/HILONGOS/BATO'
  if (lowerName.includes('caballes')) return 'CARIGARA'
  return 'AREA OF ASSIGNMENT'
}

const getCollectorInitials = name => String(name || '')
  .split(/\s+/)
  .filter(Boolean)
  .slice(0, 2)
  .map(part => part.charAt(0).toUpperCase())
  .join('') || 'CP'

const getGeneratedCollectionInsight = (collectorName, rows, summary) => {
  const collector = String(collectorName || 'This collector').toUpperCase()
  const paidRows = rows.filter(row => Number(row.actual || 0) > 0)
  const zeroRows = rows.filter(row => Number(row.actual || 0) === 0)
  const bestRow = [...rows].sort((a, b) => Number(b.actual || 0) - Number(a.actual || 0))[0]
  const lowestPaidRow = [...paidRows].sort((a, b) => Number(a.actual || 0) - Number(b.actual || 0))[0]
  const latestRow = rows[rows.length - 1]
  const targetGap = Math.max(0, Number(summary.dailyTarget || 0) - Number(summary.actual || 0))
  const zeroDates = zeroRows.map(row => shortDisplayDate(row.date)).join(', ')
  const bestDay = `${shortDisplayDate(bestRow?.date)} (PHP ${fmt(bestRow?.actual)})`
  const lowestPaidDay = lowestPaidRow ? `${shortDisplayDate(lowestPaidRow.date)} (PHP ${fmt(lowestPaidRow.actual)})` : 'walay posted collection'
  const performanceFacts = `Nakolekta niya ang PHP ${fmt(summary.actual)} batok sa PHP ${fmt(summary.dailyTarget)} target, kulang ug PHP ${fmt(targetGap)} (${summary.rate.toFixed(2)}%). Naay collection sa ${paidRows.length}/${rows.length} ka operational days; ${zeroRows.length} ka adlaw ang zero collection${zeroRows.length ? ` (${zeroDates})` : ''}. Pinakataas nga collection: ${bestDay}; pinakagamay nga naay collection: ${lowestPaidDay}.`

  if (paidRows.length === 0) {
    return {
      comment: `${collector} walay bisan usa ka posted actual collection sa selected week. ${performanceFacts}`,
      recommendation: `I-validate dayon ang tanan ${rows.length} ka operational days ug pangayoa ang route/activity proof. Himoa ug recovery list sa clients para ma-post ang unang collection sa sunod nga operation day.`
    }
  }

  if (summary.rate >= 100 && zeroRows.length === 0) {
    return {
      comment: `${collector} nalapas ang weekly target ug consistent ang collection sa tanang operational days. ${performanceFacts}`,
      recommendation: `Padayona ang daily route discipline nga nakaproduce sa ${bestDay}. I-monitor ang low-output day nga ${lowestPaidDay} aron mapadayon ang performance bisan dili pareho ang client availability.`
    }
  }

  if (zeroRows.length >= 2) {
    return {
      comment: `${collector} adunay inconsistent nga collection pattern tungod sa ${zeroRows.length} ka zero-collection days. ${performanceFacts}`,
      recommendation: `Unaha ang follow-up sa zero-collection dates (${zeroDates}) ug pangitaa ang clients nga na-miss sa maong routes. Gamita ang ${bestDay} nga adlaw isip reference sa clients o ruta nga mahimong ma-repeat para mabawasan ang PHP ${fmt(targetGap)} nga gap.`
    }
  }

  if (summary.rate < 85) {
    return {
      comment: `${collector} adunay collection sa halos tanang adlaw apan ubos pa ang weekly accomplishment. ${performanceFacts}`,
      recommendation: `I-prioritize ang accounts nga makadugang sa PHP ${fmt(targetGap)} nga kulang. I-review ang ${lowestPaidDay} ug ilisi ang follow-up strategy didto; dili igo ang naay collection kung gamay ra ang amount.`
    }
  }

  return {
    comment: `${collector} duol na sa target apan naa pay measurable nga kulang nga kinahanglan mahabol. ${performanceFacts}`,
    recommendation: Number(latestRow?.actual || 0) === 0
      ? `I-address una ang latest zero-collection day (${shortDisplayDate(latestRow.date)}) ug targeta ang PHP ${fmt(targetGap)} nga gap pinaagi sa high-probability paying clients.`
      : `Maintain ang follow-up nga nakahatag sa ${bestDay}, unya kuhaa ang PHP ${fmt(targetGap)} nga remaining gap gikan sa accounts nga partial o missed ang bayad.`
  }
}

const shortCollectorName = name => {
  const raw = String(name || '').trim()
  const parts = raw.split(/\s+/).filter(Boolean)
  if (parts.length <= 1) return raw.toUpperCase()
  const first = parts[0]
  const last = parts.slice(1).join(' ')
  return `${last}, ${first.charAt(0)}.`.toUpperCase()
}

const targetOrder = [
  'torreta',
  'domingono',
  'caballes',
  'jugar',
  'rosal',
  'laude'
]

const getSortOrder = name => {
  const lowerName = String(name || '').toLowerCase().trim()
  const index = targetOrder.findIndex(target => lowerName.includes(target))
  return index !== -1 ? index : targetOrder.length
}

export default function CollectorPerformance() {
  const defaultRange = useMemo(() => getDefaultRange(), [])
  const [filters, setFilters] = useState(defaultRange)
  const [data, setData] = useState(null)
  const [ratingPeriods, setRatingPeriods] = useState([])
  const [ratingDateRange, setRatingDateRange] = useState({ start_date: '', end_date: '' })
  const [selectedRatingPeriod, setSelectedRatingPeriod] = useState(null)
  const [activeTab, setActiveTab] = useState('targets')
  const [collectionRows, setCollectionRows] = useState([])
  const [newCollectionDate, setNewCollectionDate] = useState(defaultRange.date_to)
  const [selectedCollectionId, setSelectedCollectionId] = useState(null)
  const [collectorEdits, setCollectorEdits] = useState({})
  const [lockedCollections, setLockedCollections] = useState(null)
  const [showSavedModal, setShowSavedModal] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [showPerformancePreview, setShowPerformancePreview] = useState(false)
  const [collectionsLoading, setCollectionsLoading] = useState(false)
  const [loading, setLoading] = useState(true)
  const [fortyFiveDayLoading, setFortyFiveDayLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  const buildFallbackSummary = async () => {
    const dashboardRes = await API.get('/reports/dashboard', { params: { date: filters.date_to } })
    let collectionRes = { data: { payments: [] } }

    try {
      collectionRes = await API.get('/reports/daily-collection', {
        params: {
          date_from: filters.date_to,
          date_to: filters.date_to
        }
      })
    } catch (err) {
      if (err.response?.status !== 404) throw err
    }

    const baseCollectors = dashboardRes.data?.collector_performance || []
    const payments = collectionRes.data?.payments || []
    const byCollector = new Map()

    baseCollectors
      .filter(collector => !String(collector.name || '').toLowerCase().includes('melann office'))
      .forEach(collector => {
      byCollector.set(collector.name, {
        id: collector.id,
        name: collector.name,
        target: Number(collector.target || 0),
        collected: 0,
        actual_collection: 0,
        paying_clients_set: new Set(),
        active_loans: 0
      })
    })

    payments.forEach(payment => {
      const name = payment.collector_name || 'Unassigned'
      if (String(name).toLowerCase().includes('melann office')) return
      const isOldBalancePayment = String(payment.remarks || '').toLowerCase().includes('old balance') || ['balance', 'recon', 'old_balance'].includes(String(payment.payment_type || '').toLowerCase())
      const isReconReleaseToday = String(payment.loan_type || '').toLowerCase().includes('recon') && payment.date_released === filters.date_to
      if (isReconReleaseToday && !isOldBalancePayment) return
      const row = byCollector.get(name) || {
        id: `fallback-${name}`,
        name,
        target: 0,
        collected: 0,
        actual_collection: 0,
        paying_clients_set: new Set(),
        active_loans: 0
      }
      row.collected += Number(payment.amount_paid || 0)
      row.actual_collection += Number(payment.amount_paid || 0)
      if (payment.customer_id) row.paying_clients_set.add(payment.customer_id)
      byCollector.set(name, row)
    })

    const trendMap = new Map()
    collectionRes.data?.payments?.forEach(payment => {
      const isOldBalancePayment = String(payment.remarks || '').toLowerCase().includes('old balance') || ['balance', 'recon', 'old_balance'].includes(String(payment.payment_type || '').toLowerCase())
      const isReconReleaseToday = String(payment.loan_type || '').toLowerCase().includes('recon') && payment.date_released === filters.date_to
      if (isReconReleaseToday && !isOldBalancePayment) return
      const date = payment.date_paid
      trendMap.set(date, (trendMap.get(date) || 0) + Number(payment.amount_paid || 0))
    })

    const rawCollectors = Array.from(byCollector.values())
      .map(row => ({
        ...row,
        paying_clients: row.paying_clients_set.size,
        achievement_rate: row.target > 0 ? Math.round((row.collected / row.target) * 100) : 0
      }))
      .map(row => {
        const sanitizedRow = { ...row }
        delete sanitizedRow.paying_clients_set
        return sanitizedRow
      })

    const top_collector = [...rawCollectors].sort((a, b) => b.collected - a.collected)[0] || null
    const collectors = rawCollectors.sort((a, b) => getSortOrder(a.name) - getSortOrder(b.name) || String(a.name || '').localeCompare(String(b.name || '')))

    const totals = collectors.reduce((acc, row) => {
      acc.target += Number(row.target || 0)
      acc.collected += Number(row.collected || 0)
      acc.paying_clients += Number(row.paying_clients || 0)
      acc.active_loans += Number(row.active_loans || 0)
      return acc
    }, { target: 0, collected: 0, paying_clients: 0, active_loans: 0 })

    totals.payment_count = payments.length
    totals.achievement_rate = totals.target > 0 ? Math.round((totals.collected / totals.target) * 100) : 0

    return {
      date_from: filters.date_to,
      date_to: filters.date_to,
      target_date: filters.date_to,
      actual_date: filters.date_to,
      pastdue_cutoff: filters.pastdue_cutoff,
      totals,
      top_collector,
      collectors,
      trend: Array.from(trendMap.entries())
        .map(([date, collected]) => ({ date, collected }))
        .sort((a, b) => a.date.localeCompare(b.date))
    }
  }

  const loadData = async () => {
    setLoading(true)
    try {
      const res = await API.get('/collector-performance/summary', {
        params: {
          date_to: filters.date_to,
          pastdue_cutoff: filters.pastdue_cutoff
        }
      })
      setData(res.data)
      setErrorMsg('')
    } catch (err) {
      if (err.response?.status === 404) {
        try {
          const fallbackData = await buildFallbackSummary()
          setData(fallbackData)
          setErrorMsg('')
        } catch (fallbackErr) {
          setErrorMsg(fallbackErr.response?.data?.error || fallbackErr.message || 'Could not load collector performance')
        }
      } else {
        setErrorMsg(err.response?.data?.error || err.message || 'Could not load collector performance')
      }
    } finally {
      setLoading(false)
    }
  }

  const buildCollectionsByCollector = summaries => {
    const collectorMap = new Map()

    summaries.forEach(summary => {
      const date = summary?.target_date || summary?.date_to
      const dailyCollectors = (summary?.collectors || [])
        .filter(collector => !String(collector.name || '').toLowerCase().includes('melann office'))
        .sort((a, b) => getSortOrder(a.name) - getSortOrder(b.name) || String(a.name || '').localeCompare(String(b.name || '')))

      dailyCollectors.forEach(collector => {
        const key = collector.id || collector.name
        const dailyTarget = Number(collector.target || 0)
        const actual = Number(collector.actual_collection ?? collector.collected ?? 0)
        const rate = dailyTarget > 0 ? (actual / dailyTarget) * 100 : 0

        if (!collectorMap.has(key)) {
          collectorMap.set(key, {
            id: key,
            name: collector.name,
            collectorCode: collector.collector_code,
            photo: '',
            rows: []
          })
        }

        collectorMap.get(key).rows.push({
          date,
          dailyTarget,
          weeklyTarget: dailyTarget * 6,
          actual,
          paymentCount: Number(collector.payment_count || 0),
          activeClients: Number(collector.active_clients || 0),
          reconClients: Number(collector.recon_clients || 0),
          overdueClients: Number(collector.overdue_clients || 0),
          pastdueClients: Number(collector.pastdue_clients || 0),
          newClients: Number(collector.new_clients || 0),
          newClientPrincipal: Number(collector.new_client_principal || 0),
          rate,
          remark: getCollectionRemark(rate)
        })
      })
    })

    return Array.from(collectorMap.values())
      .sort((a, b) => getSortOrder(a.name) - getSortOrder(b.name) || String(a.name || '').localeCompare(String(b.name || '')))
      .map(collector => ({
        ...collector,
        rows: collector.rows.sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')))
      }))
  }

  const loadCollections = async () => {
    setCollectionsLoading(true)
    try {
      const weekDates = getOperationWeek(filters.date_to)
      const responses = await Promise.all(weekDates.map(date => API.get('/collector-performance/summary', {
        params: {
          date_to: date,
          pastdue_cutoff: filters.pastdue_cutoff
        }
      })))
      const builtCollections = buildCollectionsByCollector(responses.map(response => response.data))
      setCollectionRows(builtCollections)
      setLockedCollections(null)
      setSelectedCollectionId(current => current && !builtCollections.some(collector => collector.id === current) ? null : current)
    } catch (err) {
      setErrorMsg(err.response?.data?.error || err.message || 'Could not load collections')
    } finally {
      setCollectionsLoading(false)
    }
  }

  const loadFortyFiveDayData = async () => {
    setFortyFiveDayLoading(true)
    try {
      const response = await API.get('/forty-five-day-rating/periods')
      setRatingPeriods(response.data)
      setErrorMsg('')
    } catch (err) {
      setErrorMsg(err.response?.data?.error || err.message || 'Could not load 45 days performance')
    } finally {
      setFortyFiveDayLoading(false)
    }
  }

  const loadRatingPeriod = async id => {
    setFortyFiveDayLoading(true)
    try {
      const response = await API.get(`/forty-five-day-rating/periods/${id}`)
      setSelectedRatingPeriod(response.data)
      setErrorMsg('')
    } catch (err) {
      setErrorMsg(err.response?.data?.error || err.message || 'Could not load rating period')
    } finally {
      setFortyFiveDayLoading(false)
    }
  }

  const generateFortyFiveDayRating = async () => {
    if (!ratingDateRange.start_date || !ratingDateRange.end_date || ratingDateRange.end_date < ratingDateRange.start_date) {
      setErrorMsg('Select a valid rating period. The end date cannot be before the start date.')
      return
    }
    setFortyFiveDayLoading(true)
    try {
      const response = await API.post('/forty-five-day-rating/periods', ratingDateRange)
      setRatingDateRange({ start_date: '', end_date: '' })
      await loadFortyFiveDayData()
      await loadRatingPeriod(response.data.id)
    } catch (err) {
      setErrorMsg(err.response?.data?.error || err.message || 'Could not generate 45-day rating')
    } finally {
      setFortyFiveDayLoading(false)
    }
  }

  const refreshRatingPeriod = async () => {
    if (!selectedRatingPeriod?.period?.id) return
    setFortyFiveDayLoading(true)
    try {
      await API.post(`/forty-five-day-rating/periods/${selectedRatingPeriod.period.id}/refresh`)
      await loadFortyFiveDayData()
      await loadRatingPeriod(selectedRatingPeriod.period.id)
    } catch (err) {
      setErrorMsg(err.response?.data?.error || err.message || 'Could not refresh rating totals')
    } finally {
      setFortyFiveDayLoading(false)
    }
  }

  const addCollectionDate = async () => {
    if (!newCollectionDate) return
    const operationDates = getOperationWeek(filters.date_to)
    if (!operationDates.includes(newCollectionDate)) {
      setErrorMsg(`Date must be within ${displayDate(operationDates[0])} to ${displayDate(operationDates[5])}.`)
      return
    }
    if (collectionRows.some(collector => collector.rows.some(row => row.date === newCollectionDate))) {
      setErrorMsg(`${displayDate(newCollectionDate)} is already included.`)
      return
    }

    setCollectionsLoading(true)
    try {
      const response = await API.get('/collector-performance/summary', {
        params: { date_to: newCollectionDate, pastdue_cutoff: filters.pastdue_cutoff }
      })
      const addedCollectors = buildCollectionsByCollector([response.data])
      setCollectionRows(current => {
        const merged = new Map(current.map(collector => [collector.id, { ...collector, rows: [...collector.rows] }]))
        addedCollectors.forEach(collector => {
          const existing = merged.get(collector.id)
          if (existing) {
            existing.rows = [...existing.rows, ...collector.rows]
              .sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')))
          } else {
            merged.set(collector.id, collector)
          }
        })
        return Array.from(merged.values())
          .sort((a, b) => getSortOrder(a.name) - getSortOrder(b.name) || String(a.name || '').localeCompare(String(b.name || '')))
      })
      setLockedCollections(null)
      setErrorMsg('')
    } catch (err) {
      setErrorMsg(err.response?.data?.error || err.message || 'Could not add collection date')
    } finally {
      setCollectionsLoading(false)
    }
  }

  const deleteCollectionDate = date => {
    setCollectionRows(current => current
      .map(collector => ({ ...collector, rows: collector.rows.filter(row => row.date !== date) }))
      .filter(collector => collector.rows.length))
    setLockedCollections(null)
    setErrorMsg('')
  }

  const applyFilters = async () => {
    await loadData()
    if (activeTab === 'collections') await loadCollections()
  }

  const updateCollectorEdit = (collectorId, field, value) => {
    setCollectorEdits(current => ({
      ...current,
      [collectorId]: {
        ...(current[collectorId] || {}),
        [field]: value
      }
    }))
    setShowSavedModal(false)
    setSaveError('')
  }

  const updateCollectorPhoto = (collectorId, file) => {
    if (!file) return
    const reader = new FileReader()
    reader.onload = event => updateCollectorEdit(collectorId, 'photo', event.target?.result || '')
    reader.readAsDataURL(file)
  }

  const saveCollectorEdits = async () => {
    const compactEdits = await compactCollectorEdits(collectorEdits)

    try {
      localStorage.setItem(COLLECTOR_EDITS_STORAGE_KEY, JSON.stringify(compactEdits))
      setCollectorEdits(compactEdits)
      setSaveError('')
      setShowSavedModal(true)
    } catch (error) {
      if (error?.name !== 'QuotaExceededError') throw error

      const editsWithoutPhotos = Object.fromEntries(Object.entries(compactEdits).map(([collectorId, edit]) => {
        const editWithoutPhoto = { ...edit }
        delete editWithoutPhoto.photo
        return [collectorId, editWithoutPhoto]
      }))

      try {
        localStorage.setItem(COLLECTOR_EDITS_STORAGE_KEY, JSON.stringify(editsWithoutPhotos))
        setSaveError('Profile details were saved, but photos could not be saved because browser storage is full. Remove old site data or use smaller photos.')
      } catch {
        setSaveError('Unable to save profile details because browser storage is full. Remove old site data, then try again.')
      }
    }
  }

  const lockWeekForPrinting = () => {
    const dates = getOperationWeek(filters.date_to)
    const dateSet = new Set(dates)
    const locked = {
      dateFrom: dates[0],
      dateTo: dates[dates.length - 1],
      collectors: collectionRows.map(collector => ({
        ...collector,
        rows: collector.rows
          .filter(row => dateSet.has(row.date))
          .sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')))
      }))
    }
    setLockedCollections(locked)
    return locked
  }

  const previewLockedPerformance = () => {
    if (!lockedCollections) lockWeekForPrinting()
    setShowPerformancePreview(true)
  }

  const printLockedPerformance = () => {
    const dates = getOperationWeek(filters.date_to)
    if (!lockedCollections) {
      const dateSet = new Set(dates)
      setLockedCollections({
        dateFrom: dates[0],
        dateTo: dates[dates.length - 1],
        collectors: collectionRows.map(collector => ({
          ...collector,
          rows: collector.rows
            .filter(row => dateSet.has(row.date))
            .sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')))
        }))
      })
    }
    document.body.classList.add('print-performance-report')
    window.print()
    document.body.classList.remove('print-performance-report')
    setShowPerformancePreview(false)
  }

  useEffect(() => {
    loadData()
  }, [])

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(COLLECTOR_EDITS_STORAGE_KEY) || '{}')
      setCollectorEdits(saved && typeof saved === 'object' ? saved : {})
    } catch {
      setCollectorEdits({})
    }
  }, [])

  useEffect(() => {
    if (activeTab === 'collections') loadCollections()
    if (activeTab === 'forty-five-days') loadFortyFiveDayData()
  }, [activeTab])

  const collectors = (data?.collectors || [])
    .filter(collector => !String(collector.name || '').toLowerCase().includes('melann office'))
    .sort((a, b) => getSortOrder(a.name) - getSortOrder(b.name) || String(a.name || '').localeCompare(String(b.name || '')))
  const totals = collectors.reduce((acc, collector) => {
    const collectorTotal = Number(collector.active_clients || 0) + Number(collector.recon_clients || 0) + Number(collector.overdue_clients || 0) + Number(collector.pastdue_clients || 0)
    acc.target += Number(collector.target || 0)
    acc.collected += Number(collector.actual_collection ?? collector.collected ?? 0)
    acc.payment_count += Number(collector.payment_count || 0)
    acc.active_clients += Number(collector.active_clients || 0)
    acc.recon_clients += Number(collector.recon_clients || 0)
    acc.overdue_clients += Number(collector.overdue_clients || 0)
    acc.pastdue_clients += Number(collector.pastdue_clients || 0)
    acc.total_clients += collectorTotal
    return acc
  }, {
    target: 0,
    collected: 0,
    payment_count: 0,
    active_clients: 0,
    recon_clients: 0,
    overdue_clients: 0,
    pastdue_clients: 0,
    total_clients: 0
  })
  totals.achievement_rate = totals.target > 0 ? Math.round((totals.collected / totals.target) * 100) : 0
  const totalClients = Number(totals.active_clients || 0) + Number(totals.recon_clients || 0) + Number(totals.overdue_clients || 0) + Number(totals.pastdue_clients || 0)
  const activeTotal = Number(totals.active_clients || 0) + Number(totals.overdue_clients || 0)
  const pastdueTotal = Number(totals.pastdue_clients || 0)
  const reportDate = data?.target_date || filters.date_to
  const pastdueCutoff = data?.pastdue_cutoff || filters.pastdue_cutoff
  const getCollectorCollectionTotals = rows => {
    const totals = rows.reduce((acc, row) => {
      acc.dailyTarget += Number(row.dailyTarget || 0)
      acc.actual += Number(row.actual || 0)
      acc.paymentCount += Number(row.paymentCount || 0)
      return acc
    }, { dailyTarget: 0, actual: 0, paymentCount: 0 })
    totals.rate = totals.dailyTarget > 0 ? (totals.actual / totals.dailyTarget) * 100 : 0
    totals.remark = getCollectionRemark(totals.rate)
    return totals
  }
  const selectedCollection = collectionRows.find(collector => collector.id === selectedCollectionId)
  const selectedSummary = selectedCollection ? getCollectorCollectionTotals(selectedCollection.rows) : null
  const selectedLatestRow = selectedCollection?.rows.find(row => row.date === filters.date_to) || selectedCollection?.rows[selectedCollection?.rows.length - 1]
  const selectedEdit = selectedCollection ? collectorEdits[selectedCollection.id] || {} : {}
  const selectedActiveTarget = 100
  const selectedNewClients = selectedCollection?.rows.reduce((sum, row) => sum + Number(row.newClients || 0), 0) || 0
  const selectedNewClientPrincipal = selectedCollection?.rows.reduce((sum, row) => sum + Number(row.newClientPrincipal || 0), 0) || 0
  const selectedReturnClients = Number(selectedEdit.returnClients ?? 0)
  const selectedReconClients = Number(selectedEdit.reconClients ?? selectedCollection?.rows.reduce((sum, row) => sum + Number(row.reconClients || 0), 0) ?? 0)
  const selectedBeginningActive = selectedLatestRow
    ? Number(selectedLatestRow.activeClients || 0) + Number(selectedLatestRow.overdueClients || 0)
    : 0
  const selectedEndingBalance = Math.max(0, selectedBeginningActive - selectedReconClients)
  const selectedInsight = selectedCollection && selectedSummary
    ? getGeneratedCollectionInsight(selectedCollection.name, selectedCollection.rows, selectedSummary)
    : null
  const performanceWeekDates = getOperationWeek(lockedCollections?.dateTo || filters.date_to)
  const isValidRatingRange = Boolean(ratingDateRange.start_date && ratingDateRange.end_date && ratingDateRange.end_date >= ratingDateRange.start_date)

  return (
    <div className="dashboard-v2">
      <style>{`
        .collector-print-layout { display: none; }
        .performance-print-layout { display: none; }
        .performance-print-layout.performance-preview-visible {
          display: block;
          position: fixed;
          inset: 0;
          z-index: 1000;
          overflow: auto;
          background: rgba(15, 23, 42, 0.72);
          padding: 72px 24px 24px;
          text-align: center;
        }
        .performance-preview-controls {
          position: fixed;
          top: 18px;
          right: 24px;
          z-index: 1001;
          display: flex;
          gap: 10px;
        }
        .performance-print-layout.performance-preview-visible .performance-print-page {
          width: 8in;
          min-height: 12.5in;
          margin: 0 auto 24px;
          background: #fff;
          box-shadow: 0 20px 60px rgba(0,0,0,.35);
          text-align: left;
          transform-origin: top center;
          zoom: .78;
        }
        @media (max-width: 1100px) {
          .performance-print-layout.performance-preview-visible .performance-print-page { zoom: .66; }
        }
        @media (max-width: 820px) {
          .performance-print-layout.performance-preview-visible .performance-print-page { zoom: .52; }
        }
        .collector-print-table {
          width: 100%;
          border-collapse: collapse;
          table-layout: fixed;
          color: #000;
          font-family: Arial, Helvetica, sans-serif;
        }
        .collector-print-table th,
        .collector-print-table td {
          border: 1px solid #000;
          padding: 3px 4px;
          font-size: 8px;
          line-height: 1.05;
          vertical-align: middle;
        }
        .collector-print-table th {
          font-weight: 800;
          text-align: center;
        }
        .collector-print-label {
          width: 22%;
          font-weight: 800;
          text-align: left;
        }
        .collector-print-value {
          font-weight: 800;
          text-align: left;
        }
        .collector-print-name {
          font-weight: 800;
          text-align: left;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: clip;
        }
        .collector-print-num { text-align: center; font-weight: 700; }
        .collector-print-money { text-align: right; font-weight: 700; }
        .collector-print-total td { font-weight: 900; }
        @media print {
          @page { size: 8.5in 13in; margin: 0.25in; }
          body { background: #fff !important; }
          body * { visibility: hidden !important; }
          body.print-target #printable-area.collector-print-layout,
          body.print-target #printable-area.collector-print-layout *,
          body.print-actual #printable-area.collector-print-layout,
          body.print-actual #printable-area.collector-print-layout * { visibility: visible !important; }
          body.print-target #printable-area.collector-print-layout,
          body.print-actual #printable-area.collector-print-layout {
            display: grid !important;
            grid-template-columns: 1fr;
            gap: 0.2in;
            position: absolute !important;
            left: 0;
            top: 0;
            width: 100%;
            padding: 0;
            background: #fff;
          }
          .collector-print-panel { break-inside: avoid; page-break-inside: avoid; }
          body.print-target .print-actual-only,
          body.print-target .print-actual-only * { display: none !important; visibility: hidden !important; }
          body.print-actual .print-target-only,
          body.print-actual .print-target-only * { display: none !important; visibility: hidden !important; }
          body.print-performance-report * { visibility: hidden !important; }
          body.print-performance-report .performance-print-layout,
          body.print-performance-report .performance-print-layout * { visibility: visible !important; }
          body.print-performance-report .collector-print-layout { display: none !important; }
          body.print-performance-report .performance-print-layout {
            display: block !important;
            position: absolute !important;
            left: 0;
            top: 0;
            width: 100%;
            background: #fff;
            color: #000;
            font-family: Arial, Helvetica, sans-serif;
          }
          .performance-print-page {
            page-break-after: always;
            width: 8in;
            min-height: 12.5in;
            padding: 0;
          }
          .performance-print-page:last-child { page-break-after: auto; }
          .performance-preview-controls { display: none !important; }
        }
      `}</style>

      <div className={`performance-print-layout ${showPerformancePreview ? 'performance-preview-visible' : ''}`}>
        {showPerformancePreview && (
          <div className="performance-preview-controls">
            <button className="btn btn-secondary" type="button" onClick={() => setShowPerformancePreview(false)}>
              <X size={16} /> Close Preview
            </button>
            <button className="btn btn-primary" type="button" onClick={printLockedPerformance}>
              <Printer size={16} /> Print
            </button>
          </div>
        )}
        {(lockedCollections?.collectors || collectionRows).map(collector => {
          const summary = getCollectorCollectionTotals(collector.rows)
          const edit = collectorEdits[collector.id] || {}
          const firstRow = collector.rows[0] || {}
          const newClients = collector.rows.reduce((sum, row) => sum + Number(row.newClients || 0), 0)
          const newPrincipal = collector.rows.reduce((sum, row) => sum + Number(row.newClientPrincipal || 0), 0)
          const returnClients = Number(edit.returnClients ?? 0)
          const reconClients = Number(edit.reconClients ?? collector.rows.reduce((sum, row) => sum + Number(row.reconClients || 0), 0))
          const activeTarget = 100
          const beginningActive = Number(firstRow.activeClients || 0) + Number(firstRow.overdueClients || 0)
          const endingBalance = Math.max(0, beginningActive - reconClients)
          const lacking = Math.max(0, activeTarget - endingBalance)
          const insight = getGeneratedCollectionInsight(edit.fullName || collector.name, collector.rows, summary)
          return (
            <Fragment key={`print-performance-${collector.id}`}>
            <div className="performance-print-page">
              <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                <img src={logo} alt="" style={{ width: 122, justifySelf: 'end' }} />
                <div style={{ fontSize: 12, lineHeight: 1.25 }}>
                  <div style={{ fontSize: 22, fontWeight: 800 }}>Melann Lending Investor Corporation</div>
                  <div>Lot 3 Blk 2, Brgy. San Isidro, Ormoc City</div>
                  <div>(053) 520-1138,0917-113-1000,0919-0085182</div>
                  <div>melann.lic2016@gmail.com</div>
                  <div>https://www.facebook.com/MelannInvestorCorp</div>
                </div>
              </div>
              <div style={{ textAlign: 'center', color: '#2563eb', fontWeight: 900, letterSpacing: 2, textDecoration: 'underline', margin: '6px 0 10px' }}>WEEKLY PERFORMANCE RATING</div>
              <div style={{ fontSize: 12, marginBottom: 8 }}>Rating Period: <span style={{ color: '#ef4444', textDecoration: 'underline' }}>{ratingPeriod(performanceWeekDates)}</span></div>

              <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', fontSize: 11.5, marginBottom: 10 }}>
                <colgroup><col style={{ width: '20%' }} /><col style={{ width: '30%' }} /><col style={{ width: '20%' }} /><col style={{ width: '30%' }} /></colgroup>
                <tbody>
                  <tr><td style={{ border: '1px solid #000', padding: 6 }}>Name of Collector</td><td style={{ border: '1px solid #000', padding: 6, fontWeight: 800 }}>{String(edit.fullName || collector.name).toUpperCase()}</td><td style={{ border: '1px solid #000', padding: 6 }}>Area of Assignment</td><td style={{ border: '1px solid #000', padding: 6, fontWeight: 800 }}>{String(edit.area || getCollectorArea(collector.name)).toUpperCase()}</td></tr>
                  <tr><td style={{ border: '1px solid #000', padding: 6 }}>Team Name</td><td style={{ border: '1px solid #000', padding: 6, fontWeight: 800 }}>{String(edit.teamName || collector.collectorCode || 'COLLECTION').toUpperCase()}</td><td style={{ border: '1px solid #000', padding: 6 }}>Name of Supervisor</td><td style={{ border: '1px solid #000', padding: 6, fontWeight: 800 }}>{edit.supervisor || 'Not encoded'}</td></tr>
                </tbody>
              </table>

              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10.5, marginBottom: 10, textAlign: 'center', tableLayout: 'fixed' }}>
                <colgroup>
                  {Array.from({ length: 5 }, (_, index) => <col key={`active-col-${index}`} style={{ width: '11.4%' }} />)}
                  {Array.from({ length: 3 }, (_, index) => <col key={`release-col-${index}`} style={{ width: '14.333%' }} />)}
                </colgroup>
                <tbody>
                  <tr><th colSpan={8} style={{ border: '1px solid #000', padding: 5, textDecoration: 'underline' }}>MARKETING PERFORMANCE</th></tr>
                  <tr>
                    <td colSpan={5} style={{ border: '1px solid #000', padding: 5 }}>Target of Active Clients (<span style={{ color: '#ef4444' }}>{activeTarget}</span>)</td>
                    <td colSpan={3} style={{ border: '1px solid #000', padding: 5 }}>Total Amount of Release (from New Clients)</td>
                  </tr>
                  <tr>
                    <td style={{ border: '1px solid #000', padding: 5 }}>Beginning<br />Active</td>
                    <td style={{ border: '1px solid #000', padding: 5 }}>New Client/<br />Return client</td>
                    <td style={{ border: '1px solid #000', padding: 5 }}>Relax/On<br />Hold/Recon</td>
                    <td style={{ border: '1px solid #000', padding: 5 }}>Ending<br />Balance</td>
                    <td style={{ border: '1px solid #000', padding: 5 }}>Lacking No of<br />Clients</td>
                    <td style={{ border: '1px solid #000', padding: 5 }}>Beg. Bal.</td>
                    <td style={{ border: '1px solid #000', padding: 5 }}>This Week</td>
                    <td style={{ border: '1px solid #000', padding: 5 }}>Ending Balance</td>
                  </tr>
                  <tr>
                    <td style={{ border: '1px solid #000', padding: 5, fontWeight: 800 }}>{countFmt(beginningActive)}</td>
                    <td style={{ border: '1px solid #000', padding: 5, fontWeight: 800 }}>{countFmt(newClients + returnClients)}</td>
                    <td style={{ border: '1px solid #000', padding: 5, fontWeight: 800 }}>{countFmt(reconClients)}</td>
                    <td style={{ border: '1px solid #000', padding: 5, fontWeight: 800 }}>{countFmt(endingBalance)}</td>
                    <td style={{ border: '1px solid #000', padding: 5, fontWeight: 800, color: '#ef4444' }}>{countFmt(lacking)}</td>
                    <td style={{ border: '1px solid #000', padding: 5 }}>{printAmount(summary.dailyTarget)}</td>
                    <td style={{ border: '1px solid #000', padding: 5 }}>{printAmount(newPrincipal)}</td>
                    <td style={{ border: '1px solid #000', padding: 5 }}>{printAmount(Math.max(0, summary.dailyTarget - newPrincipal))}</td>
                  </tr>
                </tbody>
              </table>

              <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', fontSize: 10.5, marginBottom: 0, textAlign: 'center' }}>
                <colgroup><col style={{ width: '16.5%' }} /><col style={{ width: '14%' }} /><col style={{ width: '13.5%' }} /><col style={{ width: '12.5%' }} /><col style={{ width: '20%' }} /><col style={{ width: '23.5%' }} /></colgroup>
                <thead>
                  <tr><th colSpan={6} style={{ border: '1px solid #000', padding: 5, textDecoration: 'underline' }}>COLLECTION PERFORMANCE</th></tr>
                  <tr><th rowSpan={2} style={{ border: '1px solid #000', padding: 5 }}>Rating Period</th><th colSpan={2} style={{ border: '1px solid #000', padding: 5 }}>Target</th><th rowSpan={2} style={{ border: '1px solid #000', padding: 5 }}>Actual</th><th rowSpan={2} style={{ border: '1px solid #000', padding: 5 }}>Percentage of<br />Accomplishment</th><th rowSpan={2} style={{ border: '1px solid #000', padding: 5 }}>Remark</th></tr>
                  <tr><th style={{ border: '1px solid #000', padding: 5 }}>Daily</th><th style={{ border: '1px solid #000', padding: 5 }}>Weekly</th></tr>
                </thead>
                <tbody>
                  {collector.rows.map(row => <tr key={`print-row-${collector.id}-${row.date}`}><td style={{ border: '1px solid #000', padding: 4 }}>{printDate(row.date)}</td><td style={{ border: '1px solid #000', padding: 4 }}>{printAmount(row.dailyTarget)}</td><td style={{ border: '1px solid #000', padding: 4 }}>{printAmount(row.weeklyTarget)}</td><td style={{ border: '1px solid #000', padding: 4 }}>{printAmount(row.actual)}</td><td style={{ border: '1px solid #000', padding: 4 }}>{row.rate.toFixed(2)}%</td><td style={{ border: '1px solid #000', padding: 4 }}>{row.remark}</td></tr>)}
                  <tr><td style={{ border: '1px solid #000', padding: 5, fontWeight: 800 }}>Total</td><td style={{ border: '1px solid #000', padding: 5, fontWeight: 800 }}>{printAmount(summary.dailyTarget)}</td><td style={{ border: '1px solid #000', padding: 5 }}></td><td style={{ border: '1px solid #000', padding: 5, fontWeight: 800 }}>{printAmount(summary.actual)}</td><td style={{ border: '1px solid #000', padding: 5, background: summary.rate >= 90 ? '#bbf7d0' : summary.rate >= 85 ? '#fde68a' : '#ef4444', color: summary.rate < 85 ? '#fff' : '#000', fontWeight: 800 }}>{summary.rate.toFixed(2)}%</td><td style={{ border: '1px solid #000', padding: 5, fontWeight: 800 }}>{summary.remark}</td></tr>
                </tbody>
              </table>

              
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, marginBottom: 0 }}>
                <tbody>
                  <tr>
                    <td style={{ border: '1px solid #000', padding: 0, verticalAlign: 'top', width: '63%' }}>
                      <table style={{ width: '100%', height: 220, borderCollapse: 'collapse', fontSize: 11, tableLayout: 'fixed' }}>
                        <tbody>
                          <tr><td colSpan={2} style={{ borderBottom: '1px solid #000', padding: 8, height: 82, verticalAlign: 'top' }}><b><u>Legend:</u></b><div style={{ display: 'grid', gridTemplateColumns: '100px 1fr', gap: 8, marginTop: 6 }}><div><div style={{ background: '#bbf7d0', border: '1px solid #000', textAlign: 'center', fontWeight: 800 }}>Passed</div><div style={{ background: '#fde68a', border: '1px solid #000', borderTop: 0, textAlign: 'center', fontWeight: 800 }}>Warning</div><div style={{ background: '#fecaca', border: '1px solid #000', borderTop: 0, textAlign: 'center', fontWeight: 800 }}>Needs Improvement</div></div><div style={{ lineHeight: 1.45 }}>90.00% and above<br />85% - 89.99%<br />84.99% and below</div></div></td></tr>
                          <tr><td style={{ borderRight: '1px solid #000', borderBottom: '1px solid #000', padding: 8, height: 70, verticalAlign: 'bottom', width: '50%' }}><i>Prepared by:</i><br /><br /><div style={{ textAlign: 'center' }}><b>MIA S. YBAÑEZ</b><br /><span style={{ borderTop: '1px solid #000', display: 'inline-block', width: '90%', paddingTop: 2 }}>IT/ Acctg. Clerk</span></div></td><td style={{ borderBottom: '1px solid #000', padding: 8, height: 70, verticalAlign: 'bottom', width: '50%' }}><i>Acknowledged by:</i><br /><br /><div style={{ textAlign: 'center' }}><b>{String(edit.fullName || collector.name).toUpperCase()}</b><br /><span style={{ borderTop: '1px solid #000', display: 'inline-block', width: '90%', paddingTop: 2 }}>CI/Collector</span></div></td></tr>
                          <tr><td style={{ borderRight: '1px solid #000', padding: 8, height: 70, verticalAlign: 'bottom' }}><i>Reviewed by:</i><br /><br /><div style={{ textAlign: 'center' }}><b>MARILYN O. RELOBA</b><br /><span style={{ borderTop: '1px solid #000', display: 'inline-block', width: '90%', paddingTop: 2 }}>Branch Manager</span></div></td><td style={{ padding: 8, height: 70, verticalAlign: 'bottom' }}><i>Approved by:</i><br /><br /><div style={{ textAlign: 'center' }}><b>VICTORIO L. RELOBA, JR.</b><br /><span style={{ borderTop: '1px solid #000', display: 'inline-block', width: '90%', paddingTop: 2 }}>Operations Manager</span></div></td></tr>
                        </tbody>
                      </table>
                    </td>
                    <td style={{ border: '1px solid #000', padding: 0, verticalAlign: 'top', width: '37%' }}>
                      <table style={{ width: '100%', height: 282, borderCollapse: 'collapse', fontSize: 11, tableLayout: 'fixed' }}>
                        <tbody>
                          <tr><td colSpan={2} style={{ borderBottom: '1px solid #000', padding: 6, textAlign: 'center', height: 24 }}><u>Coaching Details:</u></td></tr>
                          <tr><td style={{ borderRight: '1px dotted #000', borderBottom: '1px solid #000', padding: 6, width: '32%', height: 36, verticalAlign: 'middle' }}>Date</td><td style={{ borderBottom: '1px solid #000', padding: 6 }}></td></tr>
                          <tr><td style={{ borderRight: '1px dotted #000', borderBottom: '1px solid #000', padding: 6, height: 82, verticalAlign: 'middle' }}>Name and<br />Signature of<br />Coach</td><td style={{ borderBottom: '1px solid #000', padding: 6, textAlign: 'center', verticalAlign: 'bottom' }}><b>VICTORIO L. RELOBA, JR.</b><br /><span style={{ borderTop: '1px solid #000', display: 'inline-block', width: '88%', paddingTop: 2 }}>Position of Coach</span></td></tr>
                          <tr><td style={{ borderRight: '1px dotted #000', padding: 6, height: 80, verticalAlign: 'middle' }}>Collector</td><td style={{ padding: 6, textAlign: 'center', verticalAlign: 'bottom' }}><b>{String(edit.fullName || collector.name).toUpperCase()}</b><br /><span style={{ borderTop: '1px solid #000', display: 'inline-block', width: '88%', paddingTop: 2 }}>Name of Collector</span></td></tr>
                        </tbody>
                      </table>
                    </td>
                  </tr>
                </tbody>
              </table>
              <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', fontSize: 11, marginTop: -1 }}>
                <tbody>
                  <tr><td style={{ border: '1px solid #000', padding: '7px 9px 4px' }}><b><u>Recommendation:</u></b></td></tr>
                  <tr><td style={{ border: '1px solid #000', borderTop: 0, padding: '4px 9px 8px', minHeight: 34, verticalAlign: 'top' }}><i>{edit.recommendation || insight.recommendation}</i></td></tr>
                  <tr><td style={{ border: '1px solid #000', borderTop: 0, padding: '7px 9px 4px' }}><b><u>Comments/Suggestions:</u></b></td></tr>
                  <tr><td style={{ border: '1px solid #000', borderTop: 0, padding: '4px 9px 8px', minHeight: 42, verticalAlign: 'top' }}><i>{edit.comment || insight.comment}</i></td></tr>
                </tbody>
              </table>
            </div>
            </Fragment>
          )
        })}
      </div>

      <div id="printable-area" className="collector-print-layout">
        <div className="collector-print-panel print-target-only">
          <table className="collector-print-table">
            <thead>
              <tr><td className="collector-print-label">{displayWeekday(reportDate)}</td><td colSpan={6}></td></tr>
              <tr><td className="collector-print-label">TYPE:</td><td colSpan={6} className="collector-print-value">DAILY</td></tr>
              <tr><td className="collector-print-label">DATE:</td><td colSpan={6} className="collector-print-value">{displayDate(reportDate)}</td></tr>
              <tr>
                <th style={{ width: '33%' }}>Collector</th>
                <th>Active</th>
                <th>Recon</th>
                <th>Pastdue</th>
                <th>Total No.<br />of Clients</th>
                <th colSpan={2}>Target</th>
              </tr>
            </thead>
            <tbody>
              {collectors.map(collector => {
                const collectorActive = Number(collector.active_clients || 0) + Number(collector.overdue_clients || 0)
                const collectorTotal = collectorActive + Number(collector.recon_clients || 0) + Number(collector.pastdue_clients || 0)
                return (
                  <tr key={`print-left-${collector.id}`}>
                    <td className="collector-print-name">{String(collector.name || '').toUpperCase()}</td>
                    <td className="collector-print-num">{countFmt(collectorActive)}</td>
                    <td className="collector-print-num">{countFmt(collector.recon_clients)}</td>
                    <td className="collector-print-num">{countFmt(Number(collector.pastdue_clients || 0))}</td>
                    <td className="collector-print-num">{countFmt(collectorTotal)}</td>
                    <td colSpan={2} className="collector-print-money">{printAmount(collector.target)}</td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="collector-print-total">
                <td className="collector-print-money">TOTAL</td>
                <td className="collector-print-num">{countFmt(activeTotal)}</td>
                <td className="collector-print-num">{countFmt(totals.recon_clients)}</td>
                <td className="collector-print-num">{countFmt(pastdueTotal)}</td>
                <td className="collector-print-num">{countFmt(totalClients)}</td>
                <td colSpan={2} className="collector-print-money">{printAmount(totals.target)}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        <div className="collector-print-panel print-actual-only">
          <table className="collector-print-table">
            <thead>
              <tr><td className="collector-print-label">{displayWeekday(reportDate)}</td><td colSpan={3}></td></tr>
              <tr><td className="collector-print-label">TYPE:</td><td colSpan={3} className="collector-print-value">DAILY</td></tr>
              <tr><td className="collector-print-label">DATE:</td><td colSpan={3} className="collector-print-value">{displayDate(reportDate)}</td></tr>
              <tr>
                <th style={{ width: '44%' }}>Collector</th>
                <th>No of<br />Active Accts</th>
                <th>Target</th>
                <th>Actual</th>
              </tr>
            </thead>
            <tbody>
              {collectors.map(collector => (
                <tr key={`print-right-${collector.id}`}>
                  <td className="collector-print-name">{shortCollectorName(collector.name)}</td>
                  <td className="collector-print-num">{countFmt(Number(collector.active_clients || 0) + Number(collector.overdue_clients || 0))}</td>
                  <td className="collector-print-money">{printAmount(collector.target)}</td>
                  <td className="collector-print-money">{collector.actual_collection || collector.collected ? printAmount(collector.actual_collection ?? collector.collected) : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {errorMsg && <div className="empty-state"><p>{errorMsg}</p></div>}

      {!errorMsg && (
        <>
          <div className="card-v2" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr auto',
              gap: 20,
              alignItems: 'center',
              padding: '20px 24px',
              borderBottom: '1px solid var(--border)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{
                  width: 38,
                  height: 38,
                  borderRadius: 8,
                  background: '#eef2f7',
                  color: '#475569',
                  display: 'grid',
                  placeItems: 'center'
                }}>
                  <Users size={22} />
                </div>
                <div>
                  <div className="card-v2-title" style={{ marginBottom: 4 }}>Daily Target Breakout</div>
                  <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                    Target/counts match the Collection Sheet for {data?.target_date || filters.date_to}; actual excludes pastdue maturity on/before {pastdueCutoff || '-'}
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'end', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                <div className="form-group" style={{ minWidth: 150, marginBottom: 0 }}>
                  <label className="form-label">Collection Sheet Date</label>
                  <input className="form-control" type="date" value={filters.date_to} onChange={e => {
                    const nextDate = e.target.value
                    setNewCollectionDate(nextDate)
                    setLockedCollections(null)
                    setFilters(current => ({
                      ...current,
                      date_to: nextDate,
                      pastdue_cutoff: current.pastdue_cutoff || `${new Date(`${nextDate}T00:00:00`).getFullYear()}-05-15`
                    }))
                  }} />
                </div>
                <div className="form-group" style={{ minWidth: 150, marginBottom: 0 }}>
                  <label className="form-label">Pastdue Cutoff</label>
                  <input className="form-control" type="date" value={filters.pastdue_cutoff || ''} onChange={e => setFilters(current => ({ ...current, pastdue_cutoff: e.target.value }))} />
                </div>
                <button className="btn btn-primary" type="button" onClick={applyFilters} disabled={loading || collectionsLoading}>
                  {loading || collectionsLoading ? 'Loading...' : 'Apply'}
                </button>
                <button className="btn btn-secondary" type="button" onClick={() => {
                  document.body.classList.add('print-actual');
                  window.print();
                  document.body.classList.remove('print-actual');
                }} disabled={loading || !data}>
                  <Printer size={16} /> Print Actual Collection
                </button>
                <button className="btn btn-secondary" type="button" onClick={() => {
                  document.body.classList.add('print-target');
                  window.print();
                  document.body.classList.remove('print-target');
                }} disabled={loading || !data}>
                  <Printer size={16} /> Print Daily Target
                </button>
                <button className="btn btn-success" type="button" onClick={() => window.print()} disabled={loading || !data}>
                  <FileText size={16} /> Export PDF Manifest
                </button>
              </div>
            </div>

            <div style={{
              display: 'flex',
              gap: 8,
              padding: '14px 24px',
              borderBottom: '1px solid var(--border)',
              background: '#f8fafc'
            }}>
              <button
                className={`btn ${activeTab === 'targets' ? 'btn-primary' : 'btn-secondary'}`}
                type="button"
                onClick={() => setActiveTab('targets')}
              >
                Daily Target
              </button>
              <button
                className={`btn ${activeTab === 'collections' ? 'btn-primary' : 'btn-secondary'}`}
                type="button"
                onClick={() => setActiveTab('collections')}
              >
                <CalendarDays size={16} /> Collections
              </button>
              <button
                className={`btn ${activeTab === 'forty-five-days' ? 'btn-primary' : 'btn-secondary'}`}
                type="button"
                onClick={() => setActiveTab('forty-five-days')}
              >
                <TrendingUp size={16} /> 45 Days Performance
              </button>
            </div>

            {activeTab === 'targets' && (
              <div style={{ padding: 22, background: '#f8fbff' }}>
                <div style={{
                  border: '1px solid #dbe4f0',
                  borderRadius: 14,
                  background: '#fff',
                  boxShadow: '0 18px 40px rgba(15, 23, 42, 0.08)',
                  overflow: 'hidden'
                }}>
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr repeat(5, minmax(130px, 0.5fr))',
                    gap: 16,
                    alignItems: 'center',
                    padding: '22px 24px'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                      <div style={{ width: 54, height: 54, borderRadius: '50%', background: 'linear-gradient(135deg, #4f46e5, #6d5dfc)', color: '#fff', display: 'grid', placeItems: 'center', boxShadow: '0 10px 24px rgba(79,70,229,.28)' }}>
                        <CalendarDays size={26} />
                      </div>
                      <div>
                        <div style={{ fontSize: 22, fontWeight: 900, color: '#08184a', textTransform: 'uppercase' }}>Daily Target Overview</div>
                        <div style={{ marginTop: 5, color: '#475569', fontSize: 14, fontWeight: 700 }}>Summary of collector targets and status</div>
                      </div>
                    </div>
                    {[
                      ['Total Clients', countFmt(totalClients), '#1d4ed8'],
                      ['Active', countFmt(activeTotal), '#059669'],
                      ['Recon', countFmt(totals.recon_clients), '#1d4ed8'],
                      ['Past Due', countFmt(pastdueTotal), '#dc2626'],
                      ['Total Target', `PHP ${fmt(totals.target)}`, '#6d28d9']
                    ].map(([label, value, color]) => (
                      <div key={label} style={{ border: '1px solid #dbe4f0', borderRadius: 10, padding: '14px 16px', background: '#fff' }}>
                        <div style={{ color: '#64748b', fontSize: 11, fontWeight: 900, letterSpacing: .5, textTransform: 'uppercase' }}>{label}</div>
                        <div style={{ marginTop: 6, color, fontSize: 20, fontWeight: 900, whiteSpace: 'nowrap' }}>{value}</div>
                      </div>
                    ))}
                  </div>

                  <div style={{ overflowX: 'auto', padding: '0 18px 18px' }}>
                    <table className="data-table" style={{ margin: 0, border: '1px solid #dbe4f0', minWidth: 980, borderRadius: 8, overflow: 'hidden' }}>
                      <thead>
                        <tr style={{ background: 'linear-gradient(90deg, #4338ca, #3730a3)' }}>
                          <th style={{ color: '#fff' }}>Collector</th>
                          <th style={{ color: '#fff', textAlign: 'center' }}>Total No. of Clients</th>
                          <th style={{ color: '#fff', textAlign: 'center' }}>Active</th>
                          <th style={{ color: '#fff', textAlign: 'center' }}>Recon</th>
                          <th style={{ color: '#fff', textAlign: 'center' }}>Past Due</th>
                          <th style={{ color: '#fff', textAlign: 'right' }}>Target (PHP)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {loading ? (
                          <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 28 }}>Loading...</td></tr>
                        ) : collectors.length ? collectors.map(collector => {
                          const collectorActive = Number(collector.active_clients || 0) + Number(collector.overdue_clients || 0)
                          const collectorPastDue = Number(collector.pastdue_clients || 0)
                          const collectorTotal = collectorActive + Number(collector.recon_clients || 0) + collectorPastDue
                          const cardEdit = collectorEdits[collector.id] || {}
                          return (
                            <tr key={collector.id}>
                              <td style={{ fontWeight: 900, textTransform: 'uppercase', color: '#08184a' }}>
                                <span style={{ display: 'inline-grid', placeItems: 'center', width: 28, height: 28, borderRadius: '50%', background: '#6d28d9', color: '#fff', fontSize: 11, marginRight: 12 }}>{getCollectorInitials(cardEdit.fullName || collector.name)}</span>
                                {cardEdit.fullName || collector.name}
                              </td>
                              <td style={{ textAlign: 'center', fontWeight: 900 }}>{countFmt(collectorTotal)}</td>
                              <td style={{ textAlign: 'center', color: '#059669', fontWeight: 900 }}>{countFmt(collectorActive)}</td>
                              <td style={{ textAlign: 'center', color: '#1d4ed8', fontWeight: 900 }}>{countFmt(collector.recon_clients)}</td>
                              <td style={{ textAlign: 'center', color: '#dc2626', fontWeight: 900 }}>{countFmt(collectorPastDue)}</td>
                              <td style={{ textAlign: 'right', color: '#6d28d9', fontWeight: 900 }}>PHP {fmt(collector.target)}</td>
                            </tr>
                          )
                        }) : (
                          <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 28 }}>No active collectors found.</td></tr>
                        )}
                      </tbody>
                      {!loading && collectors.length > 0 && (
                        <tfoot>
                          <tr style={{ background: '#f0e7ff' }}>
                            <td style={{ fontWeight: 900, textTransform: 'uppercase', padding: '18px 24px', color: '#6d28d9' }}>Total</td>
                            <td style={{ textAlign: 'center', fontWeight: 900, color: '#1d4ed8' }}>{countFmt(totalClients)}</td>
                            <td style={{ textAlign: 'center', color: '#059669', fontWeight: 900 }}>{countFmt(activeTotal)}</td>
                            <td style={{ textAlign: 'center', color: '#1d4ed8', fontWeight: 900 }}>{countFmt(totals.recon_clients)}</td>
                            <td style={{ textAlign: 'center', color: '#dc2626', fontWeight: 900 }}>{countFmt(pastdueTotal)}</td>
                            <td style={{ textAlign: 'right', color: '#6d28d9', fontWeight: 900, fontSize: 18 }}>PHP {fmt(totals.target)}</td>
                          </tr>
                        </tfoot>
                      )}
                    </table>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'collections' && (
              <div>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                  padding: '22px 24px',
                  borderBottom: '1px solid var(--border)',
                  flexWrap: 'wrap'
                }}>
                  <div>
                    <div className="card-v2-title" style={{ marginBottom: 4, textTransform: 'uppercase' }}>Collection Performance</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 800, letterSpacing: 1.2, textTransform: 'uppercase' }}>Daily audit & metric tracking</div>
                  </div>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <button className="btn btn-secondary" type="button" onClick={loadCollections} disabled={collectionsLoading}>
                      <RefreshCw size={16} /> {collectionsLoading ? 'Syncing...' : 'Sync Dates'}
                    </button>
                    <button className="btn btn-secondary" type="button" onClick={lockWeekForPrinting} disabled={collectionsLoading || !collectionRows.length}>
                      Lock Week
                    </button>
                    <button className="btn btn-secondary" type="button" onClick={previewLockedPerformance} disabled={collectionsLoading || !collectionRows.length}>
                      Preview Performance
                    </button>
                    <button className="btn btn-primary" type="button" onClick={printLockedPerformance} disabled={collectionsLoading || !collectionRows.length}>
                      <Printer size={16} /> Print Performance
                    </button>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <input
                        className="form-control"
                        type="date"
                        aria-label="Date to add"
                        min={getOperationWeek(filters.date_to)[0]}
                        max={getOperationWeek(filters.date_to)[5]}
                        value={newCollectionDate}
                        onChange={e => setNewCollectionDate(e.target.value)}
                        style={{ width: 150 }}
                      />
                      <button className="btn btn-success" type="button" onClick={addCollectionDate} disabled={collectionsLoading || !newCollectionDate}>
                        <Plus size={16} /> Add Date
                      </button>
                    </div>
                  </div>
                </div>

                {selectedCollection && selectedSummary && selectedLatestRow ? (
                  <div style={{ padding: 24 }}>
                    <button className="btn btn-secondary" type="button" onClick={() => setSelectedCollectionId(null)} style={{ marginBottom: 18 }}>
                      <ArrowLeft size={16} /> Back to Collectors
                    </button>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 12, marginBottom: 18 }}>
                      <button className="btn btn-primary" type="button" onClick={saveCollectorEdits}>
                        Save
                      </button>
                    </div>
                    {saveError && <div className="empty-state" style={{ marginBottom: 18 }}><p>{saveError}</p></div>}

                    <div className="card-v2" style={{ marginBottom: 24 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
                        <User size={19} color="#2563eb" />
                        <div className="card-v2-title">Profile Information</div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 24, padding: 24, background: '#f8fafc', border: '1px solid var(--border)', borderRadius: 10, marginBottom: 28 }}>
                        <label style={{ width: 90, height: 90, borderRadius: '50%', background: 'linear-gradient(135deg, #e2e8f0, #fff)', display: 'grid', placeItems: 'center', boxShadow: '0 14px 28px rgba(15, 23, 42, 0.14)', fontSize: 24, fontWeight: 900, cursor: 'pointer', overflow: 'hidden' }}>
                          {selectedEdit.photo ? (
                            <img src={selectedEdit.photo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          ) : getCollectorInitials(selectedEdit.fullName || selectedCollection.name)}
                          <input type="file" accept="image/*" onChange={e => updateCollectorPhoto(selectedCollection.id, e.target.files?.[0])} style={{ display: 'none' }} />
                        </label>
                        <div>
                          <div style={{ fontSize: 16, fontWeight: 900, textTransform: 'uppercase' }}>Collector Identity</div>
                          <div style={{ marginTop: 8, color: '#94a3b8', fontSize: 11, fontWeight: 900, letterSpacing: 1.2, textTransform: 'uppercase' }}>Click photo to upload/edit collector image.</div>
                        </div>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 24 }}>
                        {[
                          ['fullName', 'Full Name', selectedCollection.name],
                          ['teamName', 'Team Name', selectedCollection.collectorCode || 'COLLECTION'],
                          ['area', 'Area of Assignment', getCollectorArea(selectedCollection.name)],
                          ['supervisor', 'Supervisor Name', 'Not encoded']
                        ].map(([field, label, value]) => (
                          <div key={label}>
                            <div style={{ color: '#94a3b8', fontSize: 10, fontWeight: 900, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 8 }}>{label}</div>
                            <input
                              className="form-control"
                              value={selectedEdit[field] ?? value}
                              onChange={e => updateCollectorEdit(selectedCollection.id, field, e.target.value)}
                              style={{ fontWeight: 900, color: '#17345b' }}
                            />
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="card-v2" style={{ marginBottom: 24 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
                        <TrendingUp size={20} color="#059669" />
                        <div className="card-v2-title">Marketing Performance</div>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 24, marginBottom: 28 }}>
                        <div style={{ border: '1px solid var(--border)', background: '#f8fafc', borderRadius: 10, padding: 24 }}>
                          <div style={{ color: '#94a3b8', fontSize: 11, fontWeight: 900, letterSpacing: 1.2, textTransform: 'uppercase' }}>Target of Active Clients</div>
                          <input className="form-control" value={selectedActiveTarget} readOnly style={{ marginTop: 14, fontWeight: 900 }} />
                        </div>
                        <div style={{ border: '1px solid var(--border)', background: '#f8fafc', borderRadius: 10, padding: 24 }}>
                          <div style={{ color: '#94a3b8', fontSize: 11, fontWeight: 900, letterSpacing: 1.2, textTransform: 'uppercase' }}>Daily Collection Target</div>
                          <div style={{ marginTop: 14, border: '1px solid var(--border)', background: '#fff', borderRadius: 8, padding: '14px 18px', fontWeight: 900 }}>{printAmount(selectedLatestRow.dailyTarget)}</div>
                        </div>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
                        <table className="data-table" style={{ margin: 0, border: '1px solid var(--border)' }}>
                          <thead>
                            <tr><th colSpan={6} style={{ textAlign: 'center' }}>Target of Active Clients ({countFmt(selectedActiveTarget)})</th></tr>
                            <tr>
                              <th>Beginning Active</th><th>New Client</th><th>Return Client</th><th>Relax / On Hold / Recon</th><th>Ending Balance</th><th>Lacking No of Clients</th>
                            </tr>
                          </thead>
                          <tbody>
                            <tr>
                              <td style={{ textAlign: 'center', fontWeight: 900 }}>{countFmt(selectedBeginningActive)}</td>
                              <td style={{ textAlign: 'center', color: '#2563eb', fontWeight: 900 }}>{countFmt(selectedNewClients)}</td>
                              <td style={{ textAlign: 'center', fontWeight: 900 }}>
                                <input
                                  className="form-control"
                                  type="number"
                                  min="0"
                                  value={selectedReturnClients}
                                  onChange={e => updateCollectorEdit(selectedCollection.id, 'returnClients', e.target.value)}
                                  style={{ maxWidth: 90, margin: '0 auto', textAlign: 'center', fontWeight: 900 }}
                                />
                              </td>
                              <td style={{ textAlign: 'center', fontWeight: 900 }}>
                                <input
                                  className="form-control"
                                  type="number"
                                  min="0"
                                  value={selectedReconClients}
                                  onChange={e => updateCollectorEdit(selectedCollection.id, 'reconClients', e.target.value)}
                                  style={{ maxWidth: 90, margin: '0 auto', textAlign: 'center', fontWeight: 900 }}
                                />
                              </td>
                              <td style={{ textAlign: 'center', color: '#059669', fontWeight: 900 }}>{countFmt(selectedEndingBalance)}</td>
                              <td style={{ textAlign: 'center', color: '#e11d48', fontWeight: 900 }}>{countFmt(Math.max(0, selectedActiveTarget - selectedEndingBalance))}</td>
                            </tr>
                          </tbody>
                        </table>
                        <table className="data-table" style={{ margin: 0, border: '1px solid var(--border)' }}>
                          <thead>
                            <tr><th colSpan={3} style={{ textAlign: 'center' }}>Total Amount of Release From New Clients</th></tr>
                            <tr><th>Beg. Bal.</th><th>This Week</th><th>Ending Balance</th></tr>
                          </thead>
                          <tbody>
                            <tr>
                              <td style={{ textAlign: 'center', fontWeight: 900 }}>PHP {fmt(selectedSummary.dailyTarget)}</td>
                              <td style={{ textAlign: 'center', color: '#2563eb', fontWeight: 900 }}>PHP {fmt(selectedNewClientPrincipal)}</td>
                              <td style={{ textAlign: 'center', color: '#2563eb', fontWeight: 900 }}>PHP {fmt(Math.max(0, selectedSummary.dailyTarget - selectedNewClientPrincipal))}</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </div>

                    <div className="card-v2" style={{ padding: 0, overflow: 'hidden', marginBottom: 24 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '24px 28px', borderBottom: '1px solid var(--border)' }}>
                        <div>
                          <div className="card-v2-title" style={{ textTransform: 'uppercase' }}>Collection Performance</div>
                          <div style={{ marginTop: 6, color: '#94a3b8', fontSize: 11, fontWeight: 900, letterSpacing: 1.2, textTransform: 'uppercase' }}>Daily audit & metric tracking</div>
                        </div>
                      </div>
                      <div style={{ overflowX: 'auto' }}>
                        <table className="data-table" style={{ margin: 0, border: 'none', minWidth: 980 }}>
                          <thead>
                            <tr><th rowSpan={2}>Rating Period</th><th colSpan={2} style={{ textAlign: 'center' }}>Target</th><th rowSpan={2} style={{ textAlign: 'right' }}>Actual</th><th rowSpan={2} style={{ textAlign: 'center' }}>Percentage of Accomplishment</th><th rowSpan={2} style={{ textAlign: 'center' }}>Remarks</th><th rowSpan={2} style={{ width: 64, textAlign: 'center' }}>Action</th></tr>
                            <tr><th style={{ textAlign: 'right' }}>Daily</th><th style={{ textAlign: 'right' }}>Weekly</th></tr>
                          </thead>
                          <tbody>
                            {selectedCollection.rows.map(row => {
                              const rowRemarkStyle = getRemarkStyle(row.remark)
                              return (
                                <tr key={`selected-${row.date}`}>
                                  <td><div style={{ fontWeight: 900, fontSize: 16 }}>{shortDisplayDate(row.date)}</div><div style={{ marginTop: 6, color: '#94a3b8', fontSize: 11, fontWeight: 900, letterSpacing: 1.3, textTransform: 'uppercase' }}>Operational Day</div></td>
                                  <td style={{ textAlign: 'right', fontWeight: 900 }}>PHP {fmt(row.dailyTarget)}</td>
                                  <td style={{ textAlign: 'right', color: '#334155', fontWeight: 900 }}>PHP {fmt(row.weeklyTarget)}</td>
                                  <td style={{ textAlign: 'right', color: row.actual > 0 ? '#0ea5e9' : '#64748b', fontWeight: 900 }}>PHP {fmt(row.actual)}</td>
                                  <td style={{ textAlign: 'center' }}><div style={{ color: row.rate >= 85 ? '#059669' : '#e11d48', fontWeight: 900, fontSize: 18 }}>{row.rate.toFixed(2)}%</div><div style={{ width: 84, height: 5, borderRadius: 999, background: '#e8edf4', margin: '8px auto 0', overflow: 'hidden' }}><div style={{ width: `${Math.min(row.rate, 100)}%`, height: '100%', background: row.rate >= 85 ? '#10b981' : '#e11d48' }} /></div></td>
                                  <td style={{ textAlign: 'center' }}><span style={{ display: 'inline-flex', justifyContent: 'center', minWidth: 118, padding: '9px 13px', border: `1px solid ${rowRemarkStyle.borderColor}`, borderRadius: 8, fontSize: 11, fontWeight: 900, letterSpacing: 1.1, textTransform: 'uppercase', ...rowRemarkStyle }}>{row.remark}</span></td>
                                  <td style={{ textAlign: 'center' }}>
                                    <button className="btn btn-secondary" type="button" title={`Delete ${displayDate(row.date)}`} aria-label={`Delete ${displayDate(row.date)}`} onClick={() => deleteCollectionDate(row.date)} style={{ padding: 8, color: '#dc2626' }}>
                                      <Trash2 size={16} />
                                    </button>
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                          <tfoot>
                            <tr style={{ background: '#0f172a', color: '#fff' }}>
                              <td style={{ padding: '20px 24px' }}><div style={{ color: '#93c5fd', fontSize: 11, fontWeight: 900, letterSpacing: 1.2, textTransform: 'uppercase' }}>Weekly Summary</div><div style={{ marginTop: 6, fontWeight: 900 }}>CONSOLIDATED</div></td>
                              <td style={{ textAlign: 'right', fontWeight: 900 }}>PHP {fmt(selectedSummary.dailyTarget)}</td>
                              <td style={{ textAlign: 'right', color: '#94a3b8', fontWeight: 900 }}>-</td>
                              <td style={{ textAlign: 'right', color: '#38bdf8', fontWeight: 900 }}>PHP {fmt(selectedSummary.actual)}</td>
                              <td style={{ textAlign: 'center', fontWeight: 900, fontSize: 18 }}>{selectedSummary.rate.toFixed(2)}%</td>
                              <td style={{ textAlign: 'center' }}><span style={{ display: 'inline-flex', justifyContent: 'center', minWidth: 118, padding: '9px 13px', borderRadius: 8, background: selectedSummary.remark === 'PASSED' ? '#10b981' : selectedSummary.remark === 'WARNING' ? '#f97316' : '#f43f5e', color: '#fff', fontSize: 11, fontWeight: 900, letterSpacing: 1.1, textTransform: 'uppercase' }}>{selectedSummary.remark}</span></td>
                              <td></td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    </div>

                    <div className="card-v2">
                      <div className="card-v2-title" style={{ marginBottom: 20 }}>AI Generated Comment and Recommendation</div>
                      <div style={{ display: 'grid', gap: 18 }}>
                        <div>
                          <div style={{ color: '#94a3b8', fontSize: 11, fontWeight: 900, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 8 }}>Supervisor Comments</div>
                          <textarea
                            className="form-control"
                            value={selectedEdit.comment ?? selectedInsight.comment}
                            onChange={e => updateCollectorEdit(selectedCollection.id, 'comment', e.target.value)}
                            style={{ minHeight: 92, fontWeight: 800, lineHeight: 1.6 }}
                          />
                        </div>
                        <div>
                          <div style={{ color: '#94a3b8', fontSize: 11, fontWeight: 900, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 8 }}>Strategic Recommendation</div>
                          <textarea
                            className="form-control"
                            value={selectedEdit.recommendation ?? selectedInsight.recommendation}
                            onChange={e => updateCollectorEdit(selectedCollection.id, 'recommendation', e.target.value)}
                            style={{ minHeight: 92, fontWeight: 800, lineHeight: 1.6 }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(330px, 1fr))', gap: 24, padding: 24 }}>
                  {collectionsLoading ? (
                    <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 28 }}>Loading collections...</div>
                  ) : collectionRows.length ? collectionRows.map(collector => {
                    const summary = getCollectorCollectionTotals(collector.rows)
                    const latestRow = collector.rows.find(row => row.date === filters.date_to) || collector.rows[collector.rows.length - 1] || {}
                    const weeklyTarget = Number(latestRow.weeklyTarget || summary.dailyTarget || 0)
                    const remarkStyle = getRemarkStyle(summary.remark)
                    const cardEdit = collectorEdits[collector.id] || {}

                    return (
                      <div
                        key={`collector-collection-${collector.id}`}
                        role="button"
                        tabIndex={0}
                        onClick={() => setSelectedCollectionId(collector.id)}
                        onKeyDown={e => {
                          if (e.key === 'Enter' || e.key === ' ') setSelectedCollectionId(collector.id)
                        }}
                        style={{
                        border: '1px solid var(--border)',
                        borderRadius: 14,
                        overflow: 'hidden',
                        background: '#fff',
                        boxShadow: '0 12px 26px rgba(15, 23, 42, 0.08)',
                        padding: 24,
                        cursor: 'pointer'
                      }}>
                        <div style={{
                          display: 'grid',
                          gridTemplateColumns: 'minmax(0, 1fr) auto',
                          alignItems: 'flex-start',
                          gap: 12
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0, overflow: 'hidden' }}>
                            <div style={{
                              width: 58,
                              height: 58,
                              borderRadius: '50%',
                              background: 'linear-gradient(135deg, #e2e8f0, #f8fafc)',
                              border: '4px solid #fff',
                              boxShadow: '0 8px 18px rgba(15, 23, 42, 0.14)',
                              color: '#0f172a',
                              display: 'grid',
                              placeItems: 'center',
                              fontSize: 15,
                              fontWeight: 900,
                              flex: '0 0 auto'
                            }}>
                              {cardEdit.photo ? (
                                <img src={cardEdit.photo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
                              ) : getCollectorInitials(cardEdit.fullName || collector.name)}
                            </div>
                            <div style={{ minWidth: 0, overflow: 'hidden' }}>
                              <div style={{ fontSize: 20, lineHeight: 1.15, fontWeight: 900, textTransform: 'uppercase', color: '#0f172a', overflowWrap: 'anywhere' }}>{cardEdit.fullName || collector.name}</div>
                              <div style={{ marginTop: 7, display: 'flex', alignItems: 'center', gap: 4, color: '#475569', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', overflowWrap: 'anywhere' }}>
                                <MapPin size={14} /> {cardEdit.area || getCollectorArea(collector.name)}
                              </div>
                            </div>
                          </div>
                          <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 124, minHeight: 46, padding: '8px 10px', border: `1px solid ${remarkStyle.borderColor}`, borderRadius: 6, fontSize: 11, lineHeight: 1.35, fontWeight: 900, letterSpacing: 1.1, textTransform: 'uppercase', textAlign: 'center', whiteSpace: 'normal', ...remarkStyle }}>
                            {summary.remark}
                          </span>
                        </div>

                        <div style={{ marginTop: 26 }}>
                          <label className="form-label">Date</label>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 68px', gap: 10 }}>
                            <input className="form-control" type="date" value={filters.date_to} readOnly />
                            <button className="btn btn-primary" type="button" onClick={e => { e.stopPropagation(); loadCollections() }} disabled={collectionsLoading}>Load</button>
                          </div>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 16, marginTop: 24 }}>
                          <div style={{ background: '#f1f5f9', borderRadius: 8, padding: '17px 18px' }}>
                            <div style={{ color: '#334155', fontSize: 11, fontWeight: 800 }}>Daily Target</div>
                            <div style={{ marginTop: 7, color: '#0f172a', fontSize: 20, fontWeight: 900 }}>PHP {fmt(Number(latestRow.dailyTarget || 0))}</div>
                          </div>
                          <div style={{ background: '#f1f5f9', borderRadius: 8, padding: '17px 18px' }}>
                            <div style={{ color: '#334155', fontSize: 11, fontWeight: 800 }}>Daily Actual</div>
                            <div style={{ marginTop: 7, color: '#e11d48', fontSize: 20, fontWeight: 900 }}>PHP {fmt(Number(latestRow.actual || 0))}</div>
                          </div>
                          <div style={{ background: '#f8fafc', border: '1px solid var(--border)', borderRadius: 8, padding: '17px 18px' }}>
                            <div style={{ color: '#64748b', fontSize: 11, fontWeight: 800 }}>Total Target</div>
                            <div style={{ marginTop: 7, color: '#17345b', fontSize: 20, fontWeight: 900 }}>PHP {fmt(weeklyTarget)}</div>
                          </div>
                          <div style={{ background: '#f8fafc', border: '1px solid var(--border)', borderRadius: 8, padding: '17px 18px' }}>
                            <div style={{ color: '#64748b', fontSize: 11, fontWeight: 800 }}>Total Actual</div>
                            <div style={{ marginTop: 7, color: '#e11d48', fontSize: 20, fontWeight: 900 }}>PHP {fmt(summary.actual)}</div>
                          </div>
                        </div>

                        <div style={{ marginTop: 28 }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 9 }}>
                            <div style={{ color: '#17345b', fontSize: 13, fontWeight: 900 }}>Collection Progress</div>
                            <div style={{ color: summary.rate >= 85 ? '#059669' : '#e11d48', fontSize: 20, fontWeight: 900 }}>{summary.rate.toFixed(0)}%</div>
                          </div>
                          <div style={{ height: 10, borderRadius: 999, background: '#e2e8f0', overflow: 'hidden' }}>
                            <div style={{ width: `${Math.min(summary.rate, 100)}%`, height: '100%', background: summary.rate >= 85 ? '#10b981' : '#e11d48' }} />
                          </div>
                        </div>

                        <button className="btn btn-primary" type="button" onClick={e => { e.stopPropagation(); setSelectedCollectionId(collector.id) }} disabled={collectionsLoading} style={{ width: '100%', marginTop: 24, justifyContent: 'center' }}>
                          <Edit3 size={16} /> Input Daily Data
                        </button>
                      </div>
                    )
                  }) : (
                    <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 28 }}>No collection dates loaded.</div>
                  )}
                </div>
                )}
              </div>
            )}

            {activeTab === 'forty-five-days' && (
              <div style={{ padding: 22, background: '#f8fbff' }}>
                <div style={{ border: '1px solid #dbe4f0', borderRadius: 14, background: '#fff', boxShadow: '0 18px 40px rgba(15, 23, 42, 0.08)', overflow: 'hidden' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 18, padding: '22px 24px', flexWrap: 'wrap', borderBottom: '1px solid #dbe4f0' }}>
                    <div>
                      <div style={{ fontSize: 22, fontWeight: 900, color: '#08184a', textTransform: 'uppercase' }}>45-Day Performance Rating</div>
                      <div style={{ marginTop: 5, color: '#475569', fontSize: 14, fontWeight: 700 }}>
                        Generate a company-selected rating period with automated collection, release, and DCR expense totals.
                      </div>
                    </div>
                  </div>

                  <div style={{ padding: 24, borderBottom: '1px solid #dbe4f0' }}>
                    <div style={{ fontSize: 16, fontWeight: 900, color: '#08184a', marginBottom: 16 }}>Generate 45-Day Rating</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 16, alignItems: 'end' }}>
                      <label><span className="form-label">Start date</span><input className="form-control" type="date" value={ratingDateRange.start_date} onChange={e => { setRatingDateRange(current => ({ ...current, start_date: e.target.value })); setErrorMsg('') }} /></label>
                      <label><span className="form-label">End date</span><input className="form-control" type="date" value={ratingDateRange.end_date} min={ratingDateRange.start_date || undefined} onChange={e => { setRatingDateRange(current => ({ ...current, end_date: e.target.value })); setErrorMsg('') }} disabled={!ratingDateRange.start_date} /></label>
                      <button className="btn btn-primary" type="button" onClick={generateFortyFiveDayRating} disabled={fortyFiveDayLoading || !isValidRatingRange} style={{ justifyContent: 'center' }}><CalendarDays size={16} /> Generate Rating</button>
                    </div>
                    <div style={{ color: '#64748b', fontSize: 12, fontWeight: 700, marginTop: 12 }}>The company may choose any rating period. The end date only needs to be on or after the start date.</div>
                  </div>

                  <div style={{ overflowX: 'auto', padding: '0 18px 18px' }}>
                    <div style={{ fontSize: 16, fontWeight: 900, color: '#08184a', margin: '22px 6px 14px' }}>Generated Periods</div>
                    <table className="data-table" style={{ margin: 0, border: '1px solid #dbe4f0', minWidth: 900 }}>
                      <thead><tr style={{ background: 'linear-gradient(90deg, #0f766e, #0f4c5c)' }}><th style={{ color: '#fff' }}>Date Range</th><th style={{ color: '#fff' }}>Status</th><th style={{ color: '#fff', textAlign: 'right' }}>Collections (PHP)</th><th style={{ color: '#fff', textAlign: 'right' }}>Releases (PHP)</th><th style={{ color: '#fff', textAlign: 'right' }}>DCR Expenses (PHP)</th><th style={{ color: '#fff' }}>Overall Rating</th><th style={{ color: '#fff' }}>Action</th></tr></thead>
                      <tbody>{fortyFiveDayLoading && !ratingPeriods.length ? <tr><td colSpan={7} style={{ textAlign: 'center', padding: 28 }}>Loading rating periods...</td></tr> : ratingPeriods.length ? ratingPeriods.map(period => (
                        <tr key={`rating-period-${period.id}`}><td>{displayDate(period.start_date)} to {displayDate(period.end_date)}</td><td><span className="status-badge">{period.status}</span></td><td style={{ textAlign: 'right' }}>PHP {fmt(period.total_collection)}</td><td style={{ textAlign: 'right' }}>PHP {fmt(period.total_release)}</td><td style={{ textAlign: 'right' }}>PHP {fmt(period.total_expense)}</td><td style={{ fontWeight: 800 }}>{period.overall_rating}</td><td><button className="btn btn-secondary" type="button" onClick={() => loadRatingPeriod(period.id)}>View Rating</button></td></tr>
                      )) : <tr><td colSpan={7} style={{ textAlign: 'center', padding: 28 }}>No 45-day ratings generated yet.</td></tr>}</tbody>
                    </table>
                  </div>

                  {selectedRatingPeriod && <div style={{ padding: 24, borderTop: '1px solid #dbe4f0', background: '#f8fbff' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 16 }}><div><div style={{ fontSize: 18, fontWeight: 900, color: '#08184a' }}>Daily Input / Collector Evaluation</div><div style={{ color: '#64748b', fontSize: 13, fontWeight: 700 }}>{displayDate(selectedRatingPeriod.period.start_date)} to {displayDate(selectedRatingPeriod.period.end_date)}</div></div><button className="btn btn-secondary" type="button" onClick={refreshRatingPeriod} disabled={fortyFiveDayLoading || selectedRatingPeriod.period.status === 'Finalized'}><RefreshCw size={16} /> Refresh automated totals</button></div>
                    <div style={{ color: '#475569', fontSize: 12, lineHeight: 1.5, marginBottom: 14 }}>Collection is summed per collector. Recon releases are excluded. The DCR expense total is divided equally among active collectors.</div>
                    <div style={{ overflowX: 'auto' }}><table className="data-table" style={{ margin: 0, minWidth: 950 }}><thead><tr><th>Collector</th><th style={{ textAlign: 'right' }}>Collection</th><th style={{ textAlign: 'right' }}>Release</th><th style={{ textAlign: 'right' }}>Expense Share</th><th style={{ textAlign: 'right' }}>Net Income</th><th style={{ textAlign: 'right' }}>Accomplishment</th><th>Rating</th></tr></thead><tbody>{selectedRatingPeriod.evaluations.map(evaluation => <tr key={evaluation.id}><td style={{ fontWeight: 800 }}>{evaluation.collector_name}</td><td style={{ textAlign: 'right' }}>PHP {fmt(evaluation.collection_total)}</td><td style={{ textAlign: 'right' }}>PHP {fmt(evaluation.release_total)}</td><td style={{ textAlign: 'right' }}>PHP {fmt(evaluation.expense_total)}</td><td style={{ textAlign: 'right' }}>PHP {fmt(evaluation.net_income)}</td><td style={{ textAlign: 'right' }}>{evaluation.accomplishment_percentage == null ? 'Not rated' : `${Number(evaluation.accomplishment_percentage).toFixed(2)}%`}</td><td style={{ fontWeight: 800 }}>{evaluation.rating}</td></tr>)}</tbody></table></div>
                  </div>}
                </div>
              </div>
            )}
          </div>

          {activeTab === 'targets' && <div style={{ padding: '0 22px 22px', background: '#f8fbff' }}>
            <div style={{ border: '1px solid #dbe4f0', borderRadius: 14, background: '#fff', boxShadow: '0 18px 40px rgba(15, 23, 42, 0.08)', overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '22px 24px' }}>
                <div style={{ width: 54, height: 54, borderRadius: '50%', background: 'linear-gradient(135deg, #4f46e5, #6d5dfc)', color: '#fff', display: 'grid', placeItems: 'center', boxShadow: '0 10px 24px rgba(79,70,229,.28)' }}>
                  <FileText size={26} />
                </div>
                <div>
                  <div style={{ fontSize: 22, fontWeight: 900, color: '#08184a', textTransform: 'uppercase' }}>Actual Collection</div>
                  <div style={{ marginTop: 5, color: '#475569', fontSize: 14, fontWeight: 700 }}>
                    Actual collection summary for {displayDate(reportDate)}
                  </div>
                </div>
              </div>

            <div style={{ overflowX: 'auto', padding: '0 18px 18px' }}>
              <table className="data-table" style={{ margin: 0, border: '1px solid #dbe4f0', minWidth: 900 }}>
                <thead>
                  <tr style={{ background: 'linear-gradient(90deg, #1d4ed8, #3730a3)' }}>
                    <th style={{ color: '#fff' }}>Collector</th>
                    <th style={{ color: '#fff', textAlign: 'center' }}>No of Active Accts</th>
                    <th style={{ color: '#fff', textAlign: 'right' }}>Target (PHP)</th>
                    <th style={{ color: '#fff', textAlign: 'right' }}>Actual (PHP)</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 28 }}>Loading...</td></tr>
                  ) : collectors.length ? collectors.map(collector => {
                    const collectorActive = Number(collector.active_clients || 0) + Number(collector.overdue_clients || 0)
                    return (
                      <tr key={`actual-${collector.id}`}>
                        <td style={{ fontWeight: 900, textTransform: 'uppercase', color: '#08184a' }}>{collector.name}</td>
                        <td style={{ textAlign: 'center', fontWeight: 900 }}>{countFmt(collectorActive)}</td>
                        <td style={{ textAlign: 'right', color: '#6d28d9', fontWeight: 900 }}>PHP {fmt(collector.target)}</td>
                        <td style={{ textAlign: 'right', color: '#2563eb', fontWeight: 900 }}>
                          {collector.actual_collection || collector.collected ? `PHP ${fmt(collector.actual_collection ?? collector.collected)}` : '-'}
                        </td>
                      </tr>
                    )
                  }) : (
                    <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 28 }}>No active collectors found.</td></tr>
                  )}
                </tbody>
                {!loading && collectors.length > 0 && (
                  <tfoot>
                    <tr style={{ background: '#eaf1ff' }}>
                      <td style={{ fontWeight: 900, textTransform: 'uppercase', padding: '18px 24px', color: '#1d4ed8' }}>Total</td>
                      <td style={{ textAlign: 'center', fontWeight: 900, color: '#059669' }}>{countFmt(activeTotal)}</td>
                      <td style={{ textAlign: 'right', color: '#6d28d9', fontWeight: 900, fontSize: 18 }}>PHP {fmt(totals.target)}</td>
                      <td style={{ textAlign: 'right', color: '#2563eb', fontWeight: 900, fontSize: 18 }}>PHP {fmt(totals.collected)}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
            </div>
          </div>}
        </>
      )}

      {showSavedModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          zIndex: 1000,
          display: 'grid',
          placeItems: 'center',
          padding: 20,
          background: 'rgba(15, 23, 42, 0.42)',
          backdropFilter: 'blur(4px)'
        }}>
          <div style={{
            width: 'min(430px, 100%)',
            background: '#fff',
            borderRadius: 14,
            border: '1px solid #dbeafe',
            boxShadow: '0 24px 70px rgba(15, 23, 42, 0.28)',
            overflow: 'hidden'
          }}>
            <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '14px 14px 0' }}>
              <button
                type="button"
                onClick={() => setShowSavedModal(false)}
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 8,
                  border: '1px solid #e2e8f0',
                  background: '#fff',
                  display: 'grid',
                  placeItems: 'center',
                  cursor: 'pointer'
                }}
                aria-label="Close saved confirmation"
              >
                <X size={18} />
              </button>
            </div>
            <div style={{ padding: '8px 34px 34px', textAlign: 'center' }}>
              <div style={{
                width: 72,
                height: 72,
                borderRadius: '50%',
                margin: '0 auto 18px',
                background: '#dcfce7',
                color: '#059669',
                display: 'grid',
                placeItems: 'center'
              }}>
                <CheckCircle2 size={42} />
              </div>
              <div style={{ color: '#0f172a', fontSize: 22, fontWeight: 900 }}>Information Saved</div>
              <div style={{ marginTop: 10, color: '#64748b', fontSize: 14, lineHeight: 1.5, fontWeight: 700 }}>
                The collector profile, photo, editable fields, comments, and recommendation were saved successfully.
              </div>
              <button
                className="btn btn-primary"
                type="button"
                onClick={() => setShowSavedModal(false)}
                style={{ marginTop: 24, minWidth: 140, justifyContent: 'center' }}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
