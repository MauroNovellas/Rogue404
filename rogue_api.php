<?php
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

$file = __DIR__ . '/rogue_scores.json';
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($method === 'GET') {
    sendJson(readScores($file));
}

if ($method === 'POST') {
    $raw = file_get_contents('php://input');
    $input = json_decode($raw ?: '', true);

    if (!is_array($input) || !isset($input['name'], $input['score'])) {
        sendError(400, 'Datos de puntuación inválidos.');
    }

    $entry = [
        'name' => sanitizeName($input['name']),
        'score' => max(0, (int)$input['score']),
        'level' => max(1, (int)($input['level'] ?? 1)),
        'seed' => (int)($input['seed'] ?? 0),
        'cause' => cleanText($input['cause'] ?? 'Desconocido', 20),
        'kills' => cleanText($input['kills'] ?? 'Ninguno', 100),
        'equipment' => cleanText($input['equipment'] ?? 'Nada', 50),
        'date' => date('d/m/y')
    ];

    if ($entry['name'] === '') {
        $entry['name'] = 'UNK';
    }

    $handle = fopen($file, 'c+');
    if ($handle === false) {
        sendError(500, 'No se pudo abrir el salón de la fama.');
    }

    if (!flock($handle, LOCK_EX)) {
        fclose($handle);
        sendError(500, 'No se pudo bloquear el salón de la fama.');
    }

    rewind($handle);
    $contents = stream_get_contents($handle);
    $scores = decodeScores($contents);

    // Evita dobles envíos idénticos del mismo día, también en datos históricos.
    $scores[] = $entry;
    $unique = [];
    $seen = [];
    foreach ($scores as $scoreEntry) {
        if (!is_array($scoreEntry)) continue;
        $key = scoreKey($scoreEntry);
        if (isset($seen[$key])) continue;
        $seen[$key] = true;
        $unique[] = $scoreEntry;
    }

    usort($unique, function ($a, $b) {
        return ((int)($b['score'] ?? 0)) <=> ((int)($a['score'] ?? 0));
    });
    $unique = array_slice($unique, 0, 20);

    $json = json_encode($unique, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if ($json === false) {
        flock($handle, LOCK_UN);
        fclose($handle);
        sendError(500, 'No se pudo codificar el salón de la fama.');
    }

    rewind($handle);
    if (!ftruncate($handle, 0) || fwrite($handle, $json) === false) {
        flock($handle, LOCK_UN);
        fclose($handle);
        sendError(500, 'No se pudo guardar el salón de la fama.');
    }
    fflush($handle);
    flock($handle, LOCK_UN);
    fclose($handle);

    sendJson($unique);
}

header('Allow: GET, POST');
sendError(405, 'Método no permitido.');

function readScores($file) {
    $handle = fopen($file, 'c+');
    if ($handle === false) return [];

    if (!flock($handle, LOCK_SH)) {
        fclose($handle);
        return [];
    }

    rewind($handle);
    $contents = stream_get_contents($handle);
    flock($handle, LOCK_UN);
    fclose($handle);

    return decodeScores($contents);
}

function decodeScores($contents) {
    if (!is_string($contents) || trim($contents) === '') return [];
    $scores = json_decode($contents, true);
    return is_array($scores) ? $scores : [];
}

function sanitizeName($value) {
    $name = strtoupper((string)$value);
    $name = preg_replace('/[^A-Z0-9]/', '', $name);
    return substr($name ?: '', 0, 5);
}

function cleanText($value, $maxLength) {
    $text = trim(strip_tags((string)$value));
    $text = preg_replace('/[\x00-\x1F\x7F]+/u', ' ', $text);
    if ($text === null) $text = '';
    return function_exists('mb_substr')
        ? mb_substr($text, 0, $maxLength, 'UTF-8')
        : substr($text, 0, $maxLength);
}

function scoreKey($entry) {
    $fields = ['name', 'score', 'level', 'seed', 'cause', 'kills', 'equipment', 'date'];
    $parts = [];
    foreach ($fields as $field) {
        $parts[] = (string)($entry[$field] ?? '');
    }
    return hash('sha256', implode("\x1F", $parts));
}

function sendJson($payload, $status = 200) {
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function sendError($status, $message) {
    sendJson(['error' => $message], $status);
}
