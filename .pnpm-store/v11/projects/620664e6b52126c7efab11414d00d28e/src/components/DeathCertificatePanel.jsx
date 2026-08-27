import { useState } from 'react';
import { Download, FileImage, FileText, Upload } from 'lucide-react';
import API from '../services/api';

export default function DeathCertificatePanel({ customer, onUpdated, getImageUrl, onPreview }) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  const uploadCertificate = async event => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const name = String(file.name || '').toLowerCase();
    const accepted = String(file.type || '').startsWith('image/') || /\.(pdf|doc|docx)$/.test(name);
    if (!accepted) {
      setError('Please select an image, PDF, Word DOC, or Word DOCX file.');
      return;
    }

    try {
      setUploading(true);
      setError('');
      const formData = new FormData();
      formData.append('file', file);
      const response = await API.post(`/customers/${customer.id}/death-certificate`, formData);
      onUpdated?.(response.data.url);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to upload the death certificate.');
    } finally {
      setUploading(false);
    }
  };

  const fileUrl = getImageUrl(customer.death_certificate_image);
  const extension = String(customer.death_certificate_image || '').split('?')[0].split('.').pop().toLowerCase();
  const isImage = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'].includes(extension);
  const isPdf = extension === 'pdf';
  const fileLabel = isPdf ? 'PDF document' : ['doc', 'docx'].includes(extension) ? 'Word document' : 'Image document';

  return (
    <div className="death-certificate-panel">
      <div className="death-certificate-heading">
        <div>
          <div className="death-certificate-eyebrow">Deceased Client Record</div>
          <h3>Death Certificate</h3>
          <p>Upload and keep the client’s death certificate as supporting proof.</p>
        </div>
        <label className={`death-certificate-upload ${uploading ? 'disabled' : ''}`}>
          <Upload size={17} /> {uploading ? 'Uploading…' : fileUrl ? 'Replace File' : 'Upload File'}
          <input type="file" accept="image/*,.pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={uploadCertificate} disabled={uploading} />
        </label>
      </div>

      {error && <div className="death-certificate-error">{error}</div>}
      {fileUrl ? isImage ? (
        <button type="button" className="death-certificate-preview" onClick={() => onPreview?.(fileUrl)}>
          <img src={fileUrl} alt={`Death certificate of ${customer.full_name}`} />
          <span>Click image to view full size</span>
        </button>
      ) : (
        <div className="death-certificate-document">
          <FileText size={42} />
          <div>
            <strong>Death Certificate — {fileLabel}</strong>
            <span>{isPdf ? 'Open the PDF to view the certificate.' : 'Open or download the Word document to view the certificate.'}</span>
          </div>
          <a href={fileUrl} target="_blank" rel="noreferrer" className="death-certificate-open"><Download size={17} /> Open File</a>
        </div>
      ) : (
        <div className="death-certificate-empty">
          <FileImage size={42} />
          <strong>No death certificate uploaded yet</strong>
          <span>Accepted: image, PDF, Word DOC, or Word DOCX — up to 5 MB.</span>
        </div>
      )}
    </div>
  );
}
