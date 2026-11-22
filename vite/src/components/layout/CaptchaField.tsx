import { useCallback, useEffect, useRef, useState } from 'react';
import { RefreshCw, ShieldCheck } from 'lucide-react';
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
    min?: number;
    max?: number;
    expiresIn: number;
}

interface Props {
    config?: UserCaptchaConfig;
    scene: 'login' | 'register' | 'comment' | 'checkin';
    onChange: (value: CaptchaValue | null) => void;
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

export default function CaptchaField({ config, scene, onChange }: Props) {
    const enabled = Boolean(config?.enabled && config.scenes.includes(scene));
    const provider = config?.provider ?? 'math';
    const builtin = provider === 'math' || provider === 'slider';
    const [challenge, setChallenge] = useState<Challenge | null>(null);
    const [answer, setAnswer] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [cloudReady, setCloudReady] = useState(false);
    const [cloudBusy, setCloudBusy] = useState(false);
    const geetest = useRef<{
        showCaptcha: () => void;
        onSuccess: (callback: () => void) => void;
        getValidate: () => Record<string, unknown>;
    } | null>(null);
    const onChangeRef = useRef(onChange);
    onChangeRef.current = onChange;

    const refresh = useCallback(async () => {
        if (!enabled || !builtin || !config?.challenge) {
            return;
        }
        setLoading(true);
        setError('');
        setAnswer('');
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
        if (enabled && builtin) {
            void refresh();
        } else {
            setChallenge(null);
        }
    }, [enabled, builtin, refresh]);

    useEffect(() => {
        if (!enabled || builtin) {
            return;
        }
        let cancelled = false;
        setLoading(true);
        setError('');
        const loaded = provider === 'geetest'
            ? loadScript('ttdf-geetest4', 'https://static.geetest.com/v4/gt4.js')
            : provider === 'tencent'
              ? loadScript('ttdf-tencent-captcha', 'https://turing.captcha.qcloud.com/TCaptcha.js')
              : provider === 'aliyun'
                ? loadScript('ttdf-aliyun-awsc', 'https://g.alicdn.com/AWSC/AWSC/awsc.js')
                : Promise.reject(new Error('未知验证码服务'));
        void loaded
            .then(() => {
                if (!cancelled) {
                    setCloudReady(true);
                }
            })
            .catch((reason: unknown) => {
                if (!cancelled) {
                    setError(reason instanceof Error ? reason.message : '验证码组件加载失败');
                }
            })
            .finally(() => {
                if (!cancelled) {
                    setLoading(false);
                }
            });

        return () => {
            cancelled = true;
        };
    }, [builtin, enabled, provider]);

    const submitBuiltin = (nextAnswer: string) => {
        setAnswer(nextAnswer);
        if (!challenge) {
            onChangeRef.current(null);
            return;
        }
        onChangeRef.current({
            id: challenge.id,
            answer: nextAnswer,
        });
    };

    const openCloud = () => {
        if (!cloudReady || cloudBusy) {
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
                            onChangeRef.current({ ticket: payload });
                            setCloudBusy(false);
                            setCloudReady(true);
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
                    onChangeRef.current({
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
                        onChangeRef.current({
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

    if (!enabled) {
        return null;
    }

    return (
        <div className="grid gap-2 rounded-lg border border-line bg-surface-mute p-3">
            <div className="flex items-center justify-between gap-2">
                <Label className="inline-flex items-center gap-1.5">
                    <ShieldCheck className="size-4" aria-hidden="true" />
                    人机验证
                </Label>
                {builtin ? (
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
                ) : (
                    <Button type="button" size="sm" variant="outline" onClick={openCloud} disabled={!cloudReady || cloudBusy}>
                        {cloudBusy ? '验证中…' : '开始验证'}
                    </Button>
                )}
            </div>

            {builtin && challenge ? (
                challenge.provider === 'slider' ? (
                    <div className="grid gap-2">
                        <input
                            type="range"
                            min={challenge.min ?? 10}
                            max={challenge.max ?? 90}
                            value={answer === '' ? String(challenge.min ?? 10) : answer}
                            aria-label="拖动滑块完成验证"
                            onChange={(event) => submitBuiltin(event.target.value)}
                            className="ttdf-captcha-range w-full"
                        />
                        <p className="text-xs text-ink-faint">拖动滑块到安全位置后提交。</p>
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
                        />
                    </div>
                )
            ) : builtin ? (
                <p className="text-xs text-ink-faint">{loading ? '正在加载验证码…' : '验证码暂不可用'}</p>
            ) : (
                <div id="ttdf-aliyun-captcha" className="min-h-9 text-xs text-ink-faint">
                    {error === '' ? '点击“开始验证”完成服务商人机校验。' : error}
                </div>
            )}
            {error !== '' ? (
                <p className="text-xs text-danger" role="alert">{error}</p>
            ) : null}
        </div>
    );
}
