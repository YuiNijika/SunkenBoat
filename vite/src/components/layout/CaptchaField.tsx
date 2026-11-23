import { useCallback, useEffect, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react';
import { GripVertical, RefreshCw } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import type { UserCaptchaConfig } from '../../types';

export interface CaptchaValue {
    id?: string;
    answer?: string;
    ticket?: Record<string, unknown>;
}

interface Challenge {
    id: string;
    provider: 'math' | 'slider' | 'image_text' | 'image_select';
    question?: string;
    prompt?: string;
    image?: string;
    piece?: string;
    pieceTop?: number;
    pieceWidth?: number;
    length?: number;
    options?: Array<{ id: string; image: string }>;
    source?: 'builtin' | 'custom';
    target?: string | null;
    expiresIn: number;
}

interface Props {
    config?: UserCaptchaConfig;
    scene: 'login' | 'register' | 'comment' | 'checkin';
    onChange: (value: CaptchaValue | null) => void;
    onComplete?: (value: CaptchaValue) => void;
    autoStart?: boolean;
    compact?: boolean;
}

declare global {
    interface Window {
        initGeetest4?: (
            options: Record<string, unknown>,
            callback: (captcha: {
                showCaptcha: () => void;
                onSuccess: (callback: () => void) => void;
                getValidate: () => Record<string, unknown>;
            }) => void
        ) => void;
        TencentCaptcha?: new (
            appId: string,
            callback: (result: Record<string, unknown>) => void,
            options?: Record<string, unknown>
        ) => { show: () => void };
        AWSC?: {
            use: (
                name: string,
                callback: (state: unknown, module: Record<string, unknown>) => void
            ) => void;
        };
    }
}

function loadScript(id: string, src: string): Promise<void> {
    return new Promise((resolve, reject) => {
        const existing = document.getElementById(id) as HTMLScriptElement | null;
        if (existing) {
            if (existing.dataset.loaded === '1') {
                resolve();
                return;
            }
            existing.addEventListener('load', () => resolve(), { once: true });
            existing.addEventListener('error', () => reject(new Error('验证码组件加载失败')), {
                once: true,
            });
            return;
        }

        const script = document.createElement('script');
        script.id = id;
        script.src = src;
        script.async = true;
        script.onload = () => {
            script.dataset.loaded = '1';
            resolve();
        };
        script.onerror = () => reject(new Error('验证码组件加载失败'));
        document.head.appendChild(script);
    });
}

function RecaptchaMark() {
    return (
        <svg viewBox="0 0 32 32" className="size-7" aria-hidden="true">
            <path
                d="M16 4.5a11.5 11.5 0 0 1 9.9 5.7"
                fill="none"
                stroke="#4285f4"
                strokeLinecap="round"
                strokeWidth="2.8"
            />
            <path
                d="M26.8 3.8v7.2h-7.2"
                fill="none"
                stroke="#4285f4"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2.8"
            />
            <path
                d="M16 27.5a11.5 11.5 0 0 1-9.9-5.7"
                fill="none"
                stroke="#5f6368"
                strokeLinecap="round"
                strokeWidth="2.8"
            />
            <path
                d="M5.2 28.2V21h7.2"
                fill="none"
                stroke="#5f6368"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2.8"
            />
            <circle cx="16" cy="16" r="4.2" fill="none" stroke="#4285f4" strokeWidth="2.4" />
        </svg>
    );
}

export default function CaptchaField({
    config,
    scene,
    onChange,
    onComplete,
    autoStart = false,
    compact = false,
}: Props) {
    const enabled = Boolean(config?.enabled && config.scenes.includes(scene));
    const provider = config?.provider ?? 'math';
    const builtin =
        provider === 'math'
        || provider === 'slider'
        || provider === 'image_text'
        || provider === 'image_select';
    const [started, setStarted] = useState(false);
    const [challenge, setChallenge] = useState<Challenge | null>(null);
    const [answer, setAnswer] = useState('');
    const [slide, setSlide] = useState(0);
    const [dragging, setDragging] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [cloudBusy, setCloudBusy] = useState(false);
    const stageRef = useRef<HTMLDivElement>(null);
    const dragRef = useRef<{
        pointerId: number;
        startX: number;
        startAnswer: number;
        answer: number;
        width: number;
        moved: boolean;
    } | null>(null);
    const valueRef = useRef<CaptchaValue | null>(null);
    const autoStartRef = useRef('');
    const geetest = useRef<{
        showCaptcha: () => void;
        onSuccess: (callback: () => void) => void;
        getValidate: () => Record<string, unknown>;
    } | null>(null);
    const onChangeRef = useRef(onChange);
    const onCompleteRef = useRef(onComplete);
    onChangeRef.current = onChange;
    onCompleteRef.current = onComplete;

    const pieceWidth = challenge?.pieceWidth ?? 17.5;
    const maxAnswer = Math.max(1, 100 - pieceWidth);

    const refresh = useCallback(async () => {
        if (!enabled || !builtin || !config?.challenge) {
            return;
        }
        setLoading(true);
        setError('');
        setAnswer('');
        setSlide(0);
        setDragging(false);
        dragRef.current = null;
        valueRef.current = null;
        onChangeRef.current(null);
        try {
            const response = await fetch(config.challenge, {
                credentials: 'same-origin',
                headers: { Accept: 'application/json' },
            });
            const payload = await response.json().catch(() => null);
            const next = payload?.data?.challenge as Challenge | undefined;
            if (!response.ok || !next?.id) {
                throw new Error(payload?.message || '验证码加载失败');
            }
            setChallenge(next);
        } catch (reason) {
            setChallenge(null);
            setError(reason instanceof Error ? reason.message : '验证码加载失败');
        } finally {
            setLoading(false);
        }
    }, [builtin, config?.challenge, enabled]);

    useEffect(() => {
        setStarted(false);
        setChallenge(null);
        setAnswer('');
        setSlide(0);
        setDragging(false);
        dragRef.current = null;
        valueRef.current = null;
        autoStartRef.current = '';
        setCloudBusy(false);
        setError('');
        onChangeRef.current(null);
    }, [enabled, provider, scene]);

    const updateSlide = useCallback(
        (value: number, emit = true): CaptchaValue | null => {
            const clamped = Math.max(0, Math.min(maxAnswer, value));
            const formatted = clamped.toFixed(2);
            const nextValue =
                challenge && clamped > 0.05
                    ? { id: challenge.id, answer: formatted }
                    : null;

            setSlide(clamped);
            setAnswer(formatted);
            if (!emit) {
                return nextValue;
            }
            valueRef.current = nextValue;
            onChangeRef.current(nextValue);

            return nextValue;
        },
        [challenge, maxAnswer]
    );

    useEffect(() => {
        if (!dragging) {
            return;
        }

        const move = (event: PointerEvent) => {
            const drag = dragRef.current;
            if (!drag || event.pointerId !== drag.pointerId) {
                return;
            }

            event.preventDefault();
            const delta = ((event.clientX - drag.startX) / drag.width) * 100;
            if (Math.abs(event.clientX - drag.startX) > 2) {
                drag.moved = true;
            }
            drag.answer = drag.startAnswer + delta;
            updateSlide(drag.answer, false);
        };
        const end = (event: PointerEvent) => {
            if (!dragRef.current || event.pointerId !== dragRef.current.pointerId) {
                return;
            }
            const drag = dragRef.current;
            dragRef.current = null;
            setDragging(false);

            if (event.type !== 'pointerup') {
                updateSlide(drag.startAnswer, false);
                valueRef.current = null;
                onChangeRef.current(null);
                return;
            }

            if (!drag.moved) {
                valueRef.current = null;
                onChangeRef.current(null);
                return;
            }

            updateSlide(drag.answer);
        };

        window.addEventListener('pointermove', move, { passive: false });
        window.addEventListener('pointerup', end);
        window.addEventListener('pointercancel', end);

        return () => {
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', end);
            window.removeEventListener('pointercancel', end);
        };
    }, [dragging, updateSlide]);

    const beginSlideDrag = (event: ReactPointerEvent<HTMLElement>) => {
        if (
            challenge?.provider !== 'slider'
            || !stageRef.current
            || (event.pointerType === 'mouse' && event.button !== 0)
        ) {
            return;
        }

        event.preventDefault();
        dragRef.current = {
            pointerId: event.pointerId,
            startX: event.clientX,
            startAnswer: slide,
            answer: slide,
            width: Math.max(1, stageRef.current.clientWidth),
            moved: false,
        };
        setDragging(true);
    };

    const handleSlideKey = (event: ReactKeyboardEvent<HTMLElement>) => {
        const step = event.shiftKey ? 10 : 2;
        let next = slide;

        if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
            next -= step;
        } else if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
            next += step;
        } else if (event.key === 'Home') {
            next = 0;
        } else if (event.key === 'End') {
            next = maxAnswer;
        } else {
            return;
        }

        event.preventDefault();
        updateSlide(next);
    };

    const submitBuiltin = (nextAnswer: string, complete = false) => {
        setAnswer(nextAnswer);
        if (!challenge) {
            onChangeRef.current(null);
            return;
        }
        const value = {
            id: challenge.id,
            answer: nextAnswer,
        };
        valueRef.current = value;
        onChangeRef.current(value);
        if (complete) {
            onCompleteRef.current?.(value);
        }
    };

    const finishCloud = (value: CaptchaValue) => {
        valueRef.current = value;
        onChangeRef.current(value);
        onCompleteRef.current?.(value);
    };

    const openCloud = () => {
        if (cloudBusy) {
            return;
        }
        setError('');
        onChangeRef.current(null);

        if (provider === 'geetest' && window.initGeetest4 && config?.geetestId) {
            setCloudBusy(true);
            if (!geetest.current) {
                window.initGeetest4(
                    { captchaId: config.geetestId, product: 'bind' },
                    (instance) => {
                        geetest.current = instance;
                        instance.onSuccess(() => {
                            const payload = instance.getValidate();
                            finishCloud({ ticket: payload });
                            setCloudBusy(false);
                        });
                        instance.showCaptcha();
                    }
                );
            } else {
                geetest.current.showCaptcha();
            }
            return;
        }

        if (provider === 'tencent' && window.TencentCaptcha && config?.tencentAppId) {
            const instance = new window.TencentCaptcha(config.tencentAppId, (result) => {
                if (Number(result.ret) === 0) {
                    finishCloud({
                        ticket: {
                            ticket: result.ticket,
                            randstr: result.randstr,
                        },
                    });
                } else {
                    setError('人机验证已取消');
                }
            });
            instance.show();
            return;
        }

        if (provider === 'aliyun' && window.AWSC && config?.aliyunAppKey) {
            setCloudBusy(true);
            window.AWSC.use('nc', (_state, module) => {
                const init = module.init as ((options: Record<string, unknown>) => void) | undefined;
                if (!init) {
                    setCloudBusy(false);
                    setError('阿里云验证码初始化失败');
                    return;
                }
                init({
                    appkey: config.aliyunAppKey,
                    scene: config.aliyunScene || 'nc',
                    render: '#ttdf-aliyun-captcha',
                    success: (data: Record<string, unknown>) => {
                        finishCloud({
                            ticket: {
                                sessionId: data.sessionId ?? data.csessionid ?? '',
                                sig: data.sig ?? '',
                                token: data.token ?? '',
                            },
                        });
                        setCloudBusy(false);
                    },
                    fail: () => {
                        setCloudBusy(false);
                        setError('人机验证未通过');
                    },
                });
            });
            return;
        }

        setError('验证码服务配置不完整');
    };

    const start = () => {
        if (!enabled || loading || cloudBusy) {
            return;
        }

        setError('');
        setAnswer('');
        setChallenge(null);
        onChangeRef.current(null);
        setStarted(true);

        if (builtin) {
            setSlide(0);
            setDragging(false);
            dragRef.current = null;
            valueRef.current = null;
            void refresh();
            return;
        }

        setLoading(true);
        const loaded = provider === 'geetest'
            ? loadScript('ttdf-geetest4', 'https://static.geetest.com/v4/gt4.js')
            : provider === 'tencent'
              ? loadScript('ttdf-tencent-captcha', 'https://turing.captcha.qcloud.com/TCaptcha.js')
              : provider === 'aliyun'
                ? loadScript('ttdf-aliyun-awsc', 'https://g.alicdn.com/AWSC/AWSC/awsc.js')
                : Promise.reject(new Error('未知验证码服务'));

        void loaded
            .then(() => {
                setLoading(false);
                window.requestAnimationFrame(openCloud);
            })
            .catch((reason: unknown) => {
                setError(reason instanceof Error ? reason.message : '验证码组件加载失败');
            })
            .finally(() => {
                setLoading(false);
            });
    };

    useEffect(() => {
        if (!autoStart || !enabled) {
            return;
        }

        const key = `${provider}:${scene}`;
        if (autoStartRef.current === key) {
            return;
        }
        autoStartRef.current = key;
        start();
    }, [autoStart, enabled, provider, scene]);

    if (!enabled) {
        return null;
    }

    const canVerify =
        challenge?.provider === 'slider' ? slide > 0.05 : answer.trim() !== '';

    const verify = () => {
        if (!challenge) {
            return;
        }
        if (challenge.provider === 'slider') {
            const value = valueRef.current ?? updateSlide(slide);
            if (value) {
                onCompleteRef.current?.(value);
            }
            return;
        }
        if (answer.trim() === '') {
            return;
        }
        submitBuiltin(answer, true);
    };

    return (
        <div
            className={`overflow-hidden rounded-[3px] border border-[#d3d3d3] bg-white text-[#202124] dark:border-[#5f6368] dark:bg-[#222] dark:text-[#e8eaed] ${
                compact ? '' : 'shadow-[0_0_4px_rgba(0,0,0,0.12)]'
            }`}
        >
            <div className="flex min-h-[74px] items-center justify-between gap-3 px-3 py-2">
                <button
                    type="button"
                    onClick={start}
                    disabled={loading || cloudBusy || started}
                    className="flex min-w-0 items-center gap-3 text-left disabled:cursor-default"
                >
                    <span
                        className="grid size-[28px] shrink-0 place-items-center rounded-[2px] border-2 border-[#c1c1c1] bg-white dark:border-[#5f6368] dark:bg-[#2d2d2d]"
                        aria-hidden="true"
                    >
                        {loading || cloudBusy ? (
                            <span className="size-4 animate-spin rounded-full border-2 border-[#4285f4] border-t-transparent" />
                        ) : null}
                    </span>
                    <span className="text-[14px] leading-5">我不是机器人</span>
                </button>
                <div className="flex shrink-0 flex-col items-end leading-none">
                    <RecaptchaMark />
                    <span className="mt-1 text-[9px] text-[#9aa0a6]">reCAPTCHA</span>
                    <span className="mt-0.5 text-[7px] text-[#9aa0a6]">隐私条款 - 使用条款</span>
                </div>
            </div>

            {started ? (
                <div className="border-t border-[#e5e5e5] dark:border-[#3c4043]">
                    {builtin ? (
                        challenge ? (
                            <>
                                <div className="flex items-center justify-between bg-[#4285f4] px-3 py-2 text-white">
                                    <span className="text-[13px]">请完成验证</span>
                                    <button
                                        type="button"
                                        aria-label="刷新验证码"
                                        onClick={() => void refresh()}
                                        disabled={loading}
                                        className="rounded p-0.5 hover:bg-white/15 disabled:opacity-60"
                                    >
                                        <RefreshCw
                                            className={`size-4 ${loading ? 'animate-spin' : ''}`}
                                            aria-hidden="true"
                                        />
                                    </button>
                                </div>
                                <div className="bg-white p-3 text-[#202124] dark:bg-[#222] dark:text-[#e8eaed]">
                                    {challenge.provider === 'slider' ? (
                                        <div className="grid gap-2">
                                            {challenge.image && challenge.piece ? (
                                                <>
                                                    <div
                                                        ref={stageRef}
                                                        className="relative aspect-[2/1] w-full touch-none select-none overflow-hidden rounded-[2px] border border-[#d3d3d3] dark:border-[#5f6368]"
                                                    >
                                                        <img
                                                            src={challenge.image}
                                                            alt=""
                                                            aria-hidden="true"
                                                            draggable={false}
                                                            className="absolute inset-0 size-full object-cover"
                                                        />
                                                        <img
                                                            src={challenge.piece}
                                                            alt=""
                                                            aria-hidden="true"
                                                            draggable={false}
                                                            onPointerDown={beginSlideDrag}
                                                            className={`absolute touch-none drop-shadow-[0_2px_5px_rgba(0,0,0,0.28)] ${
                                                                dragging
                                                                    ? 'cursor-grabbing'
                                                                    : 'cursor-grab'
                                                            }`}
                                                            style={{
                                                                left: `${slide}%`,
                                                                top: `${challenge.pieceTop ?? 30}%`,
                                                                width: `${pieceWidth}%`,
                                                            }}
                                                        />
                                                    </div>
                                                    <div
                                                        role="slider"
                                                        tabIndex={0}
                                                        aria-label="拖动滑块完成图片拼图"
                                                        aria-valuemin={0}
                                                        aria-valuemax={Math.round(maxAnswer)}
                                                        aria-valuenow={Math.round(slide)}
                                                        aria-valuetext={`已拖动 ${Math.round((slide / maxAnswer) * 100)}%`}
                                                        onPointerDown={beginSlideDrag}
                                                        onKeyDown={handleSlideKey}
                                                        className={`relative h-10 w-full touch-none select-none overflow-hidden rounded-[2px] border border-[#d3d3d3] bg-[#f1f3f4] outline-none focus-visible:ring-2 focus-visible:ring-[#4285f4]/40 dark:border-[#5f6368] dark:bg-[#2d2d2d] ${
                                                            dragging
                                                                ? 'cursor-grabbing'
                                                                : 'cursor-grab'
                                                        }`}
                                                    >
                                                        <span
                                                            className="absolute inset-y-0 left-0 bg-[#4285f4]/20"
                                                            style={{ width: `${(slide / maxAnswer) * 100}%` }}
                                                            aria-hidden="true"
                                                        />
                                                        <span className="pointer-events-none absolute inset-0 grid place-items-center text-[11px] text-[#5f6368] dark:text-[#9aa0a6]">
                                                            拖动滑块完成拼图
                                                        </span>
                                                        <span
                                                            className="absolute top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-full bg-[#4285f4] text-white shadow-sm"
                                                            style={{
                                                                left: `calc(${(slide / maxAnswer) * 100}% - ${
                                                                    (slide / maxAnswer) * 32
                                                                }px)`,
                                                            }}
                                                            aria-hidden="true"
                                                        >
                                                            <GripVertical className="size-4" />
                                                        </span>
                                                    </div>
                                                    <p className="text-[11px] text-[#5f6368] dark:text-[#9aa0a6]">
                                                        按住拼图块或下方滑块拖动，把图片拼回缺口位置后点击“验证”。
                                                    </p>
                                                </>
                                            ) : (
                                                <p className="text-[11px] text-[#5f6368] dark:text-[#9aa0a6]">
                                                    验证码图片加载失败，请点击刷新重试。
                                                </p>
                                            )}
                                        </div>
                                    ) : challenge.provider === 'image_select' ? (
                                        <div className="grid gap-2.5">
                                            {challenge.target ? (
                                                <div className="flex items-center gap-2 rounded-[2px] border border-[#e5e5e5] bg-[#f9f9f9] p-2 dark:border-[#3c4043] dark:bg-[#2d2d2d]">
                                                    <img
                                                        src={challenge.target}
                                                        alt="示例图片"
                                                        draggable={false}
                                                        className="size-14 shrink-0 rounded-[2px] object-contain"
                                                    />
                                                    <p className="text-[11px] leading-4 text-[#5f6368] dark:text-[#9aa0a6]">
                                                        示例图片
                                                    </p>
                                                </div>
                                            ) : null}
                                            <p className="text-[13px]">
                                                {challenge.prompt ?? '请选择符合提示的图片'}
                                            </p>
                                            <div className="grid grid-cols-3 gap-2">
                                                {(challenge.options ?? []).map((option) => {
                                                    const selected = answer === option.id;

                                                    return (
                                                        <button
                                                            key={option.id}
                                                            type="button"
                                                            aria-pressed={selected}
                                                            aria-label={
                                                                selected ? '已选择该图片' : '选择该图片'
                                                            }
                                                            className={`relative aspect-square overflow-hidden rounded-[2px] border bg-white transition dark:bg-[#2d2d2d] ${
                                                                selected
                                                                    ? 'border-[#4285f4] ring-2 ring-[#4285f4]/40'
                                                                    : 'border-[#d3d3d3] hover:border-[#4285f4]/60 dark:border-[#5f6368]'
                                                            }`}
                                                            onClick={() => submitBuiltin(option.id)}
                                                        >
                                                            <img
                                                                src={option.image}
                                                                alt=""
                                                                aria-hidden="true"
                                                                draggable={false}
                                                                className="size-full object-contain p-1"
                                                            />
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                            <p className="text-[11px] text-[#5f6368] dark:text-[#9aa0a6]">
                                                选择后点击右下角“验证”。
                                            </p>
                                        </div>
                                    ) : challenge.provider === 'image_text' ? (
                                        <div className="grid gap-2.5">
                                            {challenge.image ? (
                                                <img
                                                    src={challenge.image}
                                                    alt="图片验证码"
                                                    draggable={false}
                                                    className="w-full rounded-[2px] border border-[#d3d3d3] bg-white dark:border-[#5f6368] dark:bg-[#2d2d2d]"
                                                />
                                            ) : (
                                                <p className="text-[11px] text-[#5f6368] dark:text-[#9aa0a6]">
                                                    验证码图片加载失败，请点击刷新重试。
                                                </p>
                                            )}
                                            <div className="flex flex-wrap items-center gap-2">
                                                <Input
                                                    type="text"
                                                    autoComplete="off"
                                                    autoCapitalize="characters"
                                                    value={answer}
                                                    maxLength={challenge.length ?? 6}
                                                    aria-label="图片字符验证码"
                                                    placeholder="输入图中字符"
                                                    className="h-9 w-40 rounded-[2px] border-[#d3d3d3] bg-white font-mono text-[#202124] tracking-[0.2em] uppercase focus-visible:border-[#4285f4] focus-visible:ring-1 focus-visible:ring-[#4285f4] dark:border-[#5f6368] dark:bg-[#2d2d2d] dark:text-[#e8eaed]"
                                                    onChange={(event) =>
                                                        submitBuiltin(
                                                            event.target.value
                                                                .replace(/[^a-zA-Z0-9]/g, '')
                                                                .toUpperCase()
                                                                .slice(0, challenge.length ?? 6)
                                                        )
                                                    }
                                                    onKeyDown={(event) => {
                                                        if (
                                                            event.key === 'Enter'
                                                            && answer.trim() !== ''
                                                        ) {
                                                            event.preventDefault();
                                                            submitBuiltin(answer, true);
                                                        }
                                                    }}
                                                />
                                            </div>
                                            <p className="text-[11px] text-[#5f6368] dark:text-[#9aa0a6]">
                                                {challenge.prompt
                                                    ?? '请输入图片中的字符（不区分大小写）。'}
                                                输入后按 Enter，或点击“验证”。
                                            </p>
                                        </div>
                                    ) : (
                                        <div className="flex flex-wrap items-center gap-2">
                                            <span className="rounded-[2px] border border-[#d3d3d3] bg-[#f9f9f9] px-3 py-2 font-mono text-sm text-[#202124] dark:border-[#5f6368] dark:bg-[#2d2d2d] dark:text-[#e8eaed]">
                                                {challenge.question}
                                            </span>
                                            <Input
                                                type="text"
                                                inputMode="numeric"
                                                autoComplete="off"
                                                value={answer}
                                                aria-label="验证码答案"
                                                placeholder="输入结果"
                                                className="h-9 w-28 rounded-[2px] border-[#d3d3d3] bg-white text-[#202124] focus-visible:border-[#4285f4] focus-visible:ring-1 focus-visible:ring-[#4285f4] dark:border-[#5f6368] dark:bg-[#2d2d2d] dark:text-[#e8eaed]"
                                                onChange={(event) => {
                                                    const raw = event.target.value.replace(
                                                        /[^\d-]/g,
                                                        ''
                                                    );
                                                    const digits = raw
                                                        .replace(/-/g, '')
                                                        .slice(0, 3);
                                                    submitBuiltin(
                                                        (raw.startsWith('-') ? '-' : '') + digits
                                                    );
                                                }}
                                                onKeyDown={(event) => {
                                                    if (
                                                        event.key === 'Enter'
                                                        && answer.trim() !== ''
                                                    ) {
                                                        event.preventDefault();
                                                        submitBuiltin(answer, true);
                                                    }
                                                }}
                                            />
                                        </div>
                                    )}
                                </div>
                                <div className="flex items-center justify-between border-t border-[#e5e5e5] bg-[#f9f9f9] px-3 py-2 dark:border-[#3c4043] dark:bg-[#2d2d2d]">
                                    <button
                                        type="button"
                                        aria-label="换一张"
                                        onClick={() => void refresh()}
                                        disabled={loading}
                                        className="rounded p-1 text-[#5f6368] hover:bg-black/5 disabled:opacity-50 dark:text-[#9aa0a6] dark:hover:bg-white/10"
                                    >
                                        <RefreshCw
                                            className={`size-[18px] ${loading ? 'animate-spin' : ''}`}
                                            aria-hidden="true"
                                        />
                                    </button>
                                    <Button
                                        type="button"
                                        size="sm"
                                        onClick={verify}
                                        disabled={!canVerify || loading}
                                        className="h-8 rounded-[2px] bg-[#4285f4] px-5 text-white hover:bg-[#3367d6] disabled:opacity-50"
                                    >
                                        验证
                                    </Button>
                                </div>
                            </>
                        ) : (
                            <div className="flex items-center justify-between gap-3 px-3 py-3 text-xs text-[#5f6368] dark:text-[#9aa0a6]">
                                <span>
                                    {loading ? '正在加载验证码…' : '验证码暂不可用，请重试。'}
                                </span>
                                {loading ? null : (
                                    <button
                                        type="button"
                                        onClick={start}
                                        className="text-[#4285f4] hover:underline"
                                    >
                                        重试
                                    </button>
                                )}
                            </div>
                        )
                    ) : (
                        <>
                            <div className="flex items-center justify-between bg-[#4285f4] px-3 py-2 text-white">
                                <span className="text-[13px]">请完成验证</span>
                                <span className="text-[11px] text-white/80">
                                    {provider === 'geetest'
                                        ? 'Geetest'
                                        : provider === 'tencent'
                                          ? 'Tencent'
                                          : 'Aliyun'}
                                </span>
                            </div>
                            <div className="bg-white p-3 text-[#202124] dark:bg-[#222] dark:text-[#e8eaed]">
                                <p className="text-[12px] leading-5 text-[#5f6368] dark:text-[#9aa0a6]">
                                    {loading
                                        ? '正在加载验证服务…'
                                        : '验证窗口会在本页打开，完成后自动继续。'}
                                </p>
                                <div
                                    id="ttdf-aliyun-captcha"
                                    className="mt-2 min-h-8"
                                />
                            </div>
                        </>
                    )}
                </div>
            ) : null}
            {error !== '' ? (
                <div
                    className="border-t border-[#e5e5e5] px-3 py-2 text-xs text-[#d93025] dark:border-[#3c4043] dark:text-[#f28b82]"
                    role="alert"
                >
                    {error}
                </div>
            ) : null}
        </div>
    );
}
