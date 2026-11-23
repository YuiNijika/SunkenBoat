import type { CSSProperties, ReactNode } from 'react';
import type { PageFlowItem } from './PageFlow';

interface Props {
    items: PageFlowItem[];
    left?: ReactNode;
    right?: ReactNode;
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

export default function ForumFlow({ items, left, right, topPadding }: Props) {
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
        });
    });
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
    const singleColumn = hasHalfBlock || hasMidWideBlock || firstGroupRow < 0;
    const showLeft = Boolean(left) && !singleColumn;
    const showRight = Boolean(right) && !singleColumn;
    const railStyle = {
        '--forum-rail-row': `${firstGroupRow + 1} / span ${
            lastGroupRow - firstGroupRow + 1
        }`,
    } as CSSProperties;

    const classes = [
        'forum-flow',
        showLeft ? 'has-left' : '',
        showRight ? 'has-right' : '',
        topPadding ? 'forum-flow-top' : '',
    ]
        .filter(Boolean)
        .join(' ');

    return (
        <div className={classes}>
            {rows.map((row, rowIndex) =>
                row.kind === 'wide' ? (
                    <div
                        key={`${row.item.key}-${row.index}`}
                        className={`forum-flow-row page-flow-wide page-flow-${row.item.width} forum-flow-wide`}
                        data-block={row.item.type}
                        data-block-index={row.item.settingsIndex}
                        data-block-slot="main"
                        data-forum-slot="main"
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
                        key={`forum-group-${rowIndex}`}
                        className="forum-flow-row forum-flow-group"
                        data-block-slot="main"
                        data-forum-slot="main"
                        style={{ gridRow: rowIndex + 1 }}
                    >
                        <div className="forum-flow-stack">
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
                    </div>
                )
            )}
            {showLeft ? (
                <aside
                    className="forum-flow-left"
                    data-block-slot="left"
                    data-forum-slot="left"
                    style={railStyle}
                >
                    {left}
                </aside>
            ) : null}
            {showRight ? (
                <aside
                    className="forum-flow-right"
                    data-block-slot="right"
                    data-forum-slot="right"
                    style={railStyle}
                >
                    {right}
                </aside>
            ) : null}
        </div>
    );
}
