import type { RefObject } from 'react';
import {
    Bold,
    Braces,
    Code,
    Heading2,
    Image as ImageIcon,
    Italic,
    Link2,
    List,
    ListOrdered,
    Quote,
} from 'lucide-react';
import { Button } from '../ui/button';
import { applyMarkdownAction } from '../../lib/markdown';
import type { MarkdownAction } from '../../lib/markdown';

interface Props {
    target: RefObject<HTMLTextAreaElement | null>;
    onChange: (value: string) => void;
    onImage?: () => void;
    disabled?: boolean;
    className?: string;
}

const ACTIONS: { action: MarkdownAction; label: string; icon: typeof Bold }[] = [
    { action: 'heading', label: '标题', icon: Heading2 },
    { action: 'bold', label: '粗体', icon: Bold },
    { action: 'italic', label: '斜体', icon: Italic },
    { action: 'code', label: '行内代码', icon: Code },
    { action: 'codeblock', label: '代码块', icon: Braces },
    { action: 'link', label: '链接', icon: Link2 },
    { action: 'image', label: '图片', icon: ImageIcon },
    { action: 'quote', label: '引用', icon: Quote },
    { action: 'ul', label: '无序列表', icon: List },
    { action: 'ol', label: '有序列表', icon: ListOrdered },
];

export default function MarkdownToolbar({ target, onChange, onImage, disabled, className }: Props) {
    return (
        <div
            className={'markdown-toolbar' + (className ? ' ' + className : '')}
            role="toolbar"
            aria-label="Markdown 工具栏"
        >
            {ACTIONS.map(({ action, label, icon: Icon }) => (
                <Button
                    key={action}
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="markdown-toolbar-btn"
                    aria-label={label}
                    title={label}
                    disabled={disabled}
                    onClick={() => {
                        if (action === 'image' && onImage) {
                            onImage();
                            return;
                        }

                        applyMarkdownAction(target.current, action, onChange);
                    }}
                >
                    <Icon aria-hidden="true" />
                </Button>
            ))}
        </div>
    );
}
