// server.js

require('dotenv').config(); // Load environment variables

const express = require('express');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');
const app = express();
const port = process.env.PORT || 3000;

// Middleware to parse URL-encoded bodies
app.use(express.urlencoded({ extended: true }));

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// Explicit GET route for '/'
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Endpoint to handle video download
app.post('/download', (req, res) => {
    const videoUrl = req.body.videoUrl;

    if (!videoUrl) {
        return res.status(400).send('No video URL provided.');
    }

    // Sanitize the URL (basic sanitization)
    const sanitizedUrl = videoUrl.trim();

    // Path to yt-dlp executable
    const ytDlpPath = path.join(__dirname, 'files', 'yt-dlp');

    // Check if yt-dlp executable exists
    if (!fs.existsSync(ytDlpPath)) {
        console.error(`yt-dlp executable not found at ${ytDlpPath}`);
        return res.status(500).send('yt-dlp executable not found.');
    }

    // Spawn the yt-dlp process
    const ytDlp = spawn(ytDlpPath, [
        sanitizedUrl,
        '-f', 'best',    // Select the best available format
        '-o', '-',        // Output to stdout
        '--no-part'       // Do not create .part files
    ]);

    let videoTitle = 'downloaded_video';
    let contentType = 'video/mp4'; // Default content type

    // Capture stderr to check for errors and extract video title
    ytDlp.stderr.on('data', (data) => {
        const message = data.toString();
        console.error(`yt-dlp stderr: ${message}`);

        // Attempt to extract the video title from stderr
        const titleMatch = message.match(/title\s+:\s+(.*)/i);
        if (titleMatch && titleMatch[1]) {
            videoTitle = titleMatch[1].replace(/[<>:"/\\|?*]+/g, ''); // Remove illegal characters
        }

        // Optionally, extract content type if available
        const formatMatch = message.match(/format\s+:\s+(\S+)/i);
        if (formatMatch && formatMatch[1]) {
            const format = formatMatch[1];
            // Simple mapping based on format
            if (format.includes('mp4')) {
                contentType = 'video/mp4';
            } else if (format.includes('webm')) {
                contentType = 'video/webm';
            }
            // Add more mappings as needed
        }
    });

    ytDlp.on('error', (error) => {
        console.error(`Error spawning yt-dlp: ${error.message}`);
        res.status(500).send('An error occurred while downloading the video.');
    });

    ytDlp.on('close', (code) => {
        if (code !== 0) {
            console.error(`yt-dlp exited with code ${code}`);
            res.status(500).send('An error occurred while downloading the video.');
        }
    });

    // Set headers to prompt download in the browser
    res.setHeader('Content-Disposition', `attachment; filename="${videoTitle}.mp4"`);
    res.setHeader('Content-Type', contentType);

    // Pipe yt-dlp stdout directly to the response
    ytDlp.stdout.pipe(res);

    // Handle client disconnect
    req.on('close', () => {
        ytDlp.kill('SIGINT');
    });
});

// Start the server
app.listen(port, () => {
    console.log(`Server is running at http://localhost:${port}`);
});
