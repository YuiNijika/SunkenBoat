<?php

declare(strict_types=1);

namespace SunkenBoat\Support;

if (!defined('__TYPECHO_ROOT_DIR__')) {
    exit;
}

/**
 * Small byte-mode QR encoder used for WeChat Native payments.
 *
 * The site does not rely on GD, ImageMagick or a remote QR service, so the
 * payment link never leaves the server. Versions 1-10 at error correction
 * level M are enough for WeChat's code_url and keep the implementation small.
 */
final class QrCode
{
    /** @var array<int, int> */
    private const DATA_CODEWORDS = [
        1 => 16,
        2 => 28,
        3 => 44,
        4 => 64,
        5 => 86,
        6 => 108,
        7 => 124,
        8 => 154,
        9 => 182,
        10 => 216,
    ];

    /**
     * Data codewords and EC codewords per block, level M.
     *
     * @var array<int, list<array{0: int, 1: int}>>
     */
    private const BLOCKS = [
        1 => [[16, 10]],
        2 => [[28, 16]],
        3 => [[44, 26]],
        4 => [[32, 18], [32, 18]],
        5 => [[43, 24], [43, 24]],
        6 => [[27, 16], [27, 16], [27, 16], [27, 16]],
        7 => [[31, 18], [31, 18], [31, 18], [31, 18]],
        8 => [[38, 20], [38, 20], [39, 20], [39, 20]],
        9 => [[36, 22], [36, 22], [36, 22], [37, 22], [37, 22]],
        10 => [[43, 26], [43, 26], [43, 26], [43, 26], [44, 26]],
    ];

    /** @var array<int, list<int>> */
    private const ALIGNMENT = [
        1 => [],
        2 => [6, 18],
        3 => [6, 22],
        4 => [6, 26],
        5 => [6, 30],
        6 => [6, 34],
        7 => [6, 22, 38],
        8 => [6, 24, 42],
        9 => [6, 26, 46],
        10 => [6, 28, 50],
    ];

    /** @var list<int>|null */
    private static ?array $exp = null;

    /** @var list<int>|null */
    private static ?array $log = null;

    public static function dataUri(string $text): string
    {
        $svg = self::svg($text);

        return $svg === '' ? '' : 'data:image/svg+xml;base64,' . base64_encode($svg);
    }

    public static function svg(string $text): string
    {
        if ($text === '' || strlen($text) > 400) {
            return '';
        }

        $version = self::versionFor($text);
        if ($version === null) {
            return '';
        }

        $matrix = self::matrix($text, $version);
        if ($matrix === []) {
            return '';
        }

        $size = count($matrix);
        $quiet = 4;
        $dimension = $size + $quiet * 2;
        $path = '';
        for ($y = 0; $y < $size; $y++) {
            for ($x = 0; $x < $size; $x++) {
                if (($matrix[$y][$x] ?? 0) !== 1) {
                    continue;
                }
                $path .= 'M' . ($x + $quiet) . ' ' . ($y + $quiet) . 'h1v1h-1z';
            }
        }

        return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' . $dimension . ' ' . $dimension
            . '" shape-rendering="crispEdges" role="img" aria-label="支付二维码">'
            . '<rect width="100%" height="100%" fill="#ffffff"/>'
            . '<path d="' . $path . '" fill="#0f172a"/></svg>';
    }

    private static function versionFor(string $text): ?int
    {
        $length = strlen($text);
        foreach (self::DATA_CODEWORDS as $version => $capacity) {
            $countBits = $version <= 9 ? 8 : 16;
            if ($length < (1 << $countBits) && 4 + $countBits + $length * 8 <= $capacity * 8) {
                return $version;
            }
        }

        return null;
    }

    /**
     * @return list<list<int>>
     */
    private static function matrix(string $text, int $version): array
    {
        $size = 17 + $version * 4;
        $matrix = array_fill(0, $size, array_fill(0, $size, 0));
        $function = array_fill(0, $size, array_fill(0, $size, false));

        self::drawFinder($matrix, $function, $size, 0, 0);
        self::drawFinder($matrix, $function, $size, $size - 7, 0);
        self::drawFinder($matrix, $function, $size, 0, $size - 7);
        self::drawTiming($matrix, $function, $size);
        self::drawAlignment($matrix, $function, $size, $version);
        self::drawFormat($matrix, $function, $size, 0);
        if ($version >= 7) {
            self::drawVersion($matrix, $function, $size, $version);
        }
        self::putFunction($matrix, $function, 8, $size - 8, 1);

        $bits = self::bitstream($text, $version);
        if ($bits === null) {
            return [];
        }
        $codewords = self::codewords($bits, $version);
        self::drawData($matrix, $function, $size, self::interleave($codewords, $version));

        $best = null;
        $bestScore = PHP_INT_MAX;
        for ($mask = 0; $mask < 8; $mask++) {
            $candidate = $matrix;
            for ($y = 0; $y < $size; $y++) {
                for ($x = 0; $x < $size; $x++) {
                    if (!$function[$y][$x] && self::mask($mask, $x, $y)) {
                        $candidate[$y][$x] ^= 1;
                    }
                }
            }
            self::drawFormat($candidate, $function, $size, $mask);
            $score = self::penalty($candidate, $size);
            if ($score < $bestScore) {
                $bestScore = $score;
                $best = $candidate;
            }
        }

        return $best ?? [];
    }

