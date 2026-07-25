export function ConfirmDialog({ open, title, message, onCancel, onConfirm }) {
  if (!open) {
    return null;
  }

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true">
      <div className="modal-card confirm-card">
        <h3>{title}</h3>
        <p>{message}</p>
        <div className="modal-actions">
          <button className="secondary-btn" type="button" onClick={onCancel}>
            Cancel
          </button>
          <button className="primary-btn danger-btn" type="button" onClick={onConfirm}>
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}
