import { useMemo, useState } from 'react';
import { ChevronUp, ChevronDown, Search } from 'lucide-react';

export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => React.ReactNode;
  sortValue?: (row: T) => number | string;
  align?: 'left' | 'right' | 'center';
  className?: string;
}

export default function DataTable<T>({
  columns,
  rows,
  searchable = true,
  searchPlaceholder = 'Search…',
  searchFn,
  defaultSortKey,
  defaultSortDir = 'desc',
  rowKey,
  onRowClick,
  emptyMessage = 'No data',
  footer,
}: {
  columns: Column<T>[];
  rows: T[];
  searchable?: boolean;
  searchPlaceholder?: string;
  searchFn?: (row: T, query: string) => boolean;
  defaultSortKey?: string;
  defaultSortDir?: 'asc' | 'desc';
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  emptyMessage?: string;
  footer?: React.ReactNode;
}) {
  const [query, setQuery] = useState('');
  const [sortKey, setSortKey] = useState(defaultSortKey ?? columns[0]?.key);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>(defaultSortDir);

  const filtered = useMemo(() => {
    if (!query || !searchFn) return rows;
    return rows.filter((r) => searchFn(r, query.toLowerCase()));
  }, [rows, query, searchFn]);

  const sorted = useMemo(() => {
    const col = columns.find((c) => c.key === sortKey);
    if (!col?.sortValue) return filtered;
    const copy = [...filtered];
    copy.sort((a, b) => {
      const av = col.sortValue!(a);
      const bv = col.sortValue!(b);
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return copy;
  }, [filtered, sortKey, sortDir, columns]);

  function toggleSort(key: string) {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(key);
      setSortDir('desc');
    }
  }

  return (
    <div>
      {searchable && searchFn && (
        <div className="relative mb-3 max-w-xs">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={searchPlaceholder} className="input pl-9" />
        </div>
      )}
      <div className="overflow-x-auto -mx-1">
        <table className="table-base min-w-full">
          <thead>
            <tr>
              {columns.map((c) => (
                <th
                  key={c.key}
                  className={c.className ?? (c.align === 'right' ? 'text-right' : c.align === 'center' ? 'text-center' : '')}
                  onClick={() => c.sortValue && toggleSort(c.key)}
                  style={{ cursor: c.sortValue ? 'pointer' : undefined }}
                >
                  <span className="inline-flex items-center gap-1">
                    {c.header}
                    {c.sortValue && sortKey === c.key && (sortDir === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />)}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="text-center py-8 text-ink-muted">
                  {emptyMessage}
                </td>
              </tr>
            )}
            {sorted.map((row) => (
              <tr
                key={rowKey(row)}
                onClick={() => onRowClick?.(row)}
                className={onRowClick ? 'cursor-pointer hover:bg-black/[0.03] dark:hover:bg-white/[0.03]' : ''}
              >
                {columns.map((c) => (
                  <td key={c.key} className={c.className ?? (c.align === 'right' ? 'text-right' : c.align === 'center' ? 'text-center' : '')}>
                    {c.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {footer}
    </div>
  );
}
