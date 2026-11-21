import type { ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';

export default function EditorMetaBox({ title, children }: { title: string; children: ReactNode }) {
    return (
        <details className="editor-meta-box" open>
            <summary className="editor-meta-head">
                <span>{title}</span>
                <ChevronDown className="size-3.5" strokeWidth={1.8} aria-hidden="true" />
            </summary>
            <div className="editor-meta-body">{children}</div>
        </details>
    );
}
