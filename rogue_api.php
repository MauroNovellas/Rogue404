<?php
header('Content-Type: application/json');

$file = 'rogue_scores.json';

if (!file_exists($file)) {
    file_put_contents($file, json_encode([]));
}

$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
    readScores($file);
} 
elseif ($method === 'POST') {
    $input = json_decode(file_get_contents('php://input'), true);
    
    if (isset($input['name']) && isset($input['score'])) {
        $scores = json_decode(file_get_contents($file), true);
        if (!is_array($scores)) $scores = [];
        
        // Limpieza de datos básica
        $name = substr(preg_replace('/[^A-Z0-9]/', '', strtoupper($input['name'])), 0, 5);
        $score = (int)$input['score'];
        $level = isset($input['level']) ? (int)$input['level'] : 1;
        $seed = isset($input['seed']) ? (int)$input['seed'] : 0;
        $cause = isset($input['cause']) ? substr(strip_tags($input['cause']), 0, 20) : "Desconocido";
        
        // NUEVOS CAMPOS DE ESTADÍSTICAS
        // Recibimos strings ya formateados desde JS para simplificar
        $killsInfo = isset($input['kills']) ? substr(strip_tags($input['kills']), 0, 100) : "Ninguno";
        $equipInfo = isset($input['equipment']) ? substr(strip_tags($input['equipment']), 0, 50) : "Nada";
        
        $date = date('d/m/y');
        
        $scores[] = [
            'name' => $name, 
            'score' => $score, 
            'level' => $level,
            'seed' => $seed,
            'cause' => $cause,
            'kills' => $killsInfo,   // Guardado
            'equipment' => $equipInfo, // Guardado
            'date' => $date
        ];
        
        // Ordenar por puntuación descendente
        usort($scores, function($a, $b) {
            return $b['score'] - $a['score'];
        });
        
        // Mantener solo top 20 para no saturar el JSON
        $scores = array_slice($scores, 0, 20);
        
        file_put_contents($file, json_encode($scores));
        echo json_encode($scores);
    }
}

function readScores($file) {
    echo file_get_contents($file);
}
?>