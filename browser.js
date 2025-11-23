<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Home</title>

<!-- Favicon -->
<link rel="icon" type="image/png" href="https://ssl.gstatic.com/classroom/favicon.png">

<!-- PWA meta -->
<meta name="application-name" content="Google Classroom">
<meta name="theme-color" content="#424242">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="Google Classroom">

<style>
html, body {
    width: 100%;
    height: 100%;
    margin: 0;
    padding: 0;
    overflow: hidden;
    background: #000;
}

#iframe-container {
    width: 100%;
    height: 100%;
}

#iframe-container iframe {
    width: 100%;
    height: 100%;
    border: none;
    transition: opacity 0.3s ease, transform 0.3s ease;
    opacity: 0;
    transform: scale(0.98);
}
</style>
</head>
<body>

<div id="iframe-container">
    <iframe id="viewer"></iframe>
</div>

<script>
// Grab the path from URL
let path = window.location.pathname.slice(1); // "google.com"
const viewer = document.getElementById('viewer');

// Blank homepage if no path
if(!path){
    viewer.srcdoc = ""; // empty page
} else {
    // Add https automatically if missing
    if(!path.startsWith('http')) path = 'https://' + path;

    const encoded = encodeURIComponent(path);
    viewer.src = '/assignment/' + encoded;

    viewer.onload = () => {
        viewer.style.opacity = 1;
        viewer.style.transform = 'scale(1)';
    };
}
</script>

</body>
</html>
