import { Fragment, type ReactNode } from 'react';
import type { PageFlowItem } from './PageFlow';

interface Props {
    items: PageFlowItem[];
    left?: ReactNode;
    right?: ReactNode;
    columns: string;
    topPadding: boolean;
}

interface FlowEntry {
    key: string;
    type: string;
    settingsIndex: number;
    style: PageFlowItem['style'];
    content: ReactNode;
}

type FlowRow =
    | { kind: 'wide'; item: PageFlowItem; index: number }
    | { kind: 'group'; entries: FlowEntry[] };

export default function ForumFlow({ items, left, right, columns, topPadding }: Props) {
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
        });
    });
    flushGroup();
    if (!sawGroup && (left || right)) {
        rows.push({ kind: 'group', entries: [] });
    }

    return (
        <div className={'forum-flow' + (topPadding ? ' forum-flow-top' : '')}>
            {rows.map((row, rowIndex) =>
                row.kind === 'wide' ? (
                    <div
                        key={`${row.item.key}-${row.index}`}
                        className={`page-flow-wide page-flow-${row.item.width} forum-flow-wide`}
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
                    <Fragment key={`forum-group-${rowIndex}`}>
                        <div
                            className="forum-flow-group"
                            style={{ gridRow: rowIndex + 1 }}
                        >
                            <div
                                className={
                                    'grid grid-cols-[minmax(0,1fr)] gap-[15px] ' + columns
                                }
                            >
                                {left ? (
                                    <aside
                                        className="hidden content-start gap-[15px] lg:sticky lg:top-[var(--sticky-top)] lg:order-1 lg:grid lg:self-start"
                                        data-block-slot="left"
                                        data-forum-slot="left"
                                    >
                                        {left}
                                    </aside>
                                ) : null}
                                <div
                                    className="order-1 grid min-w-0 content-start gap-[15px] lg:order-2"
                                    data-block-slot="main"
                                    data-forum-slot="main"
                                >
                                    {row.entries.map((entry) => (
                                        <div
                                            key={entry.key}
                                            data-block={entry.type}
                                            data-block-index={entry.settingsIndex}
                                            style={entry.style}
                                        >
                                            {entry.content}
                                        </div>
                                    ))}
                                </div>
                                {right ? (
                                    <aside
                                        className="order-3 grid content-start gap-[15px] lg:sticky lg:top-[var(--sticky-top)] lg:self-start"
                                        data-block-slot="right"
                                        data-forum-slot="right"
                                    >
                                        {right}
                                    </aside>
                                ) : null}
                            </div>
                        </div>
                    </Fragment>
                )
            )}
        </div>
    );
}
