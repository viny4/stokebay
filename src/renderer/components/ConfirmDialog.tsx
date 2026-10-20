import { useState } from 'react';
import { errorMessage, useHud, type DialogState } from '../store/useHud';
import { Button, Dialog } from './ui';

export function ConfirmDialog({ dialog }: { dialog: Extract<DialogState, { kind: 'confirm' }> }) {
  const closeDialog = useHud((s) => s.closeDialog);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirm = async () => {
    setBusy(true);
    try {
      await dialog.onConfirm();
      closeDialog();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <Dialog
      title={dialog.title}
      onClose={closeDialog}
      footer={
        <>
          <Button onClick={closeDialog}>Cancel</Button>
          <Button
            variant={dialog.danger ? 'danger' : 'primary'}
            disabled={busy}
            onClick={() => void confirm()}
          >
            {dialog.confirmLabel}
          </Button>
        </>
      }
    >
      <p className="text-sm text-hud-text">{dialog.message}</p>
      {error ? <p className="mt-3 text-sm text-red-300">{error}</p> : null}
    </Dialog>
  );
}
