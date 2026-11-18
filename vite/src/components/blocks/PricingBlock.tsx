import { Check } from 'lucide-react';
import SectionHeading from '../content/SectionHeading';
import type { CSSProperties } from 'react';
import type { PricingPlan } from '../../types';

interface Props {
    title: string;
    text: string;
    columns: number;
    plans: PricingPlan[];
}

export default function PricingBlock({ title, text, columns, plans }: Props) {
    if (plans.length === 0) {
        return null;
    }

    const style = { '--plan-cols': Math.max(2, Math.min(4, columns)) } as CSSProperties;

    return (
        <section className="grid gap-[15px]">
            <SectionHeading title={title} description={text} align="center" />
            <ul className="pricing-grid" style={style}>
                {plans.map((plan) => (
                    <li
                        key={plan.name + plan.price}
                        className={'pricing-card' + (plan.featured ? ' is-featured' : '')}
                    >
                        {plan.featured ? <span className="pricing-badge">推荐</span> : null}
                        <h3>{plan.name}</h3>
                        <p className="pricing-price">
                            <span>{plan.price}</span>
                            {plan.period ? <small>{plan.period}</small> : null}
                        </p>
                        {plan.features.length > 0 ? (
                            <ul className="pricing-features">
                                {plan.features.map((feature) => (
                                    <li key={feature}>
                                        <Check aria-hidden="true" />
                                        {feature}
                                    </li>
                                ))}
                            </ul>
                        ) : null}
                        <a className="pricing-action" href={plan.action.url}>
                            {plan.action.label}
                        </a>
                    </li>
                ))}
            </ul>
        </section>
    );
}
