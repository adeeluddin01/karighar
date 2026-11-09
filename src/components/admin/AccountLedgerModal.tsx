"use client";

import { Modal } from "@/components/Modal";
import { Button } from "@/components/ui";
import { LedgerHistory } from "@/components/LedgerHistory";

/**
 * One account's money history, as the admin sees it.
 *
 * A thin shell around <LedgerHistory>, which the technician's own
 * /pro/history and the company's /business/earnings render too. Same query,
 * same grouping; `variant="admin"` is what adds the reconciliation
 * diagnostics — per-job ledger-versus-payments drift, and lines orphaned by
 * a deleted job — which only an admin can act on.
 */
export function AccountLedgerModal({
  accountId,
  name,
  onClose,
}: {
  accountId: string;
  name: string;
  onClose: () => void;
}) {
  return (
    <Modal title={name} subtitle="Payment history" onClose={onClose} size="lg">
      <div className="flex flex-col gap-4">
        <LedgerHistory accountId={accountId} variant="admin" />
        <div className="flex justify-end">
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </Modal>
  );
}
