import { useQuery } from '@tanstack/react-query';
import { Buildings } from '@phosphor-icons/react';
import { clubsApi } from '../../api/endpoints';
import { PageHeader } from '../../components/layout';
import { EmptyState, LoadingState, QueryState } from '../../components/feedback';
import { Button } from '../../components/Button';
import { plural } from '../../utils/dates';

export default function Clubs() {
  const clubs = useQuery({ queryKey: ['clubs'], queryFn: () => clubsApi.list() });
  return (
    <>
      <PageHeader title="Clubs" description="Every student organization on campus." />
      <QueryState query={clubs} loading={<LoadingState rows={6} />} empty={<EmptyState icon={Buildings} title="No clubs yet" />}>
        {(list) => (
          <ol className="ruled">
            {list.map((c, i) => (
              <li key={c.id}>
                <div className="stack-sm">
                  <span className="eyebrow">Club {String(i + 1).padStart(2, '0')}</span>
                  <h2 className="ruled-title">{c.name}</h2>
                  <p className="muted" style={{ maxWidth: 'var(--container-reading)' }}>
                    {c.description}
                  </p>
                  <p className="subtle">
                    <span className="num">{`${plural(c.memberCount, 'active member')} · ${plural(c.upcomingEvents, 'upcoming event')}`}</span>
                  </p>
                </div>
                <div className="actions">
                  <Button variant="primary" to={`/clubs/${c.slug}`}>
                    View club
                  </Button>
                  <Button to={`/shop/${c.id}`}>Shop</Button>
                </div>
              </li>
            ))}
          </ol>
        )}
      </QueryState>
    </>
  );
}
