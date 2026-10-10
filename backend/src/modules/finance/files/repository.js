// uploaded_files metadata rows (LLD §3.1). Written in the same transaction as the expense or
// income entry that references them.

export async function insertFile(conn, row) {
  const [created] = await conn('uploaded_files').insert(row).returning('*');
  return created;
}

export const findFile = (conn, id) => conn('uploaded_files').where({ id }).first();
