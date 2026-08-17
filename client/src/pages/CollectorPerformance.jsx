import { Fragment, useEffect, useMemo, useState } from 'react'
import { ArrowLeft, BarChart3, Building2, CalendarDays, CheckCircle2, ChevronRight, Download, Edit3, FileText, Grid2X2, Info, List, Lock, MapPin, Plus, Printer, RefreshCw, Search, Sparkles, Trash2, TrendingUp, Trophy, Unlock, User, Users, X } from 'lucide-react'
import API from '../services/api'
import { useAuth } from '../context/AuthContext'
import logo from '../assets/logo.png'
import printLetterhead from '../assets/new-letter-head-logo.jpg'
import '../dashboard.css'

const fmt = value => Number(value || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })
const isFinalRatingStatus = status => ['final', 'finalized'].includes(String(status || '').toLowerCase())
const getRatingPresentation = rating => {
  const value = String(rating || 'Not rated').toLowerCase()
  if (value.includes('outstanding') || value.includes('passing')) return { color: '#047857', background: '#e8f8f1', border: '#bcebd8' }
  if (value.includes('critical') || value.includes('poor')) return { color: '#dc2626', background: '#fff0f0', border: '#fecaca' }
  if (value.includes('unsatisfactory') || value.includes('below')) return { color: '#c56a00', background: '#fff7e6', border: '#fde3ad' }
  return { color: '#64748b', background: '#f1f5f9', border: '#dbe4f0' }
}
const countFmt = value => Number(value || 0).toLocaleString('en-PH')
const printAmount = value => Number(value || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const COLLECTOR_EDITS_STORAGE_KEY = 'collectorPerformanceEdits'
const MAX_PROFILE_PHOTO_DIMENSION = 320
const COMPANY_PERIOD_PRESETS = [
  { label: 'Jan 01 – Feb 15', start: '-01-01', end: '-02-15' },
  { label: 'Feb 16 – Mar 31', start: '-02-16', end: '-03-31' },
  { label: 'Apr 01 – May 15', start: '-04-01', end: '-05-15' },
  { label: 'May 16 – Jun 30', start: '-05-16', end: '-06-30' },
  { label: 'Jul 01 – Aug 15', start: '-07-01', end: '-08-15' },
  { label: 'Aug 16 – Sep 30', start: '-08-16', end: '-09-30' },
  { label: 'Oct 01 – Nov 15', start: '-10-01', end: '-11-15' },
  { label: 'Nov 16 – Dec 31', start: '-11-16', end: '-12-31' }
]

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

const shiftOperationWeek = (dateKey, weeks) => {
  const week = getOperationWeek(dateKey)
  const shifted = new Date(`${week[5]}T00:00:00`)
  shifted.setDate(shifted.getDate() + (weeks * 7))
  return toDateKey(shifted)
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

const coachingVariant = (seed, variants) => {
  const hash = Array.from(String(seed || '')).reduce((total, character) => total + character.charCodeAt(0), 0)
  return variants[hash % variants.length]
}

const getGeneratedCollectionInsight = (collectorName, rows) => {
  const collector = String(collectorName || 'This collector').toUpperCase()
  const today = toDateKey(new Date())
  const completedRows = rows.filter(row => String(row.date || '') < today)

  if (!completedRows.length) {
    return {
      comment: `${collector} wala pay completed operational day nga igo gamiton para sa patas nga performance assessment. Ang current ug future dates gi-classify isip pending, dili zero collection.`,
      recommendation: 'Hulata nga ma-complete ug ma-post ang adlaw sa Collections una mag-issue ug coaching assessment.'
    }
  }

  const coachingSummary = completedRows.reduce((totals, row) => {
    totals.target += Number(row.dailyTarget || 0)
    totals.actual += Number(row.actual || 0)
    totals.paymentCount += Number(row.paymentCount || 0)
    return totals
  }, { target: 0, actual: 0, paymentCount: 0 })
  coachingSummary.rate = coachingSummary.target > 0 ? (coachingSummary.actual / coachingSummary.target) * 100 : 0
  const paidRows = completedRows.filter(row => Number(row.actual || 0) > 0)
  const zeroRows = completedRows.filter(row => Number(row.actual || 0) === 0)
  const bestRow = [...completedRows].sort((a, b) => Number(b.actual || 0) - Number(a.actual || 0))[0]
  const lowestPaidRow = [...paidRows].sort((a, b) => Number(a.actual || 0) - Number(b.actual || 0))[0]
  const latestRow = completedRows[completedRows.length - 1]
  const targetGap = Math.max(0, coachingSummary.target - coachingSummary.actual)
  const zeroDates = zeroRows.map(row => shortDisplayDate(row.date)).join(', ')
  const bestDay = `${shortDisplayDate(bestRow?.date)} (PHP ${fmt(bestRow?.actual)})`
  const lowestPaidDay = lowestPaidRow ? `${shortDisplayDate(lowestPaidRow.date)} (PHP ${fmt(lowestPaidRow.actual)})` : 'walay posted collection'
  const variantSeed = `${collector}-${bestRow?.date}-${lowestPaidRow?.date}-${zeroRows.length}`

  if (paidRows.length === 0) {
    return {
      comment: `${collector}, zero collection sa tibuok period nagpasabot nga napakyas ang route execution ug follow-up. Dili mahimong walay resulta ang completed workdays; kinahanglan ma-account ang missed clients ug ang kulang nga collections. Wala pa’y ebidensya nga na-convert ang client commitments ngadto sa actual payment, busa kinahanglan ug immediate correction sa field execution.`,
      recommendation: `Sa sunod nga adlaw, sugdi sa missed clients: tawagi, i-confirm ang bayranan ug oras sa pagbayad, ug hatagi og committed amount ang matag account. I-prioritize ang clients nga adunay capacity mobayad ug i-escalate dayon ang walay clear commitment. I-submit ang recovery list before end of day.`
    }
  }

  if (coachingSummary.rate >= 100 && zeroRows.length === 0) {
    return {
      comment: `${collector}, strong ang execution kay na-hit ang target ug walay zero day. Ayaw lang kompyansa—ang challenge karon mao ang pagpadayon ani nga discipline bisan sa low-output routes. Ang maayong result kinahanglan magpabilin nga standard, dili mahimong isolated nga maayo nga semana.`,
      recommendation: `I-repeat ang follow-up style nga ni-work sa ${bestDay}, ug hatagi og minimum collection commitment ang routes nga pareho sa ${lowestPaidDay}. I-monitor ang daily output aron masayran dayon kung adunay route nga nagsugod ug kahinay.`
    }
  }

  if (zeroRows.length >= 2) {
    const recoveryFocus = coachingVariant(variantSeed, [
      `I-audit ang route ug client list sa ${zeroDates} aron mahibal-an kung unsang follow-up ang na-miss.`,
      `I-compare ang route execution sa zero days batok sa successful day nga ${bestDay}.`,
      `Unaha ang missed clients sa ${zeroDates}, dayon i-confirm ang commitment date ug amount sa matag account.`
    ])
    return {
      comment: `${collector}, adunay ${zeroRows.length} ka zero-collection days. Kana dili lang “low performance”; failure na sa follow-up conversion ug route control. Kinahanglan ma-explain ang missed clients ug ang walay na-collect nga adlaw. Kung walay documented reason ug recovery plan, pareho ra gihapon ang resulta sa sunod nga route cycle.`,
      recommendation: `${recoveryFocus} Mag-submit og missed-client list, reason sa non-payment, ug next collection commitment per client. I-review kini before field deployment aron dili na mausab ang zero-output day.`
    }
  }

  if (coachingSummary.rate < 85) {
    const improvementFocus = coachingVariant(variantSeed, [
      `Ang priority mao ang accounts nga makahatag og dako nga portion sa PHP ${fmt(targetGap)} nga gap.`,
      `I-review ang ${lowestPaidDay} kay mao kini ang pinakamahinay nga paid day ug pangitaa ang specific missed or partial accounts.`,
      `I-replicate ang follow-up pattern sa ${bestDay}, unya i-apply una sa active/overdue accounts nga adunay taas nga chance mobayad.`
    ])
    return {
      comment: `${collector}, adunay effort ug naay collection, pero ang output dili sapat para ma-hit ang target. Ang issue dili ang kadaghan sa adlaw nga naay collection—ang issue kay kulang ang amount ug walay kusog nga conversion sa priority accounts. Kinahanglan mas disciplined ang pagpili sa accounts ug mas klaro ang daily collection objective, dili lang basta adunay ma-collect.`,
      recommendation: `${improvementFocus} I-set ang daily catch-up amount, i-rank ang high-probability accounts, ug i-check before end of day kung na-hit ba ang client commitments. Ang partial payers kinahanglan adunay specific follow-up date, amount, ug owner.`
    }
  }

  return {
    comment: `${collector}, duol na sa target pero wala gihapon na-close ang commitment. Kung consistent ang follow-up, dapat nahabol ang final gap; kinahanglan mas higpit ang pag-convert sa partial ug missed payments. Ang close-to-target result dili pa successful kung ang kulang walay assigned recovery action.`,
    recommendation: Number(latestRow?.actual || 0) === 0
      ? `I-address una ang latest zero-collection day (${shortDisplayDate(latestRow.date)}), unya mag-assign og high-probability paying clients nga maka-cover sa PHP ${fmt(targetGap)} nga gap.`
      : `Maintain ang follow-up nga nakahatag sa ${bestDay}, unya kuhaa ang PHP ${fmt(targetGap)} nga remaining gap gikan sa ranked accounts nga partial o missed ang bayad, adunay specific commitment amount ug due date.`
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

const isRankingComplete = row => row?.accomplishment_percentage != null && Number.isFinite(Number(row.accomplishment_percentage))
const getRankingName = row => row?.collector_name || row?.name || 'Unknown'
const rankingMoney = value => Number(value || 0).toLocaleString('en-PH', { maximumFractionDigits: 0 })
const rankingGuides = [
  { range: '115% and above', label: 'Outstanding Performance', color: '#10b981' },
  { range: '110% - 114.99%', label: 'Passing/Very Satisfactory', color: '#3b82f6' },
  { range: '105% - 109.99%', label: 'Below Passing Standard', color: '#14b8a6' },
  { range: '95% - 104.99%', label: 'Unsatisfactory Performance', color: '#eab308' },
  { range: '90% - 94.99%', label: 'Poor Performance', color: '#f97316' },
  { range: '89.99% and below', label: 'Critical Performance Failure', color: '#ef4444' },
  { range: 'No data', label: 'Incomplete', color: '#cbd5e1' }
]

const getRankedRows = rows => [...rows].sort((a, b) => {
  const aComplete = isRankingComplete(a)
  const bComplete = isRankingComplete(b)
  if (aComplete !== bComplete) return aComplete ? -1 : 1
  if (aComplete) {
    const accomplishmentDifference = Number(b.accomplishment_percentage) - Number(a.accomplishment_percentage)
    if (accomplishmentDifference) return accomplishmentDifference
    const netIncomeDifference = Number(b.net_income || 0) - Number(a.net_income || 0)
    if (netIncomeDifference) return netIncomeDifference
    const collectionDifference = Number(b.collection_total || 0) - Number(a.collection_total || 0)
    if (collectionDifference) return collectionDifference
  }
  return getRankingName(a).localeCompare(getRankingName(b))
})

const escapeRankingCsv = value => `"${String(value ?? '').replaceAll('"', '""')}"`

function FortyFiveRanking({ period, collectors = [], supervisors = [] }) {
  const [rankingTab, setRankingTab] = useState('collector')
  const periodFinalized = isFinalRatingStatus(period.status)
  const sourceRows = rankingTab === 'collector'
    ? collectors
    : supervisors.filter(row => !String(row.name || '').toLowerCase().startsWith('unassigned'))
  const rankedRows = getRankedRows(sourceRows)
  const completeRows = rankedRows.filter(isRankingComplete)
  const incompleteRows = rankedRows.filter(row => !isRankingComplete(row))
  const entityLabel = rankingTab === 'collector' ? 'Collector' : 'Supervisor'
  const topPerformer = completeRows[0]
  const highestNetIncome = [...completeRows].sort((a, b) => Number(b.net_income || 0) - Number(a.net_income || 0))[0]
  const averageAccomplishment = completeRows.length
    ? completeRows.reduce((sum, row) => sum + Number(row.accomplishment_percentage || 0), 0) / completeRows.length
    : 0

  const exportRanking = () => {
    const headers = ['Rank', entityLabel, 'Total Collection', 'Total Release', 'Total Expense', 'Net Income', '% Accomplishment', 'Rating', 'Status']
    const csvRows = rankedRows.map((row, index) => {
      const complete = isRankingComplete(row)
      return [
        complete ? index + 1 : '',
        getRankingName(row),
        Number(row.collection_total || 0).toFixed(2),
        Number(row.release_total || 0).toFixed(2),
        Number(row.expense_total || 0).toFixed(2),
        Number(row.net_income || 0).toFixed(2),
        complete ? Number(row.accomplishment_percentage).toFixed(2) : '',
        row.rating || 'Not rated',
        !complete ? 'Incomplete' : periodFinalized ? 'Complete' : 'Pending Finalization'
      ].map(escapeRankingCsv).join(',')
    })
    const csv = [
      `${entityLabel.toUpperCase()} RANKING`,
      `Evaluation Period,${escapeRankingCsv(`${displayDate(period.start_date)} - ${displayDate(period.end_date)}`)}`,
      '',
      headers.map(escapeRankingCsv).join(','),
      ...csvRows
    ].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    const downloadUrl = URL.createObjectURL(blob)
    link.href = downloadUrl
    link.download = `${rankingTab}_ranking_${period.start_date}_${period.end_date}.csv`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(downloadUrl)
  }

  return <section className="ranking-dashboard">
    <header className="ranking-header">
      <div>
        <h3>{entityLabel} Ranking</h3>
        <p>Ranked based on % Accomplishment. Only {entityLabel.toLowerCase()}s with complete data are included in the official ranking.</p>
      </div>
      <div className="ranking-period"><span>Evaluation Period:</span><strong><CalendarDays size={17} /> {displayDate(period.start_date)} - {displayDate(period.end_date)}</strong></div>
    </header>

    <div className="ranking-entity-tabs" role="tablist" aria-label="Ranking type">
      <button type="button" className={rankingTab === 'collector' ? 'active' : ''} onClick={() => setRankingTab('collector')}>Collectors</button>
      <button type="button" className={rankingTab === 'supervisor' ? 'active' : ''} onClick={() => setRankingTab('supervisor')}>Supervisors</button>
    </div>

    <div className="ranking-kpis">
      <article className="ranking-kpi ranking-kpi-top"><span className="ranking-kpi-icon"><Trophy size={22} /></span><div><small>Top {entityLabel}</small><strong>{topPerformer ? getRankingName(topPerformer) : 'No complete data'}</strong><b>{topPerformer ? `${Number(topPerformer.accomplishment_percentage).toFixed(2)}%` : '—'}</b></div></article>
      <article className="ranking-kpi ranking-kpi-income"><span className="ranking-kpi-icon"><BarChart3 size={22} /></span><div><small>Highest Net Income</small><strong>{highestNetIncome ? rankingMoney(highestNetIncome.net_income) : '—'}</strong><b>{highestNetIncome ? getRankingName(highestNetIncome) : 'No complete data'}</b></div></article>
      <article className="ranking-kpi ranking-kpi-average"><span className="ranking-kpi-icon"><TrendingUp size={22} /></span><div><small>Average Accomplishment</small><strong>{completeRows.length ? `${averageAccomplishment.toFixed(2)}%` : '—'}</strong><b>(From {completeRows.length} complete evaluation{completeRows.length === 1 ? '' : 's'})</b></div></article>
      <article className="ranking-kpi ranking-kpi-incomplete"><span className="ranking-kpi-icon"><Users size={22} /></span><div><small>Incomplete Evaluations</small><strong>{incompleteRows.length}</strong><b>{entityLabel}{incompleteRows.length === 1 ? '' : 's'}</b></div></article>
    </div>

    <div className="ranking-table-wrap">
      <table className="ranking-table">
        <thead><tr><th>Rank</th><th>{entityLabel}</th><th>Total<br />Collection</th><th>Total<br />Release</th><th>Total<br />Expense</th><th>Net<br />Income</th><th>%<br />Accomp.</th><th>Rating</th><th>Status</th></tr></thead>
        <tbody>{rankedRows.length ? rankedRows.map((row, index) => {
          const complete = isRankingComplete(row)
          const name = getRankingName(row)
          const netIncome = Number(row.net_income || 0)
          const accomplishment = complete ? Number(row.accomplishment_percentage) : 0
          const ratingStyle = getRatingPresentation(row.rating)
          const statusClass = !complete ? 'incomplete' : periodFinalized ? 'complete' : 'pending'
          const statusLabel = !complete ? 'Incomplete' : periodFinalized ? 'Complete' : 'Pending Finalization'
          return <tr key={row.id || `${rankingTab}-${name}`}>
            <td><span className={`ranking-rank ${index === 0 && complete ? 'ranking-rank-first' : ''}`}>{complete ? index + 1 : '—'}{index === 0 && complete && <em>◆</em>}</span></td>
            <td><div className="ranking-person"><span>{getCollectorInitials(name)}</span><strong>{name}<small>{rankingTab === 'collector' ? (row.branch_name || 'Rated Collector') : `${row.collectors?.length || row.collector_results?.length || 0} Collector(s)`}</small></strong></div></td>
            <td className="ranking-number">{rankingMoney(row.collection_total)}</td>
            <td className="ranking-number">{rankingMoney(row.release_total)}</td>
            <td className="ranking-number">{rankingMoney(row.expense_total)}</td>
            <td className={`ranking-number ranking-net ${netIncome < 0 ? 'negative' : 'positive'}`}>{netIncome < 0 ? `(${rankingMoney(Math.abs(netIncome))})` : rankingMoney(netIncome)}</td>
            <td className="ranking-accomplishment">{complete ? <><strong>{accomplishment.toFixed(2)}%</strong><span><i style={{ width: `${Math.max(4, Math.min(accomplishment, 100))}%` }} /></span></> : <em>No data</em>}</td>
            <td><span className="ranking-rating" style={{ color: ratingStyle.color, background: ratingStyle.background }}>{row.rating || 'Incomplete'}</span></td>
            <td><span className={`ranking-status ${statusClass}`}>{periodFinalized && complete ? <CheckCircle2 size={14} /> : <Info size={14} />}{statusLabel}</span></td>
          </tr>
        }) : <tr><td colSpan={9} className="ranking-empty">No {entityLabel.toLowerCase()} ranking data available for this period.</td></tr>}</tbody>
      </table>
    </div>

    <div className="ranking-guide">
      <div className="ranking-basis"><Info size={20} /><div><strong>Ranking is based on:</strong><ol><li>Highest % Accomplishment</li><li>Highest Net Income</li><li>Highest Total Collection</li></ol></div></div>
      <div className="ranking-rating-guide"><strong>Rating Guide</strong><div>{rankingGuides.map(item => <span key={item.range}><i style={{ background: item.color }} /><b>{item.range}</b><small>{item.label}</small></span>)}</div></div>
    </div>
    <div className="ranking-export"><button className="btn btn-primary" type="button" onClick={exportRanking} disabled={!rankedRows.length}><Download size={16} /> Export Ranking</button></div>
  </section>
}

const getPrintFormStatusLabel = (periodFinalized, row) => isRankingComplete(row)
  ? (periodFinalized ? 'Completed' : 'Pending Finalization')
  : 'Incomplete'

const normalizePrintForms = (period, selectedRatingPeriod, collectorEdits = {}) => {
  const periodFinalized = isFinalRatingStatus(period.status)
  const collectors = (selectedRatingPeriod?.evaluations || []).map(row => ({
    ...row,
    printType: 'collector',
    personName: getRankingName(row),
    displayRole: 'Collector',
    position: 'CI/Collector',
    assignedArea: collectorEdits[row.collector_id]?.area || getCollectorArea(getRankingName(row)),
    teamBranch: 'Ormoc',
    supervisorName: row.supervisor || 'Not encoded',
    statusLabel: getPrintFormStatusLabel(periodFinalized, row)
  }))
  const supervisors = (selectedRatingPeriod?.supervisor_evaluations || [])
    .filter(row => !String(row.name || '').toLowerCase().startsWith('unassigned'))
    .map(row => ({
      ...row,
      printType: 'supervisor',
      personName: getRankingName(row),
      displayRole: 'Supervisor',
      position: 'Supervisor',
      assignedArea: row.branch_name || row.collector_results?.[0]?.branch_name || 'Main Branch',
      branch_name: row.branch_name || row.collector_results?.[0]?.branch_name || 'Main Branch',
      teamBranch: 'Ormoc',
      supervisorName: 'MARILYN O. RELOBA',
      statusLabel: getPrintFormStatusLabel(periodFinalized, row)
    }))
  const branchManagers = (selectedRatingPeriod?.branch_manager_evaluations || []).map(row => ({
    ...row,
    printType: 'branch-manager',
    personName: 'MARILYN O. RELOBA',
    displayRole: 'Manager',
    position: 'Branch Manager',
    assignedArea: row.branch_name || 'Main Branch',
    teamBranch: 'Ormoc',
    supervisorName: 'VICTORIO L. RELOBA JR.',
    statusLabel: getPrintFormStatusLabel(periodFinalized, row)
  }))
  const operationsManager = selectedRatingPeriod?.operations_manager_evaluation
  const managers = operationsManager ? [{
    ...operationsManager,
    printType: 'operations-manager',
    personName: 'VICTORIO L. RELOBA JR.',
    displayRole: 'Manager',
    position: 'Operations Manager',
    assignedArea: 'All Branches',
    teamBranch: 'Ormoc',
    supervisorName: 'Executive Office',
    statusLabel: getPrintFormStatusLabel(periodFinalized, operationsManager)
  }] : []
  return [...collectors, ...supervisors, ...branchManagers, ...managers]
}

const getPrintFormStatusCategory = form => {
  const status = String(form?.statusLabel || '').toLowerCase()
  if (status.includes('incomplete')) return 'incomplete'
  if (status.includes('pending')) return 'pending'
  return 'completed'
}

function FortyFivePrintForm({ period, form }) {
  if (!period || !form) return null
  const formFinalized = getPrintFormStatusCategory(form) === 'completed'
  const displayedRating = formFinalized ? (form.rating || 'Not rated') : form.statusLabel
  const ratingStyle = formFinalized
    ? getRatingPresentation(form.rating)
    : getRatingPresentation('Not rated')
  const accomplishment = isRankingComplete(form) ? Number(form.accomplishment_percentage || 0) : null
  const netIncome = Number(form.net_income || 0)
  const periodLabel = `${displayDate(period.start_date)} - ${displayDate(period.end_date)}`

  return <div className="forty-five-print-form-page">
    <header className="forty-five-form-company">
      <img src={printLetterhead} alt="Melann Lending Investor Corporation letterhead" />
    </header>
    <div className="forty-five-form-title"><span />Forty-five (45) Day Evaluation Form<span /></div>

    <table className="forty-five-form-meta">
      <tbody>
        <tr><th>Rating Period</th><td>{periodLabel}</td><th>Supervisor</th><td>{form.supervisorName}</td></tr>
        <tr><th>Name of Employee</th><td>{String(form.personName || '').toUpperCase()}</td><th>Assigned Area</th><td>{form.assignedArea}</td></tr>
        <tr><th>Position/Designation</th><td>{form.position}</td><th>Team/Branch</th><td>{form.teamBranch || 'Ormoc'}</td></tr>
      </tbody>
    </table>

    <table className="forty-five-form-kpi">
      <thead><tr><th>Key Performance Indicator</th><th>Collection</th><th>Release</th><th>Expense</th><th>Net Income</th><th>Past Due<br />Reported</th><th>% of<br />Accomplishment</th></tr></thead>
      <tbody>
        <tr>
          <td><strong>1. 45-Day Net Collection</strong><small>{displayDate(period.start_date)} - {displayDate(period.end_date)}</small></td>
          <td>{rankingMoney(form.collection_total)}</td>
          <td>{rankingMoney(form.release_total)}</td>
          <td>{rankingMoney(form.expense_total)}</td>
          <td className={netIncome < 0 ? 'negative' : ''}>{netIncome < 0 ? `(${rankingMoney(Math.abs(netIncome))})` : rankingMoney(netIncome)}</td>
          <td>{rankingMoney(form.reported_pastdue)}</td>
          <td>{accomplishment == null ? '-' : `${accomplishment.toFixed(2)}%`}</td>
        </tr>
        {[1, 2].map(index => <tr key={`empty-${index}`} className="forty-five-form-empty"><td>-</td><td>-</td><td>-</td><td>-</td><td>-</td><td>-</td><td>-</td></tr>)}
        <tr className="forty-five-form-total">
          <td>Total</td><td>{rankingMoney(form.collection_total)}</td><td>{rankingMoney(form.release_total)}</td><td>{rankingMoney(form.expense_total)}</td>
          <td className={netIncome < 0 ? 'negative' : ''}>{netIncome < 0 ? `(${rankingMoney(Math.abs(netIncome))})` : rankingMoney(netIncome)}</td><td>{rankingMoney(form.reported_pastdue)}</td><td>{accomplishment == null ? '-' : `${accomplishment.toFixed(2)}%`}</td>
        </tr>
      </tbody>
    </table>

    <div className="forty-five-form-lower">
      <table className="forty-five-form-guide">
        <tbody>
          <tr><th colSpan={2}>ACCOMPLISHMENT RATE GUIDE</th></tr>
          {rankingGuides.slice(0, 6).map(item => <tr key={item.range}><td>{item.range}</td><td>{item.label}</td></tr>)}
        </tbody>
      </table>
      <div className="forty-five-form-rating-box">
        <div className="forty-five-final-rating"><strong>FINAL RATING:</strong><span style={{ color: ratingStyle.color, background: ratingStyle.background }}>{displayedRating}</span></div>
        <p>Note: Reported Past Due excluded in the computation of accomplishment.</p>
        <table>
          <tbody>
            <tr><th>RECOMMENDATION:</th><td></td><th>Schedule of<br />Follow-up</th><td></td></tr>
            <tr><th>Assigned Coach</th><td></td><th></th><td></td></tr>
            <tr><th>Designation of<br />Coach</th><td></td><th>Designation of<br />Coach</th><td></td></tr>
          </tbody>
        </table>
      </div>
    </div>

    <div className="forty-five-form-signatures">
      {[
        [form.personName, "Ratee's Printed Name & Signature"],
        ['MARILYN O. RELOBA', "Rater's Printed Name & Signature / Branch Head"],
        [form.supervisorName, 'Printed Name and Signature of Supervisor'],
        ['', 'Printed Name and Signature of Coach']
      ].map(([name, label], index) => <div key={`sig-${index}`}><strong>{String(name || '').toUpperCase()}</strong><span>{label}</span><em>Date:</em></div>)}
    </div>
  </div>
}

function FortyFivePrintReport({ period, selectedRatingPeriod, collectorEdits }) {
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [viewMode, setViewMode] = useState('grid')
  const [selectedPrintForm, setSelectedPrintForm] = useState(null)
  const forms = normalizePrintForms(period, selectedRatingPeriod, collectorEdits)
  const collectors = forms.filter(form => form.printType === 'collector')
  const supervisors = forms.filter(form => form.printType === 'supervisor')
  const managers = forms.filter(form => form.printType === 'branch-manager' || form.printType === 'operations-manager')
  const ratedForms = forms.filter(form => getPrintFormStatusCategory(form) === 'completed')
  const filteredForms = forms.filter(form => {
    const text = `${form.personName} ${form.rating} ${form.displayRole}`.toLowerCase()
    return (!query.trim() || text.includes(query.trim().toLowerCase())) && (statusFilter === 'all' || getPrintFormStatusCategory(form) === statusFilter)
  })

  const printSelectedForm = () => {
    document.body.classList.add('print-forty-five-form')
    try {
      window.print()
    } finally {
      document.body.classList.remove('print-forty-five-form')
    }
  }

  return <section className="print-report-dashboard">
    <header className="print-report-header">
      <div className="print-report-title-icon"><Printer size={30} /></div>
      <div><h3>Print Report</h3><p>Generate and export printable evaluation forms and logs.</p></div>
    </header>
    <div className="print-report-kpis">
      {[
        ['Total Forms', forms.length, 'All evaluations', FileText, 'blue'],
        ['Collectors', collectors.length, 'For collector eval.', Users, 'green'],
        ['Supervisors', supervisors.length, 'For supervisor eval.', User, 'violet'],
        ['Managers', managers.length, 'For BM/OM eval.', Building2, 'indigo'],
        ['Rated', ratedForms.length, 'Finalized evaluations', CheckCircle2, 'mint'],
        ['Unrated', forms.length - ratedForms.length, 'Pending evaluations', CalendarDays, 'orange']
      ].map(([label, value, hint, Icon, tone]) => <article className={`print-report-kpi ${tone}`} key={label}><span><Icon size={21} /></span><div><small>{label}</small><strong>{value}</strong><em>{hint}</em></div></article>)}
    </div>

    <div className="print-report-list-panel">
      <div className="print-report-list-head">
        <div><h4>Printable Forms</h4><p>Select an evaluation to print.</p></div>
        <div className="print-report-controls">
          <label className="print-report-search"><Search size={17} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search by name..." /></label>
          <select value={statusFilter} onChange={event => setStatusFilter(event.target.value)}><option value="all">All Status</option><option value="pending">Pending</option><option value="completed">Completed</option><option value="incomplete">Incomplete</option></select>
          <button type="button" className={viewMode === 'grid' ? 'active' : ''} onClick={() => setViewMode('grid')} title="Grid view"><Grid2X2 size={18} /></button>
          <button type="button" className={viewMode === 'list' ? 'active' : ''} onClick={() => setViewMode('list')} title="List view"><List size={18} /></button>
        </div>
      </div>
      <div className={`print-report-forms ${viewMode}`}>
        {filteredForms.length ? filteredForms.map(form => {
          const ratingStyle = getRatingPresentation(form.rating)
          return <article className="print-report-form-card" key={`${form.printType}-${form.id || form.personName}`}>
            <span className="print-report-avatar"><User size={20} /></span>
            <div><strong>{String(form.personName || '').toUpperCase()}</strong><small style={{ color: ratingStyle.color, background: ratingStyle.background }}>{form.rating || 'Not rated'}</small></div>
            <button type="button" onClick={() => setSelectedPrintForm(form)} title={`Print ${form.personName}`}><Printer size={19} /></button>
          </article>
        }) : <div className="print-report-empty">No printable forms found.</div>}
      </div>
    </div>

    {selectedPrintForm && <div className="forty-five-print-preview-backdrop" onMouseDown={event => event.target === event.currentTarget && setSelectedPrintForm(null)}>
      <div className="forty-five-print-preview" role="dialog" aria-modal="true" aria-label={`Print preview for ${selectedPrintForm.personName}`}>
        <div className="forty-five-print-preview-controls">
          <button className="btn btn-secondary" type="button" onClick={() => setSelectedPrintForm(null)}><X size={16} /> Close Preview</button>
          <button className="btn btn-primary" type="button" onClick={printSelectedForm}><Printer size={16} /> Print</button>
        </div>
        <FortyFivePrintForm period={period} form={selectedPrintForm} />
      </div>
    </div>}

    <div className="forty-five-print-form-layout"><FortyFivePrintForm period={period} form={selectedPrintForm || forms[0]} /></div>
  </section>
}

function FortyFiveEvaluationTable({ entityLabel, rows = [], childRows = () => [], childEntityLabel = 'Details', onOpenChildren, footerRow }) {
  const renderCells = row => {
    const ratingStyle = getRatingPresentation(row.rating)
    const accomplishment = Number(row.accomplishment_percentage || 0)
    return <>
      <td style={{ textAlign: 'right' }}>PHP {fmt(row.collection_total)}</td>
      <td style={{ textAlign: 'right' }}>PHP {fmt(row.release_total)}</td>
      <td style={{ textAlign: 'right' }}>PHP {fmt(row.expense_total)}</td>
      <td style={{ textAlign: 'right' }}>PHP {fmt(row.reported_pastdue)}</td>
      <td style={{ textAlign: 'right', color: Number(row.net_income) >= 0 ? '#059669' : '#ef4444', fontWeight: 900 }}>PHP {fmt(row.net_income)}</td>
      <td style={{ textAlign: 'right', fontWeight: 800 }}>{row.accomplishment_percentage == null ? 'Not rated' : <>{accomplishment.toFixed(2)}%<div className="forty-five-progress"><span style={{ width: `${Math.max(0, Math.min(accomplishment, 100))}%`, background: accomplishment >= 100 ? '#0aa77e' : accomplishment >= 90 ? '#f59e0b' : '#ef4444' }} /></div></>}</td>
      <td><span className="forty-five-rating-pill" style={{ color: ratingStyle.color, background: ratingStyle.background, borderColor: ratingStyle.border }}><span className="forty-five-rating-dot">☆</span>{row.rating}</span></td>
    </>
  }

  return <>
    <div style={{ overflowX: 'auto' }}>
      <table className="data-table forty-five-hierarchy-table" style={{ margin: 0, minWidth: 1100 }}>
        <thead><tr><th>{entityLabel}</th><th style={{ textAlign: 'right' }}>Collection (PHP)</th><th style={{ textAlign: 'right' }}>Non-Recon Release (PHP)</th><th style={{ textAlign: 'right' }}>Expense Share (PHP)</th><th style={{ textAlign: 'right' }}>Reported Pastdue (PHP)</th><th style={{ textAlign: 'right' }}>Net Income (PHP)</th><th style={{ textAlign: 'right' }}>Accomplishment</th><th>Rating</th></tr></thead>
        <tbody>{rows.map((row, index) => {
          const name = row.collector_name || row.name
          const children = childRows(row) || []
          const rowKey = row.id || row.branch_id || name || index
          return <tr key={rowKey}>
              <td style={{ fontWeight: 900 }}>
                {onOpenChildren ? <button className="forty-five-name-button" type="button" onClick={() => onOpenChildren({ title: name, childEntityLabel, rows: children })} aria-label={`View ${childEntityLabel.toLowerCase()} under ${name}`}>
                  <ChevronRight size={15} />
                  <span className="forty-five-person-avatar">{getCollectorInitials(name)}</span><span>{name}</span>
                </button> : <span className="forty-five-static-name"><span className="forty-five-person-avatar">{getCollectorInitials(name)}</span>{name}</span>}
              </td>
              {renderCells(row)}
            </tr>
        })}</tbody>
        {footerRow && <tfoot><tr className="forty-five-overall-row"><td><span className="forty-five-static-name"><span className="forty-five-person-avatar">OM</span>{footerRow.name || 'Operations Manager Overall'}</span></td>{renderCells(footerRow)}</tr></tfoot>}
      </table>
    </div>
    <div className="forty-five-formula">💡 Net Income = Collections − Non-Recon Releases − Expense Share. Reported Pastdue is shown separately and is not included in the formula.</div>
  </>
}

function FortyFiveHierarchyModal({ details, onClose }) {
  useEffect(() => {
    const closeOnEscape = event => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [onClose])

  const totals = details.rows.reduce((sum, row) => ({
    collection_total: sum.collection_total + Number(row.collection_total || 0),
    release_total: sum.release_total + Number(row.release_total || 0),
    expense_total: sum.expense_total + Number(row.expense_total || 0),
    reported_pastdue: sum.reported_pastdue + Number(row.reported_pastdue || 0),
    net_income: sum.net_income + Number(row.net_income || 0)
  }), { collection_total: 0, release_total: 0, expense_total: 0, reported_pastdue: 0, net_income: 0 })

  return <div className="forty-five-modal-backdrop" onMouseDown={event => event.target === event.currentTarget && onClose()}>
    <section className="forty-five-modal" role="dialog" aria-modal="true" aria-labelledby="forty-five-modal-title">
      <header className="forty-five-modal-header">
        <div>
          <span className="forty-five-modal-eyebrow">{details.childEntityLabel} Performance Breakdown</span>
          <h3 id="forty-five-modal-title">{details.childEntityLabel}s under {details.title}</h3>
          <p>{details.rows.length} {details.childEntityLabel.toLowerCase()}{details.rows.length === 1 ? '' : 's'} included in this rating period</p>
        </div>
        <button type="button" className="forty-five-modal-close" onClick={onClose} aria-label="Close performance breakdown"><X size={19} /></button>
      </header>
      <div className="forty-five-modal-table-wrap">
        <table className="data-table forty-five-modal-table">
          <thead><tr><th>{details.childEntityLabel}</th><th>Collection</th><th>Non-Recon Release</th><th>Expense Share</th><th>Reported Pastdue</th><th>Net Income</th></tr></thead>
          <tbody>{details.rows.map((row, index) => {
            const name = row.collector_name || row.name
            return <tr key={row.id || row.branch_id || name || index}>
              <td><span className="forty-five-static-name"><span className="forty-five-person-avatar">{getCollectorInitials(name)}</span>{name}</span></td>
              <td>PHP {fmt(row.collection_total)}</td><td>PHP {fmt(row.release_total)}</td><td>PHP {fmt(row.expense_total)}</td><td>PHP {fmt(row.reported_pastdue)}</td>
              <td className={Number(row.net_income) >= 0 ? 'forty-five-positive' : 'forty-five-negative'}>PHP {fmt(row.net_income)}</td>
            </tr>
          })}</tbody>
          <tfoot><tr><td>Total</td><td>PHP {fmt(totals.collection_total)}</td><td>PHP {fmt(totals.release_total)}</td><td>PHP {fmt(totals.expense_total)}</td><td>PHP {fmt(totals.reported_pastdue)}</td><td className={totals.net_income >= 0 ? 'forty-five-positive' : 'forty-five-negative'}>PHP {fmt(totals.net_income)}</td></tr></tfoot>
        </table>
      </div>
    </section>
  </div>
}

export default function CollectorPerformance() {
  const { hasRole } = useAuth()
  const defaultRange = useMemo(() => getDefaultRange(), [])
  const [filters, setFilters] = useState(defaultRange)
  const [data, setData] = useState(null)
  const [ratingDateRange, setRatingDateRange] = useState({ start_date: '', end_date: '' })
  const [selectedRatingPeriod, setSelectedRatingPeriod] = useState(null)
  const [ratingEvaluationTab, setRatingEvaluationTab] = useState('collector')
  const [ratingContentTab, setRatingContentTab] = useState('evaluation')
  const [ratingHierarchyModal, setRatingHierarchyModal] = useState(null)
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
        const dailyTarget = Number(collector.regular_target ?? collector.target ?? 0)
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
          // Keep historical weeks usable while an already-running API has not
          // yet been restarted to serve the new weekly snapshot field.
          beginningActive: collector.beginning_active_clients == null
            ? Number(collector.active_clients || 0) + Number(collector.overdue_clients || 0)
            : Number(collector.beginning_active_clients),
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

  const loadCollections = async (dateTo = filters.date_to) => {
    setCollectionsLoading(true)
    try {
      const weekDates = getOperationWeek(dateTo)
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

  const loadFortyFiveDayEvaluation = async (startDate, endDate) => {
    const from = startDate || ratingDateRange.start_date
    const to = endDate || ratingDateRange.end_date
    if (!from || !to || to < from) {
      setErrorMsg('Please select a valid start date and end date.')
      return
    }
    setFortyFiveDayLoading(true)
    try {
      const response = await API.get('/forty-five-day-rating/calculate', {
        params: { start_date: from, end_date: to }
      })
      setSelectedRatingPeriod(response.data)
      setRatingHierarchyModal(null)
      setErrorMsg('')
    } catch (err) {
      setErrorMsg(err.response?.data?.error || err.message || 'Could not calculate 45-day performance')
    } finally {
      setFortyFiveDayLoading(false)
    }
  }

  const handleSelectPresetPeriod = (startStr, endStr) => {
    const currentYear = new Date().getFullYear()
    const from = `${currentYear}${startStr}`
    const to = `${currentYear}${endStr}`
    setRatingDateRange({ start_date: from, end_date: to })
    loadFortyFiveDayEvaluation(from, to)
  }

  const refreshRatingPeriod = async () => {
    if (!selectedRatingPeriod?.period?.start_date || !selectedRatingPeriod?.period?.end_date) return
    await loadFortyFiveDayEvaluation(selectedRatingPeriod.period.start_date, selectedRatingPeriod.period.end_date)
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

  const changeCollectionWeek = async weeks => {
    const dateTo = shiftOperationWeek(filters.date_to, weeks)
    setSelectedCollectionId(null)
    setNewCollectionDate(dateTo)
    setLockedCollections(null)
    setFilters(current => ({ ...current, date_to: dateTo }))
    await loadCollections(dateTo)
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

  const generateAiCoaching = () => {
    const collector = collectionRows.find(row => row.id === selectedCollectionId)
    if (!collector) return
    const insight = getGeneratedCollectionInsight(collector.name, collector.rows)
    setCollectorEdits(current => ({
      ...current,
      [collector.id]: {
        ...(current[collector.id] || {}),
        comment: insight.comment,
        recommendation: insight.recommendation
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
    if (activeTab === 'forty-five-days' && ratingDateRange.start_date && ratingDateRange.end_date) {
      loadFortyFiveDayEvaluation(ratingDateRange.start_date, ratingDateRange.end_date)
    }
  }, [activeTab])

  const collectors = (data?.collectors || [])
    .filter(collector => !String(collector.name || '').toLowerCase().includes('melann office'))
    .sort((a, b) => getSortOrder(a.name) - getSortOrder(b.name) || String(a.name || '').localeCompare(String(b.name || '')))
  const totals = collectors.reduce((acc, collector) => {
    const isLaude = String(collector.name || '').toLowerCase().includes('laude')
    const collectorTotal = Number(collector.active_clients || 0) + Number(collector.recon_clients || 0) + Number(collector.overdue_clients || 0) + Number(collector.pastdue_clients || 0)
    acc.target += Number(collector.regular_target ?? collector.target ?? 0)
    if (isLaude) acc.recon_target += Number(collector.recon_target || 0)
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
    recon_target: 0,
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
  const actualTargetTotal = collectors.reduce((sum, collector) => sum + Number(collector.regular_target ?? collector.target ?? 0), 0)
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
  const selectedStartRow = selectedCollection?.rows[0]
  const selectedEdit = selectedCollection ? collectorEdits[selectedCollection.id] || {} : {}
  const selectedActiveTarget = 100
  const selectedNewClients = selectedCollection?.rows.reduce((sum, row) => sum + Number(row.newClients || 0), 0) || 0
  const selectedNewClientPrincipal = selectedCollection?.rows.reduce((sum, row) => sum + Number(row.newClientPrincipal || 0), 0) || 0
  const selectedReturnClients = Number(selectedEdit.returnClients ?? 0)
  const selectedReconClients = Number(selectedEdit.reconClients ?? selectedCollection?.rows.reduce((sum, row) => sum + Number(row.reconClients || 0), 0) ?? 0)
  const startBeginningActive = selectedStartRow
    ? Number(selectedStartRow.beginningActive || 0)
    : 0
  const selectedBeginningActive = selectedEdit.beginningActive !== undefined && selectedEdit.beginningActive !== ''
    ? Number(selectedEdit.beginningActive)
    : startBeginningActive
  const selectedEndingBalance = Math.max(0, selectedBeginningActive + selectedNewClients + selectedReturnClients - selectedReconClients)
  const performanceWeekDates = getOperationWeek(lockedCollections?.dateTo || filters.date_to)
  const currentWeekDates = getOperationWeek(filters.date_to)
  const isWeekLocked = Boolean(lockedCollections && lockedCollections.dateFrom === currentWeekDates[0] && lockedCollections.dateTo === currentWeekDates[5])
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
        .forty-five-page { padding: 12px; background: #f5f8fb; }
        .forty-five-shell {
          display: grid;
          grid-template-columns: minmax(0, 1fr);
          gap: 10px;
          padding: 10px;
          border: 1px solid #dce6eb;
          border-radius: 8px;
          background: #fbfdfd;
          box-shadow: 0 12px 34px rgba(15, 50, 65, .08);
        }
        .forty-five-hero {
          grid-column: 1 / -1;
          display: flex;
          align-items: center;
          justify-content: space-between;
          min-height: 72px;
          padding: 10px 12px;
          overflow: hidden;
        }
        .forty-five-hero-copy { display: flex; align-items: center; gap: 14px; }
        .forty-five-hero-icon {
          width: 48px; height: 48px; border-radius: 9px; display: grid; place-items: center;
          color: #fff; background: linear-gradient(145deg, #128778, #00675f);
          box-shadow: 0 8px 18px rgba(0, 119, 108, .2);
        }
        .forty-five-title { margin: 0; color: #0c2348; font-size: clamp(22px, 2.2vw, 34px); line-height: 1; font-weight: 950; text-transform: uppercase; letter-spacing: -.8px; }
        .forty-five-subtitle { margin-top: 8px; color: #506176; font-size: 12px; font-weight: 700; }
        .forty-five-graphic { position: relative; display: flex; align-items: end; gap: 5px; width: 145px; height: 62px; padding: 10px 22px 6px 20px; color: #087f75; opacity: .95; }
        .forty-five-graphic span { width: 16px; border-radius: 3px 3px 0 0; background: linear-gradient(#17b79e, #08736d); }
        .forty-five-graphic span:nth-child(1) { height: 19px; }
        .forty-five-graphic span:nth-child(2) { height: 31px; }
        .forty-five-graphic span:nth-child(3) { height: 47px; }
        .forty-five-graphic svg { position: absolute; right: 0; top: 0; }
        .forty-five-card { border: 1px solid #dce6eb; border-radius: 8px; background: #fff; box-shadow: 0 5px 14px rgba(15, 50, 65, .055); overflow: hidden; }
        .forty-five-generator { grid-column: 1 / -1; width: 100%; padding: 18px; }
        .forty-five-evaluation { grid-column: 1 / -1; padding: 16px; }
        .forty-five-section-title { display: flex; align-items: center; gap: 10px; margin-bottom: 18px; color: #075e59; font-size: 14px; font-weight: 950; text-transform: uppercase; }
        .forty-five-section-title svg { color: #07877d; }
        .forty-five-form-grid { display: grid; grid-template-columns: minmax(190px, 240px) minmax(190px, 240px) minmax(180px, 220px); gap: 12px; align-items: end; }
        .forty-five-generate-button { grid-column: auto; justify-content: center; background: #087d73 !important; border-color: #087d73 !important; }
        .forty-five-presets-label { margin-top: 14px; font-size: 11px; font-weight: 800; color: #51657a; text-transform: uppercase; letter-spacing: .4px; }
        .forty-five-presets { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px; }
        .forty-five-preset-chip { padding: 6px 11px; border: 1px solid #d2e4e0; border-radius: 6px; background: #f2f8f6; color: #086b62; font-size: 11px; font-weight: 800; cursor: pointer; transition: all .15s ease; }
        .forty-five-preset-chip:hover { background: #087d73; color: #fff; border-color: #087d73; }
        .forty-five-preset-chip.active { background: #087d73; color: #fff; border-color: #087d73; box-shadow: 0 2px 6px rgba(8, 125, 115, 0.25); }
        .forty-five-note { display: flex; gap: 9px; align-items: flex-start; margin-top: 14px; color: #51657a; font-size: 11px; font-weight: 700; line-height: 1.45; }
        .forty-five-note::before { content: 'ⓘ'; color: #2563eb; font-size: 14px; }
        .forty-five-page .data-table { border-collapse: separate; border-spacing: 0; border: 0 !important; }
        .forty-five-page .data-table thead th { padding: 12px 10px; border-color: #e1e8ee; color: #405269; font-size: 10px; font-weight: 950; text-transform: uppercase; letter-spacing: .25px; }
        .forty-five-page .data-table tbody td { padding: 12px 10px; border-color: #e7edf1; color: #223148; font-size: 12px; }
        .forty-five-eval-header { display: flex; justify-content: space-between; align-items: center; gap: 14px; flex-wrap: wrap; margin-bottom: 12px; }
        .forty-five-tabs { display: flex; gap: 5px; overflow-x: auto; padding: 0 !important; margin: 0 0 10px !important; border: 0 !important; border-radius: 0 !important; background: transparent !important; }
        .forty-five-tabs .btn { min-width: 205px; justify-content: center; border-radius: 6px 6px 0 0; color: #17345b; background: #fff; border-color: #d9e3eb; }
        .forty-five-tabs .btn.btn-primary { color: #fff; background: linear-gradient(90deg, #087d73, #006b65); border-color: #087d73; }
        .forty-five-info { padding: 11px 14px; border: 1px solid #dbeafe; border-radius: 6px; background: #f0f7ff; color: #465c74 !important; font-size: 11px !important; }
        .forty-five-rating-pill { display: inline-flex; align-items: center; gap: 7px; max-width: 170px; padding: 7px 10px; border: 1px solid; border-radius: 6px; font-size: 10px; font-weight: 900; line-height: 1.25; }
        .forty-five-rating-dot { width: 18px; height: 18px; flex: 0 0 18px; display: grid; place-items: center; border: 1px solid currentColor; border-radius: 50%; font-size: 10px; }
        .forty-five-progress { width: 82px; height: 5px; margin: 7px 0 0 auto; border-radius: 999px; overflow: hidden; background: #dfe7ed; }
        .forty-five-progress > span { display: block; height: 100%; border-radius: inherit; }
        .forty-five-name-button { display: inline-flex; align-items: center; gap: 7px; width: 100%; padding: 0; border: 0; color: #16283f; background: transparent; font: inherit; font-weight: 900; text-align: left; cursor: pointer; }
        .forty-five-name-button:hover { color: #087d73; }
        .forty-five-name-button:focus-visible { outline: 2px solid #32a89d; outline-offset: 4px; border-radius: 4px; }
        .forty-five-static-name, .forty-five-child-name { display: inline-flex; align-items: center; gap: 9px; font-weight: 900; }
        .forty-five-person-avatar { display: inline-grid; place-items: center; width: 26px; height: 26px; flex: 0 0 26px; border-radius: 50%; color: #fff; background: #148a7d; font-size: 10px; }
        .forty-five-child-row td { background: #f2faf8; border-color: #d9eee9 !important; }
        .forty-five-child-row td:first-child { padding-left: 43px !important; }
        .forty-five-child-avatar { color: #087d73; background: #d9f1ec; border: 1px solid #b8e1d8; }
        .forty-five-overall-row td { padding: 13px 10px; border-top: 2px solid #91cec5; color: #123a48; background: #eaf7f4; font-size: 12px; font-weight: 900; }
        .forty-five-formula { margin-top: 10px; padding: 9px 14px; border: 1px solid #d8efeb; border-radius: 6px; color: #3c5b68; background: linear-gradient(90deg, #eefaf7, #f8fbfc); font-size: 11px; }
        .forty-five-modal-backdrop { position: fixed; inset: 0; z-index: 1300; display: grid; place-items: center; padding: 24px; background: rgba(10, 30, 48, .58); backdrop-filter: blur(5px); }
        .forty-five-modal { width: min(1180px, 100%); max-height: min(82vh, 760px); overflow: hidden; border: 1px solid #bcded8; border-radius: 14px; background: #fff; box-shadow: 0 28px 80px rgba(7, 41, 55, .32); }
        .forty-five-modal-header { display: flex; justify-content: space-between; gap: 24px; padding: 22px 24px; color: #fff; background: linear-gradient(115deg, #087d73, #075e59); }
        .forty-five-modal-eyebrow { display: block; margin-bottom: 6px; color: #bff3e9; font-size: 10px; font-weight: 950; letter-spacing: .7px; text-transform: uppercase; }
        .forty-five-modal-header h3 { margin: 0; font-size: 21px; line-height: 1.2; }
        .forty-five-modal-header p { margin: 6px 0 0; color: #d9f7f1; font-size: 12px; font-weight: 700; }
        .forty-five-modal-close { display: grid; place-items: center; width: 38px; height: 38px; flex: 0 0 38px; border: 1px solid rgba(255,255,255,.42); border-radius: 9px; color: #fff; background: rgba(255,255,255,.12); cursor: pointer; }
        .forty-five-modal-close:hover { background: rgba(255,255,255,.22); }
        .forty-five-modal-table-wrap { max-height: calc(min(82vh, 760px) - 112px); overflow: auto; padding: 18px; }
        .forty-five-modal-table { width: 100%; min-width: 960px; margin: 0; border-collapse: separate; border-spacing: 0; border: 0 !important; }
        .forty-five-modal-table thead th { position: sticky; top: 0; z-index: 1; padding: 12px 10px; border-color: #e1e8ee; color: #fff; background: #0c6f68; font-size: 10px; font-weight: 950; letter-spacing: .25px; text-transform: uppercase; }
        .forty-five-modal-table tbody td { padding: 13px 10px; border-color: #e7edf1; color: #223148; font-size: 12px; }
        .forty-five-modal-table th:not(:first-child), .forty-five-modal-table td:not(:first-child) { text-align: right; white-space: nowrap; }
        .forty-five-modal-table tbody tr:hover td { background: #f1faf8; }
        .forty-five-modal-table tfoot td { padding: 13px 10px; border-top: 2px solid #8dcfc4; color: #123a48; background: #eaf7f4; font-size: 12px; font-weight: 950; }
        .forty-five-positive { color: #059669 !important; font-weight: 900; }
        .forty-five-negative { color: #ef4444 !important; font-weight: 900; }
        .forty-five-content-tabs { display: inline-flex; gap: 4px; margin-bottom: 16px; padding: 4px; border: 1px solid #dbe4f0; border-radius: 9px; background: #eef3f8; }
        .forty-five-content-tabs button { min-width: 128px; padding: 9px 16px; border: 0; border-radius: 6px; color: #51657a; background: transparent; font-size: 12px; font-weight: 900; cursor: pointer; }
        .forty-five-content-tabs button.active { color: #fff; background: #2355dc; box-shadow: 0 4px 12px rgba(35,85,220,.22); }
        .ranking-dashboard { color: #102448; }
        .ranking-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 24px; padding: 6px 0 14px; }
        .ranking-header h3 { margin: 0; color: #102448; font-size: 21px; font-weight: 950; }
        .ranking-header p { margin: 6px 0 0; color: #587095; font-size: 12px; }
        .ranking-period { display: flex; align-items: center; gap: 10px; color: #506487; font-size: 11px; font-weight: 800; white-space: nowrap; }
        .ranking-period strong { display: inline-flex; align-items: center; gap: 8px; padding: 10px 13px; border: 1px solid #b9d4ff; border-radius: 8px; color: #1754de; background: #f4f8ff; font-size: 12px; }
        .ranking-entity-tabs { display: inline-flex; margin-bottom: 22px; padding: 3px; border-radius: 8px; background: #eef2f7; }
        .ranking-entity-tabs button { min-width: 92px; padding: 8px 14px; border: 0; border-radius: 6px; color: #506487; background: transparent; font-size: 11px; font-weight: 900; cursor: pointer; }
        .ranking-entity-tabs button.active { color: #1754de; background: #fff; box-shadow: 0 1px 5px rgba(15,35,72,.16); }
        .ranking-kpis { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14px; margin-bottom: 24px; }
        .ranking-kpi { min-height: 92px; display: flex; align-items: center; gap: 14px; padding: 14px 16px; border: 1px solid; border-radius: 12px; }
        .ranking-kpi-icon { width: 46px; height: 46px; flex: 0 0 46px; display: grid; place-items: center; border-radius: 50%; }
        .ranking-kpi div { min-width: 0; }
        .ranking-kpi small, .ranking-kpi strong, .ranking-kpi b { display: block; }
        .ranking-kpi small { margin-bottom: 5px; color: #506487; font-size: 9px; font-weight: 950; letter-spacing: .55px; text-transform: uppercase; }
        .ranking-kpi strong { overflow: hidden; color: #102448; font-size: 15px; font-weight: 950; line-height: 1.2; text-overflow: ellipsis; white-space: nowrap; text-transform: uppercase; }
        .ranking-kpi b { margin-top: 3px; font-size: 11px; font-weight: 900; }
        .ranking-kpi-top { border-color: #f6d84e; background: #fffcef; }.ranking-kpi-top .ranking-kpi-icon { color: #f2ad00; background: #fff3b7; }.ranking-kpi-top b { color: #e79000; }
        .ranking-kpi-income { border-color: #a8edc4; background: #f0fdf5; }.ranking-kpi-income .ranking-kpi-icon { color: #00b961; background: #d8f9e6; }.ranking-kpi-income strong { color: #00a957; }.ranking-kpi-income b { color: #587095; font-size: 9px; text-transform: uppercase; }
        .ranking-kpi-average { border-color: #b9d4ff; background: #eff6ff; }.ranking-kpi-average .ranking-kpi-icon { color: #4187f5; background: #dbeafe; }.ranking-kpi-average strong { color: #2668e8; }.ranking-kpi-average b { color: #587095; font-size: 9px; }
        .ranking-kpi-incomplete { border-color: #e1c6ff; background: #faf5ff; }.ranking-kpi-incomplete .ranking-kpi-icon { color: #a747f5; background: #f0ddff; }.ranking-kpi-incomplete strong { color: #9333ea; }.ranking-kpi-incomplete b { color: #587095; font-size: 9px; }
        .ranking-table-wrap { overflow-x: auto; border: 1px solid #d8e2ef; border-radius: 12px; }
        .ranking-table { width: 100%; min-width: 1030px; border-collapse: separate; border-spacing: 0; table-layout: fixed; }
        .ranking-table th { height: 60px; padding: 10px 8px; border-right: 1px solid rgba(21,72,199,.4); color: #fff; background: #2455dc; font-size: 9px; font-weight: 950; line-height: 1.25; text-align: center; text-transform: uppercase; }
        .ranking-table th:first-child { width: 64px; border-radius: 11px 0 0 0; }.ranking-table th:nth-child(2) { width: 190px; text-align: left; }.ranking-table th:nth-child(3), .ranking-table th:nth-child(4) { width: 118px; }.ranking-table th:nth-child(5) { width: 104px; }.ranking-table th:nth-child(6) { width: 100px; }.ranking-table th:nth-child(7) { width: 90px; }.ranking-table th:nth-child(8) { width: 154px; }.ranking-table th:last-child { width: 118px; border-right: 0; border-radius: 0 11px 0 0; }
        .ranking-table td { height: 68px; padding: 10px 11px; border-right: 1px solid #d8e2ef; border-bottom: 1px solid #d8e2ef; color: #102448; background: #fff; font-size: 11px; vertical-align: middle; }
        .ranking-table tr:last-child td { border-bottom: 0; }.ranking-table td:last-child { border-right: 0; text-align: center; }
        .ranking-rank { position: relative; width: 29px; height: 29px; display: grid; place-items: center; margin: auto; border-radius: 50%; color: #547093; background: #f0f4f9; font-size: 12px; font-weight: 900; }
        .ranking-rank-first { border: 1px solid #ffc928; color: #9a6b00; background: #fff9d6; }.ranking-rank-first em { position: absolute; right: -4px; bottom: -3px; color: #0aae69; font-size: 10px; font-style: normal; }
        .ranking-person { display: flex; align-items: center; gap: 11px; min-width: 0; }
        .ranking-person > span { width: 36px; height: 36px; flex: 0 0 36px; display: grid; place-items: center; border: 1px solid #cfe1ff; border-radius: 50%; color: #1754de; background: #f0f6ff; font-size: 10px; font-weight: 900; }
        .ranking-person strong { min-width: 0; overflow: hidden; font-size: 10px; font-weight: 950; line-height: 1.25; text-overflow: ellipsis; text-transform: uppercase; }
        .ranking-person small { display: block; margin-top: 2px; overflow: hidden; color: #6a7e9c; font-size: 8px; font-weight: 700; text-overflow: ellipsis; white-space: nowrap; text-transform: uppercase; }
        .ranking-number { text-align: center; font-size: 12px !important; font-weight: 950; }.ranking-net.positive { color: #00a957; }.ranking-net.negative { color: #ef2626; }
        .ranking-accomplishment { text-align: center; }.ranking-accomplishment strong { display: block; color: #1460f5; font-size: 10px; }.ranking-accomplishment > span { width: 45px; height: 4px; display: block; margin: 6px auto 0; overflow: hidden; border-radius: 99px; background: #e2e8f0; }.ranking-accomplishment i { display: block; height: 100%; border-radius: inherit; background: #2364f5; }.ranking-accomplishment em { color: #94a3b8; font-size: 10px; }
        .ranking-rating { display: block; max-width: 142px; margin: auto; padding: 7px 8px; border-radius: 4px; font-size: 8px; font-weight: 950; line-height: 1.2; text-align: center; text-transform: uppercase; }
        .ranking-status { display: inline-flex; align-items: center; justify-content: center; gap: 5px; min-width: 88px; padding: 6px 9px; border: 1px solid; border-radius: 99px; font-size: 9px; font-weight: 900; }.ranking-status.complete { border-color: #a8edc4; color: #00a957; background: #effdf5; }.ranking-status.pending { min-width: 112px; border-color: #f5d58a; color: #a16207; background: #fffbeb; }.ranking-status.incomplete { border-color: #d8e2ef; color: #70839e; background: #f5f7fa; }
        .ranking-empty { padding: 36px !important; color: #70839e !important; text-align: center; }
        .ranking-guide { display: grid; grid-template-columns: 190px 1fr; gap: 22px; margin-top: 24px; padding: 17px 18px; border: 1px solid #d8e2ef; border-radius: 11px; background: #f8fafc; }
        .ranking-basis { display: flex; gap: 11px; color: #1c61ed; }.ranking-basis > svg { flex: 0 0 auto; margin-top: 1px; }.ranking-basis strong { color: #102448; font-size: 10px; }.ranking-basis ol { margin: 5px 0 0; padding-left: 18px; color: #506487; font-size: 9px; line-height: 1.55; }
        .ranking-rating-guide > strong { display: block; margin-bottom: 8px; color: #506487; font-size: 9px; letter-spacing: .5px; text-transform: uppercase; }.ranking-rating-guide > div { display: grid; grid-template-columns: repeat(7, minmax(75px, 1fr)); gap: 8px; }.ranking-rating-guide span { position: relative; display: grid; grid-template-columns: 8px 1fr; column-gap: 5px; align-items: start; }.ranking-rating-guide span > i { width: 7px; height: 7px; margin-top: 2px; border-radius: 50%; }.ranking-rating-guide span > b { color: #102448; font-size: 8px; white-space: nowrap; }.ranking-rating-guide span > small { grid-column: 2; color: #506487; font-size: 7px; line-height: 1.2; }
        .ranking-export { display: flex; justify-content: flex-end; margin-top: 16px; }.ranking-export .btn { min-width: 176px; justify-content: center; padding: 11px 18px; background: #175bf1 !important; border-color: #175bf1 !important; box-shadow: 0 5px 12px rgba(23,91,241,.25); }
        .print-report-dashboard { color: #102448; }
        .print-report-header { display: flex; align-items: center; gap: 16px; margin-bottom: 30px; }
        .print-report-title-icon { width: 64px; height: 64px; display: grid; place-items: center; border: 1px solid #dce6f2; border-radius: 16px; color: #1f64ff; background: #fff; box-shadow: 0 4px 10px rgba(15, 23, 42, .08); }
        .print-report-header h3 { margin: 0; color: #102448; font-size: 24px; font-weight: 950; }
        .print-report-header p { margin: 7px 0 0; color: #587095; font-size: 13px; }
        .print-report-kpis { display: grid; grid-template-columns: repeat(6, minmax(130px, 1fr)); gap: 15px; margin-bottom: 23px; }
        .print-report-kpi { display: flex; align-items: center; gap: 15px; min-height: 84px; padding: 17px; border: 1px solid #dbe4f0; border-radius: 10px; background: #fff; box-shadow: 0 3px 9px rgba(15, 23, 42, .09); }
        .print-report-kpi > span { width: 48px; height: 48px; flex: 0 0 48px; display: grid; place-items: center; border-radius: 50%; }
        .print-report-kpi small { display: block; color: #506487; font-size: 10px; font-weight: 950; letter-spacing: .35px; text-transform: uppercase; }
        .print-report-kpi strong { display: block; margin-top: 2px; color: #102448; font-size: 22px; font-weight: 950; line-height: 1; }
        .print-report-kpi em { display: block; margin-top: 4px; color: #70839e; font-size: 10px; font-style: normal; font-weight: 700; }
        .print-report-kpi.blue > span { color: #2463ff; background: #edf5ff; }.print-report-kpi.green > span { color: #09b568; background: #ecfdf3; }.print-report-kpi.violet > span { color: #9333ea; background: #faf0ff; }.print-report-kpi.indigo > span { color: #4f6df5; background: #eef2ff; }.print-report-kpi.mint > span { color: #00ad73; background: #e9fbf3; }.print-report-kpi.orange > span { color: #f97316; background: #fff3e6; }
        .print-report-list-panel { padding: 25px; border: 1px solid #dbe4f0; border-radius: 12px; background: #fff; box-shadow: 0 3px 9px rgba(15, 23, 42, .09); }
        .print-report-list-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 20px; margin-bottom: 28px; }
        .print-report-list-head h4 { margin: 0; color: #102448; font-size: 21px; font-weight: 950; }
        .print-report-list-head p { margin: 5px 0 0; color: #587095; font-size: 12px; }
        .print-report-controls { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; justify-content: flex-end; }
        .print-report-search { min-width: 258px; height: 39px; display: flex; align-items: center; gap: 10px; padding: 0 13px; border: 1px solid #d6e2ef; border-radius: 8px; color: #7c8ca5; background: #fff; }
        .print-report-search input { width: 100%; border: 0; outline: 0; color: #102448; font: inherit; font-size: 12px; }
        .print-report-controls select { height: 39px; min-width: 110px; padding: 0 12px; border: 1px solid #d6e2ef; border-radius: 8px; color: #43546e; background: #fff; font-size: 12px; font-weight: 700; }
        .print-report-controls button { width: 39px; height: 39px; display: grid; place-items: center; border: 1px solid #d6e2ef; border-radius: 8px; color: #70839e; background: #f8fafc; cursor: pointer; }
        .print-report-controls button.active { color: #1f64ff; background: #eef5ff; }
        .print-report-forms { display: grid; grid-template-columns: repeat(3, minmax(240px, 1fr)); gap: 16px; }
        .print-report-forms.list { grid-template-columns: 1fr; }
        .print-report-form-card { display: grid; grid-template-columns: 38px minmax(0, 1fr) 39px; align-items: center; gap: 10px; min-height: 86px; padding: 18px 13px; border: 1px solid #e6edf5; border-radius: 12px; background: #fff; box-shadow: 0 2px 6px rgba(15, 23, 42, .04); }
        .print-report-avatar { width: 38px; height: 38px; display: grid; place-items: center; border-radius: 50%; color: #fff; background: #3d73f6; }
        .print-report-form-card strong { display: block; margin-bottom: 7px; color: #102448; font-size: 12px; font-weight: 950; line-height: 1.2; }
        .print-report-form-card small { display: inline-block; max-width: 210px; padding: 4px 7px; border-radius: 4px; font-size: 8px; font-weight: 950; line-height: 1.15; text-transform: uppercase; }
        .print-report-form-card button { width: 39px; height: 39px; display: grid; place-items: center; border: 0; border-radius: 8px; color: #fff; background: #245ff0; cursor: pointer; }
        .print-report-empty { grid-column: 1 / -1; padding: 32px; color: #70839e; text-align: center; }
        .forty-five-print-preview-backdrop { position: fixed; inset: 0; z-index: 1500; overflow: auto; padding: 22px; background: rgba(15, 23, 42, .72); backdrop-filter: blur(4px); }
        .forty-five-print-preview { width: fit-content; margin: 0 auto; }
        .forty-five-print-preview-controls { position: sticky; top: 0; z-index: 2; display: flex; justify-content: flex-end; gap: 10px; width: 7.7in; margin: 0 auto 10px; padding: 10px; border-radius: 10px; background: rgba(255,255,255,.96); box-shadow: 0 5px 18px rgba(15,23,42,.2); }
        .forty-five-print-preview-controls .btn { min-width: 120px; justify-content: center; }
        .forty-five-print-preview .forty-five-print-form-page { box-shadow: 0 16px 46px rgba(15,23,42,.28); }
        .forty-five-print-form-layout { display: none; }
        .forty-five-print-form-page { width: 7.7in; min-height: 11.2in; padding: .22in .26in; color: #000; background: #fff; font-family: Arial, Helvetica, sans-serif; }
        .forty-five-form-company { margin-bottom: .12in; text-align: center; }
        .forty-five-form-company img { display: block; width: 100%; height: auto; margin: 0 auto; }
        .forty-five-form-title { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: .06in; margin: .1in 0 .12in; color: #173c89; font-size: 11.5pt; font-weight: 600; text-align: center; }
        .forty-five-form-title span { border-top: 2px solid #173c89; }
        .forty-five-form-meta, .forty-five-form-kpi, .forty-five-form-guide, .forty-five-form-rating-box table { width: 100%; border-collapse: collapse; table-layout: fixed; }
        .forty-five-form-meta { margin-bottom: .14in; font-size: 7.3pt; }
        .forty-five-form-meta th, .forty-five-form-meta td { border: 1.4px solid #173c89; padding: .045in .055in; text-align: left; }
        .forty-five-form-meta th { width: 20%; background: #eef4fb; font-weight: 600; }
        .forty-five-form-meta td { width: 30%; font-weight: 500; }
        .forty-five-form-kpi { font-size: 7pt; text-align: center; }
        .forty-five-form-kpi th { padding: .055in .04in; border: 1.4px solid #173c89; color: #fff; background: #173c89; font-weight: 700; }
        .forty-five-form-kpi td { height: .25in; padding: .045in .04in; border: 1.2px solid #173c89; font-weight: 400; }
        .forty-five-form-kpi td strong { font-weight: 600; }
        .forty-five-form-kpi td:first-child { text-align: left; }
        .forty-five-form-kpi small { display: block; margin-top: .025in; font-size: 6pt; font-weight: 600; }
        .forty-five-form-kpi .negative { color: #d60000; }
        .forty-five-form-empty td { color: #64748b; font-weight: 400; }
        .forty-five-form-total td { background: #e7eef8; font-weight: 600; }
        .forty-five-form-lower { display: grid; grid-template-columns: 2.75in 1fr; gap: .14in; margin-top: .16in; align-items: start; }
        .forty-five-form-guide { font-size: 6.8pt; }
        .forty-five-form-guide th, .forty-five-form-guide td { border: 1.2px solid #173c89; padding: .035in .045in; }
        .forty-five-form-guide th { color: #fff; background: #173c89; font-weight: 700; text-align: center; }
        .forty-five-form-rating-box { font-size: 7pt; }
        .forty-five-final-rating { display: flex; align-items: center; gap: .1in; margin-bottom: .05in; padding: .06in .08in; border-radius: .2in; color: #fff; background: #d70000; }
        .forty-five-final-rating strong { font-size: 8.5pt; }
        .forty-five-final-rating span { margin-left: auto; min-width: 1.6in; padding: .045in .12in; border-radius: .16in; text-align: center; font-weight: 600; }
        .forty-five-form-rating-box p { margin: .035in 0 .055in; color: #173c89; font-size: 6pt; font-style: italic; font-weight: 800; text-align: center; }
        .forty-five-form-rating-box th, .forty-five-form-rating-box td { height: .29in; border: 1.2px solid #173c89; padding: .04in; text-align: left; font-size: 6.6pt; }
        .forty-five-form-rating-box th { width: 24%; background: #eef4fb; font-weight: 600; }
        .forty-five-form-signatures { display: grid; grid-template-columns: repeat(4, 1fr); gap: .2in; margin-top: .3in; padding-top: .34in; border-top: 1.4px solid #6685bd; text-align: center; }
        .forty-five-form-signatures strong { display: block; min-height: .18in; border-bottom: 1px solid #000; font-size: 6.8pt; font-weight: 500; }
        .forty-five-form-signatures span { display: block; min-height: .25in; margin-top: .025in; font-size: 5.6pt; font-weight: 400; line-height: 1.05; }
        .forty-five-form-signatures em { display: block; margin-top: .12in; border-bottom: 1px solid #000; font-size: 6pt; font-style: normal; text-align: left; }
        @media (max-width: 1100px) {
          .forty-five-shell { grid-template-columns: 1fr; }
          .forty-five-hero, .forty-five-evaluation { grid-column: 1; }
          .ranking-kpis { grid-template-columns: repeat(2, 1fr); }
          .print-report-kpis { grid-template-columns: repeat(3, 1fr); }
          .print-report-forms { grid-template-columns: repeat(2, minmax(230px, 1fr)); }
          .ranking-header { flex-direction: column; }
          .ranking-guide { grid-template-columns: 1fr; }
          .ranking-rating-guide > div { grid-template-columns: repeat(4, minmax(90px, 1fr)); }
        }
        @media (max-width: 680px) {
          .forty-five-page { padding: 6px; }
          .forty-five-shell { padding: 7px; }
          .forty-five-graphic { display: none; }
          .forty-five-form-grid { grid-template-columns: 1fr; }
          .forty-five-generate-button { grid-column: 1; }
          .forty-five-title { font-size: 21px; }
          .forty-five-modal-backdrop { padding: 10px; }
          .forty-five-modal-header { padding: 17px; }
          .forty-five-modal-header h3 { font-size: 17px; }
          .forty-five-modal-table-wrap { padding: 10px; }
          .ranking-kpis { grid-template-columns: 1fr; }
          .print-report-kpis, .print-report-forms { grid-template-columns: 1fr; }
          .print-report-list-head { flex-direction: column; }
          .print-report-controls { justify-content: stretch; width: 100%; }
          .print-report-search { min-width: 0; width: 100%; }
          .forty-five-print-preview-backdrop { padding: 10px; }
          .forty-five-print-preview { transform: scale(.75); transform-origin: top left; }
          .ranking-period { align-items: flex-start; flex-direction: column; }
          .ranking-rating-guide > div { grid-template-columns: repeat(2, minmax(100px, 1fr)); }
        }
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
          body.print-forty-five-form * { visibility: hidden !important; }
          body.print-forty-five-form .forty-five-print-form-layout,
          body.print-forty-five-form .forty-five-print-form-layout * { visibility: visible !important; }
          body.print-forty-five-form .collector-print-layout,
          body.print-forty-five-form .performance-print-layout { display: none !important; }
          body.print-forty-five-form .forty-five-print-form-layout {
            display: block !important;
            position: absolute !important;
            left: 0;
            top: 0;
            width: 100%;
            background: #fff;
          }
          .forty-five-print-preview-backdrop { display: none !important; }
          body.print-forty-five-form .forty-five-print-form-page {
            width: 7.7in;
            min-height: 11.2in;
            margin: 0 auto;
            page-break-after: always;
          }
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
          const mondayRow = collector.rows.find(row => row.date === performanceWeekDates[0]) || collector.rows[0] || {}
          const newClients = collector.rows.reduce((sum, row) => sum + Number(row.newClients || 0), 0)
          const newPrincipal = collector.rows.reduce((sum, row) => sum + Number(row.newClientPrincipal || 0), 0)
          const returnClients = Number(edit.returnClients ?? 0)
          const reconClients = Number(edit.reconClients ?? collector.rows.reduce((sum, row) => sum + Number(row.reconClients || 0), 0))
          const activeTarget = 100
          const beginningActive = Number(mondayRow.activeClients || 0) + Number(mondayRow.overdueClients || 0)
          const endingBalance = Math.max(0, beginningActive - reconClients)
          const lacking = Math.max(0, activeTarget - endingBalance)
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
                  <tr><td style={{ border: '1px solid #000', borderTop: 0, padding: '4px 9px 8px', minHeight: 34, verticalAlign: 'top' }}><i>{edit.recommendation || 'AI coaching has not been generated.'}</i></td></tr>
                  <tr><td style={{ border: '1px solid #000', borderTop: 0, padding: '7px 9px 4px' }}><b><u>Comments/Suggestions:</u></b></td></tr>
                  <tr><td style={{ border: '1px solid #000', borderTop: 0, padding: '4px 9px 8px', minHeight: 42, verticalAlign: 'top' }}><i>{edit.comment || 'AI coaching has not been generated.'}</i></td></tr>
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
                  <td className="collector-print-money">{printAmount(collector.regular_target ?? collector.target)}</td>
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
                  <input className="form-control" type="date" value={filters.date_to} disabled={activeTab === 'collections' && isWeekLocked} onChange={e => {
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
                <button className="btn btn-primary" type="button" onClick={applyFilters} disabled={loading || collectionsLoading || (activeTab === 'collections' && isWeekLocked)}>
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
                        {label === 'Total Target' && totals.recon_target > 0 && <div style={{ marginTop: 4, color: '#2563eb', fontSize: 10, fontWeight: 900 }}>Laude With Recon is display-only</div>}
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
                          const isLaude = String(collector.name || '').toLowerCase().includes('laude')
                          const reconTarget = isLaude ? Number(collector.recon_target || 0) : 0
                          const regularTarget = Number(collector.regular_target ?? collector.target ?? 0)
                          const withReconTarget = Number(collector.with_recon_target ?? (regularTarget + reconTarget))
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
                              <td style={{ textAlign: 'right', fontWeight: 900 }}>
                                {isLaude && reconTarget > 0 ? <>
                                  <div style={{ color: '#6d28d9' }}>Regular: PHP {fmt(regularTarget)}</div>
                                  <div style={{ color: '#2563eb', marginTop: 5, paddingTop: 5, borderTop: '1px solid #dbe4f0' }}>With Recon: PHP {fmt(withReconTarget)}</div>
                                </> : <span style={{ color: '#6d28d9' }}>PHP {fmt(regularTarget)}</span>}
                              </td>
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
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 800, letterSpacing: 1.2, textTransform: 'uppercase' }}>
                      Week: {shortDisplayDate(getOperationWeek(filters.date_to)[0])} – {shortDisplayDate(getOperationWeek(filters.date_to)[5])}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <button className="btn btn-secondary" type="button" onClick={() => changeCollectionWeek(-1)} disabled={collectionsLoading || isWeekLocked}>
                      Previous Week
                    </button>
                    <button className="btn btn-secondary" type="button" onClick={() => changeCollectionWeek(1)} disabled={collectionsLoading || isWeekLocked}>
                      Next Week
                    </button>
                    <button className="btn btn-secondary" type="button" onClick={loadCollections} disabled={collectionsLoading || isWeekLocked}>
                      <RefreshCw size={16} /> {collectionsLoading ? 'Syncing...' : 'Sync Dates'}
                    </button>
                    <button className={`btn ${isWeekLocked ? 'btn-success' : 'btn-secondary'}`} type="button" onClick={() => isWeekLocked ? setLockedCollections(null) : lockWeekForPrinting()} disabled={collectionsLoading || !collectionRows.length}>
                      {isWeekLocked ? <Unlock size={16} /> : <Lock size={16} />} {isWeekLocked ? 'Unlock Week' : 'Lock Week'}
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
                        disabled={isWeekLocked}
                        style={{ width: 150 }}
                      />
                      <button className="btn btn-success" type="button" onClick={addCollectionDate} disabled={collectionsLoading || isWeekLocked || !newCollectionDate}>
                        <Plus size={16} /> Add Date
                      </button>
                    </div>
                  </div>
                </div>

                {isWeekLocked && <div style={{ margin: '16px 24px 0', padding: '12px 16px', borderRadius: 8, background: '#ecfdf5', border: '1px solid #a7f3d0', color: '#047857', fontWeight: 800 }}>
                  <Lock size={16} style={{ verticalAlign: 'text-bottom', marginRight: 8 }} /> Week locked for preview and printing. Unlock it to change dates or collection entries.
                </div>}

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
                                  disabled={isWeekLocked}
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
                                  disabled={isWeekLocked}
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
                                    <button className="btn btn-secondary" type="button" title={`Delete ${displayDate(row.date)}`} aria-label={`Delete ${displayDate(row.date)}`} onClick={() => deleteCollectionDate(row.date)} disabled={isWeekLocked} style={{ padding: 8, color: '#dc2626' }}>
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
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
                        <div className="card-v2-title">AI Generated Comment and Recommendation</div>
                        <button className="btn btn-primary" type="button" onClick={generateAiCoaching}><Sparkles size={16} /> Generate AI Coaching</button>
                      </div>
                      <div style={{ display: 'grid', gap: 18 }}>
                        <div>
                          <div style={{ color: '#94a3b8', fontSize: 11, fontWeight: 900, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 8 }}>Supervisor Comments</div>
                          <textarea
                            className="form-control"
                            value={selectedEdit.comment ?? ''}
                            placeholder="Click Generate AI Coaching to create a performance critique."
                            onChange={e => updateCollectorEdit(selectedCollection.id, 'comment', e.target.value)}
                            style={{ minHeight: 92, fontWeight: 800, lineHeight: 1.6 }}
                          />
                        </div>
                        <div>
                          <div style={{ color: '#94a3b8', fontSize: 11, fontWeight: 900, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 8 }}>Strategic Recommendation</div>
                          <textarea
                            className="form-control"
                            value={selectedEdit.recommendation ?? ''}
                            placeholder="The strategic recommendation will appear after generation."
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
                            <input
                              className="form-control"
                              type="date"
                              aria-label="Collection performance date"
                              value={filters.date_to}
                              onChange={e => {
                                const dateTo = e.target.value
                                setNewCollectionDate(dateTo)
                                setLockedCollections(null)
                                setFilters(current => ({ ...current, date_to: dateTo }))
                              }}
                              disabled={isWeekLocked}
                            />
                            <button className="btn btn-primary" type="button" onClick={e => { e.stopPropagation(); loadCollections() }} disabled={collectionsLoading || isWeekLocked}>Load</button>
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
              <div className="forty-five-page">
                <div className="forty-five-shell">
                  <div className="forty-five-hero">
                    <div className="forty-five-hero-copy">
                      <div className="forty-five-hero-icon"><CalendarDays size={27} /></div>
                      <div>
                        <h2 className="forty-five-title">45-Day Performance Rating</h2>
                        <div className="forty-five-subtitle">
                          Select an evaluation date range to view automated collection, release, and expense ratings.
                        </div>
                      </div>
                    </div>
                    <div className="forty-five-graphic" aria-hidden="true"><span /><span /><span /><TrendingUp size={34} /></div>
                  </div>

                  <div className="forty-five-card forty-five-generator">
                    <div className="forty-five-section-title"><CalendarDays size={19} /> Select 45-Day Period</div>
                    <div className="forty-five-form-grid">
                      <label>
                        <span className="form-label">Start date</span>
                        <input
                          className="form-control"
                          type="date"
                          value={ratingDateRange.start_date}
                          onChange={e => {
                            setRatingDateRange(current => ({ ...current, start_date: e.target.value }))
                            setErrorMsg('')
                          }}
                        />
                      </label>
                      <label>
                        <span className="form-label">End date</span>
                        <input
                          className="form-control"
                          type="date"
                          value={ratingDateRange.end_date}
                          min={ratingDateRange.start_date || undefined}
                          onChange={e => {
                            setRatingDateRange(current => ({ ...current, end_date: e.target.value }))
                            setErrorMsg('')
                          }}
                          disabled={!ratingDateRange.start_date}
                        />
                      </label>
                      <button
                        className="btn btn-primary forty-five-generate-button"
                        type="button"
                        onClick={() => loadFortyFiveDayEvaluation(ratingDateRange.start_date, ratingDateRange.end_date)}
                        disabled={fortyFiveDayLoading || !isValidRatingRange}
                      >
                        <CalendarDays size={16} /> Calculate Performance
                      </button>
                    </div>

                    <div className="forty-five-presets-label">Official Company Periods (Quick Select):</div>
                    <div className="forty-five-presets">
                      {COMPANY_PERIOD_PRESETS.map(preset => {
                        const currentYear = new Date().getFullYear()
                        const pStart = `${currentYear}${preset.start}`
                        const pEnd = `${currentYear}${preset.end}`
                        const isSelected = ratingDateRange.start_date === pStart && ratingDateRange.end_date === pEnd
                        return (
                          <button
                            key={preset.label}
                            type="button"
                            className={`forty-five-preset-chip ${isSelected ? 'active' : ''}`}
                            onClick={() => handleSelectPresetPeriod(preset.start, preset.end)}
                          >
                            {preset.label}
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  {fortyFiveDayLoading && (
                    <div className="forty-five-card" style={{ padding: '36px 20px', textAlign: 'center', color: '#087d73', fontWeight: 800, fontSize: 14 }}>
                      <RefreshCw size={20} className="spin" style={{ display: 'inline-block', verticalAlign: 'middle', marginRight: 8 }} />
                      Calculating 45-day performance ratings...
                    </div>
                  )}

                  {!fortyFiveDayLoading && selectedRatingPeriod && (
                    <div className="forty-five-card forty-five-evaluation">
                      <div className="forty-five-content-tabs" role="tablist" aria-label="45-day performance view">
                        <button type="button" className={ratingContentTab === 'evaluation' ? 'active' : ''} onClick={() => setRatingContentTab('evaluation')}>Evaluation</button>
                        <button type="button" className={ratingContentTab === 'ranking' ? 'active' : ''} onClick={() => setRatingContentTab('ranking')}>Ranking</button>
                        <button type="button" className={ratingContentTab === 'print-report' ? 'active' : ''} onClick={() => setRatingContentTab('print-report')}>Print Report</button>
                      </div>
                      {ratingContentTab === 'evaluation' ? (
                        <>
                          <div className="forty-five-eval-header">
                            <div>
                              <div className="forty-five-section-title" style={{ marginBottom: 5 }}><Users size={19} /> 45-Day Role Evaluation</div>
                              <div style={{ color: '#64748b', fontSize: 12, fontWeight: 700 }}>
                                {displayDate(selectedRatingPeriod.period.start_date)} to {displayDate(selectedRatingPeriod.period.end_date)}
                              </div>
                            </div>
                            <button className="btn btn-secondary" type="button" onClick={refreshRatingPeriod} disabled={fortyFiveDayLoading}>
                              <RefreshCw size={16} /> Refresh automated totals
                            </button>
                          </div>
                          <div className="forty-five-tabs">
                            {[['collector', 'Collector Evaluation', <User size={16} />], ['supervisor', 'Supervisor Evaluation', <Users size={16} />], ['branch-manager', 'Branch Manager Evaluation', <Building2 size={16} />], ['operations-manager', 'Operations Manager Evaluation', <TrendingUp size={16} />]].map(([tab, label, icon]) => (
                              <button key={tab} className={`btn ${ratingEvaluationTab === tab ? 'btn-primary' : 'btn-secondary'}`} type="button" onClick={() => setRatingEvaluationTab(tab)} style={{ flexShrink: 0 }}>
                                {icon}{label}
                              </button>
                            ))}
                          </div>
                          <div className="forty-five-info" style={{ lineHeight: 1.5, marginBottom: 12 }}>
                            Collection is summed for Torreta, Domingono, Caballes, Jugar, Rosal, and Laude only. Recon releases are excluded. User-entered DCR expenses, excluding Short/Overages, are divided equally among these six collectors. Reported Pastdue is display-only and is not included in the formula.
                            {selectedRatingPeriod.period.reported_pastdue_period && <> Reported Pastdue period: {displayDate(selectedRatingPeriod.period.reported_pastdue_period.start_date)} to {displayDate(selectedRatingPeriod.period.reported_pastdue_period.end_date)}.</>}
                          </div>
                          {ratingEvaluationTab === 'collector' && <FortyFiveEvaluationTable entityLabel="Collector" rows={selectedRatingPeriod.evaluations} />}
                          {ratingEvaluationTab === 'supervisor' && <FortyFiveEvaluationTable entityLabel="Supervisor" rows={selectedRatingPeriod.supervisor_evaluations || []} childRows={row => row.collector_results?.length ? row.collector_results : selectedRatingPeriod.evaluations.filter(evaluation => (String(evaluation.supervisor || '').trim() || 'Unassigned Supervisor') === row.name)} childEntityLabel="Collector" onOpenChildren={setRatingHierarchyModal} />}
                          {ratingEvaluationTab === 'branch-manager' && <FortyFiveEvaluationTable entityLabel="Branch Manager" rows={selectedRatingPeriod.branch_manager_evaluations || []} childRows={row => row.supervisor_results?.length ? row.supervisor_results : (selectedRatingPeriod.supervisor_evaluations || []).filter(supervisor => (row.supervisors || []).includes(supervisor.name))} childEntityLabel="Supervisor" onOpenChildren={setRatingHierarchyModal} />}
                          {ratingEvaluationTab === 'operations-manager' && <FortyFiveEvaluationTable entityLabel="Branch Manager" rows={selectedRatingPeriod.operations_manager_evaluation?.branch_results || []} childRows={row => row.supervisor_results} childEntityLabel="Supervisor" onOpenChildren={setRatingHierarchyModal} footerRow={selectedRatingPeriod.operations_manager_evaluation} />}
                        </>
                      ) : ratingContentTab === 'ranking' ? (
                        <FortyFiveRanking period={selectedRatingPeriod.period} collectors={selectedRatingPeriod.evaluations} supervisors={selectedRatingPeriod.supervisor_evaluations || []} />
                      ) : (
                        <FortyFivePrintReport period={selectedRatingPeriod.period} selectedRatingPeriod={selectedRatingPeriod} collectorEdits={collectorEdits} />
                      )}
                    </div>
                  )}

                  {!fortyFiveDayLoading && !selectedRatingPeriod && (
                    <div className="forty-five-card" style={{ padding: '44px 24px', textAlign: 'center', color: '#64748b' }}>
                      <CalendarDays size={42} style={{ margin: '0 auto 14px', color: '#087d73', opacity: 0.65 }} />
                      <div style={{ fontSize: 16, fontWeight: 900, color: '#0c2348' }}>Select a 45-Day Period</div>
                      <div style={{ fontSize: 13, marginTop: 6, color: '#64748b' }}>
                        Choose a start date and end date above, or click one of the company preset periods to compute 45-day performance ratings.
                      </div>
                    </div>
                  )}
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
                    const regularTarget = Number(collector.regular_target ?? collector.target ?? 0)
                    return (
                      <tr key={`actual-${collector.id}`}>
                        <td style={{ fontWeight: 900, textTransform: 'uppercase', color: '#08184a' }}>{collector.name}</td>
                        <td style={{ textAlign: 'center', fontWeight: 900 }}>{countFmt(collectorActive)}</td>
                        <td style={{ textAlign: 'right', color: '#6d28d9', fontWeight: 900 }}>PHP {fmt(regularTarget)}</td>
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
                      <td style={{ textAlign: 'right', color: '#6d28d9', fontWeight: 900, fontSize: 18 }}>PHP {fmt(actualTargetTotal)}</td>
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

      {ratingHierarchyModal && <FortyFiveHierarchyModal details={ratingHierarchyModal} onClose={() => setRatingHierarchyModal(null)} />}

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
