import { useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowsClockwise } from '@phosphor-icons/react';
import { membershipsApi } from '../../api/endpoints';
import { DescriptionList, PageHeader } from '../../components/layout';
import { ErrorState, StatusBadge, PageLoader } from '../../components/feedback';
import { Button } from '../../components/Button';
import { QrCode } from '../../components/domain';
import { ConfirmDialog } from '../../components/Modal';
import { useToast } from '../../components/Toast';
import { formatDate } from '../../utils/dates';
import { useState } from 'react';

export default function MembershipCard() {
  const { membershipId } = useParams();
  const qc = useQueryClient();
  const toast = useToast();
  const [confirm, setConfirm] = useState(false);
  const q = useQuery({ queryKey: ['digital-id', membershipId], queryFn: () => membershipsApi.digitalId(membershipId) });
  const rotate = useMutation({
    mutationFn: () => membershipsApi.rotateDigitalId(membershipId),
    onSuccess: (d) => {
      qc.setQueryData(['digital-id', membershipId], d);
      setConfirm(false);
      toast.success('New QR code issued', 'Old screenshots of your card no longer work.');
    },
    onError: (e) => toast.error(e),
  });
  if (q.isPending) return <PageLoader />;
  if (q.isError) return <div className="card"><ErrorState error={q.error} onRetry={() => q.refetch()} /></div>;
  const d = q.data;
  return (
    <>
      <PageHeader breadcrumbs={[{ label: 'My memberships', to: '/me/memberships' }, { label: d.clubName, to: `/me/memberships/${membershipId}` }, { label: 'Digital ID' }]} title="Digital membership ID" description="Show this at events. Staff scan it to confirm your membership. Scanning never uses it up." />
      <div className="id-card">
        <div className="id-card-top">
          <p>{d.clubName}</p>
          <h2>{d.memberName}</h2>
          <p className="mono">{d.memberNumber}</p>
        </div>
        <div className="card-body stack" style={{ alignItems: 'center' }}>
          <QrCode value={d.qrPayload} size={240} label={`Membership QR code for ${d.memberName}`} />
          <StatusBadge status={d.effectiveStatus} />
          <div style={{ width: '100%' }}>
            <DescriptionList items={[['Plan', d.planName], [d.effectiveStatus === 'EXPIRED' ? 'Expired' : 'Valid until', formatDate(d.expiresOn)]]} />
          </div>
          <Button variant="ghost" icon={ArrowsClockwise} onClick={() => setConfirm(true)}>
            Issue a new QR code
          </Button>
        </div>
      </div>
      <ConfirmDialog open={confirm} onClose={() => setConfirm(false)} onConfirm={() => rotate.mutate()} loading={rotate.isPending} title="Issue a new QR code?" confirmLabel="Issue new code">
        Use this if someone else has a copy of your card. The current QR code will stop working immediately.
      </ConfirmDialog>
    </>
  );
}
