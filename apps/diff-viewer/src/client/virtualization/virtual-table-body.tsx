import type { VirtualItem } from "@tanstack/react-virtual";
import type { ReactElement, ReactNode } from "react";

interface VirtualTableBodyProps<Row> {
  rows: Row[];
  virtualized: boolean;
  virtualItems: VirtualItem[];
  paddingTop: number;
  paddingBottom: number;
  colSpan: number;
  renderRow: (row: Row, virtualItem?: VirtualItem) => ReactNode;
}

/** 统一 table windowing 的 spacer 与可见项编排，行的业务渲染由调用方提供。 */
export const VirtualTableBody = <Row,>(props: VirtualTableBodyProps<Row>): ReactElement => {
  const { rows, virtualized, virtualItems, paddingTop, paddingBottom, colSpan, renderRow } = props;

  return (
    <tbody>
      {!virtualized && rows.map((row): ReactNode => renderRow(row))}
      {virtualized && (
        <>
          {paddingTop > 0 && (
            <tr data-virtual-spacer="top" aria-hidden="true">
              <td colSpan={colSpan} className="p-0 border-0" style={{ height: paddingTop }} />
            </tr>
          )}
          {virtualItems.map((virtualItem): ReactNode => {
            const row = rows[virtualItem.index];
            return row ? renderRow(row, virtualItem) : null;
          })}
          {paddingBottom > 0 && (
            <tr data-virtual-spacer="bottom" aria-hidden="true">
              <td colSpan={colSpan} className="p-0 border-0" style={{ height: paddingBottom }} />
            </tr>
          )}
        </>
      )}
    </tbody>
  );
};
