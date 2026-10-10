import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Minus, Plus, ShoppingBag, Storefront, Trash } from '@phosphor-icons/react';
import { merchApi } from '../../api/endpoints';
import { useAuth } from '../../auth/AuthProvider';
import { useClub, useIdempotencyKey } from '../../hooks';
import { Card, PageHeader } from '../../components/layout';
import { Alert, EmptyState, LoadingState } from '../../components/feedback';
import { Button, IconButton } from '../../components/Button';
import { Money } from '../../components/domain';
import { useToast } from '../../components/Toast';
import { errorMessage } from '../../utils/errorMessages';
import { sizeLabel } from '../../utils/status';
import { cartKey, loadCart } from './Shop';

function CartPanel({ clubId, cart, setCart }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const qc = useQueryClient();
  const [getKey, renewKey] = useIdempotencyKey();
  const items = cart.map((c) => ({ variantId: c.variantId, quantity: c.quantity }));
  const quote = useQuery({ queryKey: ['merch-quote', clubId, items], queryFn: () => merchApi.quote(clubId, items), enabled: !!user && items.length > 0, retry: false });

  const place = useMutation({
    mutationFn: () => merchApi.placeOrder(clubId, { items, expectedTotalPaise: quote.data.totalPaise }, getKey()),
    onSuccess: (r) => {
      renewKey();
      setCart([]);
      qc.invalidateQueries({ queryKey: ['products', clubId] });
      navigate(`/checkout/${r.payment.id}`);
    },
    onError: (e) => {
      renewKey();
      if (e.code === 'PRICE_CHANGED' || e.code === 'OUT_OF_STOCK') quote.refetch();
      toast.error(e);
    },
  });

  const setQty = (variantId, q) => setCart((c) => c.map((x) => (x.variantId === variantId ? { ...x, quantity: Math.max(1, Math.min(10, q)) } : x)));
  const remove = (variantId) => setCart((c) => c.filter((x) => x.variantId !== variantId));

  return (
    <Card title="Your cart" description="Pickup at the club desk after payment." className="cart-panel">
      {!cart.length ? (
        <EmptyState icon={ShoppingBag} title="Your cart is empty">Pick a size and add items to order.</EmptyState>
      ) : (
        <div className="stack">
          <ul className="list" aria-label="Cart items">
            {cart.map((c) => {
              const line = quote.data?.lines.find((l) => l.variantId === c.variantId);
              return (
                <li key={c.variantId} style={{ paddingInline: 0 }} className="stack-sm">
                  <div className="row-between">
                    <div>
                      <div className="cell-title">{c.name}</div>
                      <div className="cell-sub">Size {sizeLabel(c.sizeLabel)}</div>
                    </div>
                    <IconButton icon={Trash} label={`Remove ${c.name} size ${c.sizeLabel}`} onClick={() => remove(c.variantId)} />
                  </div>
                  <div className="row-between">
                    <div className="row" style={{ gap: 4 }}>
                      <IconButton icon={Minus} size={16} label="Decrease quantity" onClick={() => setQty(c.variantId, c.quantity - 1)} disabled={c.quantity <= 1} />
                      <span className="num" aria-live="polite" style={{ minWidth: 24, textAlign: 'center' }}>{c.quantity}</span>
                      <IconButton icon={Plus} size={16} label="Increase quantity" onClick={() => setQty(c.variantId, c.quantity + 1)} disabled={c.quantity >= 10} />
                    </div>
                    {line ? <Money paise={line.lineTotalPaise} className="cell-title" /> : <span className="subtle">–</span>}
                  </div>
                </li>
              );
            })}
          </ul>
          {!user ? (
            <Button variant="primary" to={`/login?next=/shop/${clubId}`} block>
              Sign in to check out
            </Button>
          ) : quote.isPending ? (
            <LoadingState />
          ) : quote.isError ? (
            <Alert tone="warning" action={<Button size="sm" onClick={() => quote.refetch()}>Retry</Button>}>{errorMessage(quote.error)}</Alert>
          ) : (
            <>
              {quote.data.savingsPaise > 0 && (
                <div className="row-between subtle">
                  <span>You save</span>
                  <Money paise={quote.data.savingsPaise} />
                </div>
              )}
              <div className="row-between">
                <strong>Total</strong>
                <span className="price-now"><Money paise={quote.data.totalPaise} /></span>
              </div>
              <Button variant="primary" size="lg" block loading={place.isPending} onClick={() => place.mutate()}>
                Place order
              </Button>
              <p className="subtle">Stock is held for 15 minutes while you pay.</p>
            </>
          )}
        </div>
      )}
    </Card>
  );
}

export default function ShopCart() {
  const { clubId } = useParams();
  const club = useClub(clubId);
  const id = club.data?.id;
  const [cart, setCart] = useState(() => loadCart(clubId));

  useEffect(() => {
    try {
      window.localStorage.setItem(cartKey(clubId), JSON.stringify(cart));
    } catch {
      /* ignore */
    }
  }, [cart, clubId]);

  if (club.isError) {
    return (
      <div className="card">
        <EmptyState icon={Storefront} title="We couldn't find this club's shop" action={<Button variant="primary" to="/clubs">Browse clubs</Button>}>
          The link may be out of date. Open the shop again from the club's page.
        </EmptyState>
      </div>
    );
  }

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: 'Clubs', to: '/clubs' }, { label: club.data?.name || '…', to: club.data ? `/clubs/${club.data.slug}` : undefined }, { label: 'Shop', to: `/shop/${clubId}` }, { label: 'Cart' }]}
        title="Your cart"
        actions={<Button to={`/shop/${clubId}`}>Continue shopping</Button>}
      />
      <div style={{ maxWidth: 640 }}>{id && <CartPanel clubId={id} cart={cart} setCart={setCart} />}</div>
    </>
  );
}
