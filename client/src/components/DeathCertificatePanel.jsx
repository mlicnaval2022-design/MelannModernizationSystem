import { useState } from 'react';
import { FileImage, Upload } from 'lucide-react';
import API from '../services/api';

export default function DeathCertificatePanel({ customer, onUpdated, getImageUrl, onPreview }) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  const uploadCertificate = async event => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!String(file.type || '').startsWith('image/')) {
      setError('Please select an image file.');
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

  const imageUrl = getImageUrl(customer.death_certificate_image);

  return (
    <div className="death-certificate-panel">
      <div className="death-certificate-heading">
        <div>
          <div className="death-certificate-eyebrow">Deceased Client Record</div>
          <h3>Death Certificate</h3>
          <p>Upload and keep the client’s death certificate image as supporting proof.</p>
        </div>
        <label className={`death-certificate-upload ${uploading ? 'disabled' : ''}`}>
          <Upload size={17} /> {uploading ? 'Uploading…' : imageUrl ? 'Replace Image' : 'Upload Image'}
          <input type="file" accept="image/*" onChange={uploadCertificate} disabled={uploading} />
        </label>
      </div>

      {error && <div className="death-certificate-error">{error}</div>}
      {imageUrl ? (
        <button type="button" className="death-certificate-preview" onClick={() => onPreview?.(imageUrl)}>
          <img src={imageUrl} alt={`Death certificate of ${customer.full_name}`} />
          <span>Click image to view full size</span>
        </button>
      ) : (
        <div className="death-certificate-empty">
          <FileImage size={42} />
          <strong>No death certificate uploaded yet</strong>
          <span>Accepted format: image file, up to 5 MB.</span>
        </div>
      )}
    </div>
  );
}
