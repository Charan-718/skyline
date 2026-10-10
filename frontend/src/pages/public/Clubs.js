import { useQuery } from '@tanstack/react-query';
import { Buildings, MagnifyingGlass } from '@phosphor-icons/react';
import { useSearchParams } from 'react-router-dom';
import { clubsApi } from '../../api/endpoints';
import { PageHeader } from '../../components/layout';
import { EmptyState, QueryState, PageLoader } from '../../components/feedback';
import { Button } from '../../components/Button';
import { Input } from '../../components/forms';
import { plural } from '../../utils/dates';

export default function Clubs() {
  const clubs = useQuery({ queryKey: ['clubs'], queryFn: () => clubsApi.list() });
  const [params, setParams] = useSearchParams();
  const search = params.get('q') || ''; 

  const onChangeName = (e) => {
    setParams({ q: e.target.value.toLowerCase() }, { replace: true });
  }
    
  return (
    <>
      <PageHeader 
        title="Clubs" 
        description="Every student organization on campus." 
        actions={
          <div className="input-group" style={{ minWidth: 250 }}>
            <span className="prefix" aria-hidden>
              <MagnifyingGlass size={18} />
            </span>
            <Input 
              type="search" 
              placeholder="Search for clubs..." 
              value={search} 
              onChange={onChangeName} 
              aria-label="Search clubs"
            />
          </div>
        }
      />
      <QueryState query={clubs} loading={<PageLoader />} empty={<EmptyState icon={Buildings} title="No clubs yet" />}>
        {(list) => {
          const filteredClubs = list.filter((c) => c.name.toLowerCase().includes(search));
          return (
            <ol className="ruled">
              {filteredClubs.map((c, i) => (
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
          );
        }}
      </QueryState>
    </>
  );
}
