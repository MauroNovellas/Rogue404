<?php
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate');
date_default_timezone_set('Europe/Madrid');

$file = __DIR__ . '/rogue_scores.json';
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

try {
    if ($method === 'GET') {
        $scores = rankedScores(readScores($file));
        if (isset($_GET['runId'])) {
            foreach ($scores as $index => $entry) {
                if (($entry['runId'] ?? '') === $_GET['runId']) sendJson(['entry' => $entry, 'rank' => $index + 1, 'total' => count($scores)]);
            }
            sendError(404, 'No consta esa expedición en el servidor.');
        }
        sendJson(array_slice($scores, 0, 20));
    }

if ($method === 'POST') {
    $raw = file_get_contents('php://input');
    $input = json_decode($raw ?: '', true);

    if (is_array($input) && ($input['action'] ?? '') === 'check-storage') {
        // Comprueba el mismo guardado atómico sin añadir partidas ni modificar el historial.
        readScores($file);
        $probe = @tempnam(__DIR__, '.rogue-check-');
        if ($probe === false || dirname($probe) !== __DIR__) {
            if (is_string($probe)) @unlink($probe);
            throw new RuntimeException('PHP no puede escribir en /404. Revisa los permisos del alojamiento.');
        }
        try {
            writeAtomically($probe, '{"check":"rogue404"}');
            if (@file_get_contents($probe) !== '{"check":"rogue404"}') throw new RuntimeException('El servidor no pudo verificar la lectura del guardado.');
        } finally { @unlink($probe); }
        sendJson(['ok' => true, 'storage' => 'writable', 'apiVersion' => 2]);
    }

    if (!is_array($input) || !isset($input['name'], $input['score']) || !is_scalar($input['name']) || !is_numeric($input['score'])) {
        sendError(400, 'Datos de puntuación inválidos.');
    }

    $entry = [
        'runId' => $input['runId'] ?? bin2hex(random_bytes(16)),
        'name' => sanitizeName($input['name']),
        'score' => max(0, (int)$input['score']),
        'level' => max(1, (int)($input['level'] ?? 1)),
        'seed' => (int)($input['seed'] ?? 0),
        'cause' => cleanText($input['cause'] ?? 'Desconocido', 20),
        'kills' => cleanText($input['kills'] ?? 'Ninguno', 100),
        'equipment' => cleanText($input['equipment'] ?? 'Nada', 240),
        'ruleset' => cleanText($input['ruleset'] ?? 'legacy', 24),
        'date' => date('d/m/y')
    ];

    if (!is_string($entry['runId']) || !preg_match('/^[A-Za-z0-9_-]{8,80}$/D', $entry['runId'])) sendError(400, 'Identificador de expedición inválido.');

    if ($entry['name'] === '') {
        $entry['name'] = 'UNK';
    }

    $saved = storeScore($file, $entry);
    // Los clientes antiguos aún esperan una lista; los nuevos exigen confirmación de su runId.
    sendJson(($input['responseVersion'] ?? 1) >= 2 ? $saved : $saved['leaderboard']);
}

header('Allow: GET, POST');
sendError(405, 'Método no permitido.');
} catch (Throwable $error) {
    error_log('Rogue404: ' . $error->getMessage());
    sendError(500, $error->getMessage());
}

function readScores($file) {
    if (!file_exists($file)) return [];
    $contents = @file_get_contents($file);
    if ($contents === false) throw new RuntimeException('El servidor no puede leer las puntuaciones. Revisa los permisos del alojamiento.');
    return decodeScores($contents);
}

function decodeScores($contents) {
    if (!is_string($contents) || trim($contents) === '') return [];
    $scores = json_decode($contents, true);
    if (json_last_error() !== JSON_ERROR_NONE || !is_array($scores) || count(array_filter($scores, 'is_array')) !== count($scores)) {
        throw new RuntimeException('El historial del servidor no es válido. Se ha conservado sin sobrescribirlo.');
    }
    return array_values($scores);
}

function rankedScores($scores) {
    usort($scores, function ($a, $b) { return ((int)($b['score'] ?? 0)) <=> ((int)($a['score'] ?? 0)); });
    return $scores;
}

function storeScore($file, $entry) {
    // Un bloqueo separado permite reemplazar el JSON completo de forma atómica.
    $lock = @fopen(__DIR__ . '/.rogue_scores.lock', 'c');
    if ($lock === false) throw new RuntimeException('El servidor no puede guardar: la carpeta de /404 no tiene permisos de escritura para PHP.');
    try {
        if (!flock($lock, LOCK_EX)) throw new RuntimeException('No se pudo bloquear el historial. Inténtalo de nuevo.');
        $scores = readScores($file);
        $existing = false;
        foreach ($scores as $score) {
            if (($score['runId'] ?? null) === $entry['runId']) { $entry = $score; $existing = true; break; }
        }
        if (!$existing) {
            $scores[] = $entry;
            $json = json_encode($scores, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
            if ($json === false) throw new RuntimeException('No se pudo codificar el historial. Los resultados anteriores se conservan.');
            writeAtomically($file, $json);
        }
        $ranked = rankedScores($scores);
        $rank = 0;
        foreach ($ranked as $index => $score) if (($score['runId'] ?? '') === $entry['runId']) { $rank = $index + 1; break; }
        return ['saved' => true, 'entry' => $entry, 'rank' => $rank, 'total' => count($ranked), 'leaderboard' => array_slice($ranked, 0, 20)];
    } finally {
        flock($lock, LOCK_UN);
        fclose($lock);
    }
}

function writeAtomically($file, $contents) {
    $temporary = @tempnam(__DIR__, '.rogue-scores-');
    try {
        if ($temporary === false || dirname($temporary) !== __DIR__) throw new RuntimeException('No se pudo preparar el guardado en /404. Revisa los permisos del alojamiento.');
        if (@file_put_contents($temporary, $contents, LOCK_EX) !== strlen($contents)) throw new RuntimeException('No se pudo escribir la puntuación completa. El historial anterior se conserva.');
        @chmod($temporary, 0644);
        if (!@rename($temporary, $file)) throw new RuntimeException('No se pudo actualizar el historial. Revisa los permisos del alojamiento.');
        $temporary = null;
    } finally {
        if (is_string($temporary) && is_file($temporary)) @unlink($temporary);
    }
}

function sanitizeName($value) {
    $name = strtoupper((string)$value);
    $name = preg_replace('/[^A-Z0-9]/', '', $name);
    return substr($name ?: '', 0, 5);
}

function cleanText($value, $maxLength) {
    if (!is_scalar($value)) return '';
    $text = trim(strip_tags((string)$value));
    $text = preg_replace('/[\x00-\x1F\x7F]+/u', ' ', $text);
    if ($text === null) $text = '';
    if (function_exists('mb_substr')) return mb_substr($text, 0, $maxLength, 'UTF-8');
    preg_match_all('/./us', $text, $characters);
    return implode('', array_slice($characters[0], 0, $maxLength));
}

function sendJson($payload, $status = 200) {
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function sendError($status, $message) {
    sendJson(['error' => $message], $status);
}
