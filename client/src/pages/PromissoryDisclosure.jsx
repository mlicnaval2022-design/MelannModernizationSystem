import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import html2pdf from 'html2pdf.js'
import API from '../services/api'
import letterheadImg from '../assets/melann-letterhead.jpg'
import marilynSignature from '../assets/marilyn-reloba-signature.png'

const fmtMoney = value => Number(value || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const shortDate = value => value ? new Date(`${String(value).slice(0, 10)}T00:00:00`).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' }) : '-'
const wordDate = value => value ? new Date(`${String(value).slice(0, 10)}T00:00:00`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '-'
const toDateInputValue = date => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}
const addDays = (value, days) => {
  if (!value) return ''
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`)
  if (Number.isNaN(date.getTime())) return ''
  date.setDate(date.getDate() + Number(days || 0))
  return toDateInputValue(date)
}
const calculateAge = birthDate => {
  if (!birthDate) return '-'
  const birth = new Date(`${birthDate}T00:00:00`)
  if (Number.isNaN(birth.getTime())) return '-'
  const today = new Date()
  let age = today.getFullYear() - birth.getFullYear()
  const monthDiff = today.getMonth() - birth.getMonth()
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) age -= 1
  return age
}
const safeName = value => String(value || 'disclosure_statement').replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '') || 'disclosure_statement'
const numberWords = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen']
const tensWords = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety']
const toWordsUnderThousand = n => {
  if (n < 20) return numberWords[n]
  if (n < 100) return `${tensWords[Math.floor(n / 10)]}${n % 10 ? ` ${numberWords[n % 10]}` : ''}`
  return `${numberWords[Math.floor(n / 100)]} hundred${n % 100 ? ` ${toWordsUnderThousand(n % 100)}` : ''}`
}
const amountInWords = value => {
  const n = Math.round(Number(value || 0))
  if (!n) return 'Zero pesos only'
  const parts = []
  const millions = Math.floor(n / 1000000)
  const thousands = Math.floor((n % 1000000) / 1000)
  const rest = n % 1000
  if (millions) parts.push(`${toWordsUnderThousand(millions)} million`)
  if (thousands) parts.push(`${toWordsUnderThousand(thousands)} thousand`)
  if (rest) parts.push(toWordsUnderThousand(rest))
  return `${parts.join(' ')} pesos only`.replace(/\b\w/g, c => c.toUpperCase())
}
const disclosurePeriod = value => {
  const days = Number(value || 0)
  if (!days) return 0
  if (days <= 30) return 30
  if (days <= 45) return 45
  return days
}
const toDisplayCase = value => String(value || '')
  .toLocaleLowerCase('en-PH')
  .replace(/(^|[^\p{L}\p{N}])(\p{L})/gu, (_, prefix, char) => prefix + char.toLocaleUpperCase('en-PH'))
  .replace(/\bIi\b/g, 'II')
  .replace(/\bIii\b/g, 'III')
  .replace(/\bIv\b/g, 'IV')
  .replace(/\bVi\b/g, 'VI')
const formatBorrowerName = loan => {
  const orderedName = [loan.first_name, loan.middle_name, loan.last_name]
    .map(part => String(part || '').trim())
    .filter(Boolean)
    .join(' ')

  if (orderedName) return toDisplayCase(orderedName)

  const fallback = String(loan.customer_name || '').trim()
  if (fallback.includes(',')) {
    const [last, rest] = fallback.split(',', 2)
    return toDisplayCase([rest, last].map(part => part.trim()).filter(Boolean).join(' '))
  }

  return fallback ? toDisplayCase(fallback) : '-'
}

export default function PromissoryDisclosure() {
  const [searchParams] = useSearchParams()
  const targetLoanCode = searchParams.get('loan') || ''
  const targetTab = searchParams.get('tab') || ''
  const [loans, setLoans] = useState([])
  const [search, setSearch] = useState(targetLoanCode)
  const [releaseDate, setReleaseDate] = useState(targetLoanCode ? '' : toDateInputValue(new Date()))
  const [selectedId, setSelectedId] = useState('')
  const [documentData, setDocumentData] = useState(null)
  const [activeTab, setActiveTab] = useState(targetTab === 'disclosure' ? 'disclosure' : 'promissory')
  const [loadingList, setLoadingList] = useState(false)
  const [loadingDoc, setLoadingDoc] = useState(false)
  const [error, setError] = useState('')

  const filteredLoans = useMemo(() => {
    const dateFiltered = releaseDate
      ? loans.filter(loan => {
          const isRecon = ['recon', 'reconstruct', 'reconstructed'].includes(String(loan.loan_type || '').toLowerCase());
          // DCR puts recon loans on their creation date instead of release date
          const dateToMatch = isRecon ? loan.created_at : loan.date_released;
          return String(dateToMatch || '').slice(0, 10) === releaseDate;
        })
      : loans
    const needle = search.trim().toLowerCase()
    if (!needle) return dateFiltered
    return dateFiltered.filter(loan => [
      loan.loan_code,
      loan.customer_name,
      loan.customer_code,
      loan.collector_name,
      loan.loan_type,
    ].some(value => String(value || '').toLowerCase().includes(needle)))
  }, [loans, search, releaseDate])

  const loadLoans = async () => {
    setLoadingList(true)
    setError('')
    try {
      const res = await API.get('/loans', { params: { status: 'active' } })
      setLoans(res.data || [])
    } catch (err) {
      setError(err.response?.data?.error || 'Unable to load posted loans.')
    } finally {
      setLoadingList(false)
    }
  }

  useEffect(() => { loadLoans() }, [])

  useEffect(() => {
    if (!targetLoanCode) return
    setSearch(targetLoanCode)
    setReleaseDate('')
    if (targetTab === 'disclosure' || targetTab === 'promissory') setActiveTab(targetTab)
  }, [targetLoanCode, targetTab])

  useEffect(() => {
    if (filteredLoans.length === 0) {
      setSelectedId('')
      setDocumentData(null)
      return
    }

    const targetLoan = targetLoanCode
      ? filteredLoans.find(loan => String(loan.loan_code || '').toLowerCase() === targetLoanCode.toLowerCase())
      : null

    if (targetLoan && String(targetLoan.id) !== String(selectedId)) {
      setSelectedId(String(targetLoan.id))
      return
    }

    if (!targetLoanCode && !filteredLoans.some(loan => String(loan.id) === String(selectedId))) {
      setSelectedId(String(filteredLoans[0].id))
    }
  }, [filteredLoans, selectedId, targetLoanCode])

  useEffect(() => {
    if (!selectedId) {
      setDocumentData(null)
      return
    }
    setLoadingDoc(true)
    setError('')
    API.get('/reports/disclosure-statement', { params: { loan_id: selectedId } })
      .then(res => setDocumentData(res.data))
      .catch(err => {
        setDocumentData(null)
        setError(err.response?.data?.error || 'Unable to load promissory.')
      })
      .finally(() => setLoadingDoc(false))
  }, [selectedId])

  const printDocument = () => setTimeout(() => window.print(), 100)

  const exportPdf = () => {
    const printableId = activeTab === 'disclosure' ? 'disclosure-printable' : 'promissory-printable'
    const printable = document.getElementById(printableId)
    if (!printable) {
      alert('Document is not ready yet.')
      return
    }
    const loanCode = documentData?.loan?.loan_code || selectedId
    const exportRoot = printable.cloneNode(true)
    exportRoot.removeAttribute('id')
    exportRoot.style.margin = '0'
    exportRoot.style.boxShadow = 'none'
    exportRoot.style.width = '8.5in'
    exportRoot.style.minHeight = '14in'
    exportRoot.style.maxWidth = 'none'
    exportRoot.style.overflow = 'visible'

    const exportHost = document.createElement('div')
    exportHost.style.position = 'fixed'
    exportHost.style.left = '-10000px'
    exportHost.style.top = '0'
    exportHost.style.width = '8.5in'
    exportHost.style.background = '#fff'
    exportHost.appendChild(exportRoot)
    document.body.appendChild(exportHost)

    html2pdf()
      .set({
        margin: 0,
        filename: `${activeTab === 'disclosure' ? 'Disclosure' : 'Promissory'}_${safeName(loanCode)}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff' },
        jsPDF: { unit: 'in', format: [8.5, 14], orientation: 'portrait' },
        pagebreak: { mode: [] },
      })
      .from(exportRoot)
      .save()
      .finally(() => exportHost.remove())
  }

  return (
    <div className="content">
      <div className="card">
        <div className="card-title">For Print</div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, borderBottom: '1px solid #dbe7f6' }}>
          {[
            ['promissory', 'Promissory'],
            ['disclosure', 'Disclosure'],
          ].map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setActiveTab(key)}
              style={{
                border: 0,
                borderBottom: activeTab === key ? '3px solid #2563eb' : '3px solid transparent',
                background: 'transparent',
                color: activeTab === key ? '#1d4ed8' : '#64748b',
                fontWeight: 800,
                padding: '10px 16px',
                cursor: 'pointer'
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="form-actions" style={{ justifyContent: 'space-between', alignItems: 'end', gap: 12, flexWrap: 'wrap' }}>
          <div className="form-group" style={{ minWidth: 320, flex: '1 1 320px' }}>
            <label className="form-label">Search Posted Loan</label>
            <input className="form-control" placeholder="Loan no., client code, name, collector..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <div className="form-group" style={{ minWidth: 180 }}>
            <label className="form-label">Release Date</label>
            <input className="form-control" type="date" value={releaseDate} onChange={e => setReleaseDate(e.target.value)} />
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn btn-secondary" onClick={loadLoans} disabled={loadingList}>{loadingList ? 'Refreshing...' : 'Refresh'}</button>
            <button className="btn btn-secondary" onClick={printDocument} disabled={!documentData || loadingDoc}>Print {activeTab === 'disclosure' ? 'Disclosure' : 'Promissory'}</button>
            <button className="btn btn-primary" onClick={exportPdf} disabled={!documentData || loadingDoc}>Export PDF</button>
          </div>
        </div>

        {error && <div className="login-error" style={{ marginTop: 12 }}>{error}</div>}

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(300px, 430px) 1fr', gap: 18, alignItems: 'start', marginTop: 16 }}>
          <div className="table-wrapper" style={{ maxHeight: '70vh', overflow: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr><th>Loan</th><th>Client</th><th>Amount</th></tr>
              </thead>
              <tbody>
                {loadingList ? (
                  <tr><td colSpan={3} className="empty-state">Loading posted loans...</td></tr>
                ) : filteredLoans.length === 0 ? (
                  <tr><td colSpan={3} className="empty-state">No posted loans found for selected date</td></tr>
                ) : filteredLoans.map(loan => (
                  <tr
                    key={loan.id}
                    onClick={() => setSelectedId(String(loan.id))}
                    style={{ cursor: 'pointer', background: String(loan.id) === String(selectedId) ? '#eff6ff' : undefined }}
                  >
                    <td><span className="mono">{loan.loan_code}</span><div style={{ color: '#64748b', fontSize: 12 }}>{shortDate(loan.date_released)}</div></td>
                    <td><strong>{loan.customer_name}</strong><div style={{ color: '#64748b', fontSize: 12 }}>{loan.customer_code} · {loan.loan_type}</div></td>
                    <td style={{ textAlign: 'right' }}>{fmtMoney(loan.principal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div>
            {loadingDoc ? (
              <div className="empty-state">Loading document...</div>
            ) : documentData ? (
              activeTab === 'disclosure' ? <DisclosurePreview data={documentData} /> : <DocumentPreview data={documentData} />
            ) : (
              <div className="empty-state">Select a posted loan to preview the document.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function DisclosurePreview({ data }) {
  const loan = data.loan || {}
  const principal = Number(loan.principal || 0)
  const totalLoan = Number(loan.total_amortization || loan.principal || 0)
  const interestRate = Number(loan.interest_rate || 0)
  const loanPeriod = Number(loan.loan_period || 0)
  const displayLoanPeriod = disclosurePeriod(loanPeriod)
  const amortization = Number(loan.amortization || 0)
  const maturityDate = loan.date_maturity || addDays(loan.date_released, loanPeriod)
  const fullName = formatBorrowerName(loan)
  const netProceed = Number(loan.net_proceeds || principal)
  const charges = Number(loan.service_fee || 0) + Number(loan.insurance || 0) + Number(loan.notarial_fee || 0) + Number(loan.filing_fee || 0) + Number(loan.total_deductions || 0) + Number(loan.penalty || 0) + Number(loan.passbook || 0) + Number(loan.previous_balance || 0)
  const schedule = (data.schedule || []).slice(0, 45)
  const collateral = loan.collateral || '-'
  const field = (label, value, strong = false) => (
    <div className="ds-field">
      <span>{label}</span>
      <b className={strong ? 'ds-strong' : ''}>{value || '-'}</b>
    </div>
  )

  return (
    <div id="disclosure-printable" className="disclosure-print">
      <style>{`
        .disclosure-print { width: 8.5in; min-height: 14in; background: #fff; color: #293344; font-family: Arial, Helvetica, sans-serif; margin: 0 auto; border: 1px solid #d7e0ec; box-shadow: 0 8px 24px rgba(15, 23, 42, 0.08); box-sizing: border-box; overflow: hidden; }
        .ds-header { display: flex; justify-content: space-between; gap: 24px; align-items: center; background: #11244a; color: #fff; border-left: 14px solid #f6bd13; padding: 24px 34px; }
        .ds-company { font-size: 28px; font-weight: 900; letter-spacing: 1px; line-height: 1; }
        .ds-sub { margin-top: 8px; color: #cbd5e1; font-size: 13px; }
        .ds-badge { border: 1px solid #355587; border-radius: 8px; padding: 10px 18px; text-align: center; min-width: 240px; background: rgba(255,255,255,0.04); }
        .ds-badge-title { font-size: 20px; font-weight: 900; letter-spacing: 1px; }
        .ds-badge-id { margin-top: 6px; color: #f6bd13; font-size: 15px; font-weight: 900; }
        .ds-body { padding: 18px 28px 28px; }
        .ds-section { border: 1px solid #d9e2ef; border-radius: 8px; margin-bottom: 14px; overflow: hidden; break-inside: avoid; }
        .ds-section-title { background: #142b57; color: #fff; padding: 8px 16px; font-size: 14px; font-weight: 900; letter-spacing: 0.6px; text-transform: uppercase; }
        .ds-section-body { padding: 14px 18px; }
        .ds-grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 26px; }
        .ds-grid-3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px 18px; }
        .ds-field { display: grid; grid-template-columns: 145px 1fr; align-items: end; gap: 8px; font-size: 12px; min-height: 22px; }
        .ds-field span { color: #667085; font-weight: 800; }
        .ds-field b { border-bottom: 1px solid #d5dde8; min-height: 18px; color: #293344; font-weight: 600; }
        .ds-field .ds-strong { font-weight: 900; }
        .ds-charge-strip { display: grid; grid-template-columns: repeat(5, 1fr); margin-top: 12px; overflow: hidden; border-radius: 6px; background: #eef3f8; }
        .ds-charge-strip .ds-field { grid-template-columns: 1fr auto; padding: 7px 10px; }
        .ds-charge-strip .ds-field b { border-bottom: 0; text-align: right; }
        .ds-schedule { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
        .ds-schedule table { width: 100%; border-collapse: collapse; font-size: 10px; }
        .ds-schedule th { color: #142b57; font-weight: 900; border-bottom: 1px solid #d9e2ef; padding: 5px 3px; }
        .ds-schedule td { border-bottom: 1px solid #edf1f6; padding: 4px 3px; text-align: center; }
        .ds-schedule .money { text-align: right; font-weight: 700; }
        .ds-signatures { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; margin: 34px 0 18px; }
        .ds-signature { text-align: center; color: #7a8699; font-size: 10px; }
        .ds-line { border-top: 1px solid #142b57; margin-bottom: 7px; height: 1px; }
        .ds-authorized-signature { position: relative; padding-top: 0; transform: translateY(-6px); }
        .ds-authorized-signature-img { display: block; width: 104px; height: auto; margin: -33px auto -5px; filter: brightness(0); }
        .ds-authorized-name { color: #293344; font-weight: 900; border-top: 1px solid #142b57; padding-top: 5px; margin-bottom: 4px; }
        .ds-ack { font-size: 11px; line-height: 1.35; font-weight: 800; margin: 16px 0; }
        .ds-clause { font-size: 11px; line-height: 1.35; font-style: italic; color: #3f4a5c; }
        .ds-borrower { display: grid; grid-template-columns: 1fr 220px; gap: 80px; margin: 30px 20px 8px; }
        .ds-footer { display: flex; justify-content: space-between; background: #11244a; color: #dbe5f4; padding: 10px 34px; font-size: 11px; font-weight: 800; }
        @media print {
          @page { size: legal portrait; margin: 0.16in 0.14in 0.22in 0.14in; }
          body { margin: 0 !important; background: #fff !important; }
          body * { visibility: hidden !important; }
          #disclosure-printable, #disclosure-printable * { visibility: visible !important; }
          #disclosure-printable {
            display: flex !important;
            flex-direction: column !important;
            position: absolute !important; left: 0 !important; top: 0 !important;
            width: 8.22in !important; height: 13.62in !important; min-height: 0 !important; max-width: none !important;
            border: 1.5px solid #1f365f !important; box-shadow: none !important; margin: 0 !important; overflow: hidden !important;
          }
          .ds-header { flex: 0 0 auto !important; padding: 0.18in 0.32in !important; gap: 0.16in !important; border-left-width: 0.09in !important; }
          .ds-company { font-size: 22pt !important; letter-spacing: 1.1px !important; }
          .ds-sub { margin-top: 0.045in !important; font-size: 8.8pt !important; }
          .ds-badge { min-width: 2.35in !important; padding: 0.08in 0.14in !important; border: 1.5px solid #45699d !important; border-radius: 0.08in !important; }
          .ds-badge-title { font-size: 15pt !important; }
          .ds-badge-id { margin-top: 0.03in !important; font-size: 11.5pt !important; }
          .ds-body { flex: 1 1 auto !important; min-height: 0 !important; display: flex !important; flex-direction: column !important; padding: 0.1in 0.25in 0.05in !important; overflow: hidden !important; }
          .ds-section { margin-bottom: 0.07in !important; border: 1.5px solid #9aabc4 !important; border-radius: 0.06in !important; break-inside: avoid !important; }
          .ds-section:last-of-type { flex: 1 1 auto !important; display: flex !important; flex-direction: column !important; min-height: 2.5in !important; margin-bottom: 0.04in !important; }
          .ds-section-title { padding: 0.035in 0.12in !important; font-size: 10.6pt !important; letter-spacing: 0.35px !important; }
          .ds-section-body { padding: 0.065in 0.12in !important; }
          .ds-section:last-of-type .ds-section-body { flex: 1 1 auto !important; display: flex !important; flex-direction: column !important; padding-bottom: 0.075in !important; }
          .ds-grid-2 { gap: 0.06in 0.2in !important; }
          .ds-grid-3 { gap: 0.06in 0.16in !important; }
          .ds-field { grid-template-columns: 1.14in 1fr !important; gap: 0.05in !important; font-size: 8pt !important; min-height: 0.15in !important; }
          .ds-field b { min-height: 0.125in !important; border-bottom: 1.4px solid #a9b7ca !important; }
          .ds-charge-strip { margin-top: 0.055in !important; border: 1.2px solid #c3cfdd !important; border-radius: 0.04in !important; }
          .ds-charge-strip .ds-field { padding: 0.028in 0.065in !important; grid-template-columns: 1fr auto !important; font-size: 7.4pt !important; }
          .ds-charge-strip .ds-field b { border-bottom: 0 !important; }
          .ds-schedule { gap: 0.07in !important; }
          .ds-schedule table { font-size: 7.35pt !important; }
          .ds-schedule th { border-bottom: 0.9px solid #d5dce8 !important; padding: 0.023in 0.015in !important; line-height: 1.08 !important; }
          .ds-schedule td { border-bottom: 0.35px solid #f1f4f8 !important; padding: 0.016in 0.015in !important; line-height: 1.06 !important; }
          .ds-schedule table:not(:last-child) { border-right: 1.2px solid #9fb0c8 !important; padding-right: 0.05in !important; }
          .ds-section:last-of-type .ds-grid-2 { gap: 0.035in 0.18in !important; }
          .ds-section:last-of-type .ds-field { font-size: 7.5pt !important; min-height: 0.13in !important; }
          .ds-section:last-of-type .ds-field b { min-height: 0.105in !important; }
          .ds-signatures { gap: 0.16in !important; margin: 0.36in 0 0.12in !important; }
          .ds-signature { font-size: 6.7pt !important; }
          .ds-line { border-top: 1.4px solid #253a61 !important; margin-bottom: 0.04in !important; }
          .ds-authorized-signature { transform: translateY(-0.03in) !important; }
          .ds-authorized-signature-img { width: 0.82in !important; margin: -0.24in auto -0.04in !important; }
          .ds-authorized-name { padding-top: 0.035in !important; margin-bottom: 0.025in !important; }
          .ds-ack { font-size: 7.15pt !important; line-height: 1.1 !important; margin: 0.075in 0 !important; }
          .ds-clause { font-size: 6.9pt !important; line-height: 1.1 !important; }
          .ds-borrower { grid-template-columns: 1fr 1.45in !important; gap: 0.5in !important; margin: auto 0.15in 0 !important; padding-top: 0.18in !important; }
          .ds-footer { flex: 0 0 auto !important; margin-top: auto !important; padding: 0.045in 0.32in !important; font-size: 7.4pt !important; }
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        }
      `}</style>
      <div className="ds-header">
        <div>
          <div className="ds-company">MELANN LENDING INVESTOR CORP.</div>
          <div className="ds-sub">Ormoc City</div>
          <div className="ds-sub">On Loans/Credit Transaction As required under R.A. 3765, Truth in Lending Act</div>
        </div>
        <div className="ds-badge">
          <div className="ds-badge-title">DISCLOSURE STATEMENT</div>
          <div className="ds-badge-id">Loan ID: {loan.loan_code || loan.id}</div>
        </div>
      </div>

      <div className="ds-body">
        <section className="ds-section">
          <div className="ds-section-title">Client Information</div>
          <div className="ds-section-body ds-grid-2">
            <div>
              {field('Name', fullName, true)}
              {field('Code', loan.customer_code)}
              {field('Address', loan.address)}
              {field('Age', calculateAge(loan.birth_date))}
              {field('Nature of Business', loan.business_type || loan.business_name || loan.occupation)}
            </div>
            <div>
              {field('Phone Number', [loan.contact, loan.secondary_contact].filter(Boolean).join('/'))}
              {field('Birthday', shortDate(loan.birth_date))}
              {field('Gender', loan.gender)}
              {field('Purpose of Loan', loan.loan_purpose || loan.remarks || 'Additional Capital')}
              {field('ID Document', [loan.id_type, loan.id_number].filter(Boolean).join(' - '))}
            </div>
          </div>
        </section>

        <section className="ds-section">
          <div className="ds-section-title">Loan Information</div>
          <div className="ds-section-body">
            <div className="ds-grid-3">
              <div>
                {field('Date Release', shortDate(loan.date_released))}
                {field('Maturity', shortDate(maturityDate))}
                {field('Loan Period', `${displayLoanPeriod} days`)}
              </div>
              <div>
                {field('Principal', fmtMoney(principal), true)}
                {field('Loan Total', fmtMoney(totalLoan), true)}
                {field('Payment / Day', fmtMoney(amortization), true)}
              </div>
              <div>
                {field('Interest Rate', `${interestRate}%`, true)}
                {field('Loan Type', loan.loan_type)}
                {field('Loan Status', loan.status, true)}
              </div>
            </div>
            <div className="ds-charge-strip">
              {field('Service Fee', fmtMoney(loan.service_fee))}
              {field('Insurance', fmtMoney(loan.insurance))}
              {field('Passbook', fmtMoney(loan.passbook))}
              {field('Penalty', fmtMoney(loan.penalty))}
              {field('Prev. Balance', fmtMoney(loan.previous_balance))}
              {field('Total Charges', fmtMoney(charges), true)}
              {field('Net Proceed', fmtMoney(netProceed), true)}
              {field('Collateral', collateral, true)}
              {field('Late Penalty', '5% / month')}
              {field('Total Payment', fmtMoney(loan.total_paid))}
            </div>
          </div>
        </section>

        <section className="ds-section">
          <div className="ds-section-title">Amortization Schedule</div>
          <div className="ds-section-body ds-schedule">
            {[0, 1, 2].map(columnIndex => (
              <table key={columnIndex}>
                <thead><tr><th>No.</th><th>Date</th><th>Amortization</th><th>Balance</th></tr></thead>
                <tbody>
                  {schedule.filter((_, idx) => idx % 3 === columnIndex).map((row, idx) => {
                    const no = row.period_number || (idx * 3) + columnIndex + 1
                    const amount = Number(row.amount_due || amortization || 0)
                    const balance = Math.max(totalLoan - (amount * no), 0)
                    return (
                      <tr key={`${columnIndex}-${no}`}>
                        <td>{no}</td>
                        <td>{shortDate(row.due_date)}</td>
                        <td className="money">{fmtMoney(amount)}</td>
                        <td className="money">{fmtMoney(balance)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            ))}
          </div>
        </section>

        <section className="ds-section">
          <div className="ds-section-title">Disclosure Statement</div>
          <div className="ds-section-body">
            <div className="ds-grid-2">
              <div>{field('Name', fullName, true)}{field('Address', loan.address)}</div>
              <div>{field('Birthday', shortDate(loan.birth_date))}{field('Nationality', loan.nationality || 'Filipino')}{field('Gender', loan.gender)}</div>
            </div>
            <div style={{ color: '#142b57', fontWeight: 900, marginTop: 20 }}>CERTIFIED CORRECT:</div>
            <div className="ds-signatures">
              {[1, 2].map(item => <div className="ds-signature" key={item}><div className="ds-line" />Signature of Authorized Representative<br />Over Printed Name / Position</div>)}
              <div className="ds-signature ds-authorized-signature">
                <img className="ds-authorized-signature-img" src={marilynSignature} alt="Marilyn O. Reloba signature" />
                <div className="ds-authorized-name">MARILYN O. RELOBA</div>
                Signature of Authorized Representative<br />Over Printed Name / Position
              </div>
            </div>
            <div className="ds-ack">I ACKNOWLEDGE RECEIPT OF A COPY OF THIS STATEMENT PRIOR TO THE CONSUMMATION OF THE CREDIT TRANSACTION AND THAT I UNDERSTAND AND FULLY AGREE TO THE TERMS AND CONDITIONS THEREOF:</div>
            <div className="ds-clause">In the event of borrower's death during the active period of the loan, the total unpaid balance of the loan will be deemed paid, provided that the account is not in a past due status.</div>
            <div className="ds-borrower">
              <div className="ds-signature"><div className="ds-line" />Signature of Borrower Over Printed Name</div>
              <div className="ds-signature"><div className="ds-line" />Date</div>
            </div>
          </div>
        </section>
      </div>
      <div className="ds-footer">
        <span>{shortDate(new Date().toISOString().split('T')[0])}</span>
        <span>Page 1 of 1</span>
      </div>
    </div>
  )
}

function DocumentPreview({ data }) {
  const loan = data.loan || {}
  const principal = Number(loan.principal || 0)
  const interestRate = Number(loan.interest_rate || 0)
  const loanPeriod = Number(loan.loan_period || 0)
  const displayLoanPeriod = disclosurePeriod(loanPeriod)
  const maturityDate = loan.date_maturity || addDays(loan.date_released, loanPeriod)
  const fullName = formatBorrowerName(loan)
  const borrowerAddress = loan.address ? toDisplayCase(loan.address) : '-'
  const collateral = loan.collateral || '-'
  const words = amountInWords(principal)
  const penaltyAmount = Number(loan.penalty || 0)
  const passbookAmount = Number(loan.passbook || 0)
  const oldBalance = Number(loan.previous_balance || 0)
  const totalCharges = penaltyAmount + passbookAmount + oldBalance

  return (
    <div id="promissory-printable" className="promissory-print">
      <style>{`
        .promissory-print { width: 8.5in; min-height: 14in; background: #fff; color: #000; font-family: Arial, Helvetica, sans-serif; font-size: 10.8px; line-height: 1.24; margin: 0 auto; padding: 0.55in 0.55in 0.38in; box-shadow: 0 8px 24px rgba(15, 23, 42, 0.12); box-sizing: border-box; overflow: visible; }
        .xl-header { display: grid; grid-template-columns: minmax(0, 1fr) 2.25in; gap: 0.16in; align-items: start; margin: 0 0 0.08in; }
        .xl-letterhead { width: 4.55in; max-width: 100%; height: auto; display: block; }
        .xl-loan-type { text-align: right; color: red; font-size: 12px; font-weight: 900; margin-bottom: 2px; text-transform: uppercase; }
        .xl-charge-table { width: 100%; border-collapse: collapse; font-size: 10px; font-weight: 800; }
        .xl-charge-table td { border: 1px solid #000; padding: 1px 6px; height: 14px; }
        .xl-charge-table td:first-child { width: 42%; text-align: left; }
        .xl-charge-table td:last-child { text-align: right; font-weight: 400; }
        .xl-charge-table .total-row td { color: red; font-weight: 900; }
        .xl-title { text-align: center; font-size: 14px; font-weight: 800; text-decoration: underline; margin: 0 0 12px; }
        .xl-date { text-align: right; font-weight: 800; margin: 0 1.05in 22px 0; text-decoration: underline; }
        .xl-center { text-align: center; }
        .xl-section { text-align: center; font-weight: 800; text-decoration: underline; margin: 12px 0 6px; }
        .xl-p { margin: 4px 0; text-align: justify; }
        .xl-indent { text-indent: 28px; }
        .xl-emphasis-line { border-bottom: 1px solid #000; padding: 0 4px 1px; }
        .xl-line { border-bottom: 1px solid #000; display: inline-block; min-width: 126px; padding: 0 3px; font-weight: 700; text-align: center; }
        .xl-wide { min-width: 210px; }
        .xl-table { border-collapse: collapse; margin: 6px 0 5px 38px; width: auto; }
        .xl-table td { padding: 2px 5px 2px 0; vertical-align: bottom; white-space: nowrap; }
        .xl-loan-details td:first-child { min-width: 130px; }
        .xl-loan-details .xl-line { text-align: left; }
        .xl-loan-details .xl-line { min-width: 92px; }
        .xl-date-line { min-width: 150px !important; }
        .xl-collateral-line { color: #000; border-bottom-color: #000; }
        .xl-check-grid { display: grid; grid-template-columns: 1fr 1.1fr; gap: 60px; align-items: end; margin: 16px 0 3px; }
        .xl-check-grid > div:first-child,
        .xl-lender-sign,
        .xl-borrower-sign { position: relative; padding-top: 13px; }
        .xl-check { position: absolute; left: 4px; top: 0; font-family: Wingdings, Arial, sans-serif; font-size: 13px; line-height: 1; }
        .xl-sig-name { text-align: center; font-weight: 700; border-top: 1px solid #000; padding-top: 2px; min-height: 13px; }
        .xl-sig-label { text-align: center; font-size: 9px; }
        .xl-lender { text-align: center; font-weight: 700; }
        .xl-lender-sign { width: 238px; margin: 3px auto 0; text-align: center; }
        .xl-lender-signature-img { display: block; width: 125px; height: auto; margin: -12px auto -5px; position: relative; z-index: 1; filter: brightness(0); }
        .xl-receipt-title { font-weight: 800; text-decoration: underline; margin-top: 14px; font-size: 12px; }
        .xl-receipt-date { float: right; font-weight: 700; min-width: 108px; border-bottom: 1px solid #000; text-align: center; }
        .xl-borrower-sign { width: 238px; margin: 20px 0 0 auto; text-align: center; }
        @media print {
          @page { size: legal portrait; margin: 0; }
          body { margin: 0 !important; background: #fff !important; }
          body * { visibility: hidden !important; }
          #promissory-printable, #promissory-printable * { visibility: visible !important; }
          #promissory-printable {
            position: absolute !important; left: 0 !important; top: 0 !important;
            width: 8.5in !important; min-height: 14in !important; max-width: none !important;
            box-shadow: none !important; margin: 0 !important; overflow: visible !important;
          }
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        }
      `}</style>
      <div className="xl-header">
        <img className="xl-letterhead" src={letterheadImg} alt="Melann Lending Investor Corporation letterhead" />
        <div>
          <div className="xl-loan-type">{loan.loan_type || '-'}</div>
          <table className="xl-charge-table">
            <tbody>
              <tr><td>CARD</td><td>{fmtMoney(passbookAmount)}</td></tr>
              <tr><td>PENALTY</td><td>{fmtMoney(penaltyAmount)}</td></tr>
              <tr><td>BALANCE</td><td>{fmtMoney(oldBalance)}</td></tr>
              <tr className="total-row"><td>TOTAL</td><td>{fmtMoney(totalCharges)}</td></tr>
            </tbody>
          </table>
        </div>
      </div>
      <div className="xl-title">PROMISSORY NOTE AND LOAN AGREEMENT</div>
      <div className="xl-date">{wordDate(loan.date_released)}</div>
      <p className="xl-p">by and between:</p>
      <p className="xl-p"><strong>MELANN LENDING INVESTOR CORPORATION</strong>, a Philippine corporation duly registered with the Securities and Exchange Commision of the Philippines (SEC), with principal place of business at 943 Purok 2, Brgy. Bagong Buhay, Ormoc City and hereinafter referred to as the "LENDER";</p>
      <p className="xl-center">- and -</p>
      <p className="xl-p"><strong className="xl-emphasis-line">{fullName}</strong>, of legal age, Filipino, and a resident of <strong className="xl-emphasis-line">{borrowerAddress}</strong></p>
      <p className="xl-p">(hereinafter referred to as the "BORROWER").</p>

      <div className="xl-section">PROMISSORY NOTE</div>
      <p className="xl-p xl-indent">FOR VALUE RECEIVED, herein BORROWER promises to pay to the LENDER the sum of <span className="xl-line xl-wide">{words}</span></p>
      <p className="xl-p">(Php <span className="xl-line">{fmtMoney(principal)}</span>) together with the interest thereon at a rate of <span className="xl-line">{interestRate}%</span> payable in <span className="xl-line">{displayLoanPeriod}</span> days.</p>

      <div className="xl-section">LOAN AGREEMENT</div>
      <p className="xl-p">The BORROWER and LENDER, hereby further set forth their rights and obligations to one another under this Promissory Note and Loan Agreement and agree to be legally bound as follows:</p>
      <table className="xl-table xl-loan-details">
        <tbody>
          <tr><td>Principal Loan Amount:</td><td>Php</td><td><span className="xl-line">{fmtMoney(principal)}</span></td></tr>
          <tr><td>Interest Rate:</td><td colSpan="2"><span className="xl-line">{interestRate}%</span> payable in <span className="xl-line">{displayLoanPeriod}</span> days</td></tr>
          <tr><td>Due Date:</td><td colSpan="2"><span className="xl-line xl-date-line">{wordDate(maturityDate)}</span></td></tr>
        </tbody>
      </table>
      <p className="xl-p">(NOTE: Penalty for late payment is 5% per month of the overdue amount)</p>
      <p className="xl-p"><strong>Collateral.</strong> To secure the payment of the loan by the BORROWER of all his/her obligations in this Promissory Note and Loan Agreement, the BORROWER shall deliver to the LENDER the titles of the following properties as collaterals:</p>
      <p className="xl-p">Collaterals: <span className="xl-line xl-wide xl-collateral-line">{collateral}</span></p>
      <p className="xl-p">In case of loss, damage or diminution in value of properties served as collaterals, with or without the fault of the BORROWER, during the existence of obligation payable under this Promissory Note and Loan Agreement, the BORROWER, upon written demand by the LENDER, shall immediately deliver additional securities acceptable to the LENDER.</p>
      <p className="xl-p"><strong>Default.</strong>The occurrence of any of the following events shall constitute a default by the BORROWER of the terms of this Promissory Note and Loan Agreement:</p>
      <p className="xl-p">(a)&nbsp;&nbsp; BORROWER's failure to pay any amount due as principal or interest on the date required under this Promissory Note and Loan Agreement.</p>
      <p className="xl-p">(b)&nbsp;&nbsp; Any misrepresentation by the BORROWER made herein or in connection herewith.</p>
      <p className="xl-p">(c)&nbsp;&nbsp; Willful damage or impairment by the BORROWER of properties served as collaterals.</p>
      <p className="xl-p">As a consequence of default, the BORROWER's obligation shall become due and payable, and the possession of personal properties served as collaterals shall be transferred by the BORROWER to the LENDER without the need of any form of demand from the latter.</p>
      <p className="xl-p"><strong>Venues for Suit.</strong> The venue for all suits or legal actions arising from this Promissory Note and Loan Agreement shall be the courts in Ormoc City exclusively.</p>
      <p className="xl-p"><strong>Severability.</strong> If any provision of this Promissory Note and Loan Agreement shall be rendered to be invalid or unenforceable for any reason, the remaining provisions shall continue to be valid and enforceable.</p>
      <p className="xl-p">IN WITNESS WHEREOF and acknowledging acceptance and agreement of the foregoing, the BORROWER and LENDER affix their signatures hereto.</p>
      <div className="xl-check-grid">
        <div>
          <div className="xl-check">ü</div>
          <div className="xl-sig-name">{fullName}</div>
          <div className="xl-sig-label">Printed Name and Signature</div>
        </div>
        <div>
          <div className="xl-lender">MELANN LENDING INVESTOR CORPORATION</div>
          <div className="xl-sig-label">Lender</div>
          <div className="xl-sig-label">as represented by:</div>
          <div className="xl-lender-sign">
            <img className="xl-lender-signature-img" src={marilynSignature} alt="Marilyn O. Reloba signature" />
            <div className="xl-sig-name">MARILYN O. RELOBA</div>
            <div className="xl-sig-label">Branch Manager</div>
          </div>
        </div>
      </div>
      <div className="xl-receipt-title">ACKNOWLEDGMENT RECEIPT <span className="xl-receipt-date">{shortDate(loan.date_released)}</span></div>
      <p className="xl-p">This is to acknowledge receipt of the amount <span className="xl-line xl-wide">{words}</span></p>
      <p className="xl-p">(Php <span className="xl-line">{fmtMoney(principal)}</span>) from MELANN LENDING INVESTOR CORPORATION as proceeds of my loan under Promissory Note</p>
      <p className="xl-p">and Loan Agreement (PNLA) executed on <span className="xl-line">{shortDate(loan.date_released)}</span>.</p>
      <div className="xl-borrower-sign">
        <div className="xl-check">ü</div>
        <div className="xl-sig-name">{fullName}</div>
        <div className="xl-sig-label">Borrower's Signature</div>
      </div>
    </div>
  )
}
