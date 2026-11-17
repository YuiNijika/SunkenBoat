interface Props {
    html: string;
    label?: string;
}

/**
 * Typecho renders the pager markup server side; the React layer only styles
 * and positions it so the framework keeps its pagination semantics.
 */
export default function Pagination({ html, label = '分页' }: Props) {
    if (!html.trim()) {
        return null;
    }

    return <nav className="pagination" aria-label={label} dangerouslySetInnerHTML={{ __html: html }} />;
}
