import type { CSSProperties, ReactNode } from 'react';

export interface PageFlowItem {
    key: string;
    type: string;
    settingsIndex: number;
    wide: boolean;
    width: 'content' | 'half' | 'full';
    style: CSSProperties;
    content: ReactNode;
}

interface Props {
    items: PageFlowItem[];
    extra?: ReactNode;
    sidebar?: ReactNode;
    sidebarPosition: 'left' | 'right';
    sidebarSticky: boolean;
    topPadding: boolean;
}

interface FlowEntry {
    key: string;
    type: string;
    settingsIndex: number;
    style: CSSProperties;
    content: ReactNode;
    animate: boolean;
}

type FlowRow =
    | { kind: 'wide'; item: PageFlowItem; index: number }
    | { kind: 'group'; entries: FlowEntry[] };

export default function PageFlow({
    items,
    extra,
    sidebar,
    sidebarPosition,
    sidebarSticky,
    topPadding,
}: Props) {
    const rows: FlowRow[] = [];
    let group: FlowEntry[] = [];
    const flushGroup = () => {
        if (group.length === 0) {
            return;
        }

        rows.push({ kind: 'group', entries: group });
        group = [];
    };

    items.forEach((item, index) => {
        if (item.wide) {
            flushGroup();
            rows.push({ kind: 'wide', item, index });
            return;
        }

        group.push({
            key: item.key,
            type: item.type,
            settingsIndex: item.settingsIndex,
            style: item.style,
            content: item.content,
            animate: true,
        });
    });

    if (extra) {
        group.push({
            key: 'page-extra',
            type: 'page-extra',
            settingsIndex: -1,
            style: {},
            content: extra,
            animate: false,
        });
    }

    flushGroup();

    const groupRows = rows.reduce<number[]>((acc, row, index) => {
        if (row.kind === 'group') {
            acc.push(index);
        }

        return acc;
    }, []);
    const firstGroupRow = groupRows.length > 0 ? groupRows[0] : -1;
    const lastGroupRow = groupRows.length > 0 ? groupRows[groupRows.length - 1] : -1;

    const hasHalfBlock = items.some((item) => item.width === 'half');
    const hasMidWideBlock = rows.some(
        (row, index) =>
            row.kind === 'wide' && index > firstGroupRow && index < lastGroupRow
    );
    const hasSidebar =
        Boolean(sidebar) && !hasHalfBlock && !hasMidWideBlock && firstGroupRow >= 0;

    const classes = [
        'page-flow',
        hasSidebar ? 'has-sidebar' : '',
        sidebarPosition === 'left' ? 'sidebar-left' : '',
        topPadding ? 'page-flow-top' : '',
    ]
        .filter(Boolean)
        .join(' ');

    return (
        <div className={classes}>
            {rows.map((row, rowIndex) =>
                row.kind === 'wide' ? (
                    <div
                        key={`${row.item.key}-${row.index}`}
                        className={`page-flow-row page-flow-wide page-flow-${row.item.width}`}
                        data-block={row.item.type}
                        data-block-index={row.item.settingsIndex}
                        style={{ gridRow: rowIndex + 1 }}
                    >
                        <div className="page-flow-bleed" style={row.item.style}>
                            <div
                                className={
                                    row.item.width === 'full'
                                        ? 'page-wide-full'
                                        : 'page-wide-half'
                                }
                            >
                                {row.item.content}
                            </div>
                        </div>
                    </div>
                ) : (
                    <div
                        key={`group-${rowIndex}`}
                        className="page-flow-row page-flow-group"
                        style={{ gridRow: rowIndex + 1 }}
                    >
                        <div className="page-flow-stack">
                            {row.entries.map((entry) =>
                                entry.animate ? (
                                    <div
                                        key={entry.key}
                                        data-block={entry.type}
                                        data-block-index={entry.settingsIndex}
                                        style={entry.style}
                                    >
                                        {entry.content}
                                    </div>
                                ) : (
                                    <div key={entry.key} style={entry.style}>
                                        {entry.content}
                                    </div>
                                )
                            )}
                        </div>
                    </div>
                )
            )}
            {hasSidebar ? (
                <aside
                    className="page-flow-sidebar"
                    style={{
                        gridRow: `${firstGroupRow + 1} / span ${lastGroupRow - firstGroupRow + 1}`,
                    }}
                >
                    <div className={sidebarSticky ? 'sidebar-sticky' : ''}>{sidebar}</div>
                </aside>
            ) : null}
        </div>
    );
}
