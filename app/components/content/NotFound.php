<?php

declare(strict_types=1);

if (!defined('__TYPECHO_ROOT_DIR__')) {
    exit;
}

use SunkenBoat\Support\PageData;

$archive = $viewData['archive'] ?? null;
if (!$archive instanceof \Widget\Archive) {
    return;
}

PageData::emit(PageData::notFound($archive));
