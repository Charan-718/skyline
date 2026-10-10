import { useMemo, useState } from 'react';
import { CaretDown, CaretUp, CaretUpDown } from '@phosphor-icons/react';
import { Button } from './Button';

/**
 * columns: [{ key, header, render?(row), sortValue?(row), align?: 'right', sortable?: bool, hideOnMobile?: bool }]
 */
export function DataTable({ columns, rows, rowKey = 'id', caption, initialSort, onRowClick, empty }) {
  const [sort, setSort] = useState(initialSort || null);

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.key === sort.key);
    if (!col) return rows;
    const get = col.sortValue || ((r) => r[col.key]);
    return [...rows].sort((a, b) => {
      const va = get(a);
      const vb = get(b);
      if (va == null) return 1;
      if (vb == null) return -1;
      const cmp = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb));
      return sort.dir === 'asc' ? cmp : -cmp;
    });
  }, [rows, sort, columns]);

  const toggle = (key) => setSort((s) => (s?.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }));

  if (!rows.length && empty) return empty;

  return (
    <div className="table-wrap">
      <table className="table">
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead>
          <tr>
            {columns.map((c) => {
              const active = sort?.key === c.key;
              const ariaSort = active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : c.sortable ? 'none' : undefined;
              const Icon = active ? (sort.dir === 'asc' ? CaretUp : CaretDown) : CaretUpDown;
              return (
                <th key={c.key} scope="col" aria-sort={ariaSort} className={`${c.align === 'right' ? 'right' : ''} ${c.hideOnMobile ? 'hide-mobile' : ''}`}>
                  {c.sortable ? (
                    <button type="button" className="sort-btn" onClick={() => toggle(c.key)}>
                      {c.header}
                      <Icon size={12} aria-hidden />
                    </button>
                  ) : (
                    c.header
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => (
            <tr
              key={typeof rowKey === 'function' ? rowKey(r) : r[rowKey]}
              onClick={onRowClick ? () => onRowClick(r) : undefined}
              style={onRowClick ? { cursor: 'pointer' } : undefined}
            >
              {columns.map((c) => (
                <td key={c.key} className={`${c.align === 'right' ? 'right' : ''} ${c.hideOnMobile ? 'hide-mobile' : ''}`}>
                  {c.render ? c.render(r) : r[c.key] ?? '–'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Pagination({ page, pageSize, total, onPage }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total <= pageSize) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <nav className="pagination" aria-label="Pagination">
      <span className="num">
        {from}–{to} of {total}
      </span>
      <div className="row">
        <Button size="sm" onClick={() => onPage(page - 1)} disabled={page <= 1}>
          Previous
        </Button>
        <span className="num" aria-current="page">
          Page {page} of {pages}
        </span>
        <Button size="sm" onClick={() => onPage(page + 1)} disabled={page >= pages}>
          Next
        </Button>
      </div>
    </nav>
  );
}

export function Toolbar({ children }) {
  return <div className="toolbar">{children}</div>;
}
