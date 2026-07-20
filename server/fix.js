const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../client/src/pages/Customers.jsx');
let content = fs.readFileSync(filePath, 'utf8');

const regex = /<button className="soa-btn-outline-v2" onClick=\{\(\) => setSoaModal\(false\)\}>\s*Back\s*<div className="soa-metric-label-v2">Total Loan Amount<\/div>/;

if (!regex.test(content)) {
  console.error("Could not find the target string.");
  process.exit(1);
}

const fixedString = `<button className="soa-btn-outline-v2" onClick={() => setSoaModal(false)}>
                          Back
                        </button>
                        <button className="soa-btn-primary-v2" onClick={() => window.print()}>
                          <Printer size={16} /> Print
                        </button>
                      </div>
                    </div>

                    <div className="soa-tabs-v2 screen-only">
                      {[['summary', 'Summary', PieChart], ['profile', 'Profile', User], ['history', 'Loans & Payments History', List]].map(([id, label, Icon]) => (
                        <button key={id} type="button" className={\`soa-tab-v2 \${soaTab === id ? 'active' : ''}\`} onClick={() => setSoaTab(id)}>
                          <Icon size={18} /> {label}
                        </button>
                      ))}
                    </div>

                    {soaTab === 'summary' && (
                      <>
                        <div className="soa-card-v2 print-card">
                          <div className="soa-cust-info-v2">
                            <div className="soa-avatar-v2">
                              {soaData.photo_client ? (
                                <img src={getImageUrl(soaData.photo_client)} alt="Avatar" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
                              ) : cleanInitials}
                            </div>
                            <div className="soa-info-grid-v2">
                              <div>
                                <div className="soa-label-v2">Customer Name</div>
                                <div className="soa-val-v2">{soaData.full_name} <CheckCircle size={16} color="#eab308" fill="#fef08a" /></div>
                                <div className="soa-label-v2">Contact</div>
                                <div className="soa-val-sub-v2"><Phone size={14} /> {soaData.contact || 'NONE'}</div>
                              </div>
                              <div>
                                <div className="soa-label-v2">Customer Code</div>
                                <div className="soa-val-v2" style={{ fontSize: 18 }}>{soaData.customer_code}</div>
                                <div className="soa-label-v2">Customer Status</div>
                                {(() => {
                                  const cstat = getCalculatedCustomerStatus(soaData) || 'Active';
                                  const cclass = cstat.toLowerCase().replace(' ', '');
                                  return (
                                    <div className={\`soa-status-badge-v2 \${cclass}\`}>
                                      <div className={\`dot \${cclass}\`}></div> {cstat}
                                    </div>
                                  );
                                })()}
                              </div>
                              <div>
                                <div className="soa-label-v2">Address</div>
                                <div className="soa-val-v2" style={{ fontSize: 14, lineHeight: 1.4 }}>{[soaData.address, soaData.sitio, soaData.purok, soaData.brgy, soaData.city].filter(Boolean).join(', ') || '-'}</div>
                                <div className="soa-label-v2">Member Since</div>
                                <div className="soa-val-sub-v2"><CalendarDays size={14} /> {memberSince}</div>
                              </div>
                            </div>
                          </div>
                          
                          <div className="soa-divider-v2"></div>
                          
                          <div className="soa-chart-v2">
                            <div className="soa-chart-label-v2">OUTSTANDING BALANCE</div>
                            <div className="donut-v2">
                              <div className="donut-inner-v2">
                                <div className="donut-val-v2">{formatPhp(outstandingBal)}</div>
                                <div className="donut-sub-v2">As of {new Date().toLocaleDateString('en-US', {month:'short', day:'numeric', year:'numeric'})}</div>
                              </div>
                              <div className="donut-dot-v2"></div>
                            </div>
                          </div>
                        </div>

                        <div className="soa-metrics-row-v2 print-card">
                          <div className="soa-metric-card-v2 blue">
                            <div className="soa-metric-icon-v2"><Wallet size={24} /></div>
                            <div>
                              <div className="soa-metric-label-v2">Total Loan Amount</div>`;

content = content.replace(regex, fixedString);
fs.writeFileSync(filePath, content, 'utf8');
console.log("Successfully fixed Customers.jsx");
