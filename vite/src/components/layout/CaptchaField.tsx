import { useCallback, useEffect, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react';
import { GripVertical, RefreshCw, ShieldCheck } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import type { UserCaptchaConfig } from '../../types';

export interface CaptchaValue {
    id?: string;
    answer?: string;
    ticket?: Record<string, unknown>;
}

interface Challenge {
    id: string;
    provider: 'math' | 'slider';
    question?: string;
    image?: string;
    piece?: string;
    pieceTop?: number;
    pieceWidth?: number;
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
    const builtin = provider === 'math' || provider === 'slider';
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

            const value = updateSlide(drag.answer);
            if (value) {
                onCompleteRef.current?.(value);
            }
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

    return (
        <div
            className={
                compact
                    ? 'grid gap-2'
                    : 'grid gap-2 rounded-lg border border-line bg-surface-mute p-3'
            }
        >
            <div
                className={
                    compact
                        ? 'flex items-center justify-end gap-2'
                        : 'flex items-center justify-between gap-2'
                }
            >
                {compact ? null : (
                    <Label className="inline-flex items-center gap-1.5">
                        <ShieldCheck className="size-4" aria-hidden="true" />
                        人机验证
                    </Label>
                )}
                {started && builtin ? (
                    <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        aria-label="刷新验证码"
                        onClick={() => void refresh()}
                        disabled={loading}
                    >
                        <RefreshCw className={loading ? 'animate-spin' : ''} aria-hidden="true" />
                    </Button>
                ) : null}
            </div>

            {!started ? (
                <div className="flex flex-wrap items-center gap-2.5">
                    <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={start}
                        disabled={loading}
                    >
                        {loading ? '加载中…' : '开始验证'}
                    </Button>
                    <span className="text-xs text-ink-faint">
                        点击后加载验证码，避免页面打开时自动请求。
                    </span>
                </div>
            ) : builtin && challenge ? (
                challenge.provider === 'slider' ? (
                    <div className="grid gap-2">
                        {challenge.image && challenge.piece ? (
                            <>
                                <div
                                    ref={stageRef}
                                    className="relative aspect-[2/1] w-full select-none overflow-hidden rounded-md border border-line bg-surface-2"
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
                                            dragging ? 'cursor-grabbing' : 'cursor-grab'
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
                                    className={`relative h-10 w-full touch-none select-none overflow-hidden rounded-full border border-line bg-surface outline-none focus-visible:ring-2 focus-visible:ring-brand/35 ${
                                        dragging ? 'cursor-grabbing' : 'cursor-grab'
                                    }`}
                                >
                                    <span
                                        className="absolute inset-y-0 left-0 bg-brand-soft"
                                        style={{ width: `${(slide / maxAnswer) * 100}%` }}
                                        aria-hidden="true"
                                    />
                                    <span className="pointer-events-none absolute inset-0 grid place-items-center text-[11px] text-ink-faint">
                                        拖动滑块完成拼图
                                    </span>
                                    <span
                                        className="absolute top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-full bg-brand text-brand-foreground shadow-sm"
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
                                <p className="text-xs text-ink-faint">
                                    按住拼图块或下方滑块拖动，把图片拼回缺口位置。
                                </p>
                            </>
                        ) : (
                            <p className="text-xs text-ink-faint">验证码图片加载失败，请点击刷新重试。</p>
                        )}
                    </div>
                ) : (
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-md border border-line bg-surface px-3 py-2 font-mono text-sm text-ink">
                            {challenge.question}
                        </span>
                        <Input
                            type="text"
                            inputMode="numeric"
                            autoComplete="off"
                            value={answer}
                            aria-label="验证码答案"
                            placeholder="输入结果"
                            className="w-28"
                            onChange={(event) => submitBuiltin(event.target.value.replace(/\D/g, '').slice(0, 3))}
                            onKeyDown={(event) => {
                                if (event.key === 'Enter' && answer.trim() !== '') {
                                    event.preventDefault();
                                    submitBuiltin(answer, true);
                                }
                            }}
                        />
                    </div>
                )
            ) : builtin ? (
                <p className="text-xs text-ink-faint">{loading ? '正在加载验证码…' : '验证码暂不可用'}</p>
            ) : (
                <div id="ttdf-aliyun-captcha" className="min-h-9 text-xs text-ink-faint">
                    {loading ? '正在加载验证服务…' : '请完成服务商人机校验。'}
                </div>
            )}
            {started && (error !== '' || (!challenge && !loading && !cloudBusy)) ? (
                <Button type="button" size="sm" variant="outline" onClick={start}>
                    重新验证
                </Button>
            ) : null}
            {error !== '' ? (
                <p className="text-xs text-danger" role="alert">{error}</p>
            ) : null}
        </div>
    );
}
