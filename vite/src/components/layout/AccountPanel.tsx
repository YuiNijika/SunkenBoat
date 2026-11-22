import { useEffect, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import {
    BadgeCheck,
    CalendarCheck,
    Camera,
    CircleAlert,
    Coins,
    ExternalLink,
    FileText,
    KeyRound,
    Link2,
    LoaderCircle,
    LogOut,
    Mail,
    MapPin,
    Newspaper,
    ShieldCheck,
    Sparkles,
    Unlink,
    UserCheck,
    UserRound,
} from 'lucide-react';
import { Button } from '../ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '../ui/dialog';
import { Input } from '../ui/input';
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from '../ui/tooltip';
import {
    errorMessage,
    profileFrom,
    readPayload,
    requestEmailCode,
} from '../../lib/user';
import type {
    OAuthProvider,
    UserApiEndpoints,
    UserCertification,
    UserEconomySummary,
    UserProfile,
} from '../../types';
import { notifyError, notifySuccess } from '../../lib/notify';
import { refreshApp } from '../../lib/appNavigation';
import { cssUrl } from '../../lib/css';
import ContentManager from './ContentManager';
import AuthDialog from './AuthDialog';
import UserAvatar from './UserAvatar';
import DownloadHistory from '../content/DownloadHistory';
import LevelBadge from '../content/LevelBadge';
import MediaLibrary from '../content/MediaLibrary';
import CaptchaDialog from './CaptchaDialog';
import type { CaptchaValue } from './CaptchaField';

const GROUP_LABELS: Record<string, string> = {
    administrator: '管理员',
    editor: '编辑',
    contributor: '贡献者',
    subscriber: '订阅者',
    visitor: '访客',
};

type Status = 'loading' | 'guest' | 'ready' | 'error';

interface Props {
    api?: UserApiEndpoints;
    section?: AccountSection;
}

interface ProfileDetails {
    avatar: string;
    background: string;
    signature: string;
    gender: string;
    privacy: string;
    location: string;
}

type AccountSection = 'profile' | 'security' | 'social' | 'content' | 'downloads';

const EMPTY_DETAILS: ProfileDetails = {
    avatar: '',
    background: '',
    signature: '',
    gender: 'secret',
    privacy: 'public',
    location: '',
};

const GENDER_LABELS: Record<string, string> = {
    secret: '保密',
    male: '男',
    female: '女',
    other: '其他',
};

const PRIVACY_LABELS: Record<string, string> = {
    public: '所有人可见',
    members: '仅登录用户可见',
    private: '仅自己可见',
};

const OAUTH_ERRORS: Record<string, string> = {
    oauth_disabled: '站点尚未开放该社交账号登录。',
    oauth_denied: '你取消了社交账号授权。',
    oauth_state: '授权状态已过期，请重新发起登录。',
    oauth_failed: '社交账号授权失败，请稍后重试。',
    oauth_rate_limited: '授权失败次数过多，请稍后再试。',
    oauth_bound: '该社交账号已绑定到其他用户。',
    oauth_unbound: '该社交账号尚未绑定，请先登录后到用户中心绑定。',
};

function detailsFromProfile(profile: UserProfile): ProfileDetails {
    return {
        avatar: profile.customAvatar ?? '',
        background: profile.background ?? '',
        signature: profile.signature ?? '',
        gender: profile.gender || 'secret',
        privacy: profile.privacy || 'public',
        location: profile.location ?? '',
    };
}

function certificationFrom(value: unknown): UserCertification | null {
    if (!value || typeof value !== 'object') {
        return null;
    }

    const item = value as Partial<UserCertification>;
    const status = String(item.status ?? 'none');
    if (!['none', 'pending', 'approved', 'rejected'].includes(status)) {
        return null;
    }

    return {
        status,
        type: String(item.type ?? ''),
        name: String(item.name ?? ''),
        note: String(item.note ?? ''),
        reason: String(item.reason ?? ''),
        submitted: Number.isFinite(Number(item.submitted)) ? Math.max(0, Number(item.submitted)) : 0,
        reviewed: Number.isFinite(Number(item.reviewed)) ? Math.max(0, Number(item.reviewed)) : 0,
    };
}

function ProfileAvatar({ profile, className }: { profile: UserProfile; className: string }) {
    const [failed, setFailed] = useState(false);
    const initial = (profile.screenName || profile.name || '用').slice(0, 1);
    const base = className + ' grid shrink-0 place-items-center overflow-hidden rounded-full bg-brand-soft text-brand';

    if (!profile.avatar || failed) {
        return <span className={base + ' text-[18px] font-medium'}>{initial}</span>;
    }

    return (
        <span className={base}>
            <img
                className="size-full object-cover"
                src={profile.avatar}
                alt=""
                loading="lazy"
                referrerPolicy="no-referrer"
                onError={() => setFailed(true)}
            />
        </span>
    );
}

export default function AccountPanel({ api, section = 'profile' }: Props) {
    const [status, setStatus] = useState<Status>(api?.enabled ? 'loading' : 'guest');
    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [authOpen, setAuthOpen] = useState(false);
    const [screenName, setScreenName] = useState('');
    const [url, setUrl] = useState('');
    const [mail, setMail] = useState('');
    const [emailCode, setEmailCode] = useState('');
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [profileBusy, setProfileBusy] = useState(false);
    const [mailBusy, setMailBusy] = useState(false);
    const [passwordBusy, setPasswordBusy] = useState(false);
    const [sendingCode, setSendingCode] = useState(false);
    const [loggingOut, setLoggingOut] = useState(false);
    const [cooldown, setCooldown] = useState(0);
    const [details, setDetails] = useState<ProfileDetails>(EMPTY_DETAILS);
    const [detailsReady, setDetailsReady] = useState(false);
    const [loadError, setLoadError] = useState('');
    const [oauthProviders, setOauthProviders] = useState<OAuthProvider[]>(
        api?.oauth?.providers ?? []
    );
    const [oauthBusy, setOauthBusy] = useState('');
    const [avatarMediaOpen, setAvatarMediaOpen] = useState(false);
    const [backgroundMediaOpen, setBackgroundMediaOpen] = useState(false);
    const [backgroundBusy, setBackgroundBusy] = useState(false);
    const [certification, setCertification] = useState<UserCertification | null>(null);
    const [certType, setCertType] = useState<'personal' | 'organization'>('personal');
    const [certName, setCertName] = useState('');
    const [certNote, setCertNote] = useState('');
    const [certBusy, setCertBusy] = useState(false);
    const [certDetailsOpen, setCertDetailsOpen] = useState(false);
    const [economy, setEconomy] = useState<UserEconomySummary | null>(null);
    const [checkinCaptcha, setCheckinCaptcha] = useState<CaptchaValue | null>(null);
    const [checkinCaptchaOpen, setCheckinCaptchaOpen] = useState(false);
    const [checkinBusy, setCheckinBusy] = useState(false);

    const sessionEndpoint = api?.session;
    const meEndpoint = api?.me;
    const location = useLocation();

    useEffect(() => {
        setOauthProviders(api?.oauth?.providers ?? []);
    }, [api?.oauth]);

    useEffect(() => {
        if (status !== 'ready' || !api?.economy?.summary) {
            return;
        }
        let active = true;
        void fetch(api.economy.summary, {
            credentials: 'same-origin',
            headers: {
                Accept: 'application/json',
                'X-Typecho-Token': api.economy.nonce,
            },
        })
            .then((response) => readPayload(response))
            .then((payload) => {
                const data = (payload?.data as { economy?: UserEconomySummary } | undefined)
                    ?.economy;
                if (active && data) {
                    setEconomy(data);
                }
            })
            .catch(() => undefined);

        return () => {
            active = false;
        };
    }, [status, api?.economy?.summary, profile?.uid]);

    useEffect(() => {
        const params = new URLSearchParams(location.search);
        const result = params.get('oauth');
        const error = params.get('oauth_error');

        if (result === 'bound') {
            notifySuccess('社交账号已绑定。');
        } else if (result === 'login') {
            notifySuccess('已通过社交账号登录。');
        }

        if (error) {
            notifyError(OAUTH_ERRORS[error] ?? '社交账号授权失败。');
        }
    }, [location.search]);

    useEffect(() => {
        if (!api?.enabled || !sessionEndpoint || !meEndpoint) {
            setStatus('guest');
            return;
        }

        const controller = new AbortController();
        let active = true;
        setStatus('loading');
        setLoadError('');

        void (async () => {
            try {
                const response = await fetch(sessionEndpoint, {
                    credentials: 'same-origin',
                    headers: { Accept: 'application/json' },
                    signal: controller.signal,
                });

                if (response.status === 401) {
                    if (active) {
                        setProfile(null);
                        setStatus('guest');
                    }
                    return;
                }

                const payload = await readPayload(response);
                if (!response.ok) {
                    throw new Error(errorMessage(payload, '读取登录状态失败'));
                }

                let current = profileFrom(payload);
                if (!current) {
                    throw new Error('登录状态异常，请重新登录');
                }

                try {
                    const detail = await fetch(meEndpoint, {
                        credentials: 'same-origin',
                        headers: { Accept: 'application/json' },
                        signal: controller.signal,
                    });
                    if (detail.ok) {
                        current = profileFrom(await readPayload(detail)) ?? current;
                    }
                } catch (reason) {
                    if (reason instanceof DOMException && reason.name === 'AbortError') {
                        throw reason;
                    }
                }

                if (api?.profile) {
                    try {
                        const detailResponse = await fetch(api.profile, {
                            credentials: 'same-origin',
                            headers: {
                                Accept: 'application/json',
                                'X-Typecho-Token': api.profileNonce,
                            },
                            signal: controller.signal,
                        });

                        if (detailResponse.ok) {
                            const detailed = profileFrom(await readPayload(detailResponse));
                            if (detailed) {
                                current = { ...current, ...detailed };
                                if (active) {
                                    setDetailsReady(true);
                                }
                            }
                        }
                    } catch (reason) {
                        if (reason instanceof DOMException && reason.name === 'AbortError') {
                            throw reason;
                        }
                    }
                }

                if (active) {
                    setProfile(current);
                    setScreenName(current.screenName);
                    setUrl(current.url ?? '');
                    setMail(current.mail ?? '');
                    setDetails(detailsFromProfile(current));
                    setCertification(current.certification ?? null);
                    setStatus('ready');
                }
            } catch (reason) {
                if (reason instanceof DOMException && reason.name === 'AbortError') {
                    return;
                }

                if (active) {
                    setLoadError(reason instanceof Error ? reason.message : '读取账号信息失败');
                    setStatus('error');
                }
            }
        })();

        return () => {
            active = false;
            controller.abort();
        };
    }, [api?.enabled, api?.enhanced, api?.profile, api?.profileNonce, meEndpoint, sessionEndpoint]);

    useEffect(() => {
        if (cooldown <= 0) {
            return;
        }

        const timer = window.setTimeout(() => {
            setCooldown((seconds) => Math.max(0, seconds - 1));
        }, 1000);

        return () => window.clearTimeout(timer);
    }, [cooldown]);

    const syncProfile = (next: UserProfile) => {
        setProfile((current) => ({
            ...next,
            avatar: next.avatar || current?.avatar || '',
        }));
        setScreenName(next.screenName);
        setUrl(next.url ?? '');
        setMail(next.mail ?? '');
        if (api?.enhanced) {
            setDetails(detailsFromProfile(next));
        }
        if (next.certification) {
            setCertification(next.certification);
        }
        setStatus('ready');
    };

    const hydrateProfile = async (next: UserProfile) => {
        syncProfile(next);

        if (!api?.profile || !api.profileNonce) {
            return;
        }

        try {
            const response = await fetch(api.profile, {
                credentials: 'same-origin',
                headers: {
                    Accept: 'application/json',
                    'X-Typecho-Token': api.profileNonce,
                },
            });
            if (!response.ok) {
                return;
            }

            const detailed = profileFrom(await readPayload(response));
            if (detailed) {
                syncProfile(detailed);
            }
        } catch {
            // Keep the login response when the optional profile endpoint fails.
        }
    };

    const saveDetails = async (
        nextDetails: ProfileDetails = details
    ): Promise<UserProfile | null> => {
        if (!api?.profile || !api.profileNonce) {
            throw new Error('增强资料接口不可用');
        }

        const response = await fetch(api.profile, {
            method: 'POST',
            credentials: 'same-origin',
            headers: {
                Accept: 'application/json',
                'Content-Type': 'application/json',
                'X-Typecho-Token': api.profileNonce,
            },
            body: JSON.stringify(nextDetails),
        });
        const payload = await readPayload(response);
        if (!response.ok) {
            throw new Error(errorMessage(payload, '更多资料保存失败'));
        }

        return profileFrom(payload);
    };

    const saveProfile = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!meEndpoint || profileBusy) {
            return;
        }

        if (url.trim() !== '') {
            try {
                new URL(url.trim());
            } catch {
                notifyError('个人主页需要填写完整的 http(s) 地址');
                return;
            }
        }

        if (details.avatar.trim() !== '') {
            try {
                const avatarUrl = new URL(details.avatar.trim());
                if (
                    (avatarUrl.protocol !== 'http:' && avatarUrl.protocol !== 'https:')
                    || avatarUrl.username !== ''
                    || avatarUrl.password !== ''
                ) {
                    throw new Error();
                }
            } catch {
                notifyError('头像地址需要填写完整的 http(s) 链接');
                return;
            }
        }

        if (details.background.trim() !== '') {
            try {
                const backgroundUrl = new URL(details.background.trim());
                if (
                    (backgroundUrl.protocol !== 'http:' && backgroundUrl.protocol !== 'https:')
                    || backgroundUrl.username !== ''
                    || backgroundUrl.password !== ''
                ) {
                    throw new Error();
                }
            } catch {
                notifyError('背景图地址需要填写完整的 http(s) 链接');
                return;
            }
        }

        setProfileBusy(true);

        try {
            const response = await fetch(meEndpoint, {
                method: 'PATCH',
                credentials: 'same-origin',
                headers: {
                    Accept: 'application/json',
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    screenName: screenName.trim(),
                    url: url.trim(),
                }),
            });
            const payload = await readPayload(response);
            if (!response.ok) {
                throw new Error(errorMessage(payload, '资料保存失败'));
            }

            let updated = profileFrom(payload);
            if (!updated) {
                throw new Error('接口未返回更新后的用户信息');
            }

            if (api?.enhanced && detailsReady) {
                const detailed = await saveDetails();
                if (detailed) {
                    updated = detailed;
                }
            }

            syncProfile(updated);
            notifySuccess('个人资料已更新。');
        } catch (reason) {
            notifyError(
                reason instanceof Error ? reason.message : '资料保存失败'
            );
        } finally {
            setProfileBusy(false);
        }
    };

    const saveBackground = async (nextDetails: ProfileDetails) => {
        if (!detailsReady) {
            notifyError('更多资料尚未加载完成，请稍后再试');
            return;
        }
        if (!api?.profile || !api.profileNonce || backgroundBusy) {
            return;
        }

        const previous = details;
        setBackgroundBusy(true);
        try {
            const updated = await saveDetails(nextDetails);
            if (!updated) {
                throw new Error('接口未返回更新后的资料');
            }
            syncProfile(updated);
            notifySuccess('个人主页背景已更新。');
        } catch (reason) {
            setDetails(previous);
            notifyError(
                reason instanceof Error ? reason.message : '背景图保存失败'
            );
        } finally {
            setBackgroundBusy(false);
        }
    };

    const unbindOAuth = async (provider: OAuthProvider) => {
        if (!api?.oauth?.enabled || oauthBusy !== '') {
            return;
        }

        setOauthBusy(provider.id);

        try {
            const response = await fetch(api.oauth.unbind, {
                method: 'POST',
                credentials: 'same-origin',
                headers: {
                    Accept: 'application/json',
                    'Content-Type': 'application/json',
                    'X-Typecho-Token': api.oauth.nonce,
                },
                body: JSON.stringify({ provider: provider.id }),
            });
            const payload = await readPayload(response);
            if (!response.ok) {
                throw new Error(errorMessage(payload, '解绑失败'));
            }

            const next = payload?.data as { oauth?: { providers?: OAuthProvider[] } } | undefined;
            const providers = next?.oauth?.providers;
            if (Array.isArray(providers)) {
                setOauthProviders(providers);
            } else {
                setOauthProviders((current) =>
                    current.map((item) =>
                        item.id === provider.id
                            ? { ...item, bound: false, name: '', avatar: '', boundAt: 0 }
                            : item
                    )
                );
            }
            notifySuccess(`${provider.label} 已解绑。`);
        } catch (reason) {
            notifyError(reason instanceof Error ? reason.message : '解绑失败');
        } finally {
            setOauthBusy('');
        }
    };

    const sendEmailCode = async () => {
        if (!api || sendingCode || cooldown > 0) {
            return;
        }

        const nextMail = mail.trim();
        if (nextMail === '') {
            notifyError('请先填写新邮箱');
            return;
        }

        setSendingCode(true);

        try {
            const result = await requestEmailCode(api.emailCode, nextMail, 'email');
            setCooldown(result.cooldown);
            notifySuccess(
                `验证码已发送至新邮箱，${Math.max(1, Math.ceil(result.expiresIn / 60))} 分钟内有效。`
            );
        } catch (reason) {
            notifyError(
                reason instanceof Error ? reason.message : '验证码发送失败'
            );
        } finally {
            setSendingCode(false);
        }
    };

    const saveMail = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!api || !meEndpoint || mailBusy) {
            return;
        }

        const nextMail = mail.trim();
        if (nextMail === '') {
            notifyError('邮箱不能为空');
            return;
        }

        if (profile && nextMail.toLowerCase() === profile.mail?.toLowerCase()) {
            notifyError('新邮箱不能与当前邮箱相同');
            return;
        }

        if (api.emailVerify && emailCode.trim() === '') {
            notifyError('请输入发送到新邮箱的验证码');
            return;
        }

        setMailBusy(true);

        try {
            const response = await fetch(meEndpoint, {
                method: 'PATCH',
                credentials: 'same-origin',
                headers: {
                    Accept: 'application/json',
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    mail: nextMail,
                    ...(api.emailVerify ? { emailCode: emailCode.trim() } : {}),
                }),
            });
            const payload = await readPayload(response);
            if (!response.ok) {
                throw new Error(errorMessage(payload, '邮箱更新失败'));
            }

            const updated = profileFrom(payload);
            if (!updated) {
                throw new Error('接口未返回更新后的用户信息');
            }

            syncProfile(updated);
            setEmailCode('');
            notifySuccess('登录邮箱已更新。');
        } catch (reason) {
            notifyError(reason instanceof Error ? reason.message : '邮箱更新失败');
        } finally {
            setMailBusy(false);
        }
    };

    const savePassword = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!api || passwordBusy) {
            return;
        }

        if (newPassword !== confirmPassword) {
            notifyError('两次输入的新密码不一致');
            return;
        }

        if (newPassword.length < 6 || newPassword.length > 18) {
            notifyError('新密码长度需为 6–18 个字符');
            return;
        }

        setPasswordBusy(true);

        try {
            const response = await fetch(api.password, {
                method: 'POST',
                credentials: 'same-origin',
                headers: {
                    Accept: 'application/json',
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ currentPassword, password: newPassword }),
            });
            const payload = await readPayload(response);
            if (!response.ok) {
                throw new Error(errorMessage(payload, '密码修改失败'));
            }

            const updated = profileFrom(payload);
            if (updated) {
                syncProfile(updated);
            }

            setCurrentPassword('');
            setNewPassword('');
            setConfirmPassword('');
            notifySuccess('密码已修改，其他设备上的旧登录凭证已失效。');
        } catch (reason) {
            notifyError(reason instanceof Error ? reason.message : '密码修改失败');
        } finally {
            setPasswordBusy(false);
        }
    };

    const logout = async () => {
        if (!api || loggingOut) {
            return;
        }

        setLoggingOut(true);

        try {
            const response = await fetch(api.logout, {
                method: 'POST',
                credentials: 'same-origin',
                headers: {
                    Accept: 'application/json',
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ all: false }),
            });
            const payload = await readPayload(response);
            if (!response.ok) {
                throw new Error(errorMessage(payload, '退出登录失败'));
            }

            setProfile(null);
            setStatus('guest');
            notifySuccess('已退出登录。');
        } catch (reason) {
            notifyError(reason instanceof Error ? reason.message : '退出登录失败');
        } finally {
            setLoggingOut(false);
        }
    };

    const submitCertification = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!api?.certification || !api.certificationNonce || certBusy) {
            return;
        }
        if (certName.trim().length < 2) {
            notifyError('请填写真实姓名或组织名称');
            return;
        }
        if (certNote.trim() === '') {
            notifyError('请填写认证说明');
            return;
        }

        setCertBusy(true);
        try {
            const response = await fetch(api.certification, {
                method: 'POST',
                credentials: 'same-origin',
                headers: {
                    Accept: 'application/json',
                    'Content-Type': 'application/json',
                    'X-Typecho-Token': api.certificationNonce,
                },
                body: JSON.stringify({
                    op: 'submit',
                    type: certType,
                    name: certName.trim(),
                    note: certNote.trim(),
                }),
            });
            const payload = await readPayload(response);
            if (!response.ok) {
                throw new Error(errorMessage(payload, '认证申请提交失败'));
            }

            const data = payload?.data as { certification?: unknown; message?: unknown } | undefined;
            const next = certificationFrom(data?.certification);
            if (next) {
                setCertification(next);
            }
            notifySuccess(
                typeof data?.message === 'string' && data.message !== ''
                    ? data.message
                    : '认证申请已提交，请等待管理员审核。'
            );
        } catch (reason) {
            notifyError(reason instanceof Error ? reason.message : '认证申请提交失败');
        } finally {
            setCertBusy(false);
        }
    };

    if (!api?.enabled) {
        const centerEnabled = api?.centerEnabled === true;
        const apiReady = api?.apiReady === true;
        const title = centerEnabled ? '账号服务尚未就绪' : '账号服务未启用';
        const description = centerEnabled
            ? apiReady
                ? '账号服务正在初始化，请稍后重新加载页面。'
                : api?.admin
                  ? '前台用户中心已开启，但 REST API 总开关或 v2 写接口尚未开启。请到“设置外观 → 运行&扩展 → 接口&安全”开启这两项后重试。'
                  : '站点正在配置前台账号服务，请稍后再试或联系管理员。'
            : '站点暂未开放前台账号服务，请联系管理员。';

        return (
            <div className="surface-card card-pad">
                <p className="section-label">Account</p>
                <h2 className="mt-2 text-[20px] font-medium">{title}</h2>
                <p className="mt-2 text-[13px] leading-6 text-ink-mute">
                    {description}
                </p>
            </div>
        );
    }

    if (status === 'loading') {
        return (
            <div className="surface-card card-pad grid gap-4" aria-busy="true">
                <div className="h-5 w-36 animate-pulse rounded-[4px] bg-surface-2" />
                <div className="h-28 animate-pulse rounded-[6px] bg-surface-2" />
                <div className="h-28 animate-pulse rounded-[6px] bg-surface-2" />
            </div>
        );
    }

    if (status === 'error') {
        return (
            <div className="surface-card card-pad text-center">
                <p className="section-label">Account</p>
                <h2 className="mt-2 text-[20px] font-medium">无法读取账号信息</h2>
                <p className="mt-2 text-[13px] leading-6 text-ink-mute">{loadError}</p>
                <Button className="mt-5" type="button" variant="secondary" onClick={() => refreshApp()}>
                    重新加载
                </Button>
            </div>
        );
    }

    if (status === 'guest' || !profile) {
        return (
            <>
                <div className="surface-card card-pad text-center">
                    <span className="mx-auto grid size-11 place-items-center rounded-full bg-brand-soft text-brand">
                        <UserRound className="size-5" strokeWidth={1.8} aria-hidden="true" />
                    </span>
                    <h2 className="mt-4 text-[20px] font-medium">登录后管理账号</h2>
                    <p className="mx-auto mt-2 max-w-md text-[13px] leading-6 text-ink-mute">
                        登录后可管理个人资料、账号安全和社交账号。
                    </p>
                    <Button className="mt-5" type="button" onClick={() => setAuthOpen(true)}>
                        登录 / 注册
                    </Button>
                    {loadError ? (
                        <p className="mt-3 text-[12px] leading-5 text-destructive" role="alert">
                            {loadError}
                        </p>
                    ) : null}
                </div>
                <AuthDialog
                    open={authOpen}
                    onOpenChange={setAuthOpen}
                    api={api}
                    checking={false}
                    onAuthenticated={(next) => {
                        void hydrateProfile(next);
                    }}
                />
            </>
        );
    }

    const created = profile.created ? new Date(profile.created) : null;
    const createdText =
        created && !Number.isNaN(created.getTime())
            ? `${created.getFullYear()}-${String(created.getMonth() + 1).padStart(2, '0')}-${String(
                  created.getDate()
              ).padStart(2, '0')}`
            : '';
    const avatarPreview: UserProfile = {
        ...profile,
        avatar: details.avatar || profile.avatar,
        customAvatar: details.avatar,
    };
    const coverUrl = details.background || profile.background || '';
    const coverStyle = coverUrl !== ''
        ? {
              backgroundImage:
                  'linear-gradient(180deg, rgba(8, 12, 18, 0.12), rgba(8, 12, 18, 0.34)), '
                  + cssUrl(coverUrl),
              backgroundSize: 'cover',
              backgroundPosition: 'center',
          }
        : undefined;
    const certificationApproved = certification?.status === 'approved';

    const pageUrls = api.pages;
    const spaceUrl = `${pageUrls.space.replace(/\/+$/, '')}/${profile.uid}`;
    const forumLabel = api.forum?.label || '圈子';

    const runCheckin = async (captchaValue: CaptchaValue | null) => {
        if (checkinBusy || !api.economy?.checkin) {
            return;
        }
        setCheckinBusy(true);
        try {
            const response = await fetch(api.economy.checkin, {
                method: 'POST',
                credentials: 'same-origin',
                headers: {
                    Accept: 'application/json',
                    'Content-Type': 'application/json',
                    'X-Typecho-Token': api.economy.nonce,
                },
                body: JSON.stringify(captchaValue ? { captcha: captchaValue } : {}),
            });
            const payload = await readPayload(response);
            if (!response.ok) {
                throw new Error(errorMessage(payload, '签到失败'));
            }
            const next = (payload?.data as { economy?: UserEconomySummary } | undefined)
                ?.economy;
            if (next) {
                setEconomy(next);
            }
            setCheckinCaptcha(null);
            setCheckinCaptchaOpen(false);
            notifySuccess('签到成功，奖励已到账。');
        } catch (reason) {
            setCheckinCaptcha(null);
            notifyError(reason instanceof Error ? reason.message : '签到失败');
        } finally {
            setCheckinBusy(false);
        }
    };

    const checkinCaptchaRequired = Boolean(
        api.captcha?.enabled && api.captcha.scenes.includes('checkin')
    );

    const checkin = () => {
        if (checkinBusy || !api.economy?.checkin) {
            return;
        }
        if (checkinCaptchaRequired && !checkinCaptcha) {
            setCheckinCaptchaOpen(true);
            return;
        }
        void runCheckin(checkinCaptcha);
    };

    const navItems: { id: AccountSection; href: string; label: string; icon: ReactNode }[] = [
        {
            id: 'profile',
            href: pageUrls.profile,
            label: '个人资料',
            icon: <UserRound className="size-4" strokeWidth={1.8} aria-hidden="true" />,
        },
        {
            id: 'security',
            href: pageUrls.account,
            label: '账号安全',
            icon: <ShieldCheck className="size-4" strokeWidth={1.8} aria-hidden="true" />,
        },
    ];

    if (api.oauth?.enabled) {
        navItems.push({
            id: 'social',
            href: pageUrls.social,
            label: '社交账号',
            icon: <Link2 className="size-4" strokeWidth={1.8} aria-hidden="true" />,
        });
    }

    if (profile.canWrite || api.forum?.canPost || api.forum?.canCreateCircle) {
        navItems.push({
            id: 'content',
            href: pageUrls.content,
            label: '内容管理',
            icon: <Newspaper className="size-4" strokeWidth={1.8} aria-hidden="true" />,
        });
    }

    if (api.downloads.enabled) {
        navItems.push({
            id: 'downloads',
            href: pageUrls.downloads,
            label: '订单&下载',
            icon: <FileText className="size-4" strokeWidth={1.8} aria-hidden="true" />,
        });
    }

    const socialCount = oauthProviders.filter((provider) => provider.bound).length;
    const sectionTitles: Record<AccountSection, { title: string; description: string }> = {
        profile: {
            title: '个人资料',
            description: '完善资料后会展示在用户中心，用户名与登录邮箱仍由 Typecho 管理。',
        },
        security: {
            title: '账号安全',
            description: '管理登录邮箱与密码；敏感操作需要当前账号验证。',
        },
        social: {
            title: '社交账号',
            description: '通过 OAuth 授权绑定社交账号，绑定后可直接使用对应平台登录。',
        },
        content: {
            title: '内容管理',
            description: `统一管理文章、${forumLabel}帖子、${forumLabel}与我的评论，数据会随页面一起加载。`,
        },
        downloads: {
            title: '订单&下载',
            description: '查看免费领取与付费购买的订单号、支付状态和下载记录。',
        },
    };

    return (
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-[15px]">
            <section className="account-profile-card surface-card overflow-hidden">
                <div className="account-cover" style={coverStyle} aria-label="个人主页背景">
                    {api.enhanced ? (
                        <div className="account-cover-actions">
                            <Button
                                type="button"
                                size="sm"
                                variant="secondary"
                                className="account-cover-button"
                                disabled={backgroundBusy || !detailsReady}
                                onClick={() => setBackgroundMediaOpen(true)}
                            >
                                <Camera aria-hidden="true" />
                                {backgroundBusy ? '保存中…' : '更换背景'}
                            </Button>
                        </div>
                    ) : null}
                </div>
                <div className="account-profile-shell">
                    <div className="account-profile-main">
                        <ProfileAvatar profile={profile} className="account-profile-avatar" />
                        <div className="account-profile-copy">
                            <div className="account-profile-heading">
                                <h2 className="account-profile-name">
                                    {profile.screenName || profile.name}
                                </h2>
                                {economy?.enabled ? (
                                    <span className="account-profile-level" title={economy.level.title}>
                                        <LevelBadge
                                            level={economy.level}
                                            iconClassName="h-4.5 w-auto"
                                        />
                                    </span>
                                ) : null}
                                <span className="account-profile-role">
                                    {GROUP_LABELS[profile.group] ?? profile.group}
                                </span>
                                {certificationApproved ? (
                                    <button
                                        type="button"
                                        className="account-profile-certification"
                                        title="查看认证详情"
                                        onClick={() => setCertDetailsOpen(true)}
                                    >
                                        <BadgeCheck
                                            className="size-3.5"
                                            strokeWidth={2}
                                            aria-hidden="true"
                                        />
                                        {certification?.name || '站点认证'}
                                    </button>
                                ) : null}
                            </div>
                            <p className="account-profile-handle">
                                @{profile.name}
                                <span aria-hidden="true">·</span>
                                UID {profile.uid}
                            </p>
                            <p
                                className={
                                    'account-profile-signature'
                                    + (details.signature ? '' : ' is-empty')
                                }
                            >
                                {details.signature || '这个人很神秘，还没有填写个性签名。'}
                            </p>
                        </div>
                    </div>

                    <div className="account-profile-details">
                        <div className="account-profile-stats">
                            <div>
                                <strong>{profile.posts ?? 0}</strong>
                                <small>文章</small>
                            </div>
                            <div>
                                <strong>{profile.comments ?? 0}</strong>
                                <small>评论</small>
                            </div>
                            {typeof profile.circles === 'number' ? (
                                <div
                                    title={`加入 ${profile.joinedCircles ?? 0} · 创建 ${profile.createdCircles ?? 0}`}
                                >
                                    <strong>{profile.circles}</strong>
                                    <small>{forumLabel}</small>
                                </div>
                            ) : null}
                        </div>
                        <div className="account-profile-meta">
                            {createdText ? (
                                <span>
                                    <CalendarCheck
                                        className="size-3.5"
                                        strokeWidth={1.8}
                                        aria-hidden="true"
                                    />
                                    {createdText} 加入
                                </span>
                            ) : null}
                            {details.location ? (
                                <span>
                                    <MapPin
                                        className="size-3.5"
                                        strokeWidth={1.8}
                                        aria-hidden="true"
                                    />
                                    {details.location}
                                </span>
                            ) : null}
                            {details.gender !== 'secret' ? (
                                <span>
                                    <UserRound
                                        className="size-3.5"
                                        strokeWidth={1.8}
                                        aria-hidden="true"
                                    />
                                    {GENDER_LABELS[details.gender] ?? details.gender}
                                </span>
                            ) : null}
                            {profile.url ? (
                                <a
                                    href={profile.url}
                                    target="_blank"
                                    rel="noreferrer noopener"
                                >
                                    <ExternalLink
                                        className="size-3.5"
                                        strokeWidth={1.8}
                                        aria-hidden="true"
                                    />
                                    个人主页
                                </a>
                            ) : null}
                            <span className="account-profile-privacy">
                                {PRIVACY_LABELS[details.privacy] ?? '公开资料'}
                            </span>
                        </div>
                        <div className="account-profile-actions">
                            {api.operations?.enabled ? (
                                <Button asChild type="button" size="sm">
                                    <a href={api.operations.home}>
                                        <ShieldCheck aria-hidden="true" />
                                        运营中心
                                    </a>
                                </Button>
                            ) : null}
                            <Button asChild type="button" variant="outline" size="sm">
                                <a href={spaceUrl}>
                                    <ExternalLink aria-hidden="true" />
                                    查看空间
                                </a>
                            </Button>
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon-sm"
                                disabled={loggingOut}
                                title={loggingOut ? '退出中…' : '退出登录'}
                                aria-label={loggingOut ? '退出中…' : '退出登录'}
                                onClick={() => void logout()}
                            >
                                {loggingOut ? (
                                    <LoaderCircle className="animate-spin" aria-hidden="true" />
                                ) : (
                                    <LogOut aria-hidden="true" />
                                )}
                            </Button>
                        </div>
                    </div>
                </div>
                <div className="px-4 pb-4">
                    {loadError ? (
                        <p className="text-[12px] leading-5 text-destructive" role="alert">
                            {loadError}
                        </p>
                    ) : null}
                </div>
            </section>

            <nav className="account-tabs" aria-label="用户中心">
                {navItems.map((item) => (
                    <a
                        key={item.id}
                        href={item.href}
                        className={section === item.id ? 'is-active' : ''}
                        aria-current={section === item.id ? 'page' : undefined}
                    >
                        {item.icon}
                        {item.label}
                    </a>
                ))}
            </nav>

            {economy && (economy.enabled || economy.status.banned) ? (
                <section className="surface-card card-pad">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                            <p className="section-label">Account wallet</p>
                            <h3 className="mt-1.5 flex items-center gap-2 text-[18px] font-medium">
                                {economy.enabled ? (
                                    <LevelBadge level={economy.level} iconClassName="h-5 w-auto" />
                                ) : (
                                    '账号状态'
                                )}
                            </h3>
                            {economy.enabled ? (
                                <p className="mt-1 text-[12px] leading-5 text-ink-mute">
                                    经验 {economy.experience}
                                    {economy.level.nextExperience > economy.experience
                                        ? ` · 距「${economy.level.nextTitle}」还需 ${economy.level.nextExperience - economy.experience} 经验`
                                        : ' · 已达到当前最高等级'}
                                </p>
                            ) : null}
                        </div>
                        {economy.enabled && economy.checkin.enabled ? (
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <span tabIndex={0} className="inline-flex">
                                        <Button
                                            type="button"
                                            size="sm"
                                            onClick={() => void checkin()}
                                            disabled={checkinBusy || economy.checkin.checkedIn}
                                        >
                                            {checkinBusy ? (
                                                <LoaderCircle
                                                    className="animate-spin"
                                                    aria-hidden="true"
                                                />
                                            ) : (
                                                <CalendarCheck aria-hidden="true" />
                                            )}
                                            {economy.checkin.checkedIn ? '今日已签到' : '签到'}
                                        </Button>
                                    </span>
                                </TooltipTrigger>
                                <TooltipContent side="bottom" className="max-w-60 px-3 py-2">
                                    <div className="grid gap-1 text-[11.5px] leading-5">
                                        <p className="font-medium">
                                            总签到 {economy.checkin.total} 天
                                            {economy.checkin.streak > 0
                                                ? ` · 连续 ${economy.checkin.streak} 天`
                                                : ''}
                                        </p>
                                        <p className="opacity-80">
                                            {economy.checkin.checkedIn
                                                ? `今日已签到（${economy.checkin.today}）`
                                                : '今日还未签到'}
                                        </p>
                                        <p className="opacity-80">
                                            最近签到：
                                            {economy.checkin.last || '暂无记录'}
                                        </p>
                                    </div>
                                </TooltipContent>
                            </Tooltip>
                        ) : null}
                    </div>

                    {economy.status.banned ? (
                        <div className="mt-4 flex items-start gap-2 rounded-lg border border-danger/30 bg-danger/5 p-3 text-[12px] leading-5 text-danger">
                            <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                            <span>{economy.status.message}</span>
                        </div>
                    ) : null}

                    {economy.enabled ? (
                        <>
                            <div className="mt-4 grid gap-2 sm:grid-cols-3">
                                <div className="rounded-lg border border-line bg-surface-mute p-3">
                                    <p className="flex items-center gap-1.5 text-[11px] text-ink-faint">
                                        <Coins className="size-3.5" aria-hidden="true" />
                                        {economy.labels.balance}
                                    </p>
                                    <p className="mt-1 text-lg font-semibold tabular-nums text-ink">
                                        ¥{economy.balance}
                                    </p>
                                </div>
                                <div className="rounded-lg border border-line bg-surface-mute p-3">
                                    <p className="flex items-center gap-1.5 text-[11px] text-ink-faint">
                                        <Sparkles className="size-3.5" aria-hidden="true" />
                                        {economy.labels.points}
                                    </p>
                                    <p className="mt-1 text-lg font-semibold tabular-nums text-ink">
                                        {economy.points}
                                    </p>
                                </div>
                                <div className="rounded-lg border border-line bg-surface-mute p-3">
                                    <p className="flex items-center gap-1.5 text-[11px] text-ink-faint">
                                        <LevelBadge
                                            level={economy.level}
                                            iconClassName="h-3.5 w-auto"
                                            showTitle={false}
                                        />
                                        等级进度
                                    </p>
                                    <div
                                        className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-line"
                                        role="progressbar"
                                        aria-valuemin={0}
                                        aria-valuemax={100}
                                        aria-valuenow={economy.level.progress}
                                    >
                                        <span
                                            className="block h-full rounded-full"
                                            style={{
                                                width: `${economy.level.progress}%`,
                                                background: economy.level.color,
                                            }}
                                        />
                                    </div>
                                    <p className="mt-1.5 text-[11px] text-ink-faint">
                                        {economy.level.progress}%
                                    </p>
                                </div>
                            </div>
                            {economy.checkin.enabled && !economy.checkin.checkedIn ? (
                                <div className="mt-4 grid gap-1.5">
                                    <p className="text-[12px] leading-5 text-ink-mute">
                                        今日签到可获经验 {economy.checkin.rewards.experience}、
                                        {economy.labels.points} {economy.checkin.rewards.points}
                                        {economy.checkin.rewards.balanceCents > 0
                                            ? `、${economy.labels.balance} ¥${(economy.checkin.rewards.balanceCents / 100).toFixed(2)}`
                                            : ''}
                                        。
                                    </p>
                                    {checkinCaptchaRequired ? (
                                        <p className="text-[11px] leading-5 text-ink-faint">
                                            点击签到后会弹出人机验证，完成拼图即可领取奖励。
                                        </p>
                                    ) : null}
                                </div>
                            ) : null}
                        </>
                    ) : null}
                </section>
            ) : null}

            <section className="surface-card card-pad">
                        <div className="mb-5">
                            <p className="section-label">Account settings</p>
                            <h3 className="mt-1.5 text-[18px] font-medium">
                                {sectionTitles[section].title}
                            </h3>
                            <p className="mt-1 text-[12px] leading-5 text-ink-mute">
                                {sectionTitles[section].description}
                            </p>
                        </div>

                        {section === 'profile' ? (
                            <>
                            <form className="grid gap-4" onSubmit={(event) => void saveProfile(event)}>
                                <div className="grid gap-4 sm:grid-cols-2">
                                    <label className="grid gap-1.5">
                                        <span className="text-[12px] font-medium text-ink-soft">显示名称</span>
                                        <Input
                                            className="h-10"
                                            value={screenName}
                                            onChange={(event) => setScreenName(event.target.value)}
                                            maxLength={150}
                                        />
                                    </label>
                                    {api.enhanced ? (
                                        <label className="grid gap-1.5">
                                            <span className="text-[12px] font-medium text-ink-soft">个性签名</span>
                                            <Input
                                                className="h-10"
                                                value={details.signature}
                                                onChange={(event) =>
                                                    setDetails((current) => ({
                                                        ...current,
                                                        signature: event.target.value,
                                                    }))
                                                }
                                                maxLength={120}
                                                placeholder="一句话介绍自己"
                                            />
                                        </label>
                                    ) : null}
                                </div>
                                {api.enhanced ? (
                                    <>
                                        <div className="grid gap-2">
                                            <span className="text-[12px] font-medium text-ink-soft">头像</span>
                                            <div className="flex flex-wrap items-center gap-3 rounded-[6px] border border-line bg-surface-2 p-3">
                                                <ProfileAvatar
                                                    profile={avatarPreview}
                                                    className="size-14 border border-line shadow-sm"
                                                />
                                                <div className="min-w-0 flex-1">
                                                    <p className="truncate text-[12px] text-ink-soft">
                                                        {details.avatar
                                                            ? '已选择自定义头像'
                                                            : '当前使用站点头像源'}
                                                    </p>
                                                    <p className="mt-0.5 text-[11px] leading-5 text-ink-faint">
                                                        头像图片上传到媒体库，保存后立即生效。
                                                    </p>
                                                </div>
                                                <div className="flex shrink-0 flex-wrap items-center gap-1">
                                                    <Button
                                                        type="button"
                                                        variant="outline"
                                                        size="sm"
                                                        disabled={!api.avatarMediaEnabled}
                                                        onClick={() => setAvatarMediaOpen(true)}
                                                    >
                                                        从媒体库选择
                                                    </Button>
                                                </div>
                                            </div>
                                            {!api.avatarMediaEnabled ? (
                                                <span className="text-[11px] leading-5 text-ink-faint">
                                                    媒体库接口未启用，暂时无法更换头像。
                                                </span>
                                            ) : null}
                                        </div>
                                        <div className="grid gap-2">
                                            <span className="text-[12px] font-medium text-ink-soft">
                                                个人主页背景
                                            </span>
                                            <div className="flex flex-wrap items-center gap-3 rounded-[6px] border border-line bg-surface-2 p-3">
                                                <span
                                                    className="account-cover-thumb shrink-0"
                                                    style={
                                                        details.background !== ''
                                                            ? {
                                                                  backgroundImage: cssUrl(
                                                                      details.background
                                                                  ),
                                                              }
                                                            : undefined
                                                    }
                                                    aria-hidden="true"
                                                />
                                                <div className="min-w-0 flex-1">
                                                    <p className="truncate text-[12px] text-ink-soft">
                                                        {details.background
                                                            ? '已设置个人主页背景'
                                                            : '使用站点默认渐变背景'}
                                                    </p>
                                                    <p className="mt-0.5 text-[11px] leading-5 text-ink-faint">
                                                        背景会显示在用户中心与个人空间的顶部横幅。
                                                    </p>
                                                </div>
                                                <Button
                                                    type="button"
                                                    variant="outline"
                                                    size="sm"
                                                    disabled={
                                                        !api.avatarMediaEnabled
                                                        || !detailsReady
                                                        || backgroundBusy
                                                    }
                                                    onClick={() => setBackgroundMediaOpen(true)}
                                                >
                                                    <Camera aria-hidden="true" />
                                                    {backgroundBusy ? '保存中…' : '从媒体库选择'}
                                                </Button>
                                            </div>
                                            {!api.avatarMediaEnabled ? (
                                                <span className="text-[11px] leading-5 text-ink-faint">
                                                    媒体库接口未启用，暂时无法更换背景。
                                                </span>
                                            ) : null}
                                        </div>
                                        <div className="grid gap-4 sm:grid-cols-2">
                                            <label className="grid gap-1.5">
                                                <span className="text-[12px] font-medium text-ink-soft">性别</span>
                                                <select
                                                    className="h-10 rounded-[4px] border border-line bg-surface px-3 text-[13px] text-ink outline-none transition-[border-color,box-shadow] focus-visible:border-brand focus-visible:ring-[3px] focus-visible:ring-brand/20"
                                                    value={details.gender}
                                                    onChange={(event) =>
                                                        setDetails((current) => ({
                                                            ...current,
                                                            gender: event.target.value,
                                                        }))
                                                    }
                                                >
                                                    {Object.entries(GENDER_LABELS).map(([value, label]) => (
                                                        <option key={value} value={value}>
                                                            {label}
                                                        </option>
                                                    ))}
                                                </select>
                                            </label>
                                            <label className="grid gap-1.5">
                                                <span className="text-[12px] font-medium text-ink-soft">隐私设置</span>
                                                <select
                                                    className="h-10 rounded-[4px] border border-line bg-surface px-3 text-[13px] text-ink outline-none transition-[border-color,box-shadow] focus-visible:border-brand focus-visible:ring-[3px] focus-visible:ring-brand/20"
                                                    value={details.privacy}
                                                    onChange={(event) =>
                                                        setDetails((current) => ({
                                                            ...current,
                                                            privacy: event.target.value,
                                                        }))
                                                    }
                                                >
                                                    {Object.entries(PRIVACY_LABELS).map(([value, label]) => (
                                                        <option key={value} value={value}>
                                                            {label}
                                                        </option>
                                                    ))}
                                                </select>
                                            </label>
                                        </div>
                                        <div className="grid gap-4 sm:grid-cols-2">
                                            <label className="grid gap-1.5">
                                                <span className="text-[12px] font-medium text-ink-soft">居住地</span>
                                                <Input
                                                    className="h-10"
                                                    value={details.location}
                                                    onChange={(event) =>
                                                        setDetails((current) => ({
                                                            ...current,
                                                            location: event.target.value,
                                                        }))
                                                    }
                                                    maxLength={64}
                                                    placeholder="例如：广东 深圳"
                                                />
                                            </label>
                                            <label className="grid gap-1.5">
                                                <span className="text-[12px] font-medium text-ink-soft">个人主页</span>
                                                <Input
                                                    className="h-10"
                                                    type="url"
                                                    value={url}
                                                    onChange={(event) => setUrl(event.target.value)}
                                                    maxLength={255}
                                                    placeholder="https://example.com"
                                                />
                                            </label>
                                        </div>
                                    </>
                                ) : (
                                    <label className="grid gap-1.5">
                                        <span className="text-[12px] font-medium text-ink-soft">个人主页</span>
                                        <Input
                                            className="h-10"
                                            type="url"
                                            value={url}
                                            onChange={(event) => setUrl(event.target.value)}
                                            maxLength={255}
                                            placeholder="https://example.com"
                                        />
                                    </label>
                                )}
                                {api.enhanced && !detailsReady ? (
                                    <p className="rounded-[4px] bg-destructive/10 px-3 py-2 text-[12px] leading-5 text-destructive">
                                        更多资料尚未加载完成，保存按钮已暂时禁用。请刷新页面重试。
                                    </p>
                                ) : null}
                                <div>
                                    <Button
                                        type="submit"
                                        disabled={profileBusy || (api.enhanced && !detailsReady)}
                                    >
                                        {profileBusy ? (
                                            <>
                                                <LoaderCircle className="animate-spin" aria-hidden="true" />
                                                保存中…
                                            </>
                                        ) : (
                                            '保存资料'
                                        )}
                                    </Button>
                                </div>
                            </form>
                            {api.certificationEnabled ? (
                                <section className="mt-6 rounded-[8px] border border-line bg-surface-2 p-4">
                                    <div className="flex flex-wrap items-start justify-between gap-3">
                                        <div>
                                            <h4 className="flex items-center gap-2 text-[14px] font-medium">
                                                <UserCheck
                                                    className="size-4 text-ink-mute"
                                                    strokeWidth={1.8}
                                                    aria-hidden="true"
                                                />
                                                身份认证
                                            </h4>
                                            <p className="mt-1 text-[12px] leading-5 text-ink-mute">
                                                提交真实身份或组织信息，管理员审核通过后会在个人空间展示认证徽章。
                                            </p>
                                        </div>
                                        <span
                                            className={
                                                'chip ' +
                                                (certification?.status === 'approved'
                                                    ? 'border-[rgba(77,163,255,0.35)] bg-[rgba(77,163,255,0.1)] text-[#2d7dd2]'
                                                    : certification?.status === 'pending'
                                                      ? 'border-[rgba(245,158,11,0.3)] bg-[rgba(245,158,11,0.1)] text-[#b45309]'
                                                      : certification?.status === 'rejected'
                                                        ? 'border-[rgba(229,72,77,0.3)] bg-[rgba(229,72,77,0.08)] text-[#d94848]'
                                                        : '')
                                            }
                                        >
                                            <BadgeCheck className="size-3.5" strokeWidth={2} aria-hidden="true" />
                                            {certification?.status === 'approved'
                                                ? '已认证'
                                                : certification?.status === 'pending'
                                                  ? '审核中'
                                                  : certification?.status === 'rejected'
                                                    ? '未通过'
                                                    : '未认证'}
                                        </span>
                                    </div>

                                    {certification?.status === 'approved' ? (
                                        <div className="mt-4 rounded-[6px] border border-line bg-surface px-3 py-3 text-[12px] leading-5 text-ink-soft">
                                            <p className="font-medium text-ink">
                                                {certification.name || '已认证用户'}
                                            </p>
                                            <p className="mt-0.5 text-ink-mute">
                                                {certification.type === 'organization'
                                                    ? '组织认证'
                                                    : '个人认证'}
                                                {certification.reviewed > 0
                                                    ? ` · ${new Date(certification.reviewed * 1000).toLocaleDateString()}`
                                                    : ''}
                                            </p>
                                        </div>
                                    ) : null}

                                    {certification?.status === 'pending' ? (
                                        <p className="mt-4 rounded-[6px] border border-line bg-surface px-3 py-3 text-[12px] leading-5 text-ink-mute">
                                            申请已提交，管理员审核后会在个人空间展示认证徽章。
                                        </p>
                                    ) : null}

                                    {certification?.status === 'rejected' ? (
                                        <p className="mt-4 rounded-[6px] border border-[rgba(229,72,77,0.25)] bg-[rgba(229,72,77,0.06)] px-3 py-3 text-[12px] leading-5 text-[#b93b3b]">
                                            认证未通过
                                            {certification.reason !== ''
                                                ? `：${certification.reason}`
                                                : '，请补充材料后重新提交。'}
                                        </p>
                                    ) : null}

                                    {certification?.status !== 'approved' && certification?.status !== 'pending' ? (
                                        <form className="mt-4 grid gap-3" onSubmit={(event) => void submitCertification(event)}>
                                            <div className="grid gap-3 sm:grid-cols-[180px_minmax(0,1fr)]">
                                                <label className="grid gap-1.5">
                                                    <span className="text-[12px] font-medium text-ink-soft">认证类型</span>
                                                    <select
                                                        className="h-10 rounded-[4px] border border-line bg-surface px-3 text-[13px] text-ink outline-none transition-[border-color,box-shadow] focus-visible:border-brand focus-visible:ring-[3px] focus-visible:ring-brand/20"
                                                        value={certType}
                                                        onChange={(event) =>
                                                            setCertType(
                                                                event.target.value === 'organization'
                                                                    ? 'organization'
                                                                    : 'personal'
                                                            )
                                                        }
                                                    >
                                                        <option value="personal">个人认证</option>
                                                        <option value="organization">组织认证</option>
                                                    </select>
                                                </label>
                                                <label className="grid gap-1.5">
                                                    <span className="text-[12px] font-medium text-ink-soft">
                                                        {certType === 'organization' ? '组织名称' : '真实姓名'}
                                                    </span>
                                                    <Input
                                                        className="h-10"
                                                        value={certName}
                                                        onChange={(event) => setCertName(event.target.value)}
                                                        maxLength={64}
                                                        placeholder={
                                                            certType === 'organization'
                                                                ? '例如：SunkenBoat Studio'
                                                                : '例如：张三'
                                                        }
                                                    />
                                                </label>
                                            </div>
                                            <label className="grid gap-1.5">
                                                <span className="text-[12px] font-medium text-ink-soft">认证说明</span>
                                                <textarea
                                                    className="min-h-[88px] rounded-[4px] border border-line bg-surface px-3 py-2 text-[13px] text-ink outline-none transition-[border-color,box-shadow] focus-visible:border-brand focus-visible:ring-[3px] focus-visible:ring-brand/20"
                                                    value={certNote}
                                                    onChange={(event) => setCertNote(event.target.value)}
                                                    maxLength={500}
                                                    placeholder="请填写认证依据、个人主页或其他可核验信息"
                                                />
                                            </label>
                                            <div className="flex items-center gap-2">
                                                <Button type="submit" disabled={certBusy}>
                                                    {certBusy ? (
                                                        <>
                                                            <LoaderCircle className="animate-spin" aria-hidden="true" />
                                                            提交中…
                                                        </>
                                                    ) : (
                                                        '提交认证'
                                                    )}
                                                </Button>
                                                <span className="text-[11px] text-ink-faint">
                                                    认证资料仅管理员可见
                                                </span>
                                            </div>
                                        </form>
                                    ) : null}
                                </section>
                            ) : null}
                            </>
                        ) : null}

                        {section === 'security' ? (
                            <div className="grid gap-6">
                                <form className="grid gap-4" onSubmit={(event) => void saveMail(event)}>
                                    <div>
                                        <h4 className="flex items-center gap-2 text-[14px] font-medium">
                                            <Mail className="size-4 text-ink-mute" strokeWidth={1.8} aria-hidden="true" />
                                            登录邮箱
                                        </h4>
                                        <p className="mt-1 text-[12px] leading-5 text-ink-mute">
                                            {api.emailVerify
                                                ? '更换邮箱前需要先向新邮箱发送验证码。'
                                                : '邮箱用于登录和接收站点通知。'}
                                        </p>
                                    </div>
                                    <label className="grid gap-1.5">
                                        <span className="text-[12px] font-medium text-ink-soft">新邮箱</span>
                                        <Input
                                            className="h-10"
                                            type="email"
                                            value={mail}
                                            onChange={(event) => setMail(event.target.value)}
                                            autoComplete="email"
                                            maxLength={64}
                                            required
                                            disabled={!api.emailChangeEnabled}
                                        />
                                    </label>
                                    {api.emailVerify ? (
                                        <div className="grid gap-1.5">
                                            <span className="text-[12px] font-medium text-ink-soft">邮箱验证码</span>
                                            <div className="flex gap-2">
                                                <Input
                                                    className="h-10 min-w-0 flex-1"
                                                    value={emailCode}
                                                    onChange={(event) => setEmailCode(event.target.value)}
                                                    inputMode="numeric"
                                                    pattern="[0-9]*"
                                                    maxLength={6}
                                                    autoComplete="one-time-code"
                                                    disabled={!api.emailChangeEnabled}
                                                />
                                                <Button
                                                    type="button"
                                                    variant="outline"
                                                    className="h-10 shrink-0 px-3 text-[12px]"
                                                    disabled={
                                                        sendingCode ||
                                                        cooldown > 0 ||
                                                        mail.trim() === '' ||
                                                        !api.emailChangeEnabled
                                                    }
                                                    onClick={() => void sendEmailCode()}
                                                >
                                                    {cooldown > 0
                                                        ? `${cooldown}s 后重发`
                                                        : sendingCode
                                                          ? '发送中…'
                                                          : '发送验证码'}
                                                </Button>
                                            </div>
                                        </div>
                                    ) : null}
                                    {!api.emailChangeEnabled ? (
                                        <p className="rounded-[4px] bg-destructive/10 px-3 py-2 text-[12px] leading-5 text-destructive">
                                            邮件服务尚未配置，暂时无法更换登录邮箱。
                                        </p>
                                    ) : null}
                                    <div>
                                        <Button type="submit" disabled={mailBusy || !api.emailChangeEnabled}>
                                            {mailBusy ? (
                                                <>
                                                    <LoaderCircle className="animate-spin" aria-hidden="true" />
                                                    保存中…
                                                </>
                                            ) : (
                                                '更新邮箱'
                                            )}
                                        </Button>
                                    </div>
                                </form>

                                <div className="border-t border-line pt-6">
                                    <form className="grid gap-4" onSubmit={(event) => void savePassword(event)}>
                                        <div>
                                            <h4 className="flex items-center gap-2 text-[14px] font-medium">
                                                <KeyRound className="size-4 text-ink-mute" strokeWidth={1.8} aria-hidden="true" />
                                                修改密码
                                            </h4>
                                            <p className="mt-1 text-[12px] leading-5 text-ink-mute">
                                                修改后当前设备会自动续期，其他设备上的旧登录凭证会失效。
                                            </p>
                                        </div>
                                        <label className="grid gap-1.5">
                                            <span className="text-[12px] font-medium text-ink-soft">当前密码</span>
                                            <Input
                                                className="h-10"
                                                type="password"
                                                value={currentPassword}
                                                onChange={(event) => setCurrentPassword(event.target.value)}
                                                autoComplete="current-password"
                                                maxLength={200}
                                                required
                                            />
                                        </label>
                                        <div className="grid gap-4 sm:grid-cols-2">
                                            <label className="grid gap-1.5">
                                                <span className="text-[12px] font-medium text-ink-soft">新密码</span>
                                                <Input
                                                    className="h-10"
                                                    type="password"
                                                    value={newPassword}
                                                    onChange={(event) => setNewPassword(event.target.value)}
                                                    autoComplete="new-password"
                                                    minLength={6}
                                                    maxLength={18}
                                                    required
                                                />
                                            </label>
                                            <label className="grid gap-1.5">
                                                <span className="text-[12px] font-medium text-ink-soft">确认新密码</span>
                                                <Input
                                                    className="h-10"
                                                    type="password"
                                                    value={confirmPassword}
                                                    onChange={(event) => setConfirmPassword(event.target.value)}
                                                    autoComplete="new-password"
                                                    minLength={6}
                                                    maxLength={18}
                                                    required
                                                />
                                            </label>
                                        </div>
                                        <div>
                                            <Button type="submit" disabled={passwordBusy}>
                                                {passwordBusy ? (
                                                    <>
                                                        <LoaderCircle className="animate-spin" aria-hidden="true" />
                                                        修改中…
                                                    </>
                                                ) : (
                                                    '修改密码'
                                                )}
                                            </Button>
                                        </div>
                                    </form>
                                </div>
                            </div>
                        ) : null}

                        {section === 'social' ? (
                            api.oauth?.enabled ? (
                                <div className="grid gap-4">
                                    {oauthProviders.map((provider) => (
                                        <div
                                            key={provider.id}
                                            className="flex flex-wrap items-center gap-3 rounded-[6px] border border-line bg-surface-2 p-3"
                                        >
                                            <UserAvatar
                                                name={provider.name || provider.label}
                                                avatar={provider.avatar}
                                                className="size-11"
                                            />
                                            <div className="min-w-0 flex-1">
                                                <p className="text-[13px] font-medium">
                                                    {provider.label}
                                                    <span
                                                        className={
                                                            'ml-2 text-[11px] font-normal ' +
                                                            (provider.bound
                                                                ? 'text-brand'
                                                                : 'text-ink-faint')
                                                        }
                                                    >
                                                        {provider.bound ? '已绑定' : '未绑定'}
                                                    </span>
                                                </p>
                                                <p className="mt-0.5 truncate text-[12px] text-ink-mute">
                                                    {provider.bound
                                                        ? provider.name || '已授权'
                                                        : `绑定后可使用 ${provider.label} 登录`}
                                                </p>
                                            </div>
                                            {provider.bound ? (
                                                <Button
                                                    type="button"
                                                    variant="outline"
                                                    size="sm"
                                                    className="shrink-0"
                                                    disabled={oauthBusy !== ''}
                                                    onClick={() => void unbindOAuth(provider)}
                                                >
                                                    {oauthBusy === provider.id ? (
                                                        <LoaderCircle
                                                            className="animate-spin"
                                                            aria-hidden="true"
                                                        />
                                                    ) : (
                                                        <Unlink aria-hidden="true" />
                                                    )}
                                                    {oauthBusy === provider.id ? '解绑中…' : '解绑'}
                                                </Button>
                                            ) : (
                                                <Button
                                                    asChild
                                                    variant="outline"
                                                    size="sm"
                                                    className="shrink-0"
                                                >
                                                    <a
                                                        href={`${api.oauth?.startBase}/${provider.id}/start`}
                                                    >
                                                        <ExternalLink aria-hidden="true" />
                                                        去绑定
                                                    </a>
                                                </Button>
                                            )}
                                        </div>
                                    ))}

                                    {oauthProviders.length === 0 ? (
                                        <div className="rounded-[6px] border border-dashed border-line bg-surface-2 px-5 py-8 text-center">
                                            {api.oauth?.nullImage ? (
                                                <img
                                                    className="mx-auto w-48 max-w-full opacity-80"
                                                    src={api.oauth.nullImage}
                                                    alt=""
                                                    loading="lazy"
                                                />
                                            ) : null}
                                            <p className="mt-3 text-[13px] font-medium">
                                                暂未配置社交平台
                                            </p>
                                            <p className="mt-1 text-[12px] leading-5 text-ink-mute">
                                                管理员完成任一 OAuth 平台的 App ID 与密钥配置后，这里会出现对应的绑定入口。
                                            </p>
                                        </div>
                                    ) : socialCount === 0 ? (
                                        <div className="rounded-[6px] border border-dashed border-line bg-surface-2 px-5 py-8 text-center">
                                            {api.oauth?.nullImage ? (
                                                <img
                                                    className="mx-auto w-48 max-w-full opacity-80"
                                                    src={api.oauth.nullImage}
                                                    alt=""
                                                    loading="lazy"
                                                />
                                            ) : null}
                                            <p className="mt-3 text-[13px] font-medium">
                                                尚未绑定社交账号
                                            </p>
                                            <p className="mt-1 text-[12px] leading-5 text-ink-mute">
                                                绑定后可使用对应平台一键登录，无需输入本站密码。
                                            </p>
                                        </div>
                                    ) : null}

                                    <p className="text-[11px] leading-5 text-ink-faint">
                                        绑定社交账号后，您可更安全、更快速地登录本站。
                                    </p>
                                </div>
                            ) : (
                                <div className="rounded-[6px] border border-dashed border-line bg-surface-2 px-5 py-8 text-center">
                                    <p className="text-[13px] font-medium">
                                        站点尚未开放社交账号登录
                                    </p>
                                    <p className="mt-1 text-[12px] leading-5 text-ink-mute">
                                        管理员启用 OAuth 登录后，这里会显示可绑定的社交平台。
                                    </p>
                                </div>
                            )
                        ) : null}

                        {section === 'content' ? (
                            <div className="grid gap-[15px]">
                                <ContentManager api={api} profile={profile} />
                            </div>
                        ) : null}

                        {section === 'downloads' ? (
                            <DownloadHistory client={api.downloads} />
                        ) : null}
            </section>

            <Dialog open={certDetailsOpen} onOpenChange={setCertDetailsOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <BadgeCheck className="size-5 text-[#2d7dd2]" aria-hidden="true" />
                            认证详情
                        </DialogTitle>
                        <DialogDescription>
                            该认证由站点管理员审核，认证信息会展示在个人资料与用户空间。
                        </DialogDescription>
                    </DialogHeader>
                    {certification ? (
                        <div className="grid gap-3 text-[13px]">
                            <div className="rounded-[6px] border border-line bg-surface-2 px-3.5 py-3">
                                <p className="text-[11px] text-ink-faint">认证名称</p>
                                <p className="mt-1 font-medium text-ink">
                                    {certification.name || '已认证用户'}
                                </p>
                            </div>
                            <div className="grid gap-3 sm:grid-cols-2">
                                <div className="rounded-[6px] border border-line px-3.5 py-3">
                                    <p className="text-[11px] text-ink-faint">认证类型</p>
                                    <p className="mt-1 text-ink-soft">
                                        {certification.type === 'organization'
                                            ? '组织认证'
                                            : '个人认证'}
                                    </p>
                                </div>
                                <div className="rounded-[6px] border border-line px-3.5 py-3">
                                    <p className="text-[11px] text-ink-faint">审核时间</p>
                                    <p className="mt-1 text-ink-soft">
                                        {certification.reviewed > 0
                                            ? new Date(
                                                  certification.reviewed * 1000
                                              ).toLocaleString()
                                            : '暂无记录'}
                                    </p>
                                </div>
                            </div>
                            <div className="rounded-[6px] border border-line px-3.5 py-3">
                                <p className="text-[11px] text-ink-faint">认证说明</p>
                                <p className="mt-1 whitespace-pre-wrap break-words leading-6 text-ink-soft">
                                    {certification.note || '未填写认证说明。'}
                                </p>
                            </div>
                            {certification.reason ? (
                                <div className="rounded-[6px] border border-line px-3.5 py-3">
                                    <p className="text-[11px] text-ink-faint">审核备注</p>
                                    <p className="mt-1 break-words leading-6 text-ink-soft">
                                        {certification.reason}
                                    </p>
                                </div>
                            ) : null}
                        </div>
                    ) : (
                        <p className="rounded-[6px] border border-dashed border-line bg-surface-2 px-3.5 py-6 text-center text-[12px] text-ink-faint">
                            暂无认证信息。
                        </p>
                    )}
                </DialogContent>
            </Dialog>

            <CaptchaDialog
                open={checkinCaptchaOpen}
                onOpenChange={setCheckinCaptchaOpen}
                config={api.captcha}
                scene="checkin"
                title="完成验证后签到"
                description="拖动拼图块完成人机验证，验证通过后会自动签到并领取奖励。"
                onVerified={(value) => {
                    setCheckinCaptcha(value);
                    void runCheckin(value);
                }}
            />

            <MediaLibrary
                open={avatarMediaOpen}
                onOpenChange={setAvatarMediaOpen}
                mediaEndpoint={api.avatarMedia}
                uploadPurpose="avatar"
                allowDelete={false}
                title="选择头像"
                description="从媒体库选择或上传头像图片"
                onSelect={(item) => {
                    setDetails((current) => ({ ...current, avatar: item.url }));
                    setAvatarMediaOpen(false);
                }}
            />
            <MediaLibrary
                open={backgroundMediaOpen}
                onOpenChange={setBackgroundMediaOpen}
                mediaEndpoint={api.avatarMedia}
                uploadPurpose="background"
                allowDelete={false}
                title="选择个人主页背景"
                description="从媒体库选择或上传背景图片"
                onSelect={(item) => {
                    const nextDetails = { ...details, background: item.url };
                    setDetails(nextDetails);
                    setBackgroundMediaOpen(false);
                    void saveBackground(nextDetails);
                }}
            />
        </div>
    );
}

