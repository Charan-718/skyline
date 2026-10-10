import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ShoppingCart, TShirt } from '@phosphor-icons/react';
import { merchApi } from '../../api/endpoints';
import { useAuth } from '../../auth/AuthProvider';
import { useClub } from '../../hooks';
import { PageHeader, Segmented } from '../../components/layout';
import { Alert, Badge, CardsSkeleton, EmptyState, QueryState } from '../../components/feedback';
import { Button } from '../../components/Button';
import { Money } from '../../components/domain';
import { useToast } from '../../components/Toast';
import { formatDateTime } from '../../utils/dates';
import { sizeLabel } from '../../utils/status';

export const cartKey = (clubId) => `soms.cart.${clubId}`;
export function loadCart(clubId) {
  try {
    return JSON.parse(window.localStorage.getItem(cartKey(clubId))) || [];
  } catch {
    return [];
  }
}

function ProductCard({ product, onAdd, signedIn }) {
  const [size, setSize] = useState(product.variants.length === 1 ? product.variants[0].id : null);
  const variant = product.variants.find((v) => v.id === size);
  const price = product.displayPrice;
  const blocked = !price.eligible;
  return (
    <article className="card" style={{ overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <div className="product-art">
        <TShirt size={56} weight="duotone" aria-hidden />
      </div>
      <div className="card-body stack" style={{ flex: 1 }}>
        <div className="stack-sm" style={{ gap: 2 }}>
          <span className="subtle">{product.categoryName}</span>
          <h3>{product.name}</h3>
          <p className="subtle">{product.description}</p>
        </div>
        <div className="row" style={{ alignItems: 'baseline' }}>
          {blocked ? (
            <span className="price-now"><Money paise={product.pricePaise} /></span>
          ) : (
            <>
              <span className="price-now"><Money paise={price.finalPricePaise} /></span>
              {price.discountPaise > 0 && <span className="price-old"><Money paise={price.listPricePaise} /></span>}
            </>
          )}
        </div>
        <div className="row">
          {product.offerActive && <Badge tone="accent">Offer until {formatDateTime(product.offerEndsAt)}</Badge>}
          {price.priceRule === 'MEMBER_DISCOUNT' && <Badge tone="success">Member price</Badge>}
          {!product.availableToNonMembers && <Badge>Members only</Badge>}
          {!product.memberDiscountEligible && <Badge dot={false}>No member discount</Badge>}
        </div>
        <div className="stack-sm" style={{ marginTop: 'auto' }}>
          <span className="label" id={`size-${product.id}`}>
            Size
          </span>
          <div className="size-picker" role="group" aria-labelledby={`size-${product.id}`}>
            {product.variants.map((v) => (
              <button key={v.id} type="button" aria-pressed={size === v.id} disabled={!v.orderable} onClick={() => setSize(v.id)} aria-label={`${sizeLabel(v.sizeLabel)}${v.orderable ? `, ${v.available} left` : ', out of stock'}`}>
                {sizeLabel(v.sizeLabel)}
              </button>
            ))}
          </div>
          {variant && variant.available <= 5 && <span className="subtle" style={{ color: 'var(--color-warning)' }}>Only {variant.available} left</span>}
          {blocked && signedIn ? (
            <Alert tone="info">Available to club members only.</Alert>
          ) : (
            <Button variant="primary" icon={ShoppingCart} disabled={!variant || blocked} onClick={() => onAdd(product, variant)}>
              {variant ? 'Add to cart' : 'Choose a size'}
            </Button>
          )}
        </div>
      </div>
    </article>
  );
}

export default function Shop() {
  const { clubId } = useParams();
  const { user } = useAuth();
  const toast = useToast();
  const club = useClub(clubId);
  const id = club.data?.id;
  const [category, setCategory] = useState('all');
  const [cart, setCart] = useState(() => loadCart(clubId));
  const products = useQuery({ queryKey: ['products', id, !!user], queryFn: () => merchApi.products(id), enabled: !!id });

  useEffect(() => {
    try {
      window.localStorage.setItem(cartKey(clubId), JSON.stringify(cart));
    } catch {
      /* ignore */
    }
  }, [cart, clubId]);

  const add = (product, variant) => {
    setCart((c) => {
      const found = c.find((x) => x.variantId === variant.id);
      if (found) return c.map((x) => (x.variantId === variant.id ? { ...x, quantity: Math.min(10, x.quantity + 1) } : x));
      return [...c, { variantId: variant.id, name: product.name, sizeLabel: variant.sizeLabel, quantity: 1 }];
    });
    toast.success('Added to cart', `${product.name} · ${sizeLabel(variant.sizeLabel)}`);
  };

  const categories = [...new Set((products.data || []).map((p) => p.categoryName))];
  const count = cart.reduce((s, c) => s + c.quantity, 0);

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: 'Clubs', to: '/clubs' }, { label: club.data?.name || '…', to: club.data ? `/clubs/${club.data.slug}` : undefined }, { label: 'Shop' }]}
        title={`${club.data?.name || 'Club'} shop`}
        description="Order from your phone, pay online, collect with your pickup code."
        actions={
          <Button variant="primary" icon={ShoppingCart} to={`/shop/${clubId}/cart`}>
            Cart · <span className="num">{count}</span>
          </Button>
        }
      />
      <div className="stack">
        <div className="stack">
          {categories.length > 1 && <Segmented label="Category" value={category} onChange={setCategory} options={[{ value: 'all', label: 'All' }, ...categories.map((c) => ({ value: c, label: c }))]} />}
          <QueryState query={products} loading={<CardsSkeleton count={4} />} empty={<div className="card"><EmptyState icon={TShirt} title="Nothing on sale right now" /></div>}>
            {(list) => (
              <div className="grid grid-3">
                {list.filter((p) => category === 'all' || p.categoryName === category).map((p) => (
                  <ProductCard key={p.id} product={p} onAdd={add} signedIn={!!user} />
                ))}
              </div>
            )}
          </QueryState>
        </div>
      </div>
    </>
  );
}