    /**
     * @param list<list<int>> $matrix
     * @param list<list<bool>> $function
     */
    private static function drawFinder(array &$matrix, array &$function, int $size, int $left, int $top): void
    {
        for ($dy = -1; $dy <= 7; $dy++) {
            for ($dx = -1; $dx <= 7; $dx++) {
                $x = $left + $dx;
                $y = $top + $dy;
                if ($x < 0 || $y < 0 || $x >= $size || $y >= $size) {
                    continue;
                }
                $dark = $dx >= 0 && $dx <= 6 && $dy >= 0 && $dy <= 6
                    && ($dx === 0 || $dx === 6 || $dy === 0 || $dy === 6
                        || ($dx >= 2 && $dx <= 4 && $dy >= 2 && $dy <= 4));
                self::putFunction($matrix, $function, $x, $y, $dark ? 1 : 0);
            }
        }
    }

    /**
     * @param list<list<int>> $matrix
     * @param list<list<bool>> $function
     */
    private static function drawTiming(array &$matrix, array &$function, int $size): void
    {
        for ($i = 8; $i <= $size - 9; $i++) {
            self::putFunction($matrix, $function, $i, 6, $i % 2 === 0 ? 1 : 0);
            self::putFunction($matrix, $function, 6, $i, $i % 2 === 0 ? 1 : 0);
        }
    }

    /**
     * @param list<list<int>> $matrix
     * @param list<list<bool>> $function
     */
    private static function drawAlignment(array &$matrix, array &$function, int $size, int $version): void
    {
        foreach (self::ALIGNMENT[$version] as $cy) {
            foreach (self::ALIGNMENT[$version] as $cx) {
                if ($function[$cy][$cx]) {
                    continue;
                }
                for ($dy = -2; $dy <= 2; $dy++) {
                    for ($dx = -2; $dx <= 2; $dx++) {
                        $dark = max(abs($dx), abs($dy)) !== 1;
                        self::putFunction($matrix, $function, $cx + $dx, $cy + $dy, $dark ? 1 : 0);
                    }
                }
            }
        }
    }

    /**
     * @param list<list<int>> $matrix
     * @param list<list<bool>> $function
     */
    private static function drawFormat(array &$matrix, array &$function, int $size, int $mask): void
    {
        $data = (0 << 3) | $mask;
        $remainder = $data;
        for ($i = 0; $i < 10; $i++) {
            $remainder = ($remainder << 1) ^ (($remainder >> 9) * 0x537);
        }
        $bits = (($data << 10) | $remainder) ^ 0x5412;

        for ($i = 0; $i < 15; $i++) {
            $bit = ($bits >> $i) & 1;
            if ($i < 6) {
                self::putFunction($matrix, $function, 8, $i, $bit);
            } elseif ($i < 8) {
                self::putFunction($matrix, $function, 8, $i + 1, $bit);
            } else {
                self::putFunction($matrix, $function, 8, $size - 15 + $i, $bit);
            }

            if ($i < 8) {
                self::putFunction($matrix, $function, $size - $i - 1, 8, $bit);
            } elseif ($i < 9) {
                self::putFunction($matrix, $function, 15 - $i, 8, $bit);
            } else {
                self::putFunction($matrix, $function, 15 - $i - 1, 8, $bit);
            }
        }
    }

    /**
     * @param list<list<int>> $matrix
     * @param list<list<bool>> $function
     */
    private static function drawVersion(array &$matrix, array &$function, int $size, int $version): void
    {
        $remainder = $version;
        for ($i = 0; $i < 12; $i++) {
            $remainder = ($remainder << 1) ^ (($remainder >> 11) * 0x1f25);
        }
        $bits = ($version << 12) | $remainder;
        for ($i = 0; $i < 18; $i++) {
            $bit = ($bits >> $i) & 1;
            $a = $size - 11 + $i % 3;
            $b = intdiv($i, 3);
            self::putFunction($matrix, $function, $a, $b, $bit);
            self::putFunction($matrix, $function, $b, $a, $bit);
        }
    }

