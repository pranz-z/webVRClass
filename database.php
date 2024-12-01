<?php
$host = getenv('DB_HOST') ?: 'dpg-ct5ill56l47c73fq6o7g-a.singapore-postgres.render.com';
$port = getenv('DB_PORT') ?: '5432';
$dbname = getenv('DB_NAME') ?: 'vrified';
$user = getenv('DB_USER') ?: 'root';
$password = getenv('DB_PASSWORD') ?: 'lFa99pMkQuSLSwAPljK0DoJaeqPkR3XW';

try {
    // Create a new PDO instance with the PostgreSQL connection details
    $pdo = new PDO("pgsql:host=$host;port=$port;dbname=$dbname", $user, $password);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    // Log success message only for debugging, not for production
    error_log("Connected to the PostgreSQL database successfully!");
} catch (PDOException $e) {
    // Log error for debugging; don't expose details to the client
    error_log("Database connection error: " . $e->getMessage());
    die("Could not connect to the database.");
}
?>