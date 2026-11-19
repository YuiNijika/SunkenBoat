import { useState } from 'react';
import type { ComponentType } from 'react';
import {
    AtSign,
    Check,
    ImageDown,
    Link2,
    LoaderCircle,
    MessageCircleMore,
    MessagesSquare,
    Orbit,
    Radio,
    Send,
    Share2,
    Users,
} from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog';
import type { LucideProps } from 'lucide-react';
import type { ShareConfig } from '../../types';

type ShareIcon = ComponentType<LucideProps>;

interface Channel {
    id: string;
    label: string;
    icon: ShareIcon;
    color: string;
}

const CHANNELS: Channel[] = [
    { id: 'qzone', label: 'QQ 空间', icon: Orbit, color: '#f4b400' },
    { id: 'weibo', label: '微博', icon: Radio, color: '#e6162d' },
    { id: 'qq', label: 'QQ 好友', icon: MessageCircleMore, color: '#1296db' },
    { id: 'x', label: 'X / Twitter', icon: AtSign, color: '#111827' },
    { id: 'reddit', label: 'Reddit', icon: MessagesSquare, color: '#ff4500' },
    { id: 'facebook', label: 'Facebook', icon: Users, color: '#1877f2' },
    { id: 'telegram', label: 'Telegram', icon: Send, color: '#229ed9' },
    { id: 'poster', label: '海报分享', icon: ImageDown, color: '#de6c3c' },
    { id: 'native', label: '系统分享', icon: Share2, color: '#486b87' },
    { id: 'copy', label: '复制链接', icon: Link2, color: '#129c86' },
];

interface Props {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    config: ShareConfig;
    url: string;
    title: string;
    siteName: string;
}

function externalUrl(id: string, url: string, title: string): string {
    const encodedUrl = encodeURIComponent(url);
    const encodedTitle = encodeURIComponent(title);

    return {
        qzone: `https://sns.qzone.qq.com/cgi-bin/qzshare/cgi_qzshare_onekey?url=${encodedUrl}&title=${encodedTitle}`,
        weibo: `https://service.weibo.com/share/share.php?url=${encodedUrl}&title=${encodedTitle}`,
        qq: `https://connect.qq.com/widget/shareqq/index.html?url=${encodedUrl}&title=${encodedTitle}`,
        x: `https://twitter.com/intent/tweet?url=${encodedUrl}&text=${encodedTitle}`,
        reddit: `https://www.reddit.com/submit?url=${encodedUrl}&title=${encodedTitle}`,
        facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`,
        telegram: `https://t.me/share/url?url=${encodedUrl}&text=${encodedTitle}`,
    }[id] ?? '';
}

async function copyText(text: string): Promise<void> {
    if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return;
    }

    const field = document.createElement('textarea');
    field.value = text;
    field.setAttribute('readonly', '');
    field.style.position = 'fixed';
    field.style.opacity = '0';
    document.body.appendChild(field);
    field.select();
    document.execCommand('copy');
    field.remove();
}

function wrapText(
    context: CanvasRenderingContext2D,
    text: string,
    maxWidth: number,
    maxLines: number
): string[] {
    const lines: string[] = [];
    let line = '';

    for (const char of Array.from(text)) {
        const next = line + char;
        if (line !== '' && context.measureText(next).width > maxWidth) {
            lines.push(line);
            line = char;
            if (lines.length === maxLines) {
                return lines;
            }
            continue;
        }
        line = next;
    }

    if (line !== '' && lines.length < maxLines) {
        lines.push(line);
    }

    return lines;
}

async function createPoster(url: string, title: string, siteName: string, brand: string): Promise<Blob> {
    const canvas = document.createElement('canvas');
    canvas.width = 1080;
    canvas.height = 1440;
    const context = canvas.getContext('2d');
    if (context === null) {
        throw new Error('无法创建海报画布');
    }

    if (document.fonts?.ready) {
        await document.fonts.ready;
    }

    const gradient = context.createLinearGradient(0, 0, canvas.width, canvas.height);
    gradient.addColorStop(0, '#0f766e');
    gradient.addColorStop(0.56, '#2563eb');
    gradient.addColorStop(1, '#111827');
    context.fillStyle = gradient;
    context.fillRect(0, 0, canvas.width, canvas.height);

    context.globalAlpha = 0.16;
    context.fillStyle = '#ffffff';
    context.beginPath();
    context.arc(920, 160, 280, 0, Math.PI * 2);
    context.fill();
    context.beginPath();
    context.arc(90, 1320, 320, 0, Math.PI * 2);
    context.fill();
    context.globalAlpha = 1;

    context.fillStyle = 'rgba(255,255,255,0.13)';
    context.strokeStyle = 'rgba(255,255,255,0.28)';
    context.lineWidth = 2;
    context.beginPath();
    context.roundRect(64, 76, 952, 1288, 38);
    context.fill();
    context.stroke();

    context.fillStyle = '#ffffff';
    context.font = '600 30px "Segoe UI", "PingFang SC", sans-serif';
    context.fillText(brand || siteName, 112, 160);

    context.fillStyle = 'rgba(255,255,255,0.68)';
    context.font = '400 24px "Segoe UI", "PingFang SC", sans-serif';
    context.fillText(siteName, 112, 205);

    context.fillStyle = '#ffffff';
    context.font = '600 68px "Segoe UI", "PingFang SC", sans-serif';
    const lines = wrapText(context, title, 820, 5);
    lines.forEach((line, index) => {
        context.fillText(line, 112, 360 + index * 92);
    });

    context.fillStyle = 'rgba(255,255,255,0.16)';
    context.fillRect(112, 1024, 856, 2);

    context.fillStyle = 'rgba(255,255,255,0.78)';
    context.font = '400 24px "Segoe UI", "PingFang SC", sans-serif';
    const urlLines = wrapText(context, url, 840, 2);
    urlLines.forEach((line, index) => {
        context.fillText(line, 112, 1086 + index * 38);
    });

    context.fillStyle = 'rgba(255,255,255,0.46)';
    context.font = '400 21px "Segoe UI", "PingFang SC", sans-serif';
    context.fillText('长按识别或复制链接访问', 112, 1298);

    return new Promise((resolve, reject) => {
        canvas.toBlob((blob) => {
            if (blob === null) {
                reject(new Error('生成海报失败'));
                return;
            }
            resolve(blob);
        }, 'image/png');
    });
}

