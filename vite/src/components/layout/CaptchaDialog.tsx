import { useEffect, useRef } from 'react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '../ui/dialog';
import CaptchaField from './CaptchaField';
import type { CaptchaValue } from './CaptchaField';
import type { UserCaptchaConfig } from '../../types';

interface Props {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    config?: UserCaptchaConfig;
    scene: 'login' | 'register' | 'comment' | 'checkin';
    onVerified: (value: CaptchaValue) => void;
    title?: string;
    description?: string;
}

export default function CaptchaDialog({
    open,
    onOpenChange,
    config,
    scene,
    onVerified,
    title = '人机验证',
    description = '点击“我不是机器人”开始验证；通过后会自动继续。',
}: Props) {
    const completed = useRef(false);

    useEffect(() => {
        completed.current = false;
    }, [open, scene]);

    const finish = (next: CaptchaValue | null) => {
        if (!next || completed.current) {
            return;
        }
        completed.current = true;
        onVerified(next);
        onOpenChange(false);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="w-[calc(100%-2rem)] max-w-[400px] gap-3 rounded-[6px] border-line bg-surface p-4 shadow-pop">
                <DialogHeader className="gap-0.5 pr-6 text-left">
                    <DialogTitle className="text-[15px] leading-tight font-semibold tracking-[-0.01em] text-ink">
                        {title}
                    </DialogTitle>
                    <DialogDescription className="text-[11px] leading-4 text-ink-faint">
                        {description}
                    </DialogDescription>
                </DialogHeader>

                <CaptchaField
                    key={`${scene}:${open ? 'open' : 'closed'}`}
                    config={config}
                    scene={scene}
                    compact
                    onChange={() => undefined}
                    onComplete={finish}
                />
            </DialogContent>
        </Dialog>
    );
}