    /**
     * @param list<list<int>> $matrix
     * @param list<list<bool>> $function
     */
    private static function putFunction(array &$matrix, array &$function, int $x, int $y, int $value): void
    {
        if (!isset($matrix[$y][$x])) {
            return;
        }
        $matrix[$y][$x] = $value;
        $function[$y][$x] = true;
    }

    private static function bitstream(string $text, int $version): ?string
    {
        $countBits = $version <= 9 ? 8 : 16;
        $length = strlen($text);
        if ($length >= (1 << $countBits)) {
            return null;
        }

        $bits = '0100' . str_pad(decbin($length), $countBits, '0', STR_PAD_LEFT);
        $length -= 1;
        for ($i = 0; $i <= $length; $i++) {
            $bits .= str_pad(decbin(ord($text[$i])), 8, '0', STR_PAD_LEFT);
        }

        $capacity = self::DATA_CODEWORDS[$version] * 8;
        if (strlen($bits) > $capacity) {
            return null;
        }
        $bits .= str_repeat('0', min(4, $capacity - strlen($bits)));
        if (strlen($bits) % 8 !== 0) {
            $bits .= str_repeat('0', 8 - strlen($bits) % 8);
        }

        $index = 0;
        while (strlen($bits) < $capacity) {
            $bits .= $index % 2 === 0 ? '11101100' : '00010001';
            $index++;
        }

        return $bits;
    }

    /**
     * @return list<int>
     */
    private static function codewords(string $bits, int $version): array
    {
        $capacity = self::DATA_CODEWORDS[$version] * 8;
        $bits = substr($bits, 0, $capacity);
        $codewords = [];
        for ($i = 0; $i < $capacity; $i += 8) {
            $codewords[] = bindec(substr($bits, $i, 8));
        }

        return $codewords;
    }

    /**
     * @param list<int> $data
     * @return list<int>
     */
    private static function interleave(array $data, int $version): array
    {
        $blocks = [];
        $ecBlocks = [];
        $offset = 0;
        foreach (self::BLOCKS[$version] as [$count, $ecCount]) {
            $block = array_slice($data, $offset, $count);
            $offset += $count;
            $blocks[] = $block;
            $ecBlocks[] = self::reedSolomon($block, $ecCount);
        }

        $result = [];
        $maxData = max(array_map('count', $blocks));
        for ($i = 0; $i < $maxData; $i++) {
            foreach ($blocks as $block) {
                if (array_key_exists($i, $block)) {
                    $result[] = $block[$i];
                }
            }
        }

        $maxEc = max(array_map('count', $ecBlocks));
        for ($i = 0; $i < $maxEc; $i++) {
            foreach ($ecBlocks as $block) {
                if (array_key_exists($i, $block)) {
                    $result[] = $block[$i];
                }
            }
        }

        return $result;
    }

    /**
     * @param list<int> $data
     * @return list<int>
     */
    private static function reedSolomon(array $data, int $degree): array
    {
        self::galoisTables();
        $generator = [1];
        for ($i = 0; $i < $degree; $i++) {
            $next = array_fill(0, count($generator) + 1, 0);
            foreach ($generator as $j => $coefficient) {
                $next[$j] ^= $coefficient;
                $next[$j + 1] ^= self::gfMultiply($coefficient, self::$exp[$i] ?? 1);
            }
            $generator = $next;
        }

        $remainder = array_fill(0, $degree, 0);
        foreach ($data as $byte) {
            $factor = $byte ^ ($remainder[0] ?? 0);
            array_shift($remainder);
            $remainder[] = 0;
            foreach ($generator as $i => $coefficient) {
                if ($i === 0) {
                    continue;
                }
                $remainder[$i - 1] ^= self::gfMultiply($coefficient, $factor);
            }
        }

        return $remainder;
    }

    private static function gfMultiply(int $left, int $right): int
    {
        if ($left === 0 || $right === 0) {
            return 0;
        }
        self::galoisTables();

        return self::$exp[(self::$log[$left] + self::$log[$right]) % 255];
    }

    private static function galoisTables(): void
    {
        if (self::$exp !== null && self::$log !== null) {
            return;
        }
        self::$exp = array_fill(0, 512, 0);
        self::$log = array_fill(0, 256, 0);
        $value = 1;
        for ($i = 0; $i < 255; $i++) {
            self::$exp[$i] = $value;
            self::$log[$value] = $i;
            $value <<= 1;
            if (($value & 0x100) !== 0) {
                $value ^= 0x11d;
            }
        }
        for ($i = 255; $i < 512; $i++) {
            self::$exp[$i] = self::$exp[$i - 255];
        }
    }

