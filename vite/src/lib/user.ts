import type { UserCertification, UserProfile } from '../types';

export interface ApiPayload {
    data?: unknown;
    message?: string;
    errors?: Record<string, unknown>;
    meta?: {
        page?: number;
        pageSize?: number;
        total?: number;
        lastPage?: number;
        [key: string]: unknown;
    };
}

const MESSAGES: Record<string, string> = {
    'Authentication required': '请先登录',
    'Endpoint not found': '接口不存在',
    'Email delivery is unavailable': '邮件服务尚未配置，请联系站点管理员',
    'SMS delivery is unavailable': '短信服务尚未配置，请联系站点管理员',
    'Invalid credentials': '用户名或密码无效',
    'Invalid email address': '电子邮箱格式错误',
    'Invalid password': '密码不符合要求',
    'Invalid request body': '请检查填写的内容',
    'Invalid verification code': '验证码无效或已过期',
    'Invalid SMS verification code': '短信验证码无效或已过期',
    'SMS registration requires enhanced user profiles': '短信注册需要先在用户设置中启用更多资料',
    'Invalid phone number': '手机号格式无效',
    'Invalid user name': '用户名不符合要求',
    'Method not allowed': '请求方式不受支持',
    'Password reset is disabled': '本站尚未开放邮箱找回密码',
    'Please wait before requesting another code': '发送过于频繁，请稍后再试',
    'Registration verification failed': '注册验证失败，请重新获取验证码',
    'Registration is disabled': '站点未开放注册',
    'The last administrator cannot be removed or demoted': '不能删除或降级最后一个管理员',
    'Unable to deliver mail': '验证码邮件发送失败，请检查邮件服务配置',
    'Unable to send SMS verification code': '短信验证码发送失败，请检查短信服务配置',
    'Unable to create the user': '注册失败，请稍后再试',
    'Unable to send verification email': '验证码邮件发送失败，请稍后再试',
    'User already exists': '用户名或邮箱已被占用',
    'User not found': '用户不存在',
};

export function errorMessage(payload: ApiPayload | null, fallback: string): string {
    if (payload?.errors && typeof payload.errors === 'object') {
        for (const value of Object.values(payload.errors)) {
            if (typeof value === 'string' && value.trim() !== '') {
                return value;
            }
        }
    }

    const message = typeof payload?.message === 'string' ? payload.message.trim() : '';
    if (message !== '') {
        return MESSAGES[message] ?? message;
    }

    return fallback;
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

export function profileFrom(payload: ApiPayload | null): UserProfile | null {
    const data = payload?.data;
    if (!data || typeof data !== 'object') {
        return null;
    }

    const candidate = (data as { user?: unknown }).user ?? data;
    if (!candidate || typeof candidate !== 'object') {
        return null;
    }

    const profile = candidate as Partial<UserProfile>;
    if (typeof profile.uid !== 'number' || profile.uid <= 0) {
        return null;
    }

    return {
        uid: profile.uid,
        name: String(profile.name ?? ''),
        screenName: String(profile.screenName ?? ''),
        mail: String(profile.mail ?? ''),
        url: String(profile.url ?? ''),
        group: String(profile.group ?? ''),
        created: String(profile.created ?? ''),
        avatar: String(profile.avatar ?? ''),
        customAvatar: String(profile.customAvatar ?? ''),
        background: String(profile.background ?? ''),
        signature: String(profile.signature ?? ''),
        gender: String(profile.gender ?? 'secret'),
        privacy: String(profile.privacy ?? 'public'),
        location: String(profile.location ?? ''),
        posts: Number.isFinite(Number(profile.posts)) ? Math.max(0, Math.round(Number(profile.posts))) : 0,
        comments: Number.isFinite(Number(profile.comments))
            ? Math.max(0, Math.round(Number(profile.comments)))
            : 0,
        circles: Number.isFinite(Number(profile.circles))
            ? Math.max(0, Math.round(Number(profile.circles)))
            : undefined,
        joinedCircles: Number.isFinite(Number(profile.joinedCircles))
            ? Math.max(0, Math.round(Number(profile.joinedCircles)))
            : undefined,
        createdCircles: Number.isFinite(Number(profile.createdCircles))
            ? Math.max(0, Math.round(Number(profile.createdCircles)))
            : undefined,
        canWrite: profile.canWrite === true,
        certificationEnabled: profile.certificationEnabled === true,
        certification: certificationFrom(profile.certification),
    };
}

export async function readPayload(response: Response): Promise<ApiPayload | null> {
    try {
        return (await response.json()) as ApiPayload;
    } catch {
        return null;
    }
}

export type EmailCodePurpose = 'register' | 'reset' | 'email';

export interface EmailCodeResult {
    cooldown: number;
    expiresIn: number;
}

export async function requestEmailCode(
    endpoint: string,
    mail: string,
    purpose: EmailCodePurpose
): Promise<EmailCodeResult> {
    const response = await fetch(endpoint, {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ mail: mail.trim(), purpose }),
    });
    const payload = await readPayload(response);
    if (!response.ok) {
        throw new Error(errorMessage(payload, '验证码发送失败，请稍后再试'));
    }

    const data =
        payload?.data && typeof payload.data === 'object'
            ? (payload.data as { cooldown?: unknown; expiresIn?: unknown })
            : null;
    const cooldown = Number(data?.cooldown);
    const expiresIn = Number(data?.expiresIn);

    return {
        cooldown: Number.isFinite(cooldown) && cooldown > 0 ? Math.round(cooldown) : 60,
        expiresIn: Number.isFinite(expiresIn) && expiresIn > 0 ? Math.round(expiresIn) : 600,
    };
}

export async function requestSmsCode(
    endpoint: string,
    phone: string
): Promise<EmailCodeResult> {
    const response = await fetch(endpoint, {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ phone: phone.trim(), purpose: 'register' }),
    });
    const payload = await readPayload(response);
    if (!response.ok) {
        throw new Error(errorMessage(payload, '短信验证码发送失败，请稍后再试'));
    }

    const data =
        payload?.data && typeof payload.data === 'object'
            ? (payload.data as { cooldown?: unknown; expiresIn?: unknown })
            : null;
    const cooldown = Number(data?.cooldown);
    const expiresIn = Number(data?.expiresIn);

    return {
        cooldown: Number.isFinite(cooldown) && cooldown > 0 ? Math.round(cooldown) : 60,
        expiresIn: Number.isFinite(expiresIn) && expiresIn > 0 ? Math.round(expiresIn) : 600,
    };
}
