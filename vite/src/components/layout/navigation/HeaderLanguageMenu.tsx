import { useEffect, useState } from 'react';
import { Check, Languages } from 'lucide-react';
import { changeTranslation, prepareTranslation } from '../../../lib/translate';
import { notifyError } from '../../../lib/notify';
import { Button } from '../../ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '../../ui/dropdown-menu';
import type { SiteInfo } from '../../../types';

function persistLanguage(code: string): void {
    try {
        if (code === '') {
            window.localStorage.removeItem('ttdf:translate-language');
        } else {
            window.localStorage.setItem('ttdf:translate-language', code);
        }
    } catch {
        // Translation still works without storage.
    }
}

export default function HeaderLanguageMenu({
    translate,
}: {
    translate: SiteInfo['translate'];
}) {
    const [language, setLanguage] = useState('');

    useEffect(() => {
        if (!translate.enabled) {
            return;
        }

        let stored = '';
        try {
            stored = window.localStorage.getItem('ttdf:translate-language') ?? '';
        } catch {
            stored = '';
        }
        setLanguage(stored);

        if (stored === '') {
            return;
        }

        let active = true;
        void prepareTranslation(translate).then(() => {
            if (!active) {
                return;
            }
            changeTranslation(stored);
        });

        return () => {
            active = false;
        };
    }, [translate]);

    if (!translate.enabled) {
        return null;
    }

    const selectLanguage = async (code: string) => {
        const previous = language;
        setLanguage(code);
        persistLanguage(code);

        const api = await prepareTranslation(translate);
        if (api) {
            changeTranslation(code === '' ? translate.local : code);
        } else {
            setLanguage(previous);
            persistLanguage(previous);
            notifyError('翻译服务暂时不可用');
        }
    };

    return (
        <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
                <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-11 rounded-[8px] text-ink-mute hover:bg-surface-2 hover:text-ink-soft"
                    aria-label="切换页面语言"
                    title="切换页面语言"
                >
                    <Languages strokeWidth={1.8} aria-hidden="true" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
                align="end"
                sideOffset={8}
                className="w-44 border-line bg-surface p-1.5"
                onEscapeKeyDown={(event) => event.stopPropagation()}
            >
                <DropdownMenuLabel className="px-2 py-1 text-[11px] font-normal text-ink-faint">
                    页面语言
                </DropdownMenuLabel>
                <DropdownMenuSeparator className="bg-line" />
                <DropdownMenuItem
                    className="cursor-pointer px-2 py-1.5 text-[12px]"
                    onSelect={() => {
                        void selectLanguage('');
                    }}
                >
                    <span className="flex-1">原文</span>
                    {language === '' ? (
                        <Check className="size-3.5 text-brand" strokeWidth={2} />
                    ) : null}
                </DropdownMenuItem>
                {translate.languages.map((item) => (
                    <DropdownMenuItem
                        key={item.code}
                        className="cursor-pointer px-2 py-1.5 text-[12px]"
                        onSelect={() => {
                            void selectLanguage(item.code);
                        }}
                    >
                        <span className="flex-1">{item.label}</span>
                        {language === item.code ? (
                            <Check className="size-3.5 text-brand" strokeWidth={2} />
                        ) : null}
                    </DropdownMenuItem>
                ))}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
