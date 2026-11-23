import type { ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Badge } from '../../ui/badge';

interface TopbarProps {
    backHref: string;
    documentLabel: string;
    statusLabel: string;
    statusActive?: boolean;
    dirty?: boolean;
    actions: ReactNode;
    note: ReactNode;
    shortcut: ReactNode;
}

export function EditorTopbar({
    backHref,
    documentLabel,
    statusLabel,
    statusActive = false,
    dirty = false,
    actions,
    note,
    shortcut,
}: TopbarProps) {
    return (
        <header className="editor-topbar">
            <div className="editor-topbar-row">
                <div className="editor-topbar-left">
                    <a className="editor-back" href={backHref}>
                        <ArrowLeft aria-hidden="true" />
                        <span>内容管理</span>
                    </a>
                    <span className="editor-topbar-sep" aria-hidden="true">
                        /
                    </span>
                    <span className="editor-topbar-doc">{documentLabel}</span>
                    <Badge variant={statusActive ? 'default' : 'secondary'}>
                        {statusLabel}
                    </Badge>
                    {dirty ? <span className="editor-dirty">未保存</span> : null}
                </div>
                <div className="editor-toolbar-actions">{actions}</div>
            </div>
            <div className="editor-topbar-sub">
                <span>{note}</span>
                <span className="editor-shortcut">{shortcut}</span>
            </div>
        </header>
    );
}

export function EditorMobileBar({ children }: { children: ReactNode }) {
    return <div className="editor-mobile-bar">{children}</div>;
}
