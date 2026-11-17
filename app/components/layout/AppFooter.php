<?php

declare(strict_types=1);

if (!defined('__TYPECHO_ROOT_DIR__')) {
    exit;
}

use TTDF\Hooks\Hooks;

$archive = $viewData['archive'] ?? null;
?>
</div>
<?php
Hooks::doAction('theme.before_footer', $archive);
Hooks::doAction('theme.after_main', $archive);
Hooks::doAction('theme.footer', $archive);
?>
</body>
</html>
