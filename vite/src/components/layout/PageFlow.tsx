import { Fragment, type CSSProperties, type ReactNode } from 'react';

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
    let sawGroup = false;
    const flushGroup = () => {
        if (group.length === 0) {
            return;
        }

        sawGroup = true;
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
    const hasSidebar = Boolean(sidebar);
    if (!sawGroup && sidebar) {
        rows.push({ kind: 'group', entries: [] });
    }

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
                        className={`page-flow-wide page-flow-${row.item.width}`}
                        data-block={row.item.type}
                        data-block-index={row.item.settingsIndex}
                        style={{ gridRow: rowIndex + 1 }}
                    >
                        <div className="page-flow-bleed" style={row.item.style}>
                            <div
                                className={
                                    row.item.width === 'full' ? 'page-wide-full' : 'page-wide-half'
                                }
                            >
                                {row.item.content}
                            </div>
                        </div>
                    </div>
                ) : (
                    <Fragment key={`group-${rowIndex}`}>
                        <div
                            className="page-flow-group"
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
                        {sidebar ? (
                            <aside
                                className="page-flow-sidebar"
                                style={{ gridRow: rowIndex + 1 }}
                            >
                                <div className={sidebarSticky ? 'sidebar-sticky' : ''}>
                                    {sidebar}
                                </div>
                            </aside>
                        ) : null}
                    </Fragment>
                )
            )}
        </div>
    );
}
