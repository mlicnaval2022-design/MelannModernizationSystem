import React, { useState, useEffect } from 'react';
import API from '../services/api';
import { regions, provinces, cities, barangays } from 'select-philippines-address';
import { getZipCodeForCity } from '../data/philippinePostalCodes';

const STEPS = [
  { id: 1, title: 'Personal Information', sub: 'Basic personal details', icon: '👤' },
  { id: 2, title: 'Address Information', sub: 'Current address details', icon: '📍' },
  { id: 3, title: 'Contact Information', sub: 'Contact & online details', icon: '📞' },
  { id: 4, title: 'Business Information', sub: 'Business & employment', icon: '🏪' },
  { id: 5, title: 'Identification', sub: 'ID and document details', icon: '🪪' }
];

const PHILID_TYPE = 'Philippine Identification (PhilID / ePhilID)';
const ID_TYPE_OPTIONS = [
  PHILID_TYPE,
  "Driver's License",
  'Passport',
  'UMID (Unified Multi-Purpose ID)',
  'SSS ID',
  'GSIS ID',
  'PRC ID',
  "Voter's ID / Certification",
  'Postal ID',
  'Senior Citizen ID',
  'PWD ID',
  'NBI Clearance',
  'Police Clearance',
  'Barangay Clearance / Certificate',
  'PhilHealth ID',
  'TIN ID',
  'Pag-IBIG ID (HDMF)',
  'OFW ID',
  "Seaman's Book",
  'Alien Certificate of Registration (ACR)',
  'Government Office / GOCC ID',
  'Integrated Bar of the Philippines (IBP) ID',
  'Company ID',
  'School ID',
  "Business Permit / Mayor's Permit",
  'DTI Certificate of Registration',
  'SEC Certificate of Registration',
  'Others'
];

const normalizeIdType = value => {
  const idType = String(value || '').trim();
  return idType === 'Philippine Identification (PhilID)' ? PHILID_TYPE : idType;
};

