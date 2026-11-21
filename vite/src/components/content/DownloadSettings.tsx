import type { DownloadConfig } from '../../lib/downloads';
import { Checkbox } from '../ui/checkbox';
import { Input } from '../ui/input';
import EditorMetaBox from './EditorMetaBox';

interface Props {
    value: DownloadConfig;
    enabled: boolean;
    paymentEnabled: boolean;
    disabled?: boolean;
    onChange: (value: DownloadConfig) => void;
}

export function downloadConfigError(value: DownloadConfig): string | null {
    if (!value.enabled) {
        return null;
    }

    try {
        const target = new URL(value.url.trim());
        if (
            !['http:', 'https:'].includes(target.protocol)
            || target.username !== ''
            || target.password !== ''
            || /[\u0000-\u0020]/u.test(value.url.trim())
        ) {
            return '请填写有效的 HTTP 或 HTTPS 下载链接。';
        }
    } catch {
        return '请填写有效的 HTTP 或 HTTPS 下载链接。';
    }

    if (
        value.paid
        && (!/^\d{1,6}(\.\d{1,2})?$/u.test(value.price.trim()) || Number(value.price) <= 0)
    ) {
        return '请填写大于 0、最多两位小数的下载价格。';
    }

    return null;
}

export default function DownloadSettings({
    value,
    enabled,
    paymentEnabled,
    disabled = false,
    onChange,
}: Props) {
    if (!enabled && !value.enabled) {
        return null;
    }

    return (
        <EditorMetaBox title="资源下载">
            <label className="content-check">
                <Checkbox
                    checked={value.enabled}
                    disabled={disabled || (!enabled && !value.enabled)}
                    onCheckedChange={(checked) => onChange({ ...value, enabled: checked === true })}
                />
                <span>启用下载</span>
            </label>
            {value.enabled ? (
                <div className="grid min-w-0 gap-3">
                    <label className="editor-field">
                        <span className="editor-field-head">下载链接</span>
                        <Input
                            type="url"
                            value={value.url}
                            onChange={(event) => onChange({ ...value, url: event.target.value })}
                            placeholder="https://"
                            maxLength={2048}
                            disabled={disabled}
                        />
                    </label>
                    <label className="content-check">
                        <Checkbox
                            checked={value.paid}
                            disabled={disabled || (!paymentEnabled && !value.paid)}
                            onCheckedChange={(checked) =>
                                onChange({ ...value, paid: checked === true })
                            }
                        />
                        <span>启用付费下载</span>
                    </label>
                    {value.paid ? (
                        <label className="editor-field">
                            <span className="editor-field-head">价格（元）</span>
                            <Input
                                type="number"
                                inputMode="decimal"
                                min="0.01"
                                max="999999.99"
                                step="0.01"
                                value={value.price}
                                onChange={(event) =>
                                    onChange({ ...value, price: event.target.value })
                                }
                                disabled={disabled}
                            />
                        </label>
                    ) : null}
                    {!paymentEnabled ? (
                        <p className="editor-meta-note">站点暂未开放付费下载。</p>
                    ) : null}
                </div>
            ) : null}
        </EditorMetaBox>
    );
}
