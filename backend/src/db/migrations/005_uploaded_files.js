// LLD §3.5 #5 — uploaded_files (receipt metadata). Schema only in Step 2 (OQ-27); code lands in T-80.

export async function up(knex) {
  await knex.raw(`
    CREATE TABLE uploaded_files (
      id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      club_id       uuid NOT NULL REFERENCES clubs (id) ON DELETE RESTRICT,
      uploaded_by   uuid NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
      purpose       text NOT NULL CHECK (purpose IN ('RECEIPT')),
      original_name text NOT NULL,
      storage_key   text UNIQUE NOT NULL,
      mime_type     text NOT NULL CHECK (mime_type IN ('image/jpeg', 'image/png', 'application/pdf')),
      size_bytes    int NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 5242880),
      sha256        char(64) NOT NULL,
      created_at    timestamptz NOT NULL DEFAULT now()
    );
  `);
}

export async function down(knex) {
  await knex.raw('DROP TABLE uploaded_files');
}
