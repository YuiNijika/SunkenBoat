import { useEffect, useRef, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { Button } from '../ui/button';
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
    title = '完成人机验证后继续',
    description = '拖动拼图块，把图片放回缺口位置；验证完成后会自动继续。',
}: Props) {
    const [value, setValue] = useState<CaptchaValue | null>(null);
    const completed = useRef(false);
    const manual = config?.provider === 'math' || config?.provider === 'slider';

    useEffect(() => {
        setValue(null);
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
            <DialogContent className="w-[calc(100%-2rem)] max-w-[430px] gap-4 rounded-[10px] border-line bg-surface p-5 shadow-pop">
                <DialogHeader className="gap-1.5 pr-6 text-left">
                    <DialogTitle className="flex items-center gap-2 text-[18px] leading-tight font-semibold tracking-[-0.01em] text-ink">
                        <ShieldCheck className="size-4.5 text-brand" aria-hidden="true" />
                        {title}
                    </DialogTitle>
                    <DialogDescription className="text-[12px] leading-5 text-ink-mute">
                        {description}
                    </DialogDescription>
                </DialogHeader>

                <CaptchaField
                    key={`${scene}:${open ? 'open' : 'closed'}`}
                    config={config}
                    scene={scene}
                    autoStart={open}
                    compact
                    onChange={setValue}
                    onComplete={finish}
                />

                {manual ? (
                    <Button type="button" className="h-9 w-full" disabled={!value} onClick={() => finish(value)}>
                        完成验证
                    </Button>
                ) : null}
            </DialogContent>
        </Dialog>
    );
}