    /**
     * @param list<list<int>> $matrix
     * @param list<list<bool>> $function
     */
    private static function drawData(array &$matrix, array $function, int $size, array $codewords): void
    {
        $bits = '';
        foreach ($codewords as $codeword) {
            $bits .= str_pad(decbin($codeword & 0xff), 8, '0', STR_PAD_LEFT);
        }

        $index = 0;
        $length = strlen($bits);
        $upward = true;
        for ($right = $size - 1; $right >= 1; $right -= 2) {
            if ($right === 6) {
                $right = 5;
            }
            for ($vertical = 0; $vertical < $size; $vertical++) {
                $y = $upward ? $size - 1 - $vertical : $vertical;
                for ($j = 0; $j < 2; $j++) {
                    $x = $right - $j;
                    if ($function[$y][$x]) {
                        continue;
                    }
                    $matrix[$y][$x] = $index < $length ? (int) $bits[$index] : 0;
                    $index++;
                }
            }
            $upward = !$upward;
        }
    }

    private static function mask(int $mask, int $x, int $y): bool
    {
        return match ($mask) {
            0 => ($x + $y) % 2 === 0,
            1 => $y % 2 === 0,
            2 => $x % 3 === 0,
            3 => ($x + $y) % 3 === 0,
            4 => (intdiv($y, 2) + intdiv($x, 3)) % 2 === 0,
            5 => ($x * $y) % 2 + ($x * $y) % 3 === 0,
            6 => (($x * $y) % 2 + ($x * $y) % 3) % 2 === 0,
            7 => (($x + $y) % 2 + ($x * $y) % 3) % 2 === 0,
            default => false,
        };
    }

    /**
     * @param list<list<int>> $matrix
     */
    private static function penalty(array $matrix, int $size): int
    {
        $score = 0;
        for ($y = 0; $y < $size; $y++) {
            $runColor = -1;
            $run = 0;
            for ($x = 0; $x < $size; $x++) {
                $color = $matrix[$y][$x];
                if ($color === $runColor) {
                    $run++;
                    continue;
                }
                if ($run >= 5) {
                    $score += 3 + $run - 5;
                }
                $runColor = $color;
                $run = 1;
            }
            if ($run >= 5) {
                $score += 3 + $run - 5;
            }
        }
        for ($x = 0; $x < $size; $x++) {
            $runColor = -1;
            $run = 0;
            for ($y = 0; $y < $size; $y++) {
                $color = $matrix[$y][$x];
                if ($color === $runColor) {
                    $run++;
                    continue;
                }
                if ($run >= 5) {
                    $score += 3 + $run - 5;
                }
                $runColor = $color;
                $run = 1;
            }
            if ($run >= 5) {
                $score += 3 + $run - 5;
            }
        }

        for ($y = 0; $y < $size - 1; $y++) {
            for ($x = 0; $x < $size - 1; $x++) {
                $color = $matrix[$y][$x];
                if (
                    $matrix[$y][$x + 1] === $color
                    && $matrix[$y + 1][$x] === $color
                    && $matrix[$y + 1][$x + 1] === $color
                ) {
                    $score += 3;
                }
            }
        }

        $patternA = [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0];
        $patternB = [0, 0, 0, 0, 1, 0, 1, 1, 1, 0, 1];
        for ($y = 0; $y < $size; $y++) {
            for ($x = 0; $x < $size - 10; $x++) {
                if (self::matches($matrix, $x, $y, true, $patternA) || self::matches($matrix, $x, $y, true, $patternB)) {
                    $score += 40;
                }
            }
        }
        for ($x = 0; $x < $size; $x++) {
            for ($y = 0; $y < $size - 10; $y++) {
                if (self::matches($matrix, $x, $y, false, $patternA) || self::matches($matrix, $x, $y, false, $patternB)) {
                    $score += 40;
                }
            }
        }

        $dark = 0;
        foreach ($matrix as $row) {
            $dark += array_sum($row);
        }
        $percent = $dark * 100 / ($size * $size);
        $score += (int) (abs($percent - 50) / 5) * 10;

        return $score;
    }

    /**
     * @param list<list<int>> $matrix
     * @param list<int> $pattern
     */
    private static function matches(array $matrix, int $x, int $y, bool $horizontal, array $pattern): bool
    {
        foreach ($pattern as $i => $value) {
            $cell = $horizontal ? ($matrix[$y][$x + $i] ?? -1) : ($matrix[$y + $i][$x] ?? -1);
            if ($cell !== $value) {
                return false;
            }
        }

        return true;
    }
}
