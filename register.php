<?php
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: POST, GET, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type");
require_once "database.php";

if ($_SERVER['REQUEST_METHOD'] == 'POST') {
    $firstname = $_POST['firstname'];
    $lastname = $_POST['lastname'];
    $gender = $_POST['gender'];
    $birthday = $_POST['birthday'];
    $acctype = $_POST['acctype'];
    $email = $_POST['email'];
    $password = $_POST['password'];

    try {
        // Validate input
        if (empty($firstname) || empty($lastname) || empty($gender) || empty($birthday) || empty($acctype) || empty($email) || empty($password)) {
            echo "validation_error";
            exit;
        }

        // Hash the password for secure storage
        $hashedPassword = password_hash($password, PASSWORD_DEFAULT);

        // Insert new user record
        $stmt = $pdo->prepare("INSERT INTO users (firstname, lastname, birthday, gender, email, acctype,  password) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
        $stmt->execute([$username, $phone, $email, $hashedPassword]);

        // Respond with 'success' for the frontend to handle the UI update
        echo "success";
    } catch (PDOException $e) {
        // Add logging for debugging
        error_log("Error in register.php: " . $e->getMessage());

        // Check for a duplicate entry error (SQLSTATE 23000)
        if ($e->getCode() == 23000) {
            echo "duplicate";
        } else {
            echo "error: " . $e->getMessage(); // Temporarily show detailed error
        }
    }
}
?>