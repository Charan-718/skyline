// LLD §3.5 #8 — merchandise catalogue, variants, stock movements, low-stock alerts, orders.
// Schema only in Step 2 (OQ-27): payments.order_id (009) references orders. Code lands in T-60–T-63.

export async function up(knex) {
  await knex.raw(`
    CREATE TABLE product_categories (
      id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      club_id uuid NOT NULL REFERENCES clubs (id) ON DELETE RESTRICT,
      name    text NOT NULL,
      UNIQUE (id, club_id)
    );
    CREATE UNIQUE INDEX product_categories_club_name_uq ON product_categories (club_id, lower(name));

    CREATE TABLE products (
      id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      club_id                  uuid NOT NULL REFERENCES clubs (id) ON DELETE RESTRICT,
      category_id              uuid NOT NULL,
      name                     text NOT NULL,
      description              text DEFAULT '',
      price_paise              bigint NOT NULL CHECK (price_paise > 0),
      member_discount_eligible boolean DEFAULT true,
      available_to_non_members boolean DEFAULT false,
      offer_price_paise        bigint NULL CHECK (offer_price_paise > 0),
      offer_starts_at          timestamptz NULL,
      offer_ends_at            timestamptz NULL,
      status                   text NOT NULL CHECK (status IN ('DRAFT', 'ACTIVE', 'INACTIVE', 'ARCHIVED')),
      created_by               uuid NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
      created_at               timestamptz NOT NULL DEFAULT now(),
      updated_at               timestamptz NOT NULL DEFAULT now(),
      UNIQUE (id, club_id),
      FOREIGN KEY (category_id, club_id) REFERENCES product_categories (id, club_id) ON DELETE RESTRICT,
      CHECK (offer_price_paise IS NULL OR (offer_starts_at IS NOT NULL AND offer_ends_at > offer_starts_at AND offer_price_paise < price_paise))
    );
    CREATE INDEX products_club_status_idx ON products (club_id, status);
    CREATE TRIGGER products_set_updated_at BEFORE UPDATE ON products FOR EACH ROW EXECUTE FUNCTION set_updated_at();

    CREATE TABLE product_variants (
      id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      product_id          uuid NOT NULL,
      club_id             uuid NOT NULL REFERENCES clubs (id) ON DELETE RESTRICT,
      size_label          text NOT NULL CHECK (length(size_label) <= 20),
      stock_on_hand       int NOT NULL DEFAULT 0,
      stock_reserved      int NOT NULL DEFAULT 0,
      low_stock_threshold int NOT NULL CHECK (low_stock_threshold >= 0),
      is_active           boolean DEFAULT true,
      created_at          timestamptz NOT NULL DEFAULT now(),
      updated_at          timestamptz NOT NULL DEFAULT now(),
      CHECK (stock_on_hand >= 0 AND stock_reserved >= 0 AND stock_reserved <= stock_on_hand),
      UNIQUE (product_id, size_label),
      UNIQUE (id, club_id),
      FOREIGN KEY (product_id, club_id) REFERENCES products (id, club_id) ON DELETE RESTRICT
    );
    CREATE TRIGGER product_variants_set_updated_at BEFORE UPDATE ON product_variants FOR EACH ROW EXECUTE FUNCTION set_updated_at();

    CREATE TABLE orders (
      id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      club_id            uuid NOT NULL REFERENCES clubs (id) ON DELETE RESTRICT,
      user_id            uuid NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
      status             text NOT NULL CHECK (status IN ('PENDING_PAYMENT', 'CONFIRMED', 'PICKED_UP', 'CANCELLED', 'EXPIRED')),
      buyer_type         text NOT NULL CHECK (buyer_type IN ('MEMBER', 'NON_MEMBER')),
      subtotal_paise     bigint NOT NULL,
      discount_paise     bigint NOT NULL,
      total_paise        bigint NOT NULL CHECK (total_paise > 0 AND total_paise = subtotal_paise - discount_paise),
      pricing_mode       text NOT NULL CHECK (pricing_mode IN ('BEST_OF', 'STACK')),
      membership_term_id uuid NULL REFERENCES membership_terms (id) ON DELETE RESTRICT,
      pickup_code        text UNIQUE NULL,
      hold_expires_at    timestamptz NULL,
      confirmed_at       timestamptz NULL,
      picked_up_at       timestamptz NULL,
      picked_up_by       uuid NULL REFERENCES users (id) ON DELETE RESTRICT,
      cancelled_at       timestamptz NULL,
      cancel_reason      text NULL,
      created_at         timestamptz NOT NULL DEFAULT now(),
      UNIQUE (id, club_id),
      CHECK (status NOT IN ('CONFIRMED', 'PICKED_UP') OR pickup_code IS NOT NULL)
    );
    CREATE INDEX orders_club_status_created_idx ON orders (club_id, status, created_at DESC);
    CREATE INDEX orders_user_created_idx ON orders (user_id, created_at DESC);

    CREATE TABLE order_items (
      id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      order_id               uuid NOT NULL,
      club_id                uuid NOT NULL,
      product_id             uuid NOT NULL REFERENCES products (id) ON DELETE RESTRICT,
      variant_id             uuid NOT NULL,
      quantity               int NOT NULL CHECK (quantity BETWEEN 1 AND 10),
      unit_list_price_paise  bigint NOT NULL,
      unit_discount_paise    bigint NOT NULL,
      unit_final_price_paise bigint NOT NULL,
      line_total_paise       bigint NOT NULL,
      price_rule             text NOT NULL CHECK (price_rule IN ('LIST', 'MEMBER_DISCOUNT', 'OFFER', 'OFFER_PLUS_MEMBER')),
      CHECK (line_total_paise = unit_final_price_paise * quantity),
      UNIQUE (order_id, variant_id),
      FOREIGN KEY (order_id, club_id) REFERENCES orders (id, club_id) ON DELETE RESTRICT,
      FOREIGN KEY (variant_id, club_id) REFERENCES product_variants (id, club_id) ON DELETE RESTRICT
    );

    CREATE TABLE stock_movements (
      id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      variant_id    uuid NOT NULL,
      club_id       uuid NOT NULL,
      type          text NOT NULL CHECK (type IN ('RESTOCK', 'ADJUSTMENT', 'RESERVE', 'RELEASE', 'SALE')),
      quantity      int NOT NULL CHECK (quantity <> 0),
      reason        text NULL,
      order_id      uuid NULL REFERENCES orders (id) ON DELETE RESTRICT,
      actor_user_id uuid NULL REFERENCES users (id) ON DELETE RESTRICT,
      created_at    timestamptz NOT NULL DEFAULT now(),
      FOREIGN KEY (variant_id, club_id) REFERENCES product_variants (id, club_id) ON DELETE RESTRICT
    );
    CREATE INDEX stock_movements_variant_created_idx ON stock_movements (variant_id, created_at);
    CREATE TRIGGER stock_movements_append_only BEFORE UPDATE OR DELETE ON stock_movements
      FOR EACH ROW EXECUTE FUNCTION forbid_update_delete();

    CREATE TABLE low_stock_alerts (
      id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      variant_id           uuid NOT NULL,
      club_id              uuid NOT NULL,
      status               text NOT NULL CHECK (status IN ('OPEN', 'RESOLVED')),
      available_at_trigger int NOT NULL,
      threshold_at_trigger int NOT NULL,
      triggered_at         timestamptz NOT NULL DEFAULT now(),
      resolved_at          timestamptz NULL,
      FOREIGN KEY (variant_id, club_id) REFERENCES product_variants (id, club_id) ON DELETE RESTRICT
    );
    CREATE UNIQUE INDEX low_stock_alerts_open_uq ON low_stock_alerts (variant_id) WHERE status = 'OPEN';
  `);
}

export async function down(knex) {
  await knex.raw(`
    DROP TABLE low_stock_alerts;
    DROP TABLE stock_movements;
    DROP TABLE order_items;
    DROP TABLE orders;
    DROP TABLE product_variants;
    DROP TABLE products;
    DROP TABLE product_categories;
  `);
}