export default function CustomerWizard({ initialData, onClose, onSaved, collectors }) {
  const educationalBackgroundOptions = ['Primary', 'Secondary', 'College', 'Undergraduate'];
  const occupationalStatusOptions = ['Government', 'Private', 'Self-Employed', 'Unemployed'];
  const businessTypeOptions = [
    'SARI-SARI STORE',
    'EATERY / CARENDERIA',
    'MARKET VENDOR',
    'FOOD CART / KIOSK / STREET VENDOR',
    'BAKERY / BAKE SHOP',
    'ONLINE SELLER',
    'RETAIL / WHOLESALE STORE',
    'HARDWARE / CONSTRUCTION SUPPLIES',
    'PHARMACY / DRUG STORE',
    'WATER REFILLING STATION',
    'LAUNDRY SHOP',
    'BARBER SHOP / BEAUTY SALON',
    'TAILORING / DRESSMAKING',
    'MOTORCYCLE / AUTO REPAIR SHOP',
    'CARWASH',
    'TRICYCLE DRIVER / OPERATOR',
    'HABAL-HABAL / MOTORCYCLE TAXI',
    'JEEPNEY DRIVER / OPERATOR',
    'TRANSPORTATION / HAULING',
    'FARMING / AGRICULTURE',
    'LIVESTOCK / POULTRY RAISING',
    'FISHING / AQUACULTURE',
    'REAL ESTATE / RENTALS / BOARDING HOUSE',
    'INTERNET CAFE / PISONET',
    'PAWNSHOP / REMITTANCE / MONEY CHANGER',
    'JUNKSHOP',
    'CONTRACTOR / CONSTRUCTION',
    'PROFESSIONAL SERVICES / FREELANCER',
    'SALARY / EMPLOYED',
    'PENSIONER'
  ];
  const [step, setStep] = useState(1);
  const [form, setForm] = useState(initialData ? {
    ...initialData,
    id_type: normalizeIdType(initialData.id_type)
  } : {
    customer_classification: 'New Client', risk_category: 'Medium Risk', cic_verification: 'Verified',
    first_name: '', last_name: '', middle_name: '', gender: 'Male', birth_date: '', civil_status: 'Single', nationality: 'Filipino',
    educational_background: '', occupational_status: '',
    address: '', sitio: '', purok: '', brgy: '', city: '', province: '', zip_code: '', home_status: 'Owned', length_of_stay: '', previous_address: '',
    contact: '', secondary_contact: '', email: '', fb_account: '', messenger_account: '', contact_notes: '',
    business_type: 'SARI-SARI STORE', business_type_other: '', occupation: 'Retail', business_name: '', business_address: '', business_years: '', business_months: '', income_per_month: '', business_employees: '', business_ownership: 'Sole Proprietorship', business_permit: 'Yes', permit_date_issued: '', permit_place_issued: '', permit_no: '',
    id_type: '', id_number: '', id_issue_date: '', id_expiry_date: '', id_issued_by: 'PSA', id_place_of_issue: '', tin_number: '', sss_number: '', id_notes: '',
    loan_purpose: '', branch_id: '', collector_id: '',
    photo_id_front: null, photo_id_back: null, photo_business_proof: null, photo_client: null
  });

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [showSuccess, setShowSuccess] = useState(false);

  const [regionData, setRegionData] = useState([]);
  const [provinceData, setProvinceData] = useState([]);
  const [cityData, setCityData] = useState([]);
  const [brgyData, setBrgyData] = useState([]);

  const [regionCode, setRegionCode] = useState('');
  const [provinceCode, setProvinceCode] = useState('');
  const [cityCode, setCityCode] = useState('');

  useEffect(() => {
    regions().then(setRegionData);
  }, []);

  const handleRegion = (e) => {
    const code = e.target.value;
    setRegionCode(code); setProvinceCode(''); setCityCode('');
    setProvinceData([]); setCityData([]); setBrgyData([]);
    if (code) provinces(code).then(setProvinceData);
    setForm(f => ({...f, province: '', city: '', brgy: '', zip_code: ''}));
  };
  const handleProvince = (e) => {
    const code = e.target.value;
    setProvinceCode(code); setCityCode('');
    setCityData([]); setBrgyData([]);
    if (code) cities(code).then(setCityData);
    const name = provinceData.find(p => p.province_code === code)?.province_name;
    setForm(f => ({...f, province: name || '', city: '', brgy: '', zip_code: ''}));
  };
  const handleCity = (e) => {
    const code = e.target.value;
    setCityCode(code); setBrgyData([]);
    if (code) barangays(code).then(setBrgyData);
    const name = cityData.find(p => p.city_code === code)?.city_name;
    setForm(f => ({...f, city: name || '', brgy: '', zip_code: getZipCodeForCity(code)}));
  };
  const handleBrgy = (e) => {
    const code = e.target.value;
    const name = brgyData.find(p => p.brgy_code === code)?.brgy_name;
    setForm(f => ({...f, brgy: name || ''}));
  };


  const calculateAge = (dob) => {
    if (!dob) return '';
    const diff = Date.now() - new Date(dob).getTime();
    return Math.abs(new Date(diff).getUTCFullYear() - 1970);
  };

  const handleUpper = (field) => (e) => setForm(f => ({ ...f, [field]: e.target.value.toUpperCase() }));
  const handleLower = (field) => (e) => setForm(f => ({ ...f, [field]: e.target.value.toLowerCase() }));
  const getImageUrl = (path) => {
    if (!path) return '';
    if (path.startsWith('http')) return path;
    if (path.startsWith('/')) {
      const baseUrl = API.defaults.baseURL.replace('/api', '');
      return `${baseUrl}${path}`;
    }
    const baseUrl = API.defaults.baseURL.replace('/api', '');
    return `${baseUrl}/${path}`;
  };
  
  const handleFileUpload = async (file, field) => {
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await API.post('/customers/upload', formData);
      if (!res.data?.stored || !res.data?.url) {
        throw new Error('The server did not confirm that the picture was stored.');
      }
      setForm(f => ({ ...f, [field]: res.data.url }));
    } catch (uploadError) {
      alert(uploadError.response?.data?.error || uploadError.message || 'File upload failed');
    }
  };

  const removeUploadedFile = (event, field) => {
    event.preventDefault();
    event.stopPropagation();
    setForm(f => ({ ...f, [field]: null }));
  };

  const renderUploadPreview = (field, alt) => (
    <div className="upload-preview">
      <img src={getImageUrl(form[field])} alt={alt} />
      <button
        type="button"
        className="upload-delete-btn"
        onClick={(event) => removeUploadedFile(event, field)}
        title="Remove picture"
        aria-label="Remove picture"
      >
        ×
      </button>
    </div>
  );

  const handleSave = async () => {
    if (String(form.id_number || '').trim() && !normalizeIdType(form.id_type)) {
      setStep(5);
      setError('Please select the Type of ID before saving the customer.');
      return;
    }
    try {
      setSaving(true);
      setError('');
      const payload = {
        ...form,
        id_type: normalizeIdType(form.id_type),
        business_type: form.business_type === 'OTHERS' ? form.business_type_other : form.business_type,
        messenger_account: '',
        business_name: '',
        occupation: '',
      };
      if (initialData?.id) {
        await API.put(`/customers/${initialData.id}`, payload);
      } else {
        await API.post('/customers', payload);
      }
      setShowSuccess(true);
    } catch (err) {
      setError(err.response?.data?.error || 'An error occurred while saving.');
    } finally {
      setSaving(false);
    }
  };

  const nextStep = () => { if (step < 5) setStep(step + 1); };
  const prevStep = () => { if (step > 1) setStep(step - 1); };

  const renderStepContent = () => {
    switch(step) {
      case 1: return (
        <div className="wizard-step-content">
          <div className="wizard-section-header">
            <span className="icon">👤</span>
            <div>
              <h3>Personal Information</h3>
              <p>Basic personal details of the customer.</p>
            </div>
          </div>
          <div className="form-grid">
            <div className="form-group"><label>Last Name *</label><input className="form-control" value={form.last_name} onChange={handleUpper('last_name')} /></div>
            <div className="form-group"><label>First Name *</label><input className="form-control" value={form.first_name} onChange={handleUpper('first_name')} /></div>
            <div className="form-group"><label>Middle Name</label><input className="form-control" value={form.middle_name} onChange={handleUpper('middle_name')} /></div>
          </div>
          <div className="form-grid" style={{ gridTemplateColumns: '1fr 1.5fr 1fr' }}>
            <div className="form-group"><label>Gender *</label>
              <select className="form-control" value={form.gender} onChange={e => setForm({...form, gender: e.target.value})}>
                <option value="Male">Male</option><option value="Female">Female</option>
              </select>
            </div>
            <div className="form-group"><label>Birth Date *</label><input type="date" className="form-control" value={form.birth_date} onChange={e => setForm({...form, birth_date: e.target.value})} /></div>
            <div className="form-group"><label>Age</label>
              <div style={{position:'relative'}}><input className="form-control" value={calculateAge(form.birth_date)} disabled /><span style={{position:'absolute', right:10, top:8, fontSize:12, color:'#10b981', background:'#d1fae5', padding:'2px 6px', borderRadius:4}}>Auto</span></div>
            </div>
          </div>
          <div className="form-grid">
            <div className="form-group"><label>Civil Status *</label>
              <select className="form-control" value={form.civil_status} onChange={e => setForm({...form, civil_status: e.target.value})}>
                <option value="Single">Single</option><option value="Married">Married</option><option value="Widowed">Widowed</option><option value="Separated">Separated</option>
              </select>
            </div>
            <div className="form-group"><label>Nationality *</label>
              <select className="form-control" value={form.nationality} onChange={e => setForm({...form, nationality: e.target.value})}>
                <option value="Filipino">Filipino</option><option value="Foreigner">Foreigner</option>
              </select>
            </div>
          </div>

          <label className="section-label">Educational Background</label>
          <div className="radio-cards">
            {educationalBackgroundOptions.map(option => (
              <div key={option} className={`radio-card checkbox-card ${form.educational_background === option ? 'active' : ''}`} onClick={() => setForm({...form, educational_background: option})}>
                <input type="checkbox" checked={form.educational_background === option} readOnly />
                <div className="radio-content">
                  <strong>{option}</strong>
                </div>
              </div>
            ))}
          </div>

          <label className="section-label">Occupational Status</label>
          <div className="radio-cards">
            {occupationalStatusOptions.map(option => (
              <div key={option} className={`radio-card checkbox-card ${form.occupational_status === option ? 'active' : ''}`} onClick={() => setForm({...form, occupational_status: option})}>
                <input type="checkbox" checked={form.occupational_status === option} readOnly />
                <div className="radio-content">
                  <strong>{option}</strong>
                </div>
              </div>
            ))}
          </div>

          <div className="form-group" style={{ marginTop: '15px' }}><label>Assigned Collector *</label>
            <select className="form-control" value={form.collector_id} onChange={e => setForm({...form, collector_id: e.target.value})}>
              <option value="">Select Collector</option>
              {collectors.map(c => <option key={c.id} value={c.id}>{c.first_name} {c.last_name}</option>)}
            </select>
          </div>

          <label className="section-label">Customer Classification *</label>
          <div className="radio-cards">
            {['New Client', 'Reloan', 'Returning Client'].map(type => (
              <div key={type} className={`radio-card ${form.customer_classification === type ? 'active' : ''}`} onClick={() => setForm({...form, customer_classification: type})}>
                <input type="radio" checked={form.customer_classification === type} readOnly />
                <div className="radio-content">
                  <strong>{type}</strong>
                  <span>{type === 'New Client' ? 'First time borrower' : type === 'Reloan' ? 'Existing client' : 'Inactive client'}</span>
                </div>
              </div>
            ))}
          </div>

          <label className="section-label">CIC Verification (For Reference)</label>
          <div className="radio-cards">
            {[
              { val: 'Verified', sub: 'No adverse record' },
              { val: 'With Existing Loan', sub: 'Currently has loan' },
              { val: 'With Delinquent Record', sub: 'Has past due record' }
            ].map(c => (
              <div key={c.val} className={`radio-card checkbox-card ${form.cic_verification === c.val ? 'active' : ''}`} onClick={() => setForm({...form, cic_verification: c.val})}>
                <input type="checkbox" checked={form.cic_verification === c.val} readOnly />
                <div className="radio-content">
                  <strong>{c.val}</strong>
                  <span>{c.sub}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      );
      case 2: return (
        <div className="wizard-step-content">
          <div className="wizard-section-header">
            <span className="icon">📍</span>
            <div>
              <h3>Address Information</h3>
              <p>Enter the current residential address of the customer.</p>
            </div>
          </div>
          <div className="form-group"><label>House No. / Street</label><input className="form-control" value={form.address} onChange={handleUpper('address')} /></div>
          <div className="form-grid">
            <div className="form-group"><label>Sitio</label><input className="form-control" value={form.sitio} onChange={handleUpper('sitio')} /></div>
            <div className="form-group"><label>Purok</label><input className="form-control" value={form.purok} onChange={handleUpper('purok')} /></div>
          </div>
          <div className="form-grid">
            <div className="form-group">
              <label>Region</label>
              <select className="form-control" value={regionCode} onChange={handleRegion}>
                <option value="">Select Region</option>
                {regionData.map(r => <option key={r.region_code} value={r.region_code}>{r.region_name}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Province * {form.province && !provinceCode && `(Currently: ${form.province})`}</label>
              <select className="form-control" value={provinceCode} onChange={handleProvince} disabled={!regionCode}>
                <option value="">Select Province</option>
                {provinceData.map(p => <option key={p.province_code} value={p.province_code}>{p.province_name}</option>)}
              </select>
            </div>
          </div>
          <div className="form-grid">
            <div className="form-group">
              <label>Municipality / City * {form.city && !cityCode && `(Currently: ${form.city})`}</label>
              <select className="form-control" value={cityCode} onChange={handleCity} disabled={!provinceCode}>
                <option value="">Select City</option>
                {cityData.map(c => <option key={c.city_code} value={c.city_code}>{c.city_name}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Barangay * {form.brgy && !brgyData.find(b=>b.brgy_name===form.brgy) && `(Currently: ${form.brgy})`}</label>
              <select className="form-control" value={brgyData.find(b=>b.brgy_name===form.brgy)?.brgy_code || ''} onChange={handleBrgy} disabled={!cityCode}>
                <option value="">Select Barangay</option>
                {brgyData.map(b => <option key={b.brgy_code} value={b.brgy_code}>{b.brgy_name}</option>)}
              </select>
            </div>
          </div>
          <div className="form-grid">
            <div className="form-group"><label>Zip Code (Auto-filled)</label><input className="form-control" inputMode="numeric" maxLength={4} value={form.zip_code} onChange={handleUpper('zip_code')} /></div>
            <div></div>
          </div>

          <label className="section-label">Home Status *</label>
          <div className="radio-cards">
            {[
              { val: 'Owned', sub: 'Owned house and lot', icon: '🏠' },
              { val: 'Living with Family', sub: 'Living with relatives', icon: '👨‍👩‍👧' },
              { val: 'Rented', sub: 'Renting a property', icon: '🔑' },
              { val: 'Others', sub: 'Others', icon: '🛖' }
            ].map(h => (
              <div key={h.val} className={`radio-card ${form.home_status === h.val ? 'active' : ''}`} onClick={() => setForm({...form, home_status: h.val})}>
                <input type="radio" checked={form.home_status === h.val} readOnly />
                <span style={{fontSize: 20}}>{h.icon}</span>
                <div className="radio-content" style={{marginLeft: 10}}>
                  <strong>{h.val}</strong>
                  <span>{h.sub}</span>
                </div>
              </div>
            ))}
          </div>

          <div className="form-grid" style={{ gridTemplateColumns: '1fr 2fr' }}>
            <div className="form-group"><label>Length of Stay</label>
              <div style={{display:'flex', gap:10, alignItems:'center'}}>
                <input type="number" className="form-control" value={form.length_of_stay} onChange={e => setForm({...form, length_of_stay: e.target.value})} />
                <span style={{color: '#64748b'}}>Years</span>
              </div>
            </div>
            <div className="form-group"><label>Previous Address (if less than 2 years)</label><input className="form-control" value={form.previous_address} onChange={handleUpper('previous_address')} /></div>
          </div>
        </div>
      );
      case 3: return (
        <div className="wizard-step-content">
          <div className="wizard-section-header">
            <span className="icon">📞</span>
            <div>
              <h3>Contact Information</h3>
              <p>Enter the customer's contact and online information.</p>
            </div>
          </div>
          <div className="form-grid">
            <div className="form-group"><label>Main Number *</label><input className="form-control" value={form.contact} onChange={handleUpper('contact')} /></div>
            <div className="form-group"><label>Secondary Number</label><input className="form-control" value={form.secondary_contact} onChange={handleUpper('secondary_contact')} /></div>
          </div>
          <div className="form-grid">
            <div className="form-group"><label>Email Address</label><input type="email" className="form-control" value={form.email} onChange={handleLower('email')} /></div>
          </div>
          <div className="form-group"><label>Facebook Account</label><input className="form-control" value={form.fb_account} onChange={handleUpper('fb_account')} /></div>
          <div className="form-group">
            <label>Additional Notes (Optional)</label>
            <textarea className="form-control" rows="3" value={form.contact_notes} onChange={handleUpper('contact_notes')}></textarea>
          </div>
        </div>
      );
      case 4: return (
        <div className="wizard-step-content">
          <div className="wizard-section-header">
            <span className="icon">🏪</span>
            <div>
              <h3>Business Information</h3>
              <p>Enter the customer's business and employment details.</p>
            </div>
          </div>
          <div className="form-grid">
            <div className="form-group">
              <label>Business Type</label>
              <select className="form-control" value={businessTypeOptions.includes(form.business_type) ? form.business_type : 'OTHERS'} onChange={e => setForm({...form, business_type: e.target.value, business_type_other: e.target.value === 'OTHERS' ? form.business_type_other : ''})}>
                {businessTypeOptions.map(type => <option key={type} value={type}>{type}</option>)}
                <option value="OTHERS">OTHERS</option>
              </select>
            </div>
            {(form.business_type === 'OTHERS' || !businessTypeOptions.includes(form.business_type)) && (
              <div className="form-group">
                <label>Other Business Type</label>
                <input className="form-control" value={form.business_type === 'OTHERS' ? form.business_type_other : form.business_type} onChange={e => setForm({...form, business_type: 'OTHERS', business_type_other: e.target.value.toUpperCase()})} />
              </div>
            )}
          </div>
          <div className="form-group"><label>Complete Business Address</label><input className="form-control" value={form.business_address} onChange={handleUpper('business_address')} /></div>
          
          <div className="form-grid">
            <div className="form-group"><label>Years in Business</label><input type="number" className="form-control" value={form.business_years} onChange={e => setForm({...form, business_years: e.target.value})} /></div>
            <div className="form-group"><label>Months in Business</label><input type="number" className="form-control" value={form.business_months} onChange={e => setForm({...form, business_months: e.target.value})} /></div>
          </div>
          <div className="form-group"><label>Average Monthly Gross Income</label><input type="number" className="form-control" value={form.income_per_month} onChange={e => setForm({...form, income_per_month: e.target.value})} /></div>
          <div className="form-group"><label>Loan Purpose</label><input className="form-control" value={form.loan_purpose} onChange={handleUpper('loan_purpose')} placeholder="e.g. ADDITIONAL CAPITAL" /></div>
          <div className="form-grid">
            <div className="form-group"><label>Business Ownership</label>
              <select className="form-control" value={form.business_ownership} onChange={e => setForm({...form, business_ownership: e.target.value})}>
                <option value="Sole Proprietorship">Sole Proprietorship</option><option value="Partnership">Partnership</option><option value="Corporation">Corporation</option>
              </select>
            </div>
            <div className="form-group"><label>Business Permit Issued</label>
              <select className="form-control" value={form.business_permit} onChange={e => setForm({...form, business_permit: e.target.value})}>
                <option value="Yes">Yes</option><option value="No">No</option>
              </select>
            </div>
          </div>
          {form.business_permit === 'Yes' && (
            <div className="form-grid" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
              <div className="form-group"><label>Date Issued</label><input type="date" className="form-control" value={form.permit_date_issued} onChange={e => setForm({...form, permit_date_issued: e.target.value})} /></div>
              <div className="form-group"><label>Place Issued</label><input className="form-control" value={form.permit_place_issued} onChange={handleUpper('permit_place_issued')} /></div>
              <div className="form-group"><label>Permit No.</label><input className="form-control" value={form.permit_no} onChange={handleUpper('permit_no')} /></div>
            </div>
          )}
        </div>
      );
      case 5: return (
        <div className="wizard-step-content">
          <div className="wizard-section-header">
            <span className="icon">🪪</span>
            <div>
              <h3>Identification Information</h3>
              <p>Enter the customer's identification details.</p>
            </div>
          </div>
          <div className="form-grid">
            <div className="form-group"><label>Type of ID *</label>
              <select className="form-control" value={form.id_type} onChange={e => setForm({...form, id_type: e.target.value})}>
                <option value="">Select ID Type</option>
                {ID_TYPE_OPTIONS.map(option => <option key={option} value={option}>{option}</option>)}
              </select>
            </div>
            <div className="form-group"><label>ID Number *</label><input className="form-control" value={form.id_number} onChange={handleUpper('id_number')} /></div>
          </div>
          <div className="form-grid">
            <div className="form-group"><label>Issue Date</label><input type="date" className="form-control" value={form.id_issue_date} onChange={e => setForm({...form, id_issue_date: e.target.value})} /></div>
            <div className="form-group"><label>Expiry Date</label><input type="date" className="form-control" value={form.id_expiry_date} onChange={e => setForm({...form, id_expiry_date: e.target.value})} /></div>
          </div>
          <div className="form-group"><label>Issued By</label><input className="form-control" value={form.id_issued_by} onChange={e => setForm({...form, id_issued_by: e.target.value})} /></div>
          
          <label className="section-label">Additional Information (Optional)</label>
          <div className="form-grid">
            <div className="form-group"><label>TIN (If available)</label><input className="form-control" value={form.tin_number} onChange={handleUpper('tin_number')} /></div>
            <div className="form-group"><label>SSS Number (If available)</label><input className="form-control" value={form.sss_number} onChange={handleUpper('sss_number')} /></div>
          </div>
          <div className="form-group">
            <label>Notes (Optional)</label>
            <textarea className="form-control" rows="3" value={form.id_notes} onChange={handleUpper('id_notes')}></textarea>
          </div>
        </div>
      );
    }
  };

  const renderSidebarContent = () => {
    return (
      <div className="wizard-right-sidebar">
        <div className="wizard-sidebar-card">
          <div className="wsc-header"><span className="icon">👤</span> Customer Code</div>
          <div className="wsc-body" style={{textAlign: 'center', fontSize: 24, fontWeight: 800, color: '#1d4ed8', background: '#eff6ff', padding: '15px', borderRadius: 8, marginTop: 10}}>
            {initialData?.customer_code || 'Auto-generated'}
          </div>
        </div>

        {step === 1 && (
          <div className="wizard-sidebar-card">
            <div className="wsc-header"><span className="icon">📷</span> Upload Picture</div>
            <div className="wsc-body">
              <label className="upload-dropzone">
                <input type="file" style={{display:'none'}} onChange={e => handleFileUpload(e.target.files[0], 'photo_client')} />
                {form.photo_client ? renderUploadPreview('photo_client', 'Profile') : (
                  <>
                    <div className="icon">☁️</div>
                    <strong>Click to upload</strong>
                    <span>or drag and drop<br/><small>JPG, PNG up to 5MB</small></span>
                  </>
                )}
              </label>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="wizard-sidebar-card">
            <div className="wsc-header"><span className="icon">🪪</span> Upload Business Proof (Optional)</div>
            <div className="wsc-body">
              <label className="upload-dropzone">
                <input type="file" style={{display:'none'}} onChange={e => handleFileUpload(e.target.files[0], 'photo_business_proof')} />
                {form.photo_business_proof ? renderUploadPreview('photo_business_proof', 'Proof') : (
                  <>
                    <div className="icon">☁️</div>
                    <strong>Click to upload</strong>
                    <span>or drag and drop<br/><small>JPG, PNG up to 5MB</small></span>
                  </>
                )}
              </label>
            </div>
          </div>
        )}
        
        {step === 5 && (
          <>
            <div className="wizard-sidebar-card">
              <div className="wsc-header"><span className="icon">🪪</span> Upload ID (Front)</div>
              <div className="wsc-body">
                <label className="upload-dropzone">
                  <input type="file" style={{display:'none'}} onChange={e => handleFileUpload(e.target.files[0], 'photo_id_front')} />
                  {form.photo_id_front ? renderUploadPreview('photo_id_front', 'ID Front') : (
                    <>
                      <div className="icon">☁️</div>
                      <strong>Click to upload</strong>
                      <span>or drag and drop<br/><small>JPG, PNG up to 5MB</small></span>
                    </>
                  )}
                </label>
              </div>
            </div>
            <div className="wizard-sidebar-card">
              <div className="wsc-header"><span className="icon">🪪</span> Upload ID (Back) (Optional)</div>
              <div className="wsc-body">
                <label className="upload-dropzone">
                  <input type="file" style={{display:'none'}} onChange={e => handleFileUpload(e.target.files[0], 'photo_id_back')} />
                  {form.photo_id_back ? renderUploadPreview('photo_id_back', 'ID Back') : (
                    <>
                      <div className="icon">☁️</div>
                      <strong>Click to upload</strong>
                      <span>or drag and drop<br/><small>JPG, PNG up to 5MB</small></span>
                    </>
                  )}
                </label>
              </div>
            </div>
          </>
        )}
      </div>
    );
  };

  return (
    <div className="modal-overlay wizard-overlay">
      <div className="wizard-modal">
        <div className="wizard-header">
          <div className="wizard-title">
            <div className="icon-wrapper">👤+</div>
            <div>
              <h2>{initialData ? 'Edit Customer Registration' : 'New Customer Registration'}</h2>
              <p>Create the customer profile first. Loan applications are entered separately.</p>
            </div>
          </div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="wizard-progress-bar">
          {STEPS.map((s, i) => (
            <React.Fragment key={s.id}>
              <div className={`wp-step ${step >= s.id ? 'active' : ''} ${step > s.id ? 'completed' : ''}`} onClick={() => setStep(s.id)}>
                <div className="wp-circle">{step > s.id ? '✓' : s.id}</div>
                <div className="wp-text">
                  <strong>{s.title}</strong>
                </div>
              </div>
              {i < STEPS.length - 1 && <div className={`wp-line ${step > s.id ? 'active' : ''}`}></div>}
            </React.Fragment>
          ))}
        </div>

        <div className="wizard-body">
          <div className="wizard-left-sidebar">
            <div className="step-indicator">STEP {step} OF 5</div>
            <div className="step-progress-track">
              <div className="step-progress-fill" style={{ width: `${(step/5)*100}%` }}></div>
            </div>
            
            <div className="wizard-nav-list">
              {STEPS.map(s => (
                <div key={s.id} className={`wn-item ${step === s.id ? 'active' : ''} ${step > s.id ? 'completed' : ''}`} onClick={() => setStep(s.id)}>
                  <div className="wn-icon">{step > s.id ? '✓' : s.icon}</div>
                  <div>
                    <strong>{s.title}</strong>
                    <span>{s.sub}</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="wizard-tip">
              <span className="icon">💡</span>
              <div>
                <strong>Quick Tip</strong>
                <p style={{margin:0, marginTop:5, color:'#1d4ed8'}}>Please complete all required fields marked with * to continue.</p>
              </div>
            </div>
          </div>

          <div className="wizard-center">
            {error && <div className="alert alert-danger" style={{ marginBottom: 14 }}>{error}</div>}
            {renderStepContent()}
          </div>

          <div className="wizard-right">
            {renderSidebarContent()}
          </div>
        </div>

        <div className="wizard-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <div style={{ display: 'flex', gap: 10 }}>
            {step > 1 && <button className="btn btn-secondary" onClick={prevStep}>&lt; Back</button>}
            {step < 5 ? 
              <button className="btn btn-primary" onClick={nextStep} style={{background:'#1d4ed8', color:'#fff', padding:'10px 24px', border:'none', borderRadius:8}}>Next &gt;</button> : 
              <button className="btn btn-primary" onClick={handleSave} disabled={saving} style={{background:'#1d4ed8', color:'#fff', padding:'10px 24px', border:'none', borderRadius:8}}>{saving ? 'Saving...' : 'Save Registration'}</button>
            }
          </div>
        </div>
      </div>

      {showSuccess && (
        <div className="modal-overlay" style={{ zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#fff', padding: '30px', borderRadius: '12px', textAlign: 'center', maxWidth: '300px', boxShadow: '0 10px 25px rgba(0,0,0,0.2)' }}>
            <div style={{ fontSize: '48px', marginBottom: '15px' }}>✅</div>
            <h3 style={{ margin: '0 0 10px 0', color: '#16a34a' }}>Saved Successfully!</h3>
            <p style={{ color: '#64748b', fontSize: '14px', marginBottom: '20px' }}>The customer information has been saved. Add a loan separately when the customer is ready to apply.</p>
            <button 
              onClick={() => { setShowSuccess(false); onSaved(); }}
              style={{ background: '#16a34a', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer', width: '100%' }}
            >
              OK
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
