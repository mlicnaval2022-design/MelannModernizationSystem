import { useEffect, useMemo, useState } from 'react'
import html2pdf from 'html2pdf.js'
import API from '../services/api'
import letterheadImg from '../assets/melann-letterhead.jpg'

const fmtMoney = value => Number(value || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const shortDate = value => value ? new Date(`${String(value).slice(0, 10)}T00:00:00`).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' }) : '-'
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
const formatBorrowerName = loan => {
  const orderedName = [loan.first_name, loan.middle_name, loan.last_name]
    .map(part => String(part || '').trim())
    .filter(Boolean)
    .join(' ')

  if (orderedName) return orderedName

  const fallback = String(loan.customer_name || '').trim()
  if (fallback.includes(',')) {
    const [last, rest] = fallback.split(',', 2)
    return [rest, last].map(part => part.trim()).filter(Boolean).join(' ')
  }

  return fallback || '-'
}

export default function PromissoryDisclosure() {
  const [loans, setLoans] = useState([])
  const [search, setSearch] = useState('')
  const [releaseDate, setReleaseDate] = useState(toDateInputValue(new Date()))
  const [selectedId, setSelectedId] = useState('')
  const [documentData, setDocumentData] = useState(null)
  const [loadingList, setLoadingList] = useState(false)
  const [loadingDoc, setLoadingDoc] = useState(false)
  const [error, setError] = useState('')

  const filteredLoans = useMemo(() => {
    const dateFiltered = releaseDate
      ? loans.filter(loan => String(loan.date_released || '').slice(0, 10) === releaseDate)
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
    if (filteredLoans.length === 0) {
      setSelectedId('')
      setDocumentData(null)
      return
    }

    if (!filteredLoans.some(loan => String(loan.id) === String(selectedId))) {
      setSelectedId(String(filteredLoans[0].id))
    }
  }, [filteredLoans, selectedId])

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
        setError(err.response?.data?.error || 'Unable to load disclosure statement.')
      })
      .finally(() => setLoadingDoc(false))
  }, [selectedId])

  const printDocument = () => setTimeout(() => window.print(), 100)

  const exportPdf = () => {
    const printable = document.getElementById('promissory-printable')
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
        filename: `Disclosure_Statement_${safeName(loanCode)}.pdf`,
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
        <div className="card-title">Disclosure Statement</div>
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
            <button className="btn btn-secondary" onClick={printDocument} disabled={!documentData || loadingDoc}>Print</button>
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
            {loadingDoc ? <div className="empty-state">Loading document...</div> : documentData ? <DocumentPreview data={documentData} /> : <div className="empty-state">Select a posted loan to preview the document.</div>}
          </div>
        </div>
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
  const collateral = loan.collateral || '-'
  const words = amountInWords(principal)
  const penaltyAmount = Number(loan.penalty || 0)
  const passbookAmount = Number(loan.passbook || 0)
  const oldBalance = Number(loan.previous_balance || 0)
  const totalCharges = penaltyAmount + passbookAmount + oldBalance

  return (
    <div id="promissory-printable" className="promissory-print">
      <style>{`
        .promissory-print { width: 8.5in; min-height: 14in; background: #fff; color: #000; font-family: Arial, Helvetica, sans-serif; font-size: 10px; line-height: 1.22; margin: 0 auto; padding: 0.32in 0.35in 0.38in; box-shadow: 0 8px 24px rgba(15, 23, 42, 0.12); box-sizing: border-box; overflow: visible; }
        .xl-header { display: grid; grid-template-columns: minmax(0, 1fr) 2.25in; gap: 0.16in; align-items: start; margin: 0 0 0.08in; }
        .xl-letterhead { width: 4.55in; max-width: 100%; height: auto; display: block; }
        .xl-loan-type { text-align: right; color: red; font-size: 12px; font-weight: 900; margin-bottom: 2px; text-transform: uppercase; }
        .xl-charge-table { width: 100%; border-collapse: collapse; font-size: 10px; font-weight: 800; }
        .xl-charge-table td { border: 1px solid #000; padding: 1px 6px; height: 14px; }
        .xl-charge-table td:first-child { width: 42%; text-align: left; }
        .xl-charge-table td:last-child { text-align: right; font-weight: 400; }
        .xl-charge-table .total-row td { color: red; font-weight: 900; }
        .xl-title { text-align: center; font-size: 13px; font-weight: 800; text-decoration: underline; margin: 0 0 12px; }
        .xl-date { text-align: right; font-weight: 800; margin: 0 1.05in 22px 0; text-decoration: underline; }
        .xl-center { text-align: center; }
        .xl-section { text-align: center; font-weight: 800; text-decoration: underline; margin: 12px 0 6px; }
        .xl-p { margin: 4px 0; text-align: justify; }
        .xl-indent { text-indent: 28px; }
        .xl-line { border-bottom: 1px solid #000; display: inline-block; min-width: 126px; padding: 0 3px; font-weight: 700; text-align: center; }
        .xl-wide { min-width: 210px; }
        .xl-table { border-collapse: collapse; margin: 6px 0 5px 38px; }
        .xl-table td { padding: 2px 9px 2px 0; vertical-align: bottom; }
        .xl-check-grid { display: grid; grid-template-columns: 1fr 1.1fr; gap: 60px; align-items: end; margin: 16px 0 3px; }
        .xl-check-grid > div:first-child,
        .xl-lender-sign,
        .xl-borrower-sign { position: relative; padding-top: 13px; }
        .xl-check { position: absolute; left: 4px; top: 0; font-family: Wingdings, Arial, sans-serif; font-size: 13px; line-height: 1; }
        .xl-sig-name { text-align: center; font-weight: 700; border-top: 1px solid #000; padding-top: 2px; min-height: 13px; }
        .xl-sig-label { text-align: center; font-size: 9px; }
        .xl-lender { text-align: center; font-weight: 700; }
        .xl-lender-sign { width: 238px; margin: 3px auto 0; text-align: center; }
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
      <div className="xl-date">{shortDate(loan.date_released)}</div>
      <p className="xl-p">by and between:</p>
      <p className="xl-p"><strong>MELANN LENDING INVESTOR CORPORATION</strong>, a Philippine corporation duly registered with the Securities and Exchange Commision of the Philippines (SEC), with principal place of business at 943 Purok 2, Brgy. Bagong Buhay, Ormoc City and hereinafter referred to as the "LENDER";</p>
      <p className="xl-center">- and -</p>
      <p className="xl-p"><strong>{fullName}</strong>, of legal age, Filipino, and a resident of <strong>{loan.address || '-'}</strong></p>
      <p className="xl-p">(hereinafter referred to as the "BORROWER").</p>

      <div className="xl-section">PROMISSORY NOTE</div>
      <p className="xl-p xl-indent">FOR VALUE RECEIVED, herein BORROWER promises to pay to the LENDER the sum of <span className="xl-line xl-wide">{words}</span></p>
      <p className="xl-p">(Php <span className="xl-line">{fmtMoney(principal)}</span>) together with the interest thereon at a rate of <span className="xl-line">{interestRate}</span> payable in <span className="xl-line">{displayLoanPeriod}</span> days.</p>

      <div className="xl-section">LOAN AGREEMENT</div>
      <p className="xl-p">The BORROWER and LENDER, hereby further set forth their rights and obligations to one another under this Promissory Note and Loan Agreement and agree to be legally bound as follows:</p>
      <table className="xl-table">
        <tbody>
          <tr><td>Principal Loan Amount:</td><td>Php</td><td><span className="xl-line">{fmtMoney(principal)}</span></td></tr>
          <tr><td>Interest Rate:</td><td colSpan="2"><span className="xl-line">{interestRate}</span> payable in <span className="xl-line">{displayLoanPeriod}</span> days</td></tr>
          <tr><td>Due Date:</td><td colSpan="2"><span className="xl-line">{shortDate(maturityDate)}</span></td></tr>
        </tbody>
      </table>
      <p className="xl-p">(NOTE: Penalty for late payment is 5% per month of the overdue amount)</p>
      <p className="xl-p"><strong>Collateral.</strong> To secure the payment of the loan by the BORROWER of all his/her obligations in this Promissory Note and Loan Agreement, the BORROWER shall deliver to the LENDER the titles of the following properties as collaterals:</p>
      <p className="xl-p">Collaterals: <span className="xl-line xl-wide">{collateral}</span></p>
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
            <div className="xl-check">ü</div>
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