export default function ShareSheet({ open, onOpenChange, config, url, title, siteName }: Props) {
    const [status, setStatus] = useState('');
    const [posterBusy, setPosterBusy] = useState(false);
    const enabled = config.items.length > 0 ? config.items : ['copy'];
    const channels = CHANNELS.filter((channel) => enabled.includes(channel.id));

    const flash = (message: string) => {
        setStatus(message);
        window.setTimeout(() => setStatus(''), 2200);
    };

    const copy = async () => {
        try {
            await copyText(url);
            flash('链接已复制');
        } catch {
            flash('请手动复制地址栏链接');
        }
    };

    const downloadPoster = async () => {
        if (posterBusy) {
            return;
        }

        setPosterBusy(true);
        try {
            const blob = await createPoster(url, title, siteName, config.brand);
            const objectUrl = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = objectUrl;
            link.download = `${(title || siteName).replace(/[\\/:*?"<>|]/g, '-').slice(0, 48)}-分享海报.png`;
            link.click();
            window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
            flash('海报已生成');
        } catch {
            flash('海报生成失败，请稍后再试');
        } finally {
            setPosterBusy(false);
        }
    };

    const choose = async (id: string) => {
        if (id === 'copy') {
            await copy();
            return;
        }
        if (id === 'poster') {
            await downloadPoster();
            return;
        }
        if (id === 'native') {
            if (navigator.share) {
                try {
                    await navigator.share({ title, text: title, url });
                } catch {
                    // The visitor may cancel the system sheet; that is not an error.
                }
            } else {
                await copy();
            }
            return;
        }

        const target = externalUrl(id, url, title);
        if (target !== '') {
            window.open(target, '_blank', 'noopener,noreferrer,width=760,height=640');
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="share-sheet gap-0 p-0 sm:max-w-[420px]">
                <DialogHeader className="border-b border-line px-5 pb-4 pt-5 text-left">
                    <DialogTitle className="text-[17px] font-medium text-ink">分享到</DialogTitle>
                    <DialogDescription className="truncate text-[12px] text-ink-faint">
                        {title}
                    </DialogDescription>
                </DialogHeader>

                <div className="share-sheet-list">
                    {channels.map((channel) => {
                        const Icon = channel.icon;
                        const busy = channel.id === 'poster' && posterBusy;

                        return (
                            <button
                                key={channel.id}
                                type="button"
                                className="share-sheet-row"
                                disabled={busy}
                                onClick={() => void choose(channel.id)}
                            >
                                <span
                                    className="share-sheet-icon"
                                    style={{ backgroundColor: channel.color }}
                                    aria-hidden="true"
                                >
                                    {busy ? (
                                        <LoaderCircle className="size-5 animate-spin" strokeWidth={1.9} />
                                    ) : (
                                        <Icon className="size-5" strokeWidth={1.9} />
                                    )}
                                </span>
                                <span className="share-sheet-label">{channel.label}</span>
                                {channel.id === 'copy' && status === '链接已复制' ? (
                                    <Check className="ml-auto size-4 text-brand" strokeWidth={2} />
                                ) : null}
                            </button>
                        );
                    })}
                </div>

                <div className="share-sheet-footer">
                    <span className={status !== '' ? 'text-brand' : ''}>{status || '分享给更多朋友'}</span>
                </div>
            </DialogContent>
        </Dialog>
    );
}

interface ButtonProps {
    config?: ShareConfig;
    url?: string;
    title?: string;
    siteName?: string;
    className?: string;
}

export function ShareButton({
    config,
    url = typeof window === 'undefined' ? '' : window.location.href,
    title = typeof document === 'undefined' ? '' : document.title,
    siteName = '',
    className = '',
}: ButtonProps) {
    const [open, setOpen] = useState(false);

    if (!config?.enabled) {
        return null;
    }

    return (
        <>
            <button
                type="button"
                className={
                    'inline-flex items-center gap-1.5 rounded-[6px] px-2.5 py-1.5 text-[12px] text-ink-mute transition-colors hover:bg-brand-soft hover:text-brand ' +
                    className
                }
                onClick={() => setOpen(true)}
            >
                <Share2 className="size-3.5" strokeWidth={1.8} />
                分享
            </button>
            <ShareSheet
                open={open}
                onOpenChange={setOpen}
                config={config}
                url={url}
                title={title}
                siteName={siteName}
            />
        </>
    );
}

